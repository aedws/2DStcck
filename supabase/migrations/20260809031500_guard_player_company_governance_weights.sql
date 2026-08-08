-- Prevent legacy/overflowed company share counts from contaminating live votes.
-- Closed proposal rows remain untouched for audit, while active and future votes
-- are always derived again from the server-owned holding/control ledgers.

begin;

create schema if not exists admin_rollback;
revoke all on schema admin_rollback from public, anon, authenticated;

create table if not exists admin_rollback.r20260809_governance_weight_guard_votes as
select v.*
from public.player_company_governance_votes v
join public.player_company_governance_proposals p on p.id = v.proposal_id
where p.status = 'open';

create table if not exists admin_rollback.r20260809_governance_weight_guard_controls as
select * from public.player_company_control_rights;

create table if not exists admin_rollback.r20260809_governance_weight_guard_cases as
select * from public.player_company_insolvency_cases
where status in ('trust', 'rehabilitation', 'loan-active', 'auction');

alter table admin_rollback.r20260809_governance_weight_guard_votes enable row level security;
alter table admin_rollback.r20260809_governance_weight_guard_controls enable row level security;
alter table admin_rollback.r20260809_governance_weight_guard_cases enable row level security;

create or replace function public.guard_player_company_control_vote_weight()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric := 0;
begin
  select greatest(0, market.total_shares::numeric)
    into v_total
  from public.player_company_market_state market
  where market.stock_id = new.stock_id;

  if not found then
    new.control_vote_weight := 0;
  elsif new.control_source = 'trust' then
    new.control_vote_weight := floor(v_total * 0.10);
  else
    new.control_vote_weight := least(
      greatest(0, coalesce(new.control_vote_weight, 0)),
      v_total
    );
  end if;
  return new;
end;
$$;

revoke all on function public.guard_player_company_control_vote_weight()
  from public, anon, authenticated;

drop trigger if exists guard_player_company_control_vote_weight
  on public.player_company_control_rights;
create trigger guard_player_company_control_vote_weight
before insert or update of stock_id, control_source, control_vote_weight
on public.player_company_control_rights
for each row execute function public.guard_player_company_control_vote_weight();

create or replace function public.guard_player_company_case_vote_weight()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_total numeric := 0;
begin
  select greatest(0, market.total_shares::numeric)
    into v_total
  from public.player_company_market_state market
  where market.stock_id = new.stock_id;

  if not found then
    new.protected_vote_weight := 0;
  elsif new.option_type = 'trust' then
    new.protected_vote_weight := floor(v_total * 0.10);
  else
    new.protected_vote_weight := least(
      greatest(0, coalesce(new.protected_vote_weight, 0)),
      v_total
    );
  end if;
  return new;
end;
$$;

revoke all on function public.guard_player_company_case_vote_weight()
  from public, anon, authenticated;

drop trigger if exists guard_player_company_case_vote_weight
  on public.player_company_insolvency_cases;
create trigger guard_player_company_case_vote_weight
before insert or update of stock_id, option_type, protected_vote_weight
on public.player_company_insolvency_cases
for each row execute function public.guard_player_company_case_vote_weight();

create or replace function public.guard_player_company_governance_vote_weight()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_stock_id text;
  v_weight numeric := 0;
begin
  select proposal.stock_id into v_stock_id
  from public.player_company_governance_proposals proposal
  where proposal.id = new.proposal_id;

  if not found then
    raise exception 'proposal_missing';
  end if;

  v_weight := public.player_company_effective_voting_weight(
    new.voter_id,
    v_stock_id
  );
  if coalesce(v_weight, 0) <= 0 then
    raise exception 'not_eligible';
  end if;
  new.voting_weight := v_weight;
  return new;
end;
$$;

revoke all on function public.guard_player_company_governance_vote_weight()
  from public, anon, authenticated;

drop trigger if exists guard_player_company_governance_vote_weight
  on public.player_company_governance_votes;
create trigger guard_player_company_governance_vote_weight
before insert or update of proposal_id, voter_id, voting_weight
on public.player_company_governance_votes
for each row execute function public.guard_player_company_governance_vote_weight();

-- Normalize live contract rights first, then rebuild only open ballots. Historic
-- resolved ballots are retained as immutable incident evidence in the live log.
update public.player_company_control_rights control
set control_vote_weight = control.control_vote_weight;

update public.player_company_insolvency_cases insolvency
set protected_vote_weight = insolvency.protected_vote_weight
where insolvency.status in ('trust', 'rehabilitation', 'loan-active', 'auction');

delete from public.player_company_governance_votes vote
using public.player_company_governance_proposals proposal
where proposal.id = vote.proposal_id
  and proposal.status = 'open'
  and public.player_company_effective_voting_weight(
    vote.voter_id,
    proposal.stock_id
  ) <= 0;

update public.player_company_governance_votes vote
set voting_weight = public.player_company_effective_voting_weight(
      vote.voter_id,
      proposal.stock_id
    ),
    cast_at = vote.cast_at
from public.player_company_governance_proposals proposal
where proposal.id = vote.proposal_id
  and proposal.status = 'open';

do $$
begin
  if exists (
    select 1
    from public.player_company_control_rights control
    join public.player_company_market_state market using (stock_id)
    where control.control_vote_weight < 0
       or control.control_vote_weight > market.total_shares
       or (
         control.control_source = 'trust'
         and control.control_vote_weight <> floor(market.total_shares::numeric * 0.10)
       )
  ) then
    raise exception 'company_control_vote_guard_failed';
  end if;

  if exists (
    select 1
    from public.player_company_governance_votes vote
    join public.player_company_governance_proposals proposal
      on proposal.id = vote.proposal_id
    where proposal.status = 'open'
      and vote.voting_weight <> public.player_company_effective_voting_weight(
        vote.voter_id,
        proposal.stock_id
      )
  ) then
    raise exception 'open_governance_vote_rebuild_failed';
  end if;
end;
$$;

commit;

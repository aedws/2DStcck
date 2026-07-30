-- 상장 후 창업주 지분과 의결권을 회사 장부의 founderShares가 아니라
-- 창업주 계좌에 실제로 남아 있는 보통주 수량으로 계산한다.

create or replace function public.player_company_account_holding_quantity(
  p_user_id uuid,
  p_stock_id text
)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    sum(public.player_company_saved_holding_quantity(holding)),
    0
  )
  from public.game_saves saves
  cross join lateral jsonb_array_elements(
    case
      when jsonb_typeof(saves.state -> 'holdings') = 'array'
      then saves.state -> 'holdings'
      else '[]'::jsonb
    end
  ) holding
  where saves.user_id = p_user_id
    and lower(coalesce(holding ->> 'stockId', '')) =
      lower(trim(coalesce(p_stock_id, '')));
$$;

revoke all on function public.player_company_account_holding_quantity(uuid, text)
  from public, anon, authenticated;

create or replace function public.get_player_company_founder_ownership_summary(
  p_stock_id text
)
returns table (
  stock_id text,
  current_session bigint,
  last_closed_session bigint,
  founder_quantity numeric,
  total_shares numeric,
  founder_ownership_percent numeric,
  tracked_shareholder_count bigint,
  tracked_public_quantity numeric,
  eligible_vote_weight numeric,
  founder_expected_vote_percent numeric
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_listing public.player_company_market_listings;
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_save jsonb;
  v_company jsonb;
  v_founder numeric := 0;
  v_total numeric := 1;
  v_tracked_count bigint := 0;
  v_tracked_public numeric := 0;
  v_eligible_others numeric := 0;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select * into v_listing
  from public.player_company_market_listings listing
  where listing.stock_id = v_stock_id
    and listing.founder_id = v_user;
  if not found then raise exception 'not_founder'; end if;

  select saves.state into v_save
  from public.game_saves saves
  where saves.user_id = v_user;
  v_company := v_save -> 'playerCompany';
  v_founder := public.player_company_account_holding_quantity(
    v_user,
    v_stock_id
  );
  v_total := greatest(
    1,
    case
      when coalesce(v_company ->> 'totalShares', '') ~ '^[0-9]+$'
      then (v_company ->> 'totalShares')::numeric
      else 1
    end
  );

  select
    count(*) filter (
      where streak.user_id <> v_user and streak.current_quantity >= 1
    ),
    coalesce(sum(streak.current_quantity) filter (
      where streak.user_id <> v_user and streak.current_quantity >= 1
    ), 0),
    coalesce(sum(streak.current_quantity) filter (
      where streak.user_id <> v_user
        and streak.current_quantity >= 1
        and streak.held_since_session is not null
        and streak.held_since_session <= v_session - 90
    ), 0)
  into v_tracked_count, v_tracked_public, v_eligible_others
  from public.player_company_shareholder_streaks streak
  where streak.stock_id = v_stock_id;

  return query
  select
    v_stock_id,
    v_session,
    greatest(0, v_session - 1),
    v_founder,
    v_total,
    round(v_founder * 100 / v_total, 6),
    v_tracked_count,
    v_tracked_public,
    v_founder + v_eligible_others,
    case
      when v_founder + v_eligible_others > 0
      then round(v_founder * 100 / (v_founder + v_eligible_others), 6)
      else 0
    end;
end;
$$;

revoke all on function public.get_player_company_founder_ownership_summary(text)
  from public, anon;
grant execute on function public.get_player_company_founder_ownership_summary(text)
  to authenticated;

create or replace function public.cast_player_company_governance_vote(
  p_proposal_id uuid,
  p_vote text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_proposal public.player_company_governance_proposals;
  v_weight numeric := 0;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_vote not in ('yes', 'no') then raise exception 'invalid_vote'; end if;
  select * into v_proposal
  from public.player_company_governance_proposals
  where id = p_proposal_id
  for update;
  if not found or v_proposal.status <> 'open'
     or v_session >= v_proposal.closes_session
  then
    raise exception 'vote_closed';
  end if;

  if v_user = v_proposal.founder_id then
    v_weight := public.player_company_account_holding_quantity(
      v_user,
      v_proposal.stock_id
    );
  else
    select greatest(0, current_quantity)
      into v_weight
    from public.player_company_shareholder_streaks
    where user_id = v_user
      and stock_id = v_proposal.stock_id
      and current_quantity >= 1
      and held_since_session is not null
      and held_since_session <= v_session - 90;
  end if;
  if coalesce(v_weight, 0) <= 0 then raise exception 'not_eligible'; end if;

  insert into public.player_company_governance_votes (
    proposal_id, voter_id, vote, voting_weight
  )
  values (p_proposal_id, v_user, p_vote, v_weight)
  on conflict (proposal_id, voter_id) do update
  set vote = excluded.vote,
      voting_weight = excluded.voting_weight,
      cast_at = now();
end;
$$;

create or replace function public.list_player_company_governance_proposals()
returns table (
  id uuid,
  stock_id text,
  ticker text,
  company_name text,
  proposal_type text,
  proposed_value numeric,
  opened_session bigint,
  closes_session bigint,
  status text,
  yes_weight numeric,
  no_weight numeric,
  eligible boolean,
  voting_weight numeric,
  is_founder boolean,
  my_vote text,
  reputation_delta integer
)
language sql
stable
security definer
set search_path = public
as $$
  with current_clock as (
    select
      auth.uid() as user_id,
      floor(extract(epoch from clock_timestamp()) / 3600)::bigint as session
  ),
  totals as (
    select
      proposal_id,
      coalesce(sum(voting_weight) filter (where vote = 'yes'), 0) as yes_weight,
      coalesce(sum(voting_weight) filter (where vote = 'no'), 0) as no_weight
    from public.player_company_governance_votes
    group by proposal_id
  )
  select
    proposal.id,
    proposal.stock_id,
    proposal.ticker,
    proposal.company_name,
    proposal.proposal_type,
    proposal.proposed_value,
    proposal.opened_session,
    proposal.closes_session,
    proposal.status,
    coalesce(totals.yes_weight, 0),
    coalesce(totals.no_weight, 0),
    case
      when proposal.founder_id = current_clock.user_id then
        public.player_company_account_holding_quantity(
          current_clock.user_id,
          proposal.stock_id
        ) >= 1
      else (
        streak.current_quantity >= 1
        and streak.held_since_session is not null
        and streak.held_since_session <= current_clock.session - 90
      )
    end as eligible,
    case
      when proposal.founder_id = current_clock.user_id then
        public.player_company_account_holding_quantity(
          current_clock.user_id,
          proposal.stock_id
        )
      else coalesce(streak.current_quantity, 0)
    end as voting_weight,
    proposal.founder_id = current_clock.user_id as is_founder,
    own_vote.vote,
    proposal.reputation_delta
  from public.player_company_governance_proposals proposal
  cross join current_clock
  left join totals on totals.proposal_id = proposal.id
  left join public.player_company_governance_votes own_vote
    on own_vote.proposal_id = proposal.id
   and own_vote.voter_id = current_clock.user_id
  left join public.player_company_shareholder_streaks streak
    on streak.user_id = current_clock.user_id
   and streak.stock_id = proposal.stock_id
  where proposal.status = 'open'
     or proposal.closes_session >= current_clock.session - 72
  order by
    case when proposal.status = 'open' then 0 else 1 end,
    proposal.closes_session asc;
$$;

revoke all on function public.cast_player_company_governance_vote(uuid, text)
  from public, anon;
grant execute on function public.cast_player_company_governance_vote(uuid, text)
  to authenticated;
revoke all on function public.list_player_company_governance_proposals()
  from public, anon;
grant execute on function public.list_player_company_governance_proposals()
  to authenticated;

-- 요청자 회신은 코드·RPC 반영과 함께 같은 변경 이력으로 보존한다.
update public.feedback
set
  status = 'done',
  admin_note = '상장 후 회사 탭의 창업주 주식수를 실제 계좌 보유량과 연동했습니다. 실제 창업주 지분율, 확인된 다른 주주 보유량, 90거래일 장기주주를 반영한 다음 주총 예상 단독 의결권을 함께 표시하며 매 거래일 마감 때 서버 저장분으로 확정됩니다. 주주총회에서 창업주가 행사하는 투표권도 실제 보유주식 수량으로 계산하도록 수정했습니다.',
  updated_at = now()
where id = '2a141baa-ad86-4b22-8ed4-cacb85051f21'
  and status in ('open', 'considering', 'planned');

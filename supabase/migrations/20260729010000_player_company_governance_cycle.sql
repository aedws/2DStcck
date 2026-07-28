-- 플레이어 회사 24거래일 이사회 사이클과 90거래일 장기주주 거버넌스.
-- 만기 결과는 기존 공통 기업행동 원장에 기록되어 모든 클라이언트가 같은 틱에
-- 같은 주가·뉴스를 재생한다.

alter table public.player_company_market_actions
  drop constraint if exists player_company_market_actions_action_type_check;
alter table public.player_company_market_actions
  add constraint player_company_market_actions_action_type_check
  check (action_type in ('issue', 'buyback', 'retire', 'board', 'governance'));

alter table public.player_company_market_actions
  drop constraint if exists player_company_market_actions_shares_check;
alter table public.player_company_market_actions
  add constraint player_company_market_actions_shares_check check (shares >= 0);

alter table public.player_company_market_actions
  add column if not exists decision_type text,
  add column if not exists headline text,
  add column if not exists description text,
  add column if not exists reputation_delta integer not null default 0,
  add column if not exists earnings_growth_delta numeric not null default 0;

create table if not exists public.player_company_board_decisions (
  id uuid primary key default gen_random_uuid(),
  stock_id text not null,
  ticker text not null,
  founder_id uuid not null references auth.users (id) on delete cascade,
  decision_type text not null
    check (decision_type in ('research', 'dividend', 'buyback', 'acquisition')),
  selected_session bigint not null,
  resolve_session bigint not null,
  status text not null default 'pending'
    check (status in ('pending', 'resolved')),
  outcome_label text not null,
  earnings_growth_delta numeric not null,
  price_factor numeric not null check (price_factor between 0.85 and 1.15),
  reputation_delta integer not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  unique (stock_id, resolve_session)
);

create index if not exists player_company_board_due_idx
  on public.player_company_board_decisions (status, resolve_session);

alter table public.player_company_board_decisions enable row level security;
revoke all on public.player_company_board_decisions from public, anon, authenticated;
grant select on public.player_company_board_decisions to anon, authenticated;
drop policy if exists player_company_board_read
  on public.player_company_board_decisions;
create policy player_company_board_read
  on public.player_company_board_decisions
  for select to anon, authenticated using (true);

create table if not exists public.player_company_governance_proposals (
  id uuid primary key default gen_random_uuid(),
  stock_id text not null,
  ticker text not null,
  company_name text not null,
  founder_id uuid not null references auth.users (id) on delete cascade,
  proposal_type text not null
    check (proposal_type in ('dividend', 'issue', 'retire', 'expansion')),
  proposed_value numeric not null,
  opened_session bigint not null,
  closes_session bigint not null,
  status text not null default 'open'
    check (status in ('open', 'passed', 'rejected')),
  reputation_delta integer not null default 0,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create unique index if not exists player_company_one_open_proposal_idx
  on public.player_company_governance_proposals (stock_id)
  where status = 'open';
create index if not exists player_company_governance_due_idx
  on public.player_company_governance_proposals (status, closes_session);

create table if not exists public.player_company_governance_votes (
  proposal_id uuid not null
    references public.player_company_governance_proposals (id) on delete cascade,
  voter_id uuid not null references auth.users (id) on delete cascade,
  vote text not null check (vote in ('yes', 'no')),
  voting_weight numeric not null check (voting_weight > 0),
  cast_at timestamptz not null default now(),
  primary key (proposal_id, voter_id)
);

alter table public.player_company_governance_proposals enable row level security;
alter table public.player_company_governance_votes enable row level security;
revoke all on public.player_company_governance_proposals
  from public, anon, authenticated;
revoke all on public.player_company_governance_votes
  from public, anon, authenticated;

create or replace function public.apply_player_company_reputation(
  p_founder_id uuid,
  p_delta integer,
  p_company_patch jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_state jsonb;
  v_company jsonb;
  v_reputation integer;
  v_now_ms bigint :=
    (extract(epoch from clock_timestamp()) * 1000)::bigint;
begin
  select state into v_state
  from public.game_saves
  where user_id = p_founder_id
  for update;
  if jsonb_typeof(v_state -> 'playerCompany') <> 'object' then return; end if;

  v_company := (v_state -> 'playerCompany') || coalesce(p_company_patch, '{}'::jsonb);
  v_reputation := greatest(
    -100,
    least(
      100,
      coalesce((v_company ->> 'governanceReputation')::integer, 0) +
        coalesce(p_delta, 0)
    )
  );
  v_company := jsonb_set(
    v_company,
    '{governanceReputation}',
    to_jsonb(v_reputation),
    true
  );
  v_company := jsonb_set(
    v_company,
    '{lastActionAt}',
    to_jsonb(v_now_ms),
    true
  );
  update public.game_saves
  set state = jsonb_set(v_state, '{playerCompany}', v_company, true),
      wallet_revision = wallet_revision + 1,
      updated_at = now()
  where user_id = p_founder_id;
end;
$$;

revoke all on function public.apply_player_company_reputation(uuid, integer, jsonb)
  from public, anon, authenticated;

create or replace function public.choose_player_company_board_decision(
  p_stock_id text,
  p_decision_type text
)
returns public.player_company_board_decisions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_listing public.player_company_market_listings;
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_resolve_session bigint;
  v_row public.player_company_board_decisions;
  v_success boolean;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  if p_decision_type not in ('research', 'dividend', 'buyback', 'acquisition') then
    raise exception 'invalid_decision_type';
  end if;
  select * into v_listing
  from public.player_company_market_listings
  where stock_id = v_stock_id and founder_id = v_user;
  if not found then raise exception 'not_founder'; end if;

  -- 선택 시점부터 온전한 한 분기(24거래일)를 운영한 뒤 결과를 발표한다.
  v_resolve_session := v_session + 24;
  if exists (
    select 1 from public.player_company_board_decisions
    where stock_id = v_stock_id and resolve_session = v_resolve_session
  ) then
    raise exception 'already_chosen';
  end if;

  v_success := mod(
    abs(hashtext(v_stock_id || ':' || v_resolve_session::text)),
    100
  ) < 65;

  insert into public.player_company_board_decisions (
    stock_id, ticker, founder_id, decision_type,
    selected_session, resolve_session, outcome_label,
    earnings_growth_delta, price_factor, reputation_delta
  )
  values (
    v_stock_id,
    v_listing.ticker,
    v_user,
    p_decision_type,
    v_session,
    v_resolve_session,
    case p_decision_type
      when 'research' then '연구개발 성과'
      when 'dividend' then '주주환원 강화'
      when 'buyback' then '자사주 매입 효과'
      else case when v_success then '인수 시너지 성공' else '인수 통합 비용 발생' end
    end,
    case p_decision_type
      when 'research' then 4.5
      when 'dividend' then -0.5
      when 'buyback' then 0.5
      else case when v_success then 6 else -4 end
    end,
    case p_decision_type
      when 'research' then 1.04
      when 'dividend' then 1.02
      when 'buyback' then 1.035
      else case when v_success then 1.06 else 0.94 end
    end,
    case p_decision_type
      when 'research' then 4
      when 'dividend' then 3
      when 'buyback' then 2
      else case when v_success then 5 else -3 end
    end
  )
  returning * into v_row;
  return v_row;
end;
$$;

create or replace function public.create_player_company_governance_proposal(
  p_stock_id text,
  p_proposal_type text,
  p_proposed_value numeric
)
returns public.player_company_governance_proposals
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_stock_id text := lower(trim(coalesce(p_stock_id, '')));
  v_listing public.player_company_market_listings;
  v_save jsonb;
  v_company jsonb;
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_value numeric := coalesce(p_proposed_value, 0);
  v_row public.player_company_governance_proposals;
begin
  if v_user is null then raise exception 'not_authenticated'; end if;
  select * into v_listing
  from public.player_company_market_listings
  where stock_id = v_stock_id and founder_id = v_user;
  if not found then raise exception 'not_founder'; end if;
  if p_proposal_type not in ('dividend', 'issue', 'retire', 'expansion') then
    raise exception 'invalid_proposal_type';
  end if;
  if exists (
    select 1 from public.player_company_governance_proposals
    where stock_id = v_stock_id and status = 'open'
  ) then
    raise exception 'open_proposal_exists';
  end if;

  if p_proposal_type = 'dividend' then
    if v_value < 0 or v_value > 0.5 then raise exception 'invalid_value'; end if;
  elsif p_proposal_type in ('issue', 'retire') then
    if v_value < 0.01 or v_value > 0.2 then raise exception 'invalid_value'; end if;
  else
    v_value := 1;
  end if;

  select state into v_save from public.game_saves where user_id = v_user;
  v_company := v_save -> 'playerCompany';
  insert into public.player_company_governance_proposals (
    stock_id, ticker, company_name, founder_id, proposal_type,
    proposed_value, opened_session, closes_session
  )
  values (
    v_stock_id,
    v_listing.ticker,
    coalesce(v_company ->> 'name', v_listing.ticker),
    v_user,
    p_proposal_type,
    v_value,
    v_session,
    v_session + 24
  )
  returning * into v_row;
  return v_row;
end;
$$;

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
  v_state public.player_company_market_state;
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
    select * into v_state
    from public.player_company_market_state
    where stock_id = v_proposal.stock_id;
    if found then
      v_weight := greatest(1, v_state.total_shares - v_state.public_shares);
    else
      v_weight := 1;
    end if;
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
    (
      proposal.founder_id = current_clock.user_id
      or (
        streak.current_quantity >= 1
        and streak.held_since_session is not null
        and streak.held_since_session <= current_clock.session - 90
      )
    ) as eligible,
    case
      when proposal.founder_id = current_clock.user_id
        then greatest(
          1,
          coalesce(market_state.total_shares - market_state.public_shares, 1)
        )::numeric
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
  left join public.player_company_market_state market_state
    on market_state.stock_id = proposal.stock_id
  where proposal.status = 'open'
     or proposal.closes_session >= current_clock.session - 72
  order by
    case when proposal.status = 'open' then 0 else 1 end,
    proposal.closes_session asc;
$$;

create or replace function public.resolve_due_player_company_governance()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session bigint := floor(extract(epoch from clock_timestamp()) / 3600)::bigint;
  v_epoch_seconds bigint := 1783728000;
  v_count integer := 0;
  v_decision public.player_company_board_decisions;
  v_proposal public.player_company_governance_proposals;
  v_state public.player_company_market_state;
  v_save jsonb;
  v_company jsonb;
  v_total bigint;
  v_public bigint;
  v_shares bigint;
  v_total_after bigint;
  v_public_after bigint;
  v_factor numeric;
  v_rep integer;
  v_yes numeric;
  v_no numeric;
  v_passed boolean;
  v_tick bigint;
  v_patch jsonb;
  v_headline text;
  v_description text;
begin
  for v_decision in
    select * from public.player_company_board_decisions
    where status = 'pending' and resolve_session <= v_session
    order by resolve_session, id
    for update skip locked
  loop
    select state into v_save
    from public.game_saves
    where user_id = v_decision.founder_id;
    v_company := v_save -> 'playerCompany';
    v_total := greatest(1, coalesce((v_company ->> 'totalShares')::bigint, 1));
    v_public := greatest(0, coalesce((v_company ->> 'publicShares')::bigint, 0));
    v_tick := greatest(0, v_decision.resolve_session * 3600 - v_epoch_seconds);
    select greatest(v_tick, coalesce(max(effective_tick) + 1, v_tick))
      into v_tick
    from public.player_company_market_actions
    where stock_id = v_decision.stock_id;

    v_headline := v_decision.ticker || ' 분기 실적 · ' || v_decision.outcome_label;
    v_description :=
      '이사회 선택이 다음 분기 매출 성장률에 ' ||
      case when v_decision.earnings_growth_delta >= 0 then '+' else '' end ||
      v_decision.earnings_growth_delta::text ||
      '%p 반영됐습니다. 회사 명성 ' ||
      case when v_decision.reputation_delta >= 0 then '+' else '' end ||
      v_decision.reputation_delta::text || '.';

    insert into public.player_company_market_actions (
      request_id, stock_id, ticker, action_type, shares,
      total_shares_before, public_shares_before,
      total_shares_after, public_shares_after,
      price_factor, price_cents, effective_tick, declared_by,
      decision_type, headline, description,
      reputation_delta, earnings_growth_delta
    )
    values (
      v_decision.id, v_decision.stock_id, v_decision.ticker, 'board', 0,
      v_total, v_public, v_total, v_public,
      v_decision.price_factor, 1, v_tick, v_decision.founder_id,
      v_decision.decision_type, v_headline, v_description,
      v_decision.reputation_delta, v_decision.earnings_growth_delta
    )
    on conflict (request_id) do nothing;

    perform public.apply_player_company_reputation(
      v_decision.founder_id,
      v_decision.reputation_delta
    );
    update public.player_company_board_decisions
    set status = 'resolved', resolved_at = now()
    where id = v_decision.id;
    v_count := v_count + 1;
  end loop;

  for v_proposal in
    select * from public.player_company_governance_proposals
    where status = 'open' and closes_session <= v_session
    order by closes_session, id
    for update skip locked
  loop
    select
      coalesce(sum(voting_weight) filter (where vote = 'yes'), 0),
      coalesce(sum(voting_weight) filter (where vote = 'no'), 0)
    into v_yes, v_no
    from public.player_company_governance_votes
    where proposal_id = v_proposal.id;
    v_passed := v_yes > v_no and v_yes > 0;

    select state into v_save
    from public.game_saves
    where user_id = v_proposal.founder_id
    for update;
    v_company := v_save -> 'playerCompany';
    v_total := greatest(1, coalesce((v_company ->> 'totalShares')::bigint, 1));
    v_public := greatest(0, coalesce((v_company ->> 'publicShares')::bigint, 0));
    insert into public.player_company_market_state (
      stock_id, ticker, founder_id, total_shares, public_shares
    )
    values (
      v_proposal.stock_id, v_proposal.ticker, v_proposal.founder_id,
      v_total, v_public
    )
    on conflict (stock_id) do nothing;
    select * into v_state
    from public.player_company_market_state
    where stock_id = v_proposal.stock_id
    for update;
    v_total := v_state.total_shares;
    v_public := v_state.public_shares;
    v_shares := 0;
    v_total_after := v_total;
    v_public_after := v_public;
    v_factor := case when v_passed then 1 else 0.99 end;
    v_rep := case when v_passed then 1 else -1 end;
    v_patch := '{}'::jsonb;

    if v_passed and v_proposal.proposal_type = 'dividend' then
      v_factor := 1.02;
      v_rep := 3;
      v_patch := jsonb_build_object('dividendRate', v_proposal.proposed_value);
    elsif v_passed and v_proposal.proposal_type = 'issue' then
      v_shares := greatest(1, ceil(v_total * v_proposal.proposed_value)::bigint);
      v_total_after := v_total + v_shares;
      v_public_after := v_public + v_shares;
      v_factor := greatest(0.85, v_total::numeric / v_total_after::numeric);
      v_rep := -2;
      v_patch := jsonb_build_object(
        'totalShares', v_total_after,
        'publicShares', v_public_after
      );
    elsif v_passed and v_proposal.proposal_type = 'retire' then
      v_shares := least(
        v_public,
        greatest(1, ceil(v_public * v_proposal.proposed_value)::bigint)
      );
      if v_shares > 0 and v_shares < v_total then
        v_total_after := v_total - v_shares;
        v_public_after := v_public - v_shares;
        v_factor := least(1.15, v_total::numeric / v_total_after::numeric);
        v_rep := 3;
        v_patch := jsonb_build_object(
          'totalShares', v_total_after,
          'publicShares', v_public_after
        );
      end if;
    elsif v_passed and v_proposal.proposal_type = 'expansion' then
      v_factor := 1.04;
      v_rep := 5;
    end if;

    update public.player_company_market_state
    set total_shares = v_total_after,
        public_shares = v_public_after,
        updated_at = now()
    where stock_id = v_proposal.stock_id;

    v_tick := greatest(0, v_proposal.closes_session * 3600 - v_epoch_seconds);
    select greatest(v_tick, coalesce(max(effective_tick) + 1, v_tick))
      into v_tick
    from public.player_company_market_actions
    where stock_id = v_proposal.stock_id;
    v_headline :=
      v_proposal.company_name || ' 주주총회 · ' ||
      case when v_passed then '안건 가결' else '안건 부결' end;
    v_description :=
      case v_proposal.proposal_type
        when 'dividend' then '다음 1회 배당 예산 조정'
        when 'issue' then '신주 발행'
        when 'retire' then '자사주 소각'
        else '사업 확장'
      end ||
      ' 안건이 ' || case when v_passed then '가결' else '부결' end ||
      '됐습니다. 찬성 ' || round(v_yes, 2)::text ||
      '표, 반대 ' || round(v_no, 2)::text || '표.';

    insert into public.player_company_market_actions (
      request_id, stock_id, ticker, action_type, shares,
      total_shares_before, public_shares_before,
      total_shares_after, public_shares_after,
      price_factor, price_cents, effective_tick, declared_by,
      decision_type, headline, description,
      reputation_delta, earnings_growth_delta
    )
    values (
      v_proposal.id, v_proposal.stock_id, v_proposal.ticker, 'governance',
      v_shares, v_total, v_public, v_total_after, v_public_after,
      v_factor, 1, v_tick, v_proposal.founder_id,
      v_proposal.proposal_type, v_headline, v_description,
      v_rep, 0
    )
    on conflict (request_id) do nothing;

    perform public.apply_player_company_reputation(
      v_proposal.founder_id,
      v_rep,
      v_patch
    );
    update public.player_company_governance_proposals
    set
      status = case when v_passed then 'passed' else 'rejected' end,
      reputation_delta = v_rep,
      resolved_at = now()
    where id = v_proposal.id;
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.choose_player_company_board_decision(text, text)
  from public, anon;
grant execute on function public.choose_player_company_board_decision(text, text)
  to authenticated;
revoke all on function public.create_player_company_governance_proposal(text, text, numeric)
  from public, anon;
grant execute on function public.create_player_company_governance_proposal(text, text, numeric)
  to authenticated;
revoke all on function public.cast_player_company_governance_vote(uuid, text)
  from public, anon;
grant execute on function public.cast_player_company_governance_vote(uuid, text)
  to authenticated;
revoke all on function public.list_player_company_governance_proposals()
  from public, anon;
grant execute on function public.list_player_company_governance_proposals()
  to authenticated;
revoke all on function public.resolve_due_player_company_governance()
  from public;
grant execute on function public.resolve_due_player_company_governance()
  to anon, authenticated;

-- 유저 ETF 서버 권위 원장.
-- 1) 보유 좌수와 펀드 발행 좌수를 같은 트랜잭션에서 갱신한다.
-- 2) ETF 현금 흐름은 계정별 누적 delta로 기록해 game_saves의 마지막 적용값과
--    차이만 클라이언트가 반영한다. 다중 기기·재시도에도 멱등이다.
-- 3) 운용사 본인이 아니어도 로그인 사용자가 기한 도래 정산을 촉발할 수 있다.

alter table public.amc_listed_funds
  add column if not exists last_price_factor double precision not null default 1,
  add column if not exists last_nav_per_share bigint not null default 1,
  add column if not exists last_passive_period_rate double precision not null default 0,
  add column if not exists settlement_input_at timestamptz;

create table if not exists public.amc_accounts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  balance_delta bigint not null default 0,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.amc_fund_positions (
  fund_id text not null references public.amc_listed_funds (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  game_id text not null,
  quantity double precision not null default 0 check (
    quantity >= 0
    and quantity = quantity
    and quantity <> 'Infinity'::double precision
    and quantity <> '-Infinity'::double precision
  ),
  updated_at timestamptz not null default now(),
  primary key (fund_id, user_id)
);

create index if not exists amc_fund_positions_user_idx
  on public.amc_fund_positions (user_id, updated_at desc);

create table if not exists public.amc_fund_trades (
  user_id uuid not null references auth.users (id) on delete cascade,
  client_order_id text not null,
  fund_id text not null references public.amc_listed_funds (id) on delete restrict,
  delta_shares double precision not null,
  nav_per_share bigint not null check (nav_per_share > 0),
  total bigint not null check (total > 0),
  cash_delta bigint not null,
  position_after double precision not null check (position_after >= 0),
  fund_total_shares_after double precision not null check (fund_total_shares_after > 0),
  ledger_balance_after bigint not null,
  ledger_revision_after bigint not null,
  created_at timestamptz not null default now(),
  primary key (user_id, client_order_id)
);

create index if not exists amc_fund_trades_user_created_idx
  on public.amc_fund_trades (user_id, created_at desc);

create table if not exists public.amc_fund_events (
  id bigint generated always as identity primary key,
  fund_id text not null references public.amc_listed_funds (id) on delete restrict,
  ticker text not null,
  kind text not null check (kind in ('management_fee', 'dividend', 'delist')),
  due_session bigint not null,
  per_share bigint not null default 0 check (per_share >= 0),
  total bigint not null check (total >= 0),
  credited_at timestamptz,
  created_at timestamptz not null default now(),
  unique (fund_id, kind, due_session)
);

create table if not exists public.amc_fund_payments (
  event_id bigint not null references public.amc_fund_events (id) on delete restrict,
  user_id uuid not null references auth.users (id) on delete cascade,
  quantity double precision not null default 0,
  amount bigint not null check (amount >= 0),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

create index if not exists amc_fund_payments_user_idx
  on public.amc_fund_payments (user_id, created_at desc);

-- 기존 로컬 저장 보유분을 한 번만 서버 원장으로 이관한다. 이후에는 RPC만 이 원장을 갱신한다.
with saved_positions as (
  select
    saves.user_id,
    funds.id as fund_id,
    coalesce(users.raw_user_meta_data ->> 'game_id', '') as game_id,
    sum((holding ->> 'quantity')::double precision) as quantity
  from public.game_saves as saves
  cross join lateral jsonb_array_elements(
    coalesce(saves.state -> 'holdings', '[]'::jsonb)
  ) as holding
  join public.amc_listed_funds as funds
    on holding ->> 'stockId' = 'amc:' || funds.id
  left join auth.users as users on users.id = saves.user_id
  where coalesce(holding ->> 'quantity', '') ~ '^[0-9]+([.][0-9]+)?$'
    and (holding ->> 'quantity')::double precision > 0
  group by saves.user_id, funds.id, users.raw_user_meta_data
)
insert into public.amc_fund_positions (fund_id, user_id, game_id, quantity)
select fund_id, user_id, game_id, quantity
from saved_positions
on conflict (fund_id, user_id) do nothing;

insert into public.amc_accounts (user_id)
select distinct user_id from public.amc_fund_positions
on conflict (user_id) do nothing;

alter table public.amc_accounts enable row level security;
alter table public.amc_fund_positions enable row level security;
alter table public.amc_fund_trades enable row level security;
alter table public.amc_fund_events enable row level security;
alter table public.amc_fund_payments enable row level security;

create policy "amc_accounts_select_own" on public.amc_accounts
  for select to authenticated using (auth.uid() = user_id);
create policy "amc_positions_select_own" on public.amc_fund_positions
  for select to authenticated using (auth.uid() = user_id);
create policy "amc_trades_select_own" on public.amc_fund_trades
  for select to authenticated using (auth.uid() = user_id);
create policy "amc_events_select_auth" on public.amc_fund_events
  for select to authenticated using (true);
create policy "amc_payments_select_own" on public.amc_fund_payments
  for select to authenticated using (auth.uid() = user_id);

grant select on public.amc_accounts, public.amc_fund_positions,
  public.amc_fund_trades, public.amc_fund_events, public.amc_fund_payments
  to authenticated;
revoke insert, update, delete on public.amc_accounts, public.amc_fund_positions,
  public.amc_fund_trades, public.amc_fund_events, public.amc_fund_payments
  from anon, authenticated;

-- 한 이벤트의 지급액을 계정별 누적 원장에 정확히 한 번 반영한다.
create or replace function public.amc_credit_event(p_event_id bigint)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credited_at timestamptz;
begin
  select credited_at into v_credited_at
  from public.amc_fund_events
  where id = p_event_id
  for update;

  if not found or v_credited_at is not null then
    return;
  end if;

  insert into public.amc_accounts (user_id)
  select distinct user_id
  from public.amc_fund_payments
  where event_id = p_event_id
  on conflict (user_id) do nothing;

  update public.amc_accounts as accounts
  set
    balance_delta = accounts.balance_delta + credits.amount,
    revision = accounts.revision + 1,
    updated_at = now()
  from (
    select user_id, sum(amount)::bigint as amount
    from public.amc_fund_payments
    where event_id = p_event_id
    group by user_id
  ) as credits
  where accounts.user_id = credits.user_id;

  update public.amc_fund_events
  set credited_at = now()
  where id = p_event_id;
end;
$$;

revoke all on function public.amc_credit_event(bigint) from public, anon, authenticated;

-- 구 로컬 보유분을 서버 원장에 최초 1회만 이관한다. 이후에는 서버 값이 권위값이다.
create or replace function public.amc_bootstrap_position(
  p_fund_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game_id text;
  v_fund public.amc_listed_funds;
  v_position public.amc_fund_positions;
  v_registered numeric;
  v_quantity double precision;
  v_save jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select * into v_fund from public.amc_listed_funds
  where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.status = 'delisted' then raise exception 'fund_delisted'; end if;

  select * into v_position from public.amc_fund_positions
  where fund_id = p_fund_id and user_id = v_uid;
  if found then return to_jsonb(v_position); end if;

  select state into v_save from public.game_saves where user_id = v_uid for update;
  if not found then raise exception 'save_required'; end if;
  select coalesce(sum((item ->> 'quantity')::double precision), 0)
  into v_quantity
  from jsonb_array_elements(coalesce(v_save -> 'holdings', '[]'::jsonb)) as item
  where item ->> 'stockId' = 'amc:' || p_fund_id
    and coalesce(item ->> 'quantity', '') ~ '^[0-9]+([.][0-9]+)?$';
  if v_quantity <= 0 or v_quantity <> v_quantity
     or v_quantity = 'Infinity'::double precision then
    raise exception 'no_saved_position';
  end if;

  select coalesce(sum(quantity), 0) into v_registered
  from public.amc_fund_positions where fund_id = p_fund_id;
  if v_registered + v_quantity > v_fund.total_shares + 0.000001 then
    raise exception 'bootstrap_exceeds_supply';
  end if;

  select coalesce(raw_user_meta_data ->> 'game_id', '') into v_game_id
  from auth.users where id = v_uid;
  insert into public.amc_fund_positions (fund_id, user_id, game_id, quantity)
  values (p_fund_id, v_uid, v_game_id, v_quantity)
  returning * into v_position;
  insert into public.amc_accounts (user_id) values (v_uid)
  on conflict (user_id) do nothing;
  return to_jsonb(v_position);
end;
$$;

revoke all on function public.amc_bootstrap_position(text) from public;
grant execute on function public.amc_bootstrap_position(text) to authenticated;

-- 발행좌수·개인 보유좌수·ETF 현금 누적값을 한 트랜잭션에서 처리한다.
create or replace function public.amc_trade_fund(
  p_fund_id text,
  p_delta double precision,
  p_expected_position double precision,
  p_price_factor double precision,
  p_client_order_id text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_game_id text;
  v_fund public.amc_listed_funds;
  v_position public.amc_fund_positions;
  v_account public.amc_accounts;
  v_existing public.amc_fund_trades;
  v_save jsonb;
  v_cash numeric;
  v_applied numeric;
  v_effective_cash numeric;
  v_nav bigint;
  v_total bigint;
  v_cash_delta bigint;
  v_next_position double precision;
  v_next_shares double precision;
  v_next_seed bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if p_client_order_id is null or char_length(p_client_order_id) < 8
     or char_length(p_client_order_id) > 100 then raise exception 'invalid_order_id'; end if;
  if p_delta is null or p_delta = 0 or p_delta <> p_delta
     or p_delta = 'Infinity'::double precision
     or p_delta = '-Infinity'::double precision
     or abs(p_delta - round(p_delta::numeric, 6)::double precision) > 0.000000001 then
    raise exception 'invalid_delta';
  end if;
  if p_price_factor is null or p_price_factor <= 0 or p_price_factor <> p_price_factor
     or p_price_factor = 'Infinity'::double precision
     or p_price_factor = '-Infinity'::double precision then
    raise exception 'invalid_price_factor';
  end if;

  select * into v_existing from public.amc_fund_trades
  where user_id = v_uid and client_order_id = p_client_order_id;
  if found then
    select * into v_fund from public.amc_listed_funds where id = v_existing.fund_id;
    return jsonb_build_object(
      'fund', to_jsonb(v_fund), 'position', v_existing.position_after,
      'navPerShare', v_existing.nav_per_share, 'total', v_existing.total,
      'cashDelta', v_existing.cash_delta,
      'ledgerBalance', v_existing.ledger_balance_after,
      'ledgerRevision', v_existing.ledger_revision_after,
      'replayed', true
    );
  end if;

  select * into v_fund from public.amc_listed_funds
  where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.status = 'delisted' then raise exception 'fund_delisted'; end if;
  if v_fund.status = 'grace' and p_delta > 0 then raise exception 'fund_grace_no_buy'; end if;

  select coalesce(raw_user_meta_data ->> 'game_id', '') into v_game_id
  from auth.users where id = v_uid;
  insert into public.amc_fund_positions (fund_id, user_id, game_id, quantity)
  values (p_fund_id, v_uid, v_game_id, 0)
  on conflict (fund_id, user_id) do nothing;
  select * into v_position from public.amc_fund_positions
  where fund_id = p_fund_id and user_id = v_uid for update;

  if p_expected_position is null
     or abs(v_position.quantity - p_expected_position) > 0.000001 then
    raise exception 'position_conflict';
  end if;
  v_next_position := v_position.quantity + p_delta;
  if v_next_position < -0.000001 then raise exception 'insufficient_position'; end if;
  v_next_position := greatest(0, v_next_position);

  v_next_shares := v_fund.total_shares + p_delta;
  if v_next_shares <= 0 then raise exception 'insufficient_shares'; end if;
  v_nav := greatest(1, round(
    v_fund.seed_nav_value::numeric * p_price_factor::numeric
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / v_fund.total_shares::numeric
  )::bigint);
  v_total := round(v_nav::numeric * abs(p_delta)::numeric)::bigint;
  if v_total <= 0 then raise exception 'trade_too_small'; end if;
  v_cash_delta := case when p_delta > 0 then -v_total else v_total end;

  insert into public.amc_accounts (user_id) values (v_uid)
  on conflict (user_id) do nothing;
  select * into v_account from public.amc_accounts where user_id = v_uid for update;

  select state into v_save from public.game_saves where user_id = v_uid for update;
  if not found then raise exception 'save_required'; end if;
  v_cash := case when coalesce(v_save ->> 'cash', '') ~ '^-?[0-9]+([.][0-9]+)?$'
    then (v_save ->> 'cash')::numeric else 0 end;
  v_applied := case when coalesce(v_save ->> 'amcLedgerBalance', '') ~ '^-?[0-9]+([.][0-9]+)?$'
    then (v_save ->> 'amcLedgerBalance')::numeric else 0 end;
  v_effective_cash := v_cash + v_account.balance_delta - v_applied;
  if p_delta > 0 and v_effective_cash < v_total then
    raise exception 'insufficient_cash';
  end if;

  v_next_seed := v_fund.seed_nav_value
    + round((v_fund.seed_nav_value::numeric / v_fund.total_shares::numeric)
      * p_delta::numeric)::bigint;
  if v_next_seed < 0 then raise exception 'insufficient_nav'; end if;

  update public.amc_listed_funds set
    total_shares = v_next_shares,
    seed_nav_value = v_next_seed,
    last_price_factor = p_price_factor,
    last_nav_per_share = v_nav,
    updated_at = now()
  where id = p_fund_id returning * into v_fund;
  update public.amc_fund_positions set
    quantity = v_next_position, updated_at = now()
  where fund_id = p_fund_id and user_id = v_uid returning * into v_position;
  update public.amc_accounts set
    balance_delta = balance_delta + v_cash_delta,
    revision = revision + 1,
    updated_at = now()
  where user_id = v_uid returning * into v_account;

  insert into public.amc_fund_trades (
    user_id, client_order_id, fund_id, delta_shares, nav_per_share, total,
    cash_delta, position_after, fund_total_shares_after,
    ledger_balance_after, ledger_revision_after
  ) values (
    v_uid, p_client_order_id, p_fund_id, p_delta, v_nav, v_total,
    v_cash_delta, v_position.quantity, v_fund.total_shares,
    v_account.balance_delta, v_account.revision
  );

  return jsonb_build_object(
    'fund', to_jsonb(v_fund), 'position', v_position.quantity,
    'navPerShare', v_nav, 'total', v_total, 'cashDelta', v_cash_delta,
    'ledgerBalance', v_account.balance_delta,
    'ledgerRevision', v_account.revision, 'replayed', false
  );
end;
$$;

revoke all on function public.amc_trade_fund(text, double precision, double precision, double precision, text) from public;
grant execute on function public.amc_trade_fund(text, double precision, double precision, double precision, text) to authenticated;

-- 로그인한 누구나 호출할 수 있는 기한 도래 정산. 펀드 행 잠금과 이벤트 unique 키로
-- 운용료·배당·상폐 환급은 정확히 한 번만 원장에 반영된다.
create or replace function public.amc_settle_fund_internal(
  p_fund_id text,
  p_current_session bigint,
  p_price_factor double precision,
  p_passive_period_rate double precision default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fund public.amc_listed_funds;
  v_now_session bigint := floor(extract(epoch from now()) / 3600)::bigint;
  v_through bigint;
  v_due bigint;
  v_nav bigint;
  v_aum numeric;
  v_amount bigint;
  v_seed_deduction bigint;
  v_rate double precision;
  v_per_share bigint;
  v_event_id bigint;
  v_history jsonb;
begin
  if abs(p_current_session - v_now_session) > 1 then raise exception 'invalid_session'; end if;
  if p_price_factor is null or p_price_factor <= 0 or p_price_factor <> p_price_factor
     or p_price_factor = 'Infinity'::double precision
     or p_price_factor = '-Infinity'::double precision then
    raise exception 'invalid_price_factor';
  end if;
  if p_passive_period_rate is null or p_passive_period_rate < 0
     or p_passive_period_rate > 0.05 then raise exception 'invalid_passive_rate'; end if;

  select * into v_fund from public.amc_listed_funds
  where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value::numeric * p_price_factor::numeric
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / v_fund.total_shares::numeric
  )::bigint);

  if v_fund.status = 'delisted' then
    return jsonb_build_object('fund', to_jsonb(v_fund), 'settled', false);
  end if;

  v_through := p_current_session;
  if v_fund.style = 'active' then
    if v_fund.status = 'grace' then
      v_through := least(v_through, coalesce(v_fund.grace_started_session, p_current_session));
    elsif p_current_session - v_fund.last_rebalance_session >= 30 then
      v_through := least(v_through, v_fund.last_rebalance_session + 30);
    end if;
  end if;

  -- 운용료: 장기 미접속도 최대 120회까지 한 호출에서 따라잡는다.
  for v_due in
    select generate_series(v_fund.last_fee_session + 20, v_through, 20)
    limit 120
  loop
    v_nav := greatest(1, round(
      v_fund.seed_nav_value::numeric * p_price_factor::numeric
      / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
      / v_fund.total_shares::numeric
    )::bigint);
    v_aum := v_nav::numeric * v_fund.total_shares::numeric;
    v_amount := greatest(0, round(v_aum * v_fund.fee_rate)::bigint);
    if v_amount > 0 then
      v_seed_deduction := round(v_amount::numeric
        / greatest(p_price_factor::numeric / v_fund.basket_price_factor::numeric, 0.000000001))::bigint;
      v_fund.seed_nav_value := greatest(0, v_fund.seed_nav_value - v_seed_deduction);
      v_fund.cumulative_fees_paid := v_fund.cumulative_fees_paid + v_amount;
      v_event_id := null;
      insert into public.amc_fund_events (fund_id, ticker, kind, due_session, per_share, total)
      values (v_fund.id, v_fund.ticker, 'management_fee', v_due, 0, v_amount)
      on conflict (fund_id, kind, due_session) do nothing returning id into v_event_id;
      if v_event_id is not null then
        insert into public.amc_fund_payments (event_id, user_id, quantity, amount)
        values (v_event_id, v_fund.manager_user_id, 1, v_amount)
        on conflict do nothing;
        perform public.amc_credit_event(v_event_id);
      end if;
    end if;
    v_fund.last_fee_session := v_due;
  end loop;

  -- 배당: 액티브는 저장된 회차율, 패시브는 결정론 시장에서 계산해 전달한 회차율.
  v_rate := case when v_fund.style = 'active'
    then least(0.05, greatest(0, v_fund.dividend_rate))
    else p_passive_period_rate end;
  for v_due in
    select generate_series(
      v_fund.last_dividend_session + v_fund.dividend_interval_days,
      v_through,
      v_fund.dividend_interval_days
    ) limit 120
  loop
    if v_rate > 0 then
      v_nav := greatest(1, round(
        v_fund.seed_nav_value::numeric * p_price_factor::numeric
        / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
        / v_fund.total_shares::numeric
      )::bigint);
      v_aum := v_nav::numeric * v_fund.total_shares::numeric;
      v_amount := greatest(0, round(v_aum * v_rate)::bigint);
      v_per_share := floor(v_amount::numeric / v_fund.total_shares::numeric)::bigint;
      v_amount := round(
        v_per_share::numeric * v_fund.total_shares::numeric
      )::bigint;
      if v_per_share > 0 and v_amount > 0 then
        v_seed_deduction := round(v_amount::numeric
          / greatest(p_price_factor::numeric / v_fund.basket_price_factor::numeric, 0.000000001))::bigint;
        v_fund.seed_nav_value := greatest(0, v_fund.seed_nav_value - v_seed_deduction);
        v_fund.cumulative_dividends_paid := v_fund.cumulative_dividends_paid + v_amount;
        v_history := coalesce(v_fund.dividend_history, '[]'::jsonb)
          || jsonb_build_array(jsonb_build_object(
            'session', v_due, 'perShare', v_per_share, 'total', v_amount
          ));
        select coalesce(jsonb_agg(value order by ordinality), '[]'::jsonb)
          into v_fund.dividend_history
        from jsonb_array_elements(v_history) with ordinality
        where ordinality > greatest(0, jsonb_array_length(v_history) - 12);

        v_event_id := null;
        insert into public.amc_fund_events (fund_id, ticker, kind, due_session, per_share, total)
        values (v_fund.id, v_fund.ticker, 'dividend', v_due, v_per_share, v_amount)
        on conflict (fund_id, kind, due_session) do nothing returning id into v_event_id;
        if v_event_id is not null then
          insert into public.amc_fund_payments (event_id, user_id, quantity, amount)
          select v_event_id, user_id, quantity,
            round(quantity::numeric * v_per_share::numeric)::bigint
          from public.amc_fund_positions
          where fund_id = v_fund.id and quantity > 0
          on conflict do nothing;
          perform public.amc_credit_event(v_event_id);
        end if;
      end if;
    end if;
    v_fund.last_dividend_session := v_due;
  end loop;

  if v_fund.style = 'active' then
    if v_fund.status = 'active'
       and p_current_session - v_fund.last_rebalance_session >= 30 then
      v_fund.status := 'grace';
      v_fund.grace_started_session := v_fund.last_rebalance_session + 30;
    end if;
    if v_fund.status = 'grace'
       and p_current_session - coalesce(v_fund.grace_started_session, p_current_session) >= 10 then
      v_nav := greatest(1, round(
        v_fund.seed_nav_value::numeric * p_price_factor::numeric
        / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
        / v_fund.total_shares::numeric
      )::bigint);
      v_amount := round(v_nav::numeric * v_fund.total_shares::numeric)::bigint;
      v_event_id := null;
      insert into public.amc_fund_events (fund_id, ticker, kind, due_session, per_share, total)
      values (v_fund.id, v_fund.ticker, 'delist', p_current_session, v_nav, v_amount)
      on conflict (fund_id, kind, due_session) do nothing returning id into v_event_id;
      if v_event_id is not null then
        insert into public.amc_fund_payments (event_id, user_id, quantity, amount)
        select v_event_id, user_id, quantity,
          round(quantity::numeric * v_nav::numeric)::bigint
        from public.amc_fund_positions
        where fund_id = v_fund.id and quantity > 0
        on conflict do nothing;
        perform public.amc_credit_event(v_event_id);
      end if;
      update public.amc_fund_positions set quantity = 0, updated_at = now()
      where fund_id = v_fund.id and quantity > 0;
      v_fund.status := 'delisted';
      v_fund.grace_started_session := null;
    end if;
  end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value::numeric * p_price_factor::numeric
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / v_fund.total_shares::numeric
  )::bigint);
  update public.amc_listed_funds set
    seed_nav_value = v_fund.seed_nav_value,
    status = v_fund.status,
    last_fee_session = v_fund.last_fee_session,
    last_dividend_session = v_fund.last_dividend_session,
    cumulative_fees_paid = v_fund.cumulative_fees_paid,
    cumulative_dividends_paid = v_fund.cumulative_dividends_paid,
    dividend_history = v_fund.dividend_history,
    grace_started_session = v_fund.grace_started_session,
    last_price_factor = p_price_factor,
    last_nav_per_share = v_nav,
    last_passive_period_rate = p_passive_period_rate,
    settlement_input_at = now(),
    updated_at = now()
  where id = v_fund.id returning * into v_fund;

  return jsonb_build_object('fund', to_jsonb(v_fund), 'settled', true);
end;
$$;

revoke all on function public.amc_settle_fund_internal(text, bigint, double precision, double precision)
  from public, anon, authenticated;

create or replace function public.amc_settle_fund(
  p_fund_id text,
  p_current_session bigint,
  p_price_factor double precision,
  p_passive_period_rate double precision default 0
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return public.amc_settle_fund_internal(
    p_fund_id,
    p_current_session,
    p_price_factor,
    p_passive_period_rate
  );
end;
$$;

revoke all on function public.amc_settle_fund(text, bigint, double precision, double precision)
  from public, anon;
grant execute on function public.amc_settle_fund(text, bigint, double precision, double precision) to authenticated;

-- 마지막으로 검증된 가격 입력을 사용해, 접속자가 없어도 만기 정산을 계속 진행한다.
create or replace function public.amc_settle_due_funds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_session bigint := floor(extract(epoch from now()) / 3600)::bigint;
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select id, last_price_factor, last_passive_period_rate
    from public.amc_listed_funds
    where status <> 'delisted'
      and settlement_input_at is not null
      and (
        v_current_session - last_fee_session >= 20
        or v_current_session - last_dividend_session >= dividend_interval_days
        or (style = 'active' and v_current_session - last_rebalance_session >= 30)
      )
    order by updated_at asc
    limit 200
  loop
    begin
      perform public.amc_settle_fund_internal(
        v_row.id,
        v_current_session,
        greatest(v_row.last_price_factor, 0.000000001),
        greatest(v_row.last_passive_period_rate, 0)
      );
      v_count := v_count + 1;
    exception when others then
      raise warning 'AMC settlement failed for fund %: %', v_row.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.amc_settle_due_funds() from public, anon, authenticated;

create extension if not exists pg_cron;
do $$
begin
  perform cron.unschedule('amc-settlement-every-5-minutes');
exception when others then
  null;
end $$;

select cron.schedule(
  'amc-settlement-every-5-minutes',
  '*/5 * * * *',
  'select public.amc_settle_due_funds();'
);

-- 상장 후 메타데이터·리밸런싱은 전용 RPC만 허용한다. 발행좌수와 정산 필드는
-- 일반 UPDATE 및 구 RPC로 바꿀 수 없게 막아 서버 원장을 단일 권위로 유지한다.
create or replace function public.amc_sync_fund_meta(
  p_fund_id text,
  p_manager_name text,
  p_manager_tagline text,
  p_manager_detail text,
  p_name text,
  p_holdings jsonb,
  p_benchmark_stock_id text,
  p_dividend_interval_days integer,
  p_dividend_rate double precision,
  p_include_nav boolean default false,
  p_basket_price_factor double precision default 1,
  p_seed_nav_value bigint default 0,
  p_last_rebalance_session bigint default 0
)
returns public.amc_listed_funds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.amc_listed_funds;
  v_count integer;
  v_weight_sum double precision;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.amc_listed_funds
  where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_row.manager_user_id <> auth.uid() then raise exception 'not_manager'; end if;
  if v_row.status = 'delisted' then raise exception 'fund_delisted'; end if;
  if char_length(trim(p_manager_name)) not between 2 and 40
     or char_length(trim(p_manager_tagline)) not between 2 and 80
     or char_length(trim(p_name)) not between 2 and 40 then
    raise exception 'invalid_meta';
  end if;
  if p_dividend_interval_days not in (5, 20, 60)
     or p_dividend_rate < 0 or p_dividend_rate > 0.05 then
    raise exception 'invalid_dividend_meta';
  end if;
  if jsonb_typeof(p_holdings) <> 'array' then raise exception 'invalid_holdings'; end if;
  select count(*), coalesce(sum((item ->> 'weight')::double precision), 0)
  into v_count, v_weight_sum
  from jsonb_array_elements(p_holdings) as item
  where jsonb_typeof(item) = 'object'
    and coalesce(item ->> 'stockId', '') <> ''
    and coalesce(item ->> 'weight', '') ~ '^[0-9]+([.][0-9]+)?$'
    and (item ->> 'weight')::double precision > 0;
  if v_count not between 3 and 30 or abs(v_weight_sum - 1) > 0.000001 then
    raise exception 'invalid_holdings';
  end if;
  if p_include_nav and (
    p_basket_price_factor <= 0 or p_basket_price_factor <> p_basket_price_factor
    or p_seed_nav_value < 0
    or p_last_rebalance_session < v_row.last_rebalance_session
  ) then raise exception 'invalid_nav_meta'; end if;

  update public.amc_listed_funds set
    manager_name = trim(p_manager_name),
    manager_tagline = trim(p_manager_tagline),
    manager_detail = nullif(trim(coalesce(p_manager_detail, '')), ''),
    name = trim(p_name),
    holdings = p_holdings,
    benchmark_stock_id = nullif(trim(coalesce(p_benchmark_stock_id, '')), ''),
    dividend_interval_days = p_dividend_interval_days,
    dividend_rate = p_dividend_rate,
    basket_price_factor = case when p_include_nav then p_basket_price_factor else basket_price_factor end,
    seed_nav_value = case when p_include_nav then p_seed_nav_value else seed_nav_value end,
    last_rebalance_session = case when p_include_nav then p_last_rebalance_session else last_rebalance_session end,
    status = case when p_include_nav then 'active' else status end,
    grace_started_session = case when p_include_nav then null else grace_started_session end,
    updated_at = now()
  where id = p_fund_id returning * into v_row;
  return v_row;
end;
$$;

revoke all on function public.amc_sync_fund_meta(
  text, text, text, text, text, jsonb, text, integer, double precision,
  boolean, double precision, bigint, bigint
) from public;
grant execute on function public.amc_sync_fund_meta(
  text, text, text, text, text, jsonb, text, integer, double precision,
  boolean, double precision, bigint, bigint
) to authenticated;

revoke update on public.amc_listed_funds from authenticated;
revoke execute on function public.amc_adjust_shares(text, double precision, bigint) from authenticated;
revoke execute on function public.amc_apply_management_fee(text, bigint, bigint, bigint, bigint, bigint) from authenticated;
revoke execute on function public.amc_apply_dividend(text, bigint, bigint, bigint, bigint, bigint, bigint, jsonb) from authenticated;

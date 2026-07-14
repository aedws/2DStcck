-- 2DStock 새 프로젝트 스키마 (검증된 마이그레이션에서 cron/pg_net 제외 후 이어붙임)
-- 새 Supabase 프로젝트의 SQL Editor에 통째로 붙여넣어 실행하세요.

-- ================================================================
-- 20260704170801_initial_schema.sql
-- ================================================================
-- 2DStock MVP schema
-- Run in Supabase SQL Editor or via CLI

-- Profiles (extends auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nickname text,
  cash bigint not null default 10000000,
  initial_cash bigint not null default 10000000,
  created_at timestamptz not null default now()
);

-- Global market state (single row)
create table if not exists public.market_global (
  id text primary key default 'global',
  tick integer not null default 0,
  market_started_at bigint not null,
  stocks jsonb not null,
  events jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

-- User holdings
create table if not exists public.holdings (
  user_id uuid not null references public.profiles (id) on delete cascade,
  stock_id text not null,
  quantity integer not null check (quantity > 0),
  average_price integer not null check (average_price > 0),
  primary key (user_id, stock_id)
);

-- Trade history
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stock_id text not null,
  ticker text not null,
  type text not null check (type in ('buy', 'sell')),
  quantity integer not null check (quantity > 0),
  price integer not null check (price > 0),
  total bigint not null check (total > 0),
  created_at timestamptz not null default now()
);

create index if not exists trades_user_created_idx
  on public.trades (user_id, created_at desc);

-- Auto-create profile on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nickname', split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- RLS
alter table public.profiles enable row level security;
alter table public.market_global enable row level security;
alter table public.holdings enable row level security;
alter table public.trades enable row level security;

-- Profiles: read/update own
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Market: everyone can read
create policy "market_global_select_all" on public.market_global
  for select using (true);

-- Holdings: own data
create policy "holdings_select_own" on public.holdings
  for select using (auth.uid() = user_id);

-- Trades: own data
create policy "trades_select_own" on public.trades
  for select using (auth.uid() = user_id);

-- Realtime
alter publication supabase_realtime add table public.market_global;
alter publication supabase_realtime add table public.profiles;
alter publication supabase_realtime add table public.holdings;
alter publication supabase_realtime add table public.trades;

-- ================================================================
-- 20260705051226_minimal_auth.sql
-- ================================================================
-- 데이터 최소화: 인증은 이메일(아이디)+비밀번호만 보관
-- profiles에서 nickname 제거, 가입 트리거는 게임 데이터(현금)만 초기화

alter table public.profiles drop column if exists nickname;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

-- ================================================================
-- 20260705051851_limit_orders.sql
-- ================================================================
-- 지정가 주문: 가격 도달 시 서버 틱에서 자동 체결
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  stock_id text not null,
  ticker text not null,
  side text not null check (side in ('buy', 'sell')),
  price integer not null check (price > 0),
  quantity integer not null check (quantity > 0),
  status text not null default 'open' check (status in ('open', 'filled', 'cancelled')),
  created_at timestamptz not null default now(),
  filled_at timestamptz,
  filled_price integer
);

create index if not exists orders_open_idx
  on public.orders (status, stock_id) where status = 'open';
create index if not exists orders_user_idx
  on public.orders (user_id, created_at desc);

alter table public.orders enable row level security;

create policy "orders_select_own" on public.orders
  for select using (auth.uid() = user_id);

-- 본인 미체결 주문 취소만 허용
create policy "orders_cancel_own" on public.orders
  for update using (auth.uid() = user_id and status = 'open')
  with check (auth.uid() = user_id and status = 'cancelled');

alter publication supabase_realtime add table public.orders;

-- ================================================================
-- 20260712111614_game_accounts.sql
-- ================================================================
-- 이메일 노출 없는 게임 아이디 로그인용 공개 식별자 매핑.
-- PIN은 이 테이블에 저장하지 않고 Supabase Auth 비밀번호 해시만 사용한다.

create table if not exists public.game_accounts (
  game_id text primary key check (game_id ~ '^[a-z0-9_]{3,20}$'),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

alter table public.game_accounts enable row level security;

-- 클라이언트 직접 접근은 허용하지 않는다. 가입 함수의 service role만 사용한다.

-- ================================================================
-- 20260712111948_fixed_salary.sql
-- ================================================================
-- 20거래일 고정급: 사용자별 지급 기준 + 중복 방지 원장 + 원자 지급 RPC
-- 거래일은 앱과 동일하게 3시간(10,800초) 단위다.

alter table public.profiles
  add column if not exists last_salary_session bigint;

-- 기존 유저는 마이그레이션 시점부터 새로 20거래일을 센다 (과거 소급 지급 없음).
update public.profiles
set last_salary_session = floor(extract(epoch from now()) / 10800)::bigint
where last_salary_session is null;

alter table public.profiles
  alter column last_salary_session
    set default floor(extract(epoch from now()) / 10800)::bigint,
  alter column last_salary_session set not null;

create table if not exists public.salary_payments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  due_session bigint not null,
  amount bigint not null check (amount > 0),
  paid_at timestamptz not null default now(),
  primary key (user_id, due_session)
);

create index if not exists salary_payments_user_paid_idx
  on public.salary_payments (user_id, paid_at desc);

alter table public.salary_payments enable row level security;

drop policy if exists "salary_payments_select_own"
  on public.salary_payments;
create policy "salary_payments_select_own" on public.salary_payments
  for select using (auth.uid() = user_id);

-- nickname 제거(004) 후에는 클라이언트가 profiles를 갱신할 이유가 없다.
-- 이 정책을 남기면 cash와 월급 기준일까지 임의 조작할 수 있다.
drop policy if exists "profiles_update_own" on public.profiles;
revoke update on public.profiles from anon, authenticated;

grant select on public.salary_payments to authenticated;
revoke insert, update, delete on public.salary_payments from anon, authenticated;

/**
 * 현재 거래일까지 밀린 월급을 모두 지급한다.
 * 원장의 (user_id, due_session) PK와 단일 SQL 문장으로 동시 호출도 exactly-once 처리한다.
 * 금액과 주기는 Edge Function의 공통 설정에서만 전달하며 일반 클라이언트는 실행할 수 없다.
 */
create or replace function public.process_fixed_salaries(
  p_current_session bigint,
  p_interval_days integer,
  p_amount bigint
)
returns table (paid_users bigint, paid_amount bigint)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_current_session < 0 or p_interval_days <= 0 or p_amount <= 0 then
    raise exception 'invalid salary parameters';
  end if;

  return query
  with due as (
    select
      p.id as user_id,
      due_session
    from public.profiles as p
    cross join lateral generate_series(
      p.last_salary_session + p_interval_days::bigint,
      p_current_session,
      p_interval_days::bigint
    ) as due_session
    where p.last_salary_session + p_interval_days::bigint <= p_current_session
  ),
  issued as (
    insert into public.salary_payments (user_id, due_session, amount)
    select due.user_id, due.due_session, p_amount
    from due
    on conflict (user_id, due_session) do nothing
    returning user_id, due_session, amount
  ),
  credits as (
    select
      issued.user_id,
      sum(issued.amount)::bigint as amount,
      max(issued.due_session)::bigint as last_due_session
    from issued
    group by issued.user_id
  ),
  updated as (
    update public.profiles as p
    set
      cash = p.cash + credits.amount,
      last_salary_session = credits.last_due_session
    from credits
    where p.id = credits.user_id
    returning credits.amount
  )
  select
    count(*)::bigint,
    coalesce(sum(updated.amount), 0)::bigint
  from updated;
end;
$$;

revoke all on function public.process_fixed_salaries(bigint, integer, bigint)
  from public, anon, authenticated;
grant execute on function public.process_fixed_salaries(bigint, integer, bigint)
  to service_role;

/** 급여·주문과 겹쳐도 다른 현금 변경을 덮어쓰지 않는 서버 전용 가산 함수 */
create or replace function public.credit_profile_cash(
  p_user_id uuid,
  p_amount bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cash bigint;
begin
  if p_amount <= 0 then
    raise exception 'credit amount must be positive';
  end if;

  update public.profiles
  set cash = cash + p_amount
  where id = p_user_id
  returning cash into v_cash;

  return v_cash;
end;
$$;

revoke all on function public.credit_profile_cash(uuid, bigint)
  from public, anon, authenticated;
grant execute on function public.credit_profile_cash(uuid, bigint)
  to service_role;

-- ================================================================
-- 20260712112022_periodic_distributions.sql
-- ================================================================
-- 커버드콜 월 분배(20거래일) + 일반 종목 분기 배당(60거래일)
-- 지급 이벤트, 당시 보유 수량, 현금 입금을 한 트랜잭션으로 기록한다.

alter table public.market_global
  add column if not exists last_monthly_distribution_session bigint,
  add column if not exists last_quarterly_dividend_session bigint;

-- 기존 시장에는 과거 지급을 소급하지 않고 마이그레이션 시점부터 새 주기를 센다.
update public.market_global
set
  last_monthly_distribution_session = coalesce(
    last_monthly_distribution_session,
    floor(extract(epoch from now()) / 10800)::bigint
  ),
  last_quarterly_dividend_session = coalesce(
    last_quarterly_dividend_session,
    floor(extract(epoch from now()) / 10800)::bigint
  );

alter table public.market_global
  alter column last_monthly_distribution_session
    set default floor(extract(epoch from now()) / 10800)::bigint,
  alter column last_monthly_distribution_session set not null,
  alter column last_quarterly_dividend_session
    set default floor(extract(epoch from now()) / 10800)::bigint,
  alter column last_quarterly_dividend_session set not null;

create table if not exists public.distribution_events (
  stock_id text not null,
  ticker text not null,
  kind text not null check (kind in ('covered_call', 'dividend')),
  due_session bigint not null,
  base_price bigint not null check (base_price > 0),
  amount_per_share bigint not null check (amount_per_share > 0),
  processed_at timestamptz not null default now(),
  primary key (stock_id, kind, due_session)
);

create table if not exists public.distribution_payments (
  user_id uuid not null references public.profiles (id) on delete cascade,
  stock_id text not null,
  ticker text not null,
  kind text not null check (kind in ('covered_call', 'dividend')),
  due_session bigint not null,
  quantity integer not null check (quantity > 0),
  amount_per_share bigint not null check (amount_per_share > 0),
  amount bigint not null check (amount > 0),
  paid_at timestamptz not null default now(),
  primary key (user_id, stock_id, kind, due_session),
  foreign key (stock_id, kind, due_session)
    references public.distribution_events (stock_id, kind, due_session)
    on delete restrict
);

create index if not exists distribution_payments_user_paid_idx
  on public.distribution_payments (user_id, paid_at desc);

alter table public.distribution_events enable row level security;
alter table public.distribution_payments enable row level security;

drop policy if exists "distribution_events_select_all"
  on public.distribution_events;
create policy "distribution_events_select_all"
  on public.distribution_events for select using (true);

drop policy if exists "distribution_payments_select_own"
  on public.distribution_payments;
create policy "distribution_payments_select_own"
  on public.distribution_payments for select
  using (auth.uid() = user_id);

grant select on public.distribution_events to anon, authenticated;
grant select on public.distribution_payments to authenticated;
revoke insert, update, delete on public.distribution_events
  from anon, authenticated;
revoke insert, update, delete on public.distribution_payments
  from anon, authenticated;

/**
 * 한 종목의 한 지급 회차를 원자적으로 처리한다.
 * 이벤트를 실제로 만든 첫 호출만 당시 holdings를 스냅샷으로 사용해 지급한다.
 * 재호출은 저장된 주당 금액만 반환하며 새 보유자나 기존 보유자에게 다시 입금하지 않는다.
 */
create or replace function public.process_stock_distribution(
  p_stock_id text,
  p_ticker text,
  p_kind text,
  p_due_session bigint,
  p_base_price bigint,
  p_amount_per_share bigint
)
returns table (
  event_created boolean,
  settled_amount_per_share bigint,
  paid_users bigint,
  paid_amount bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_created boolean := false;
  v_amount_per_share bigint;
begin
  if p_stock_id = '' or p_ticker = '' then
    raise exception 'stock id and ticker are required';
  end if;
  if p_kind not in ('covered_call', 'dividend') then
    raise exception 'invalid distribution kind';
  end if;
  if p_due_session < 0 or p_base_price <= 0 or p_amount_per_share <= 0 then
    raise exception 'invalid distribution parameters';
  end if;

  with inserted_event as (
    insert into public.distribution_events as events (
      stock_id,
      ticker,
      kind,
      due_session,
      base_price,
      amount_per_share
    )
    values (
      p_stock_id,
      p_ticker,
      p_kind,
      p_due_session,
      p_base_price,
      p_amount_per_share
    )
    on conflict (stock_id, kind, due_session) do nothing
    returning events.amount_per_share
  )
  select true, inserted_event.amount_per_share
  into v_created, v_amount_per_share
  from inserted_event;

  if not found then
    select events.amount_per_share
    into v_amount_per_share
    from public.distribution_events as events
    where events.stock_id = p_stock_id
      and events.kind = p_kind
      and events.due_session = p_due_session;

    return query
    select false, v_amount_per_share, 0::bigint, 0::bigint;
    return;
  end if;

  return query
  with issued as (
    insert into public.distribution_payments as payments (
      user_id,
      stock_id,
      ticker,
      kind,
      due_session,
      quantity,
      amount_per_share,
      amount
    )
    select
      holdings.user_id,
      p_stock_id,
      p_ticker,
      p_kind,
      p_due_session,
      holdings.quantity,
      v_amount_per_share,
      holdings.quantity::bigint * v_amount_per_share
    from public.holdings as holdings
    where holdings.stock_id = p_stock_id
      and holdings.quantity > 0
    on conflict (user_id, stock_id, kind, due_session) do nothing
    returning payments.user_id, payments.amount
  ),
  credits as (
    select
      issued.user_id,
      sum(issued.amount)::bigint as amount
    from issued
    group by issued.user_id
  ),
  updated as (
    update public.profiles as profiles
    set cash = profiles.cash + credits.amount
    from credits
    where profiles.id = credits.user_id
    returning credits.amount
  )
  select
    v_created,
    v_amount_per_share,
    count(*)::bigint,
    coalesce(sum(updated.amount), 0)::bigint
  from updated;
end;
$$;

revoke all on function public.process_stock_distribution(
  text,
  text,
  text,
  bigint,
  bigint,
  bigint
) from public, anon, authenticated;
grant execute on function public.process_stock_distribution(
  text,
  text,
  text,
  bigint,
  bigint,
  bigint
) to service_role;

alter publication supabase_realtime add table public.distribution_payments;

-- ================================================================
-- 20260712113126_game_saves.sql
-- ================================================================
-- 경량 계정 동기화: 결정론 시장은 클라이언트가 계산하므로 저장할 것은 유저 지갑뿐.
-- 지갑 슬라이스(현금·보유·거래·카운터·대기주문)를 유저당 JSON 한 행으로 저장한다.
-- 시장(stocks/events)은 저장하지 않는다 — 기원점부터 결정론으로 재계산된다.

create table if not exists public.game_saves (
  user_id uuid primary key references auth.users (id) on delete cascade,
  state jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.game_saves enable row level security;

-- 본인 저장분만 읽고 쓴다 (지갑은 본인 소유 — 랭킹 붙일 때 서버 검증으로 하드닝 예정)
drop policy if exists "game_saves_select_own" on public.game_saves;
create policy "game_saves_select_own" on public.game_saves
  for select using (auth.uid() = user_id);

drop policy if exists "game_saves_insert_own" on public.game_saves;
create policy "game_saves_insert_own" on public.game_saves
  for insert with check (auth.uid() = user_id);

drop policy if exists "game_saves_update_own" on public.game_saves;
create policy "game_saves_update_own" on public.game_saves
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select, insert, update on public.game_saves to authenticated;
revoke delete on public.game_saves from anon, authenticated;

-- ================================================================
-- 20260713050503_leaderboard.sql
-- ================================================================
-- 공유 리더보드: 모든 유저가 같은 시장을 보므로 순자산으로 공정한 순위를 낸다.
-- 순자산 = 현금 + 주식 평가 + 사치재 가치 (사치재도 자산으로 합산되어 과시가 곧 점수).
-- 시장이 클라이언트 결정론이라 지표는 클라이언트가 계산해 upsert 한다.
-- (하드닝 예정: 서버 RPC가 holdings·현재가로 순자산을 재계산해 검증)

create table if not exists public.leaderboard (
  user_id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null,
  net_worth bigint not null default 0,
  return_rate numeric not null default 0,
  top_tier int not null default 0,
  luxury_count int not null default 0,
  showcase text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists leaderboard_net_worth_idx
  on public.leaderboard (net_worth desc);

alter table public.leaderboard enable row level security;

-- 랭킹은 모두가 읽을 수 있다 (공개 순위표)
drop policy if exists "leaderboard_select_all" on public.leaderboard;
create policy "leaderboard_select_all" on public.leaderboard
  for select using (true);

-- 본인 행만 등록·갱신 (display_name 은 인증된 아이디로 클라이언트가 채운다)
drop policy if exists "leaderboard_insert_own" on public.leaderboard;
create policy "leaderboard_insert_own" on public.leaderboard
  for insert with check (auth.uid() = user_id);

drop policy if exists "leaderboard_update_own" on public.leaderboard;
create policy "leaderboard_update_own" on public.leaderboard
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

grant select on public.leaderboard to anon, authenticated;
grant insert, update on public.leaderboard to authenticated;
revoke delete on public.leaderboard from anon, authenticated;

-- ================================================================
-- 20260713102800_leaderboard_extra.sql
-- ================================================================
alter table public.leaderboard
  add column if not exists weekly_return numeric not null default 0,
  add column if not exists title text not null default '';

create index if not exists leaderboard_weekly_return_idx
  on public.leaderboard (weekly_return desc);

-- ================================================================
-- 20260713113917_basic_leaderboard_integrity.sql
-- ================================================================
-- 캐주얼 경쟁용 기본 무결성 검사.
-- 완전한 부정행위 방지는 주문 원장 서버 검증이 필요하지만, 이 함수는 직접 랭킹
-- upsert를 막고 저장 지갑·수익률·시장 회차·급격한 점프를 서버에서 확인한다.

alter table public.leaderboard
  add column if not exists initial_cash bigint not null default 10000000,
  add column if not exists market_session bigint not null default 0,
  add column if not exists reputation bigint not null default 0,
  add column if not exists integrity_status text not null default 'legacy';

create or replace function public.submit_leaderboard(
  p_display_name text,
  p_net_worth bigint,
  p_return_rate numeric,
  p_initial_cash bigint,
  p_market_session bigint,
  p_top_tier int,
  p_luxury_count int,
  p_showcase text[],
  p_reputation bigint
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_save jsonb;
  v_saved_initial bigint;
  v_saved_luxury_count int;
  v_expected_return numeric;
  v_now_session bigint;
  v_previous public.leaderboard%rowtype;
begin
  if v_uid is null then
    raise exception 'authentication required';
  end if;

  select state into v_save from public.game_saves where user_id = v_uid;
  if v_save is null then
    raise exception 'game save required before leaderboard submission';
  end if;

  v_saved_initial := coalesce((v_save->>'initialCash')::bigint, 0);
  v_saved_luxury_count := coalesce(jsonb_array_length(coalesce(v_save->'ownedLuxuries', '[]'::jsonb)), 0);
  v_now_session := floor(extract(epoch from now()) * 1000 / 10800000)::bigint;

  if p_initial_cash <= 0 or p_initial_cash <> v_saved_initial then
    raise exception 'initial cash mismatch';
  end if;
  if p_luxury_count <> v_saved_luxury_count or p_luxury_count < 0 or p_luxury_count > 100 then
    raise exception 'luxury count mismatch';
  end if;
  if abs(p_market_session - v_now_session) > 2 then
    raise exception 'stale market session';
  end if;
  if p_net_worth < -100000000000 or p_net_worth > 1000000000000000 then
    raise exception 'net worth outside allowed range';
  end if;
  if p_reputation < 0 or p_reputation > 1000000000 then
    raise exception 'reputation outside allowed range';
  end if;

  v_expected_return := ((p_net_worth - p_initial_cash)::numeric / p_initial_cash::numeric) * 100;
  if abs(v_expected_return - p_return_rate) > 0.06 then
    raise exception 'return rate mismatch';
  end if;

  select * into v_previous from public.leaderboard where user_id = v_uid;
  if found and now() - v_previous.updated_at < interval '30 seconds' then
    if p_net_worth > v_previous.net_worth + 50000000 + abs(v_previous.net_worth) * 2 then
      raise exception 'implausible rapid net worth increase';
    end if;
  end if;

  insert into public.leaderboard (
    user_id, display_name, net_worth, return_rate, initial_cash,
    market_session, top_tier, luxury_count, showcase, reputation,
    integrity_status, updated_at
  ) values (
    v_uid, left(p_display_name, 40), p_net_worth, p_return_rate, p_initial_cash,
    p_market_session, p_top_tier, p_luxury_count, coalesce(p_showcase, '{}'),
    p_reputation, 'basic', now()
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    net_worth = excluded.net_worth,
    return_rate = excluded.return_rate,
    initial_cash = excluded.initial_cash,
    market_session = excluded.market_session,
    top_tier = excluded.top_tier,
    luxury_count = excluded.luxury_count,
    showcase = excluded.showcase,
    reputation = excluded.reputation,
    integrity_status = 'basic',
    updated_at = now();
end;
$$;

revoke insert, update on public.leaderboard from authenticated;
grant execute on function public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint
) to authenticated;

-- ================================================================
-- 20260713121554_leaderboard_permissions.sql
-- ================================================================
-- Keep leaderboard reads public, but require authenticated users to submit
-- through the validated security-definer RPC.
revoke insert, update, delete, truncate, references, trigger
  on public.leaderboard from anon, authenticated;

grant select on public.leaderboard to anon, authenticated;

revoke execute on function public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint
) from public, anon;

grant execute on function public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint
) to authenticated;

-- ================================================================
-- 20260714101500_registered_account_count.sql
-- ================================================================
-- Publicly expose only the aggregate number of registered game accounts.
-- Individual game ids and auth user ids remain inaccessible to clients.
create or replace function public.get_registered_account_count()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::bigint from public.game_accounts;
$$;

revoke all on function public.get_registered_account_count() from public;
grant execute on function public.get_registered_account_count() to anon, authenticated;

-- ================================================================
-- 20260714113000_rankings_profiles_attendance.sql
-- ================================================================
-- 10분 스냅샷 기반 주간 랭킹·공개 칭호·거래 통계.
alter table public.leaderboard
  add column if not exists weekly_start date,
  add column if not exists weekly_start_net_worth bigint not null default 0,
  add column if not exists weekly_return numeric not null default 0,
  add column if not exists title text not null default '',
  add column if not exists trade_count int not null default 0,
  add column if not exists win_rate numeric not null default 0;

create index if not exists leaderboard_weekly_return_idx
  on public.leaderboard (weekly_return desc);

drop function if exists public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint
);

create or replace function public.submit_leaderboard(
  p_display_name text,
  p_net_worth bigint,
  p_return_rate numeric,
  p_initial_cash bigint,
  p_market_session bigint,
  p_top_tier int,
  p_luxury_count int,
  p_showcase text[],
  p_reputation bigint,
  p_title text,
  p_trade_count int,
  p_win_rate numeric
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_save jsonb;
  v_saved_initial bigint;
  v_saved_luxury_count int;
  v_saved_trade_count int;
  v_expected_return numeric;
  v_now_session bigint;
  v_week_start date := date_trunc('week', timezone('Asia/Seoul', now()))::date;
  v_weekly_baseline bigint;
  v_weekly_return numeric := 0;
  v_previous public.leaderboard%rowtype;
begin
  if v_uid is null then raise exception 'authentication required'; end if;

  select state into v_save from public.game_saves where user_id = v_uid;
  if v_save is null then raise exception 'game save required before leaderboard submission'; end if;

  v_saved_initial := coalesce((v_save->>'initialCash')::bigint, 0);
  v_saved_luxury_count := coalesce(jsonb_array_length(coalesce(v_save->'ownedLuxuries', '[]'::jsonb)), 0);
  v_saved_trade_count := coalesce(jsonb_array_length(coalesce(v_save->'trades', '[]'::jsonb)), 0);
  v_now_session := floor(extract(epoch from now()) * 1000 / 3600000)::bigint;

  if p_initial_cash <= 0 or p_initial_cash <> v_saved_initial then raise exception 'initial cash mismatch'; end if;
  if p_luxury_count <> v_saved_luxury_count or p_luxury_count < 0 or p_luxury_count > 100 then raise exception 'luxury count mismatch'; end if;
  if p_trade_count <> v_saved_trade_count or p_trade_count < 0 or p_trade_count > 200 then raise exception 'trade count mismatch'; end if;
  if p_win_rate < 0 or p_win_rate > 100 then raise exception 'win rate outside allowed range'; end if;
  if length(p_title) > 30 then raise exception 'title too long'; end if;
  if abs(p_market_session - v_now_session) > 2 then raise exception 'stale market session'; end if;
  if p_net_worth < -100000000000 or p_net_worth > 1000000000000000 then raise exception 'net worth outside allowed range'; end if;
  if p_reputation < 0 or p_reputation > 1000000000 then raise exception 'reputation outside allowed range'; end if;

  v_expected_return := ((p_net_worth - p_initial_cash)::numeric / p_initial_cash::numeric) * 100;
  if abs(v_expected_return - p_return_rate) > 0.06 then raise exception 'return rate mismatch'; end if;

  select * into v_previous from public.leaderboard where user_id = v_uid;
  if found and now() - v_previous.updated_at < interval '30 seconds' and
     p_net_worth > v_previous.net_worth + 50000000 + abs(v_previous.net_worth) * 2 then
    raise exception 'implausible rapid net worth increase';
  end if;

  if found and v_previous.weekly_start = v_week_start and v_previous.weekly_start_net_worth > 0 then
    v_weekly_baseline := v_previous.weekly_start_net_worth;
    v_weekly_return := ((p_net_worth - v_weekly_baseline)::numeric / v_weekly_baseline::numeric) * 100;
  else
    v_weekly_baseline := greatest(1, p_net_worth);
  end if;

  insert into public.leaderboard (
    user_id, display_name, net_worth, return_rate, initial_cash, market_session,
    top_tier, luxury_count, showcase, reputation, integrity_status,
    weekly_start, weekly_start_net_worth, weekly_return, title,
    trade_count, win_rate, updated_at
  ) values (
    v_uid, left(p_display_name, 40), p_net_worth, p_return_rate, p_initial_cash,
    p_market_session, p_top_tier, p_luxury_count, coalesce(p_showcase, '{}'),
    p_reputation, 'basic', v_week_start, v_weekly_baseline,
    round(v_weekly_return, 2), left(p_title, 30), p_trade_count,
    round(p_win_rate, 2), now()
  )
  on conflict (user_id) do update set
    display_name = excluded.display_name,
    net_worth = excluded.net_worth,
    return_rate = excluded.return_rate,
    initial_cash = excluded.initial_cash,
    market_session = excluded.market_session,
    top_tier = excluded.top_tier,
    luxury_count = excluded.luxury_count,
    showcase = excluded.showcase,
    reputation = excluded.reputation,
    integrity_status = 'basic',
    weekly_start = excluded.weekly_start,
    weekly_start_net_worth = excluded.weekly_start_net_worth,
    weekly_return = excluded.weekly_return,
    title = excluded.title,
    trade_count = excluded.trade_count,
    win_rate = excluded.win_rate,
    updated_at = now();
end;
$$;

revoke all on function public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint,
  text, int, numeric
) from public, anon;
grant execute on function public.submit_leaderboard(
  text, bigint, numeric, bigint, bigint, int, int, text[], bigint,
  text, int, numeric
) to authenticated;

-- ================================================================
-- 20260714120000_signup_via_trigger.sql
-- ================================================================
-- 로그인/회원가입을 Edge Function 없이 동작하도록 재설계한다.
--
-- 배경: 기존 가입은 game-account Edge Function(admin.createUser)에 의존했다.
--   Free 플랜에서 Edge Function 무료 한도를 소진하면 게이트웨이가 402(Payment
--   Required)로 전체 Edge Function을 막아버려, 신규 가입이 전부 실패했다.
--   (기존 계정 로그인은 /token 이라 정상, 신규 가입만 붕괴)
--
-- 해결: 클라이언트가 supabase.auth.signUp() 으로 직접 가입하고, 아래 트리거가
--   game_accounts 매핑을 자동 생성한다. 시세 크론(tick-market)과 가입이 더 이상
--   같은 Edge Function 한도를 공유하지 않는다.

-- 1) 신규 유저 생성 시 profiles + game_accounts 매핑을 자동 생성.
--    game_id 는 raw_user_meta_data.game_id 에서 읽는다(클라이언트 signUp 의
--    options.data.game_id, 그리고 기존 Edge Function 이 넣던 user_metadata 와 동일 키).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  gid text := new.raw_user_meta_data ->> 'game_id';
begin
  insert into public.profiles (id) values (new.id)
  on conflict (id) do nothing;

  -- 게임 아이디 형식이 맞을 때만 매핑을 만든다(형식 밖 계정은 건너뜀).
  -- 이메일이 game_id 에서 파생돼 이미 유일하므로 여기서 충돌은 없지만,
  -- 어떤 경우에도 auth 가입 자체를 깨지 않도록 방어적으로 on conflict do nothing.
  if gid is not null and gid ~ '^[a-z0-9_]{3,20}$' then
    insert into public.game_accounts (game_id, user_id)
    values (gid, new.id)
    on conflict do nothing;
  end if;

  return new;
end;
$$;

-- 2) 게임 계정(가짜 이메일)은 생성 즉시 확인 처리한다.
--    프로젝트의 "Confirm email" 설정과 무관하게 로그인이 되도록 하는 안전장치다.
--    이 계정들은 실제 이메일을 받지 않으므로 이메일 확인은 의미가 없다.
create or replace function public.autoconfirm_game_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email like 'game.%@2dstock.local' and new.email_confirmed_at is null then
    new.email_confirmed_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists autoconfirm_game_user on auth.users;
create trigger autoconfirm_game_user
  before insert on auth.users
  for each row execute function public.autoconfirm_game_user();

-- ================================================================
-- 20260714123000_register_game_account_rpc.sql
-- ================================================================
-- 가입을 이메일 발송/Edge Function/"Confirm email" 설정에 전혀 의존하지 않도록
-- DB 함수로 처리한다.
--
-- 배경: 클라이언트 signUp 은 프로젝트의 "Confirm email" 설정이 켜져 있으면
--   가짜 이메일(game.*@2dstock.local)로 확인메일 발송을 시도하다 실패/레이트리밋으로
--   가입이 깨진다("서버 문제로 로그인할 수 없습니다"). Edge Function 경로는 Free 플랜
--   402 로 막혀 있다. 그래서 GoTrue 가 관리자 API 로 만드는 계정과 "동일한 구조"의
--   auth.users + auth.identities 행을 직접 만들어(비밀번호는 bcrypt 해시) 어떤 외부
--   요소에도 의존하지 않게 한다. 로그인은 표준 signInWithPassword 로 검증한다.
--
-- 반환값: 'created' | 'exists' | 'invalid_game_id' | 'invalid_pin'
--   - 'exists' 는 계정 탈취 방지를 위해 아무것도 변경하지 않는다(클라이언트가 이어서
--     로그인으로 PIN 을 검증한다).

create or replace function public.register_game_account(p_game_id text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_uid uuid;
  v_now timestamptz := now();
begin
  if p_game_id !~ '^[a-z0-9_]{3,20}$' then
    return 'invalid_game_id';
  end if;
  if p_pin !~ '^\d{6}$' then
    return 'invalid_pin';
  end if;

  v_email := 'game.' || p_game_id || '@2dstock.local';

  if exists (select 1 from auth.users where email = v_email) then
    return 'exists';
  end if;

  v_uid := gen_random_uuid();

  -- GoTrue(admin.createUser)가 만드는 이메일 계정과 동일한 형태로 생성한다.
  -- confirmed_at 은 generated 컬럼이라 넣지 않는다(email_confirmed_at 에서 파생).
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, last_sign_in_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    v_now, v_now,
    jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
    jsonb_build_object('game_id', p_game_id, 'email_verified', true),
    v_now, v_now
  );

  -- 이메일 로그인에 필요한 identity. email 컬럼은 generated 라 넣지 않는다.
  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, 'email', v_uid::text,
    jsonb_build_object(
      'sub', v_uid::text, 'email', v_email,
      'email_verified', false, 'phone_verified', false
    ),
    v_now, v_now, v_now
  );

  -- profiles / game_accounts 는 on_auth_user_created 트리거가 자동 생성한다.
  return 'created';
end;
$$;

revoke all on function public.register_game_account(text, text) from public;
grant execute on function public.register_game_account(text, text) to anon, authenticated;

-- ================================================================
-- 20260714130000_register_tokens_not_null.sql
-- ================================================================
-- GoTrue 로그인 호환: 직접 생성하는 auth.users 의 토큰 컬럼을 NULL 이 아닌 ''로.
--
-- 배경: register_game_account 가 confirmation_token/recovery_token/email_change/
--   email_change_token_new 등을 넣지 않아 NULL 로 남았는데, GoTrue 는 이 문자열
--   컬럼을 NULL 이 아닌 ''로 기대한다. NULL 이면 비밀번호가 맞아도 로그인이 거부된다
--   (신규 프로젝트로 데이터 이전 후 "PIN 불일치"로 오인된 근본 원인).
--
-- 여기서는 함수만 고친다. 이미 만들어진 유저의 NULL → '' 보정은 데이터 보정
--   쿼리로 별도 수행한다(이전 스크립트).

create or replace function public.register_game_account(p_game_id text, p_pin text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_uid uuid;
  v_now timestamptz := now();
begin
  if p_game_id !~ '^[a-z0-9_]{3,20}$' then return 'invalid_game_id'; end if;
  if p_pin !~ '^\d{6}$' then return 'invalid_pin'; end if;

  v_email := 'game.' || p_game_id || '@2dstock.local';
  if exists (select 1 from auth.users where email = v_email) then return 'exists'; end if;

  v_uid := gen_random_uuid();

  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at,
    confirmation_token, recovery_token, email_change,
    email_change_token_new, email_change_token_current,
    phone_change, phone_change_token, reauthentication_token
  ) values (
    '00000000-0000-0000-0000-000000000000', v_uid, 'authenticated', 'authenticated',
    v_email, extensions.crypt(p_pin, extensions.gen_salt('bf', 10)),
    v_now, v_now,
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('game_id',p_game_id,'email_verified',true),
    v_now, v_now,
    '', '', '', '', '', '', '', ''
  );

  insert into auth.identities (
    id, user_id, provider, provider_id, identity_data,
    last_sign_in_at, created_at, updated_at
  ) values (
    gen_random_uuid(), v_uid, 'email', v_uid::text,
    jsonb_build_object('sub',v_uid::text,'email',v_email,'email_verified',false,'phone_verified',false),
    v_now, v_now, v_now
  );

  return 'created';
end;
$$;


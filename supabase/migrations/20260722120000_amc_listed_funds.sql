-- 유저 ETF 공유 상장 · AUM(유통 좌수) · 운용료 NAV 차감.
-- 인증 유저는 전체 SELECT, 생성·메타 갱신은 본인 운용만,
-- 좌수 증감(매수/매도)과 운용료 차감은 security definer RPC.

create table if not exists public.amc_listed_funds (
  id text primary key,
  manager_user_id uuid not null references auth.users (id) on delete cascade,
  manager_game_id text not null,
  manager_name text not null check (char_length(manager_name) between 2 and 40),
  manager_tagline text not null check (char_length(manager_tagline) between 2 and 80),
  manager_detail text check (manager_detail is null or char_length(manager_detail) <= 500),
  name text not null check (char_length(name) between 2 and 40),
  ticker text not null check (ticker ~ '^[A-Z0-9]{2,6}$'),
  style text not null check (style in ('active', 'passive')),
  fee_rate double precision not null check (fee_rate > 0 and fee_rate <= 0.03),
  benchmark_stock_id text,
  holdings jsonb not null,
  total_shares double precision not null check (total_shares > 0),
  seed_nav_value bigint not null check (seed_nav_value >= 0),
  status text not null default 'active'
    check (status in ('active', 'grace', 'delisted')),
  last_fee_session bigint not null,
  last_rebalance_session bigint not null,
  grace_started_session bigint,
  created_session bigint not null,
  cumulative_fees_paid bigint not null default 0 check (cumulative_fees_paid >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists amc_listed_funds_status_idx
  on public.amc_listed_funds (status, updated_at desc);
create index if not exists amc_listed_funds_manager_idx
  on public.amc_listed_funds (manager_user_id);
create unique index if not exists amc_listed_funds_ticker_live_idx
  on public.amc_listed_funds (ticker)
  where status <> 'delisted';

alter table public.amc_listed_funds enable row level security;

drop policy if exists "amc_listed_funds_select_auth" on public.amc_listed_funds;
create policy "amc_listed_funds_select_auth" on public.amc_listed_funds
  for select to authenticated
  using (true);

drop policy if exists "amc_listed_funds_insert_own" on public.amc_listed_funds;
create policy "amc_listed_funds_insert_own" on public.amc_listed_funds
  for insert to authenticated
  with check (auth.uid() = manager_user_id);

drop policy if exists "amc_listed_funds_update_own" on public.amc_listed_funds;
create policy "amc_listed_funds_update_own" on public.amc_listed_funds
  for update to authenticated
  using (auth.uid() = manager_user_id)
  with check (auth.uid() = manager_user_id);

grant select, insert, update on public.amc_listed_funds to authenticated;
revoke delete on public.amc_listed_funds from anon, authenticated;

-- 매수(+)/매도(-)로 공유 AUM(유통 좌수·시드 NAV)을 원자적으로 조정한다.
-- p_cash_delta: 체결 대금(센트). 매수 시 +, 매도 시 - (좌당 NAV × 수량).
create or replace function public.amc_adjust_shares(
  p_fund_id text,
  p_delta double precision,
  p_cash_delta bigint default 0
)
returns public.amc_listed_funds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.amc_listed_funds;
  v_next_shares double precision;
  v_next_seed bigint;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  -- NaN/±Inf/null/0 거부 (Postgres에 finite() 없음)
  if p_delta is null
     or p_delta = 0
     or p_delta <> p_delta
     or p_delta = 'Infinity'::double precision
     or p_delta = '-Infinity'::double precision then
    raise exception 'invalid_delta';
  end if;
  if p_cash_delta is null then
    raise exception 'invalid_cash_delta';
  end if;

  select * into v_row
  from public.amc_listed_funds
  where id = p_fund_id
  for update;

  if not found then
    raise exception 'fund_not_found';
  end if;
  if v_row.status = 'delisted' then
    raise exception 'fund_delisted';
  end if;
  if v_row.status = 'grace' and p_delta > 0 then
    raise exception 'fund_grace_no_buy';
  end if;

  v_next_shares := v_row.total_shares + p_delta;
  if v_next_shares <= 0 then
    raise exception 'insufficient_shares';
  end if;

  v_next_seed := v_row.seed_nav_value + p_cash_delta;
  if v_next_seed < 0 then
    raise exception 'insufficient_nav';
  end if;
  -- 매수면 시드 NAV도 같이 늘고, 매도면 같이 줄어야 한다(부호 일치).
  if (p_delta > 0 and p_cash_delta < 0) or (p_delta < 0 and p_cash_delta > 0) then
    raise exception 'cash_delta_sign_mismatch';
  end if;

  update public.amc_listed_funds
  set
    total_shares = v_next_shares,
    seed_nav_value = v_next_seed,
    updated_at = now()
  where id = p_fund_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.amc_adjust_shares(text, double precision, bigint) from public;
grant execute on function public.amc_adjust_shares(text, double precision, bigint) to authenticated;

-- 구 시그니처 정리(존재 시)
drop function if exists public.amc_adjust_shares(text, double precision);

-- 운용자만 운용료 NAV 차감을 공유 원장에 반영한다.
create or replace function public.amc_apply_management_fee(
  p_fund_id text,
  p_due_session bigint,
  p_amount bigint,
  p_new_seed_nav_value bigint,
  p_new_last_fee_session bigint,
  p_new_cumulative_fees_paid bigint
)
returns public.amc_listed_funds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.amc_listed_funds;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated';
  end if;
  if p_amount < 0 or p_new_seed_nav_value < 0 or p_new_cumulative_fees_paid < 0 then
    raise exception 'invalid_fee_payload';
  end if;

  select * into v_row
  from public.amc_listed_funds
  where id = p_fund_id
  for update;

  if not found then
    raise exception 'fund_not_found';
  end if;
  if v_row.manager_user_id <> auth.uid() then
    raise exception 'not_manager';
  end if;
  if v_row.status = 'delisted' then
    raise exception 'fund_delisted';
  end if;
  -- 이미 더 앞 회차까지 반영됐으면 멱등 no-op
  if v_row.last_fee_session >= p_new_last_fee_session then
    return v_row;
  end if;

  update public.amc_listed_funds
  set
    seed_nav_value = p_new_seed_nav_value,
    last_fee_session = p_new_last_fee_session,
    cumulative_fees_paid = p_new_cumulative_fees_paid,
    updated_at = now()
  where id = p_fund_id
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.amc_apply_management_fee(text, bigint, bigint, bigint, bigint, bigint) from public;
grant execute on function public.amc_apply_management_fee(text, bigint, bigint, bigint, bigint, bigint) to authenticated;

-- 회사/운용사 설립 신청은 IPO 종목 요청 쿨다운과 분리한다.
create or replace function public.enforce_stock_request_cooldown()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_last timestamptz;
  v_kind text;
begin
  if coalesce(new.description, '') like '[PLAYER_COMPANY_FOUNDATION]%' then
    v_kind := 'company';
  elsif coalesce(new.description, '') like '[ASSET_MANAGER_FOUNDATION]%' then
    v_kind := 'amc';
  else
    v_kind := 'ipo';
  end if;

  select max(created_at) into v_last
  from public.stock_requests
  where user_id = new.user_id
    and (
      case v_kind
        when 'company' then coalesce(description, '') like '[PLAYER_COMPANY_FOUNDATION]%'
        when 'amc' then coalesce(description, '') like '[ASSET_MANAGER_FOUNDATION]%'
        else coalesce(description, '') not like '[PLAYER_COMPANY_FOUNDATION]%'
          and coalesce(description, '') not like '[ASSET_MANAGER_FOUNDATION]%'
      end
    );

  if v_last is not null and now() - v_last < interval '5 hours' then
    raise exception 'stock_request_cooldown'
      using hint = '요청 쿨다운(5거래일)이 아직 남았습니다.';
  end if;

  return new;
end;
$$;

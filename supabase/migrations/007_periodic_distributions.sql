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

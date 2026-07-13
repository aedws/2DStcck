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

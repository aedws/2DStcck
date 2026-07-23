-- 거래뿐 아니라 운용료·배당·상폐 정산도 bigint 캐스트 없이 numeric으로 끝까지
-- 계산한다. 기존 함수 본문의 검증·정산 순서는 유지하고 금액 지역변수와 강제
-- bigint 캐스트만 정밀형으로 승격한다.

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
    select user_id, sum(amount) as amount
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

revoke all on function public.amc_credit_event(bigint)
  from public, anon, authenticated;

do $$
declare
  v_definition text;
begin
  select pg_get_functiondef(
    'public.amc_settle_fund_internal(text,bigint,double precision,double precision)'::regprocedure
  ) into v_definition;

  v_definition := replace(v_definition, 'v_nav bigint;', 'v_nav numeric;');
  v_definition := replace(v_definition, 'v_amount bigint;', 'v_amount numeric;');
  v_definition := replace(
    v_definition,
    'v_seed_deduction bigint;',
    'v_seed_deduction numeric;'
  );
  v_definition := replace(
    v_definition,
    'v_per_share bigint;',
    'v_per_share numeric;'
  );
  -- 이 함수에서 ::bigint는 금액·지급액 반올림 또는 현재 회차 정수화에만 쓰인다.
  -- 회차 변수는 이미 bigint이므로 캐스트를 제거해도 동일하며, 금액은 numeric 유지.
  v_definition := replace(v_definition, '::bigint', '');

  execute v_definition;
end;
$$;

-- 자진 상장폐지 RPC의 bigint 캐스팅이 초인플레 규모 펀드에서 오버플로우로 실패하던
-- 문제를 고친다. 저장 컬럼과 자동청산 경로(amc_settle_fund_internal)가 이미 numeric
-- 이므로 동일하게 numeric으로 통일한다. 계산식·정책은 그대로.
create or replace function public.amc_voluntary_delist_fund(
  p_fund_id text,
  p_current_session bigint,
  p_price_factor double precision,
  p_passive_period_rate double precision default 0
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_now_session bigint := floor(extract(epoch from now()) / 3600)::bigint;
  v_fund public.amc_listed_funds;
  v_nav numeric;
  v_amount numeric;
  v_event_id bigint;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if abs(p_current_session - v_now_session) > 1 then raise exception 'invalid_session'; end if;
  if p_price_factor is null or p_price_factor <= 0 or p_price_factor <> p_price_factor
     or p_price_factor = 'Infinity'::double precision
     or p_price_factor = '-Infinity'::double precision then
    raise exception 'invalid_price_factor';
  end if;
  if p_passive_period_rate is null or p_passive_period_rate < 0
     or p_passive_period_rate > 0.05 then raise exception 'invalid_passive_rate'; end if;

  select * into v_fund from public.amc_listed_funds where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.manager_user_id <> v_uid then raise exception 'not_manager'; end if;
  if v_fund.status = 'delisted' then raise exception 'fund_delisted'; end if;

  perform public.amc_settle_fund_internal(
    p_fund_id, p_current_session, p_price_factor, p_passive_period_rate
  );
  select * into v_fund from public.amc_listed_funds where id = p_fund_id for update;
  if v_fund.status = 'delisted' then
    return jsonb_build_object(
      'fund', to_jsonb(v_fund), 'settled', true, 'alreadySettledByCompliance', true
    );
  end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value::numeric * p_price_factor::numeric
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / greatest(v_fund.total_shares::numeric, 0.000000001)
  ));
  v_amount := greatest(0, round(v_nav * v_fund.total_shares::numeric));

  insert into public.amc_fund_events (
    fund_id, ticker, kind, due_session, per_share, total
  )
  values (
    v_fund.id, v_fund.ticker, 'delist', p_current_session, v_nav, v_amount
  )
  on conflict (fund_id, kind, due_session) do nothing
  returning id into v_event_id;
  if v_event_id is null then
    select id into v_event_id from public.amc_fund_events
    where fund_id = v_fund.id and kind = 'delist' and due_session = p_current_session;
  end if;

  insert into public.amc_fund_payments (event_id, user_id, quantity, amount)
  select v_event_id, user_id, quantity,
    greatest(0, round(quantity::numeric * v_nav))
  from public.amc_fund_positions
  where fund_id = v_fund.id and quantity > 0
  on conflict (event_id, user_id) do nothing;

  perform public.amc_credit_event(v_event_id);

  update public.amc_fund_positions set quantity = 0, updated_at = now()
  where fund_id = v_fund.id and quantity > 0;

  update public.amc_listed_funds set
    status = 'delisted',
    grace_started_session = null,
    last_price_factor = p_price_factor,
    last_nav_per_share = v_nav,
    last_passive_period_rate = p_passive_period_rate,
    settlement_input_at = now(),
    updated_at = now()
  where id = v_fund.id returning * into v_fund;

  return jsonb_build_object(
    'fund', to_jsonb(v_fund), 'settled', true, 'navPerShare', v_nav, 'total', v_amount
  );
end;
$function$;

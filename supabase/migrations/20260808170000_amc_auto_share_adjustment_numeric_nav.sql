-- 자동 분할/병합 판정의 좌당 NAV(v_nav)를 bigint 로 캐스팅해, 초인플레로 좌당 NAV가
-- 9.2e18 을 넘는 펀드에서 오버플로우 예외가 나 자동 분할이 아예 실행되지 않던 문제
-- (버그리포트 d708cb76 — 히나 증권 ETF 수익률 폭증). 분할이 막혀 좌수가 1주에 고정
-- 되고 좌당 NAV = 전체 AUM 이 되어 수익률이 비정상적으로 보였다. v_nav 를 numeric
-- 으로 통일한다(저장 컬럼 last_nav_per_share 도 numeric). 병합 하한(cc623ab0) 유지.
--
-- (라이브 DB 에 apply_migration 으로 적용됨. 고정돼 있던 HOO·HHH·HIGI 는 가치 보존
--  분할로 좌당 ~$100 로 정상화.)

create or replace function public.amc_apply_auto_share_adjustment_internal(
  p_fund_id text, p_current_session bigint, p_price_factor double precision
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fund public.amc_listed_funds;
  v_nav numeric;
begin
  select * into v_fund from public.amc_listed_funds where id = p_fund_id;
  if not found then raise exception 'fund_not_found'; end if;

  if v_fund.status = 'delisted'
     or (v_fund.last_share_adjustment_session is not null
         and p_current_session - v_fund.last_share_adjustment_session < 5) then
    return jsonb_build_object('fund', to_jsonb(v_fund), 'adjusted', false, 'kind', 'cooldown', 'multiplier', 1);
  end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value::numeric * p_price_factor::numeric
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / greatest(v_fund.total_shares::numeric, 0.000000001)
  ));

  if v_nav < 100 then
    return public.amc_consolidate_micro_nav_internal(p_fund_id, p_current_session, p_price_factor);
  end if;

  return public.amc_apply_auto_share_adjustment_internal_without_cooldown(
    p_fund_id, p_current_session, p_price_factor
  );
end;
$function$;

create or replace function public.amc_apply_auto_share_adjustment_internal_without_cooldown(
  p_fund_id text, p_current_session bigint, p_price_factor double precision
)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_fund public.amc_listed_funds;
  v_now_session bigint := floor(extract(epoch from now()) / 3600)::bigint;
  v_nav numeric;
  v_multiplier double precision := 1;
  v_kind text := 'none';
begin
  if abs(p_current_session - v_now_session) > 1 then raise exception 'invalid_session'; end if;
  if p_price_factor is null or p_price_factor <= 0 or p_price_factor <> p_price_factor
     or p_price_factor = 'Infinity'::double precision
     or p_price_factor = '-Infinity'::double precision then
    raise exception 'invalid_price_factor';
  end if;

  select * into v_fund from public.amc_listed_funds where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.status = 'delisted' or v_fund.last_share_adjustment_session = p_current_session then
    return jsonb_build_object('fund', to_jsonb(v_fund), 'adjusted', false, 'kind', 'none', 'multiplier', 1);
  end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value::numeric * p_price_factor::numeric
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / v_fund.total_shares::numeric
  ));

  if v_fund.split_trigger_price is not null and v_nav >= v_fund.split_trigger_price then
    v_multiplier := v_fund.split_ratio;
    v_kind := 'split';
  elsif v_fund.reverse_split_trigger_price is not null
     and v_nav <= v_fund.reverse_split_trigger_price
     and v_fund.total_shares / v_fund.reverse_split_ratio::double precision >= 1 then
    v_multiplier := 1.0 / v_fund.reverse_split_ratio::double precision;
    v_kind := 'reverse_split';
  end if;

  if v_kind = 'none' then
    update public.amc_listed_funds
    set last_price_factor = p_price_factor, last_nav_per_share = v_nav, updated_at = now()
    where id = v_fund.id returning * into v_fund;
    return jsonb_build_object('fund', to_jsonb(v_fund), 'adjusted', false, 'kind', v_kind, 'multiplier', 1);
  end if;

  update public.amc_fund_positions
  set quantity = quantity * v_multiplier, updated_at = now()
  where fund_id = v_fund.id;

  update public.amc_listed_funds
  set total_shares = total_shares * v_multiplier,
      share_multiplier = share_multiplier * v_multiplier,
      last_share_adjustment_session = p_current_session,
      last_price_factor = p_price_factor,
      last_nav_per_share = greatest(1, round(v_nav / v_multiplier)),
      updated_at = now()
  where id = v_fund.id returning * into v_fund;

  return jsonb_build_object('fund', to_jsonb(v_fund), 'adjusted', true, 'kind', v_kind, 'multiplier', v_multiplier);
end;
$function$;

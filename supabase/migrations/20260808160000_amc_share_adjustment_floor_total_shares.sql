-- 자동 병합(역분할)·마이크로NAV 통합이 total_shares 하한 없이 반복돼 좌수가 1주
-- 미만(예: 0.04주)으로 붕괴, 좌당 NAV = 전체 AUM 이 되던 문제(버그리포트 cc623ab0).
-- 두 병합 경로 모두 '병합 후 최소 1주 유지' 하한을 둔다. 가치는 원래도 보존
-- (좌당NAV × 좌수 = AUM)되므로, 이 변경은 좌수 표현 퇴화만 막는다.
-- (라이브 DB 에 apply_migration 으로 적용됨. 붕괴된 기존 펀드 JBPF2I(0.04주)는
--  가치 보존 분할로 4주로 재정합.)

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
  v_nav bigint;
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
  )::bigint);

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
      last_nav_per_share = greatest(1, round(v_nav / v_multiplier)::bigint),
      updated_at = now()
  where id = v_fund.id returning * into v_fund;

  return jsonb_build_object('fund', to_jsonb(v_fund), 'adjusted', true, 'kind', v_kind, 'multiplier', v_multiplier);
end;
$function$;

create or replace function public.amc_consolidate_micro_nav_internal(
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
  v_nav bigint;
  v_ratio numeric := 1;
begin
  if abs(p_current_session - v_now_session) > 1 then raise exception 'invalid_session'; end if;
  if p_price_factor is null or p_price_factor <= 0 or p_price_factor <> p_price_factor
     or p_price_factor in ('Infinity'::double precision, '-Infinity'::double precision) then
    raise exception 'invalid_price_factor';
  end if;

  select * into v_fund from public.amc_listed_funds where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.status = 'delisted' or v_fund.total_shares <= 0 then
    return jsonb_build_object('fund', to_jsonb(v_fund), 'adjusted', false, 'kind', 'none', 'multiplier', 1);
  end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value::numeric * p_price_factor::numeric
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / v_fund.total_shares::numeric
  )::bigint);

  if v_nav >= 100 then
    return jsonb_build_object('fund', to_jsonb(v_fund), 'adjusted', false, 'kind', 'none', 'multiplier', 1);
  end if;

  while v_nav::numeric * v_ratio < 1000 loop
    if v_fund.total_shares / (v_ratio * 10) < 1 then exit; end if;
    v_ratio := v_ratio * 10;
    if v_ratio > 1000000000000 then
      raise exception 'micro_nav_consolidation_ratio_too_large';
    end if;
  end loop;

  if v_ratio <= 1 then
    return jsonb_build_object('fund', to_jsonb(v_fund), 'adjusted', false, 'kind', 'none', 'multiplier', 1);
  end if;

  update public.amc_fund_positions
  set quantity = quantity / v_ratio::double precision, updated_at = now()
  where fund_id = v_fund.id;

  update public.amc_listed_funds
  set total_shares = total_shares / v_ratio::double precision,
      share_multiplier = share_multiplier / v_ratio::double precision,
      last_share_adjustment_session = p_current_session,
      last_price_factor = p_price_factor,
      last_nav_per_share = greatest(1, round(v_nav::numeric * v_ratio)::bigint),
      updated_at = now()
  where id = v_fund.id returning * into v_fund;

  return jsonb_build_object('fund', to_jsonb(v_fund), 'adjusted', true, 'kind', 'reverse_split',
    'multiplier', (1 / v_ratio), 'ratio', v_ratio);
end;
$function$;

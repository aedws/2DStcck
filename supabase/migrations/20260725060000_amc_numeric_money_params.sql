-- 유저 ETF 금액 파라미터를 bigint→numeric 로 바꿔 고액 NAV(>9.2e18)에서
-- 'invalid input syntax for type bigint'/'out of range' 오류를 없앤다.
-- 컬럼은 이미 numeric 이며 파라미터 타입만 병목이었다. (버그리포트 bbd215ba/55167906)
-- 본문은 기존과 동일, 금액 파라미터 타입만 numeric 으로 변경(세션 파라미터는 bigint 유지).

drop function if exists public.amc_sync_fund_meta(text,text,text,text,text,jsonb,text,integer,double precision,boolean,double precision,bigint,bigint);
create or replace function public.amc_sync_fund_meta(p_fund_id text, p_manager_name text, p_manager_tagline text, p_manager_detail text, p_name text, p_holdings jsonb, p_benchmark_stock_id text, p_dividend_interval_days integer, p_dividend_rate double precision, p_include_nav boolean default false, p_basket_price_factor double precision default 1, p_seed_nav_value numeric default 0, p_last_rebalance_session bigint default 0)
 returns amc_listed_funds
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    or p_last_rebalance_session <= v_row.last_rebalance_session
  ) then raise exception 'stale_nav_meta'; end if;

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
$function$;
revoke all on function public.amc_sync_fund_meta(text,text,text,text,text,jsonb,text,integer,double precision,boolean,double precision,numeric,bigint) from public, anon;
grant execute on function public.amc_sync_fund_meta(text,text,text,text,text,jsonb,text,integer,double precision,boolean,double precision,numeric,bigint) to authenticated;

drop function if exists public.amc_apply_management_fee(text,bigint,bigint,bigint,bigint,bigint);
create or replace function public.amc_apply_management_fee(p_fund_id text, p_due_session bigint, p_amount numeric, p_new_seed_nav_value numeric, p_new_last_fee_session bigint, p_new_cumulative_fees_paid numeric)
 returns amc_listed_funds
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.amc_listed_funds;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_amount < 0 or p_new_seed_nav_value < 0 or p_new_cumulative_fees_paid < 0 then
    raise exception 'invalid_fee_payload';
  end if;
  select * into v_row from public.amc_listed_funds where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_row.manager_user_id <> auth.uid() then raise exception 'not_manager'; end if;
  if v_row.status = 'delisted' then raise exception 'fund_delisted'; end if;
  if v_row.last_fee_session >= p_new_last_fee_session then return v_row; end if;
  update public.amc_listed_funds
  set seed_nav_value = p_new_seed_nav_value,
    last_fee_session = p_new_last_fee_session,
    cumulative_fees_paid = p_new_cumulative_fees_paid,
    updated_at = now()
  where id = p_fund_id returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.amc_apply_management_fee(text,bigint,numeric,numeric,bigint,numeric) from public, anon;
grant execute on function public.amc_apply_management_fee(text,bigint,numeric,numeric,bigint,numeric) to authenticated;

drop function if exists public.amc_apply_dividend(text,bigint,bigint,bigint,bigint,bigint,bigint,jsonb);
create or replace function public.amc_apply_dividend(p_fund_id text, p_due_session bigint, p_per_share numeric, p_total numeric, p_new_seed_nav_value numeric, p_new_last_dividend_session bigint, p_new_cumulative_dividends_paid numeric, p_dividend_history jsonb)
 returns amc_listed_funds
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.amc_listed_funds;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_per_share < 0 or p_total < 0 or p_new_seed_nav_value < 0
     or p_new_cumulative_dividends_paid < 0 then
    raise exception 'invalid_dividend_payload';
  end if;
  select * into v_row from public.amc_listed_funds where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_row.manager_user_id <> auth.uid() then raise exception 'not_manager'; end if;
  if v_row.status = 'delisted' then raise exception 'fund_delisted'; end if;
  if v_row.last_dividend_session >= p_new_last_dividend_session then return v_row; end if;
  update public.amc_listed_funds
  set seed_nav_value = p_new_seed_nav_value,
    last_dividend_session = p_new_last_dividend_session,
    cumulative_dividends_paid = p_new_cumulative_dividends_paid,
    dividend_history = coalesce(p_dividend_history, '[]'::jsonb),
    updated_at = now()
  where id = p_fund_id returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.amc_apply_dividend(text,bigint,numeric,numeric,numeric,bigint,numeric,jsonb) from public, anon;
grant execute on function public.amc_apply_dividend(text,bigint,numeric,numeric,numeric,bigint,numeric,jsonb) to authenticated;

drop function if exists public.amc_adjust_shares(text,double precision,bigint);
create or replace function public.amc_adjust_shares(p_fund_id text, p_delta double precision, p_cash_delta numeric default 0)
 returns amc_listed_funds
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_row public.amc_listed_funds;
  v_next_shares double precision;
  v_book numeric;
  v_seed_delta numeric;
  v_next_seed numeric;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  if p_delta is null or p_delta = 0 or p_delta <> p_delta
     or p_delta = 'Infinity'::double precision
     or p_delta = '-Infinity'::double precision then
    raise exception 'invalid_delta';
  end if;
  if p_cash_delta is null then raise exception 'invalid_cash_delta'; end if;
  if (p_delta > 0 and p_cash_delta < 0) or (p_delta < 0 and p_cash_delta > 0) then
    raise exception 'cash_delta_sign_mismatch';
  end if;
  select * into v_row from public.amc_listed_funds where id = p_fund_id for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_row.status = 'delisted' then raise exception 'fund_delisted'; end if;
  if v_row.status = 'grace' and p_delta > 0 then raise exception 'fund_grace_no_buy'; end if;
  v_next_shares := v_row.total_shares + p_delta;
  if v_next_shares <= 0 then raise exception 'insufficient_shares'; end if;
  if v_row.total_shares <= 0 then raise exception 'invalid_total_shares'; end if;
  v_book := v_row.seed_nav_value::numeric / v_row.total_shares::numeric;
  v_seed_delta := round(v_book * p_delta::numeric);
  v_next_seed := v_row.seed_nav_value + v_seed_delta;
  if v_next_seed < 0 then raise exception 'insufficient_nav'; end if;
  update public.amc_listed_funds
  set total_shares = v_next_shares, seed_nav_value = v_next_seed, updated_at = now()
  where id = p_fund_id returning * into v_row;
  return v_row;
end;
$function$;
revoke all on function public.amc_adjust_shares(text,double precision,numeric) from public, anon;
grant execute on function public.amc_adjust_shares(text,double precision,numeric) to authenticated;

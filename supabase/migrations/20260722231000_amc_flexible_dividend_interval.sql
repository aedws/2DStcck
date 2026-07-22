-- 배당 주기가 섞인 패시브 ETF는 운용사가 1~240거래일 중 N거래일을 직접 정한다.

alter table public.amc_listed_funds
  drop constraint if exists amc_listed_funds_dividend_interval_days_check;

alter table public.amc_listed_funds
  add constraint amc_listed_funds_dividend_interval_days_check
  check (dividend_interval_days between 1 and 240);

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
  if p_dividend_interval_days not between 1 and 240
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

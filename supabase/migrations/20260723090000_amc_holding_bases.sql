-- 유저 ETF 구성별 편입 기준가를 holdings JSON에 함께 저장한다.
-- 기존 행은 운용사 접속 시 현재 NAV를 보존하며 자동 전환되므로 nullable 호환을 유지한다.

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
  v_base_count integer;
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

  select
    count(*),
    coalesce(sum((item ->> 'weight')::double precision), 0),
    count(*) filter (where item ? 'basePrice')
  into v_count, v_weight_sum, v_base_count
  from jsonb_array_elements(p_holdings) as item
  where jsonb_typeof(item) = 'object'
    and coalesce(item ->> 'stockId', '') <> ''
    and coalesce(item ->> 'weight', '') ~ '^[0-9]+([.][0-9]+)?$'
    and (item ->> 'weight')::double precision > 0
    and (
      not (item ? 'basePrice')
      or (
        coalesce(item ->> 'basePrice', '') ~ '^[0-9]+([.][0-9]+)?([eE][+-]?[0-9]+)?$'
        and (item ->> 'basePrice')::double precision > 0
      )
    );
  if v_count <> jsonb_array_length(p_holdings)
     or v_count not between 3 and 30
     or abs(v_weight_sum - 1) > 0.000001
     or v_base_count not in (0, v_count) then
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

-- 2026-07-23 09:00 KST 결정론 시세 스냅샷으로 기존 활성 ETF를 즉시 전환한다.
-- 구 NAV는 seed에 확정하므로 전환 자체로 좌당 NAV·AUM은 변하지 않는다.
with price_snapshot as (
  select '{"sbnd":{"display":11892,"initial":10000,"economic":11892},"bahnk-leverage-2x":{"display":8260,"initial":10000,"economic":8259.93779867921},"bahnk-covered-call":{"display":11641,"initial":10000,"economic":11641},"bahnk":{"display":34606,"initial":29000,"economic":34606},"nkvol":{"display":13018,"initial":14000,"economic":13018},"bagdi":{"display":40871,"initial":45000,"economic":40871},"baui":{"display":17307,"initial":19000,"economic":17307},"nkexa":{"display":21473,"initial":23500,"economic":21473},"hinafg":{"display":46298,"initial":52000,"economic":46298},"bahina":{"display":111114,"initial":142000,"economic":111114},"bafka":{"display":33710,"initial":26000,"economic":33710},"ba68":{"display":18309,"initial":21000,"economic":18309},"baksm":{"display":33747,"initial":33000,"economic":33747},"bakrr":{"display":46918,"initial":41000,"economic":46918},"bahrn":{"display":47225,"initial":47000,"economic":47225},"nkccl-leverage-2x":{"display":1333,"initial":10000,"economic":666.5336350041797},"wwlcl-leverage-2x":{"display":2595,"initial":10000,"economic":2595.2715807510676},"wwmne-leverage-2x":{"display":1883,"initial":10000,"economic":235.38318478923864},"nkmna-leverage-2x":{"display":2057,"initial":10000,"economic":2057.395580078386},"aegil-leverage-2x":{"display":3439,"initial":10000,"economic":3439.4539348399467},"aeyvn-leverage-2x":{"display":1436,"initial":10000,"economic":359.0183861999944},"nkilg-leverage-2x":{"display":8567,"initial":10000,"economic":8567.22395808129},"ersua":{"display":68886,"initial":57000,"economic":68886},"wwjin":{"display":16637,"initial":18500,"economic":16637},"yisang":{"display":76242,"initial":73000,"economic":76242},"dante":{"display":87732,"initial":95000,"economic":87732},"baghb":{"display":11284,"initial":9700,"economic":11284},"bakvb":{"display":11448,"initial":10100,"economic":11448},"baabb":{"display":11237,"initial":9400,"economic":11237},"batrb":{"display":11333,"initial":10300,"economic":11333},"bamlb":{"display":10748,"initial":10200,"economic":10748},"wwchl":{"display":20750,"initial":21000,"economic":20750},"wwmne":{"display":45610,"initial":48000,"economic":45610},"nkmna":{"display":97547,"initial":85000,"economic":97547}}'::jsonb as prices
), converted as (
  select
    fund.id,
    round(
      fund.seed_nav_value::numeric
      * basket.old_factor
      / greatest(fund.basket_price_factor::numeric, 0.000000001)
    )::bigint as seed_nav_value,
    basket.holdings
  from public.amc_listed_funds as fund
  cross join price_snapshot
  cross join lateral (
    select
      sum(
        (item ->> 'weight')::numeric
        * (price_snapshot.prices -> (item ->> 'stockId') ->> 'display')::numeric
        / (price_snapshot.prices -> (item ->> 'stockId') ->> 'initial')::numeric
      ) as old_factor,
      jsonb_agg(
        item || jsonb_build_object(
          'basePrice',
          (price_snapshot.prices -> (item ->> 'stockId') ->> 'economic')::numeric
        )
        order by ordinal
      ) as holdings,
      bool_and(price_snapshot.prices ? (item ->> 'stockId')) as complete
    from jsonb_array_elements(fund.holdings) with ordinality as rows(item, ordinal)
  ) as basket
  where fund.status <> 'delisted'
    and basket.complete
    and exists (
      select 1
      from jsonb_array_elements(fund.holdings) as item
      where not (item ? 'basePrice')
    )
)
update public.amc_listed_funds as fund
set
  holdings = converted.holdings,
  seed_nav_value = converted.seed_nav_value,
  basket_price_factor = 1,
  updated_at = now()
from converted
where fund.id = converted.id;

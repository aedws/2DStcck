-- 유저 ETF 자동 액면분할·병합.
-- 발행좌수와 전 계정 보유좌수를 같은 트랜잭션에서 같은 배수로 조정해
-- AUM과 각 보유자의 평가금액을 보존한다.

alter table public.amc_listed_funds
  add column if not exists split_trigger_price bigint,
  add column if not exists split_ratio integer not null default 2,
  add column if not exists reverse_split_trigger_price bigint,
  add column if not exists reverse_split_ratio integer not null default 2,
  add column if not exists share_multiplier double precision not null default 1,
  add column if not exists last_share_adjustment_session bigint;

alter table public.amc_listed_funds
  drop constraint if exists amc_split_trigger_positive,
  drop constraint if exists amc_split_ratio_allowed,
  drop constraint if exists amc_reverse_split_trigger_positive,
  drop constraint if exists amc_reverse_split_ratio_allowed,
  drop constraint if exists amc_share_multiplier_positive,
  drop constraint if exists amc_share_adjustment_band_valid;

alter table public.amc_listed_funds
  add constraint amc_split_trigger_positive
    check (split_trigger_price is null or split_trigger_price > 0),
  add constraint amc_split_ratio_allowed
    check (split_ratio in (2, 5, 10)),
  add constraint amc_reverse_split_trigger_positive
    check (reverse_split_trigger_price is null or reverse_split_trigger_price > 0),
  add constraint amc_reverse_split_ratio_allowed
    check (reverse_split_ratio in (2, 5, 10)),
  add constraint amc_share_multiplier_positive
    check (share_multiplier > 0),
  add constraint amc_share_adjustment_band_valid
    check (
      split_trigger_price is null
      or reverse_split_trigger_price is null
      or reverse_split_trigger_price < split_trigger_price
    );

create or replace function public.amc_apply_auto_share_adjustment_internal(
  p_fund_id text,
  p_current_session bigint,
  p_price_factor double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
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

  select * into v_fund
  from public.amc_listed_funds
  where id = p_fund_id
  for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.status = 'delisted'
     or v_fund.last_share_adjustment_session = p_current_session then
    return jsonb_build_object(
      'fund', to_jsonb(v_fund), 'adjusted', false, 'kind', 'none', 'multiplier', 1
    );
  end if;

  v_nav := greatest(1, round(
    v_fund.seed_nav_value::numeric * p_price_factor::numeric
    / greatest(v_fund.basket_price_factor::numeric, 0.000000001)
    / v_fund.total_shares::numeric
  )::bigint);

  if v_fund.split_trigger_price is not null
     and v_nav >= v_fund.split_trigger_price then
    v_multiplier := v_fund.split_ratio;
    v_kind := 'split';
  elsif v_fund.reverse_split_trigger_price is not null
     and v_nav <= v_fund.reverse_split_trigger_price then
    v_multiplier := 1.0 / v_fund.reverse_split_ratio::double precision;
    v_kind := 'reverse_split';
  end if;

  if v_kind = 'none' then
    update public.amc_listed_funds
    set last_price_factor = p_price_factor,
        last_nav_per_share = v_nav,
        updated_at = now()
    where id = v_fund.id
    returning * into v_fund;
    return jsonb_build_object(
      'fund', to_jsonb(v_fund), 'adjusted', false, 'kind', v_kind, 'multiplier', 1
    );
  end if;

  update public.amc_fund_positions
  set quantity = quantity * v_multiplier,
      updated_at = now()
  where fund_id = v_fund.id;

  update public.amc_listed_funds
  set total_shares = total_shares * v_multiplier,
      share_multiplier = share_multiplier * v_multiplier,
      last_share_adjustment_session = p_current_session,
      last_price_factor = p_price_factor,
      last_nav_per_share = greatest(1, round(v_nav / v_multiplier)::bigint),
      updated_at = now()
  where id = v_fund.id
  returning * into v_fund;

  return jsonb_build_object(
    'fund', to_jsonb(v_fund),
    'adjusted', true,
    'kind', v_kind,
    'multiplier', v_multiplier
  );
end;
$$;

revoke all on function public.amc_apply_auto_share_adjustment_internal(
  text, bigint, double precision
) from public, anon, authenticated;

create or replace function public.amc_apply_auto_share_adjustment(
  p_fund_id text,
  p_current_session bigint,
  p_price_factor double precision
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;
  return public.amc_apply_auto_share_adjustment_internal(
    p_fund_id, p_current_session, p_price_factor
  );
end;
$$;

revoke all on function public.amc_apply_auto_share_adjustment(
  text, bigint, double precision
) from public, anon;
grant execute on function public.amc_apply_auto_share_adjustment(
  text, bigint, double precision
) to authenticated;

-- 정산 스케줄에서도 마지막 검증 가격이 임계값을 넘으면 접속자 없이 액면조정한다.
create or replace function public.amc_settle_due_funds()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_session bigint := floor(extract(epoch from now()) / 3600)::bigint;
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select id, last_price_factor, last_passive_period_rate
    from public.amc_listed_funds
    where status <> 'delisted'
      and settlement_input_at is not null
      and (
        v_current_session - last_fee_session >= 20
        or v_current_session - last_dividend_session >= dividend_interval_days
        or (style = 'active' and v_current_session - last_rebalance_session >= 30)
        or (
          coalesce(last_share_adjustment_session, -1) <> v_current_session
          and (
            (split_trigger_price is not null and last_nav_per_share >= split_trigger_price)
            or (
              reverse_split_trigger_price is not null
              and last_nav_per_share <= reverse_split_trigger_price
            )
          )
        )
      )
    order by updated_at asc
    limit 200
  loop
    begin
      perform public.amc_apply_auto_share_adjustment_internal(
        v_row.id,
        v_current_session,
        greatest(v_row.last_price_factor, 0.000000001)
      );
      perform public.amc_settle_fund_internal(
        v_row.id,
        v_current_session,
        greatest(v_row.last_price_factor, 0.000000001),
        greatest(0, least(0.05, v_row.last_passive_period_rate))
      );
      v_count := v_count + 1;
    exception when others then
      raise warning 'amc_settle_due_funds fund % failed: %', v_row.id, sqlerrm;
    end;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.amc_settle_due_funds() from public, anon, authenticated;

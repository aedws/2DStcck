-- 유저 ETF 총자산 반영과 별개로, 자동 분할·병합 및 0원 장부 NAV를 서버에서 안정화한다.

alter table public.amc_listed_funds
  drop constraint if exists amc_share_adjustment_band_valid;

alter table public.amc_listed_funds
  add constraint amc_share_adjustment_band_valid
  check (
    split_trigger_price is null
    or reverse_split_trigger_price is null
    or (
      reverse_split_trigger_price * split_ratio < split_trigger_price
      and reverse_split_trigger_price * reverse_split_ratio < split_trigger_price
    )
  );

-- 기존 구현은 같은 1시간 세션만 중복 조정을 막았다. 원 구현을 보존하고
-- 5거래일 냉각기간을 적용하는 서버 권위 래퍼를 둔다.
alter function public.amc_apply_auto_share_adjustment_internal(
  text, bigint, double precision
) rename to amc_apply_auto_share_adjustment_internal_without_cooldown;

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
begin
  select * into v_fund
  from public.amc_listed_funds
  where id = p_fund_id;

  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.status = 'delisted'
     or (
       v_fund.last_share_adjustment_session is not null
       and p_current_session - v_fund.last_share_adjustment_session < 5
     ) then
    return jsonb_build_object(
      'fund', to_jsonb(v_fund),
      'adjusted', false,
      'kind', 'cooldown',
      'multiplier', 1
    );
  end if;

  return public.amc_apply_auto_share_adjustment_internal_without_cooldown(
    p_fund_id,
    p_current_session,
    p_price_factor
  );
end;
$$;

revoke all on function public.amc_apply_auto_share_adjustment_internal(
  text, bigint, double precision
) from public, anon, authenticated;

-- 설정 저장도 조정 직후 반대 트리거가 발동하는 좁은 밴드를 거부한다.
create or replace function public.amc_update_share_adjustment_settings(
  p_fund_id text,
  p_split_trigger_price bigint,
  p_split_ratio integer,
  p_reverse_split_trigger_price bigint,
  p_reverse_split_ratio integer
)
returns public.amc_listed_funds
language plpgsql
security definer
set search_path = public
as $$
declare
  v_fund public.amc_listed_funds;
begin
  if auth.uid() is null then raise exception 'not_authenticated'; end if;

  select * into v_fund
  from public.amc_listed_funds
  where id = p_fund_id
  for update;
  if not found then raise exception 'fund_not_found'; end if;
  if v_fund.manager_user_id <> auth.uid() then raise exception 'not_manager'; end if;
  if v_fund.status = 'delisted' then raise exception 'fund_delisted'; end if;

  if (p_split_trigger_price is not null and p_split_trigger_price <= 0)
     or (p_reverse_split_trigger_price is not null and p_reverse_split_trigger_price <= 0)
     or p_split_ratio not in (2, 5, 10)
     or p_reverse_split_ratio not in (2, 5, 10)
     or (
       p_split_trigger_price is not null
       and p_reverse_split_trigger_price is not null
       and (
         p_reverse_split_trigger_price * p_split_ratio >= p_split_trigger_price
         or p_reverse_split_trigger_price * p_reverse_split_ratio >= p_split_trigger_price
       )
     ) then
    raise exception 'invalid_share_adjustment_settings';
  end if;

  update public.amc_listed_funds
  set split_trigger_price = p_split_trigger_price,
      split_ratio = p_split_ratio,
      reverse_split_trigger_price = p_reverse_split_trigger_price,
      reverse_split_ratio = p_reverse_split_ratio,
      updated_at = now()
  where id = p_fund_id
  returning * into v_fund;

  return v_fund;
end;
$$;

revoke all on function public.amc_update_share_adjustment_settings(
  text, bigint, integer, bigint, integer
) from public, anon;
grant execute on function public.amc_update_share_adjustment_settings(
  text, bigint, integer, bigint, integer
) to authenticated;

-- 거의 전량 환매할 때 bigint 반올림으로 seed_nav_value가 0이 된 뒤,
-- 신규 매수도 0 장부가로 들어가는 악순환을 차단한다.
create or replace function public.amc_preserve_positive_seed_nav()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_factor numeric;
begin
  if new.status <> 'delisted'
     and new.total_shares > 0
     and new.seed_nav_value <= 0 then
    if old.seed_nav_value > 0 and old.total_shares > 0 then
      new.seed_nav_value := greatest(
        1,
        round(
          old.seed_nav_value::numeric
          * new.total_shares::numeric
          / old.total_shares::numeric
        )::bigint
      );
    else
      v_factor := greatest(
        new.last_price_factor::numeric
        / greatest(new.basket_price_factor::numeric, 0.000000001),
        0.000000001
      );
      new.seed_nav_value := greatest(
        1,
        round(
          new.total_shares::numeric
          * greatest(new.last_nav_per_share, 1)::numeric
          / v_factor
        )::bigint
      );
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists amc_preserve_positive_seed_nav
  on public.amc_listed_funds;
create trigger amc_preserve_positive_seed_nav
before update of seed_nav_value, total_shares
on public.amc_listed_funds
for each row execute function public.amc_preserve_positive_seed_nav();

-- MUTEC2는 최초 정상 거래가에서 확인되는 좌당 장부가 $1,000를 복원한다.
-- 현재 보유 좌수는 유지하므로 이미 처분한 물량을 되살리거나 현금을 되돌리지 않는다.
update public.amc_listed_funds
set seed_nav_value = greatest(1, round(total_shares::numeric * 100000)::bigint),
    last_nav_per_share = greatest(
      1,
      round(
        100000::numeric
        * last_price_factor::numeric
        / greatest(basket_price_factor::numeric, 0.000000001)
      )::bigint
    ),
    updated_at = now()
where upper(ticker) = 'MUTEC2'
  and status <> 'delisted'
  and seed_nav_value = 0;

-- 스케줄러도 냉각 중인 펀드를 자동조정 대상으로 반복 선택하지 않는다.
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
          (
            last_share_adjustment_session is null
            or v_current_session - last_share_adjustment_session >= 5
          )
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

revoke all on function public.amc_settle_due_funds()
  from public, anon, authenticated;

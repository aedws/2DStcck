-- MUTEC2가 손상된 장부가로 거래된 동안 매수한 좌수는 복원 NAV만 덮으면
-- 평가액이 튄다. 마지막 손상 NAV와 복원 NAV의 비율로 전 좌수를 역병합해
-- 보유 평가액과 평단을 보존한다.

do $$
declare
  v_fund public.amc_listed_funds;
  v_pre_repair_nav bigint;
  v_ratio double precision;
  v_current_session bigint := floor(extract(epoch from now()) / 3600)::bigint;
begin
  select * into v_fund
  from public.amc_listed_funds
  where upper(ticker) = 'MUTEC2'
    and status <> 'delisted'
  for update;

  if not found or v_fund.total_shares < 1000000 then
    return;
  end if;

  select nav_per_share into v_pre_repair_nav
  from public.amc_fund_trades
  where fund_id = v_fund.id
    and created_at < v_fund.updated_at
  order by created_at desc
  limit 1;

  if not found or v_pre_repair_nav <= 0 or v_fund.last_nav_per_share <= 0 then
    raise exception 'mutec2_repair_anchor_missing';
  end if;

  v_ratio := v_pre_repair_nav::double precision
    / v_fund.last_nav_per_share::double precision;
  if v_ratio <= 0 or v_ratio >= 1 then
    raise exception 'mutec2_repair_ratio_invalid';
  end if;

  update public.amc_fund_positions
  set quantity = quantity * v_ratio,
      updated_at = now()
  where fund_id = v_fund.id;

  update public.amc_listed_funds
  set total_shares = total_shares * v_ratio,
      seed_nav_value = greatest(
        1,
        round(total_shares::numeric * v_ratio::numeric * 100000)::bigint
      ),
      share_multiplier = share_multiplier * v_ratio,
      last_share_adjustment_session = v_current_session,
      updated_at = now()
  where id = v_fund.id;
end;
$$;

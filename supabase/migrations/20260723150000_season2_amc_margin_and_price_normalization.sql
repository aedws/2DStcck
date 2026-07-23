-- 시즌 1은 전 계정 마스터 지급으로 종료했으므로, 오염된 시즌 1 기준값을
-- 시즌 2에 승계하지 않고 현재 자산에서 새로 측정한다.
update public.game_saves
set state = state || jsonb_build_object(
      'investmentSeason',
      jsonb_build_object(
        'trackingEpoch', 2,
        'current', null,
        'history', '[]'::jsonb,
        'seenCeremonyIds', '[]'::jsonb
      )
    ),
    updated_at = now()
where coalesce((state -> 'investmentSeason' ->> 'trackingEpoch')::integer, 0) < 2;

-- 과대 액면가 펀드는 5거래일 냉각을 여러 번 기다리지 않게 현재 설정 배수만큼
-- 반복 분할해 한 번에 트리거 아래로 넣는다. 발행좌수와 전 보유좌수를 같은
-- 배수로 늘리므로 AUM·개인 평가액·현금은 변하지 않는다.
do $$
declare
  v_fund record;
  v_multiplier numeric;
  v_nav numeric;
begin
  for v_fund in
    select id, last_nav_per_share, split_trigger_price, split_ratio
    from public.amc_listed_funds
    where status <> 'delisted'
      and split_trigger_price is not null
      and last_nav_per_share >= split_trigger_price
    for update
  loop
    v_multiplier := 1;
    v_nav := v_fund.last_nav_per_share;
    while v_nav / v_multiplier >= v_fund.split_trigger_price loop
      v_multiplier := v_multiplier * v_fund.split_ratio;
      if v_multiplier > 1e18 then
        raise exception 'amc_normalization_multiplier_too_large: %', v_fund.id;
      end if;
    end loop;

    update public.amc_fund_positions
    set quantity = quantity * v_multiplier::double precision,
        updated_at = now()
    where fund_id = v_fund.id;

    update public.amc_listed_funds
    set total_shares = total_shares * v_multiplier::double precision,
        share_multiplier = share_multiplier * v_multiplier::double precision,
        last_nav_per_share = greatest(
          1,
          round(last_nav_per_share::numeric / v_multiplier)::bigint
        ),
        last_share_adjustment_session = floor(extract(epoch from now()) / 3600)::bigint,
        updated_at = now()
    where id = v_fund.id;
  end loop;
end;
$$;

-- 기존 5인자 거래 함수는 현금 주문의 서버 권위 검증으로 유지한다. 새 7인자
-- 오버로드는 저장 지갑에서 미수가 켜진 경우에만 클라이언트가 계산한 매수여력을
-- 해당 한 건의 현금 한도로 사용하고, 호출 직후 원래 저장 현금을 되돌린다.
create or replace function public.amc_trade_fund(
  p_fund_id text,
  p_delta double precision,
  p_expected_position double precision,
  p_price_factor double precision,
  p_client_order_id text,
  p_allow_margin boolean,
  p_margin_buying_power numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_original_state jsonb;
  v_result jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  if not coalesce(p_allow_margin, false) or p_delta < 0 then
    return public.amc_trade_fund(
      p_fund_id,
      p_delta,
      p_expected_position,
      p_price_factor,
      p_client_order_id
    );
  end if;

  if p_margin_buying_power is null
     or p_margin_buying_power < 0
     or p_margin_buying_power > 1e100 then
    raise exception 'invalid_margin_buying_power';
  end if;

  select state into v_original_state
  from public.game_saves
  where user_id = v_uid
  for update;
  if not found then raise exception 'save_required'; end if;
  if coalesce(v_original_state ->> 'marginEnabled', 'false') <> 'true' then
    raise exception 'margin_disabled';
  end if;

  update public.game_saves
  set state = jsonb_set(
    state,
    '{cash}',
    to_jsonb(round(p_margin_buying_power)),
    true
  )
  where user_id = v_uid;

  v_result := public.amc_trade_fund(
    p_fund_id,
    p_delta,
    p_expected_position,
    p_price_factor,
    p_client_order_id
  );

  update public.game_saves
  set state = v_original_state
  where user_id = v_uid;

  return v_result;
end;
$$;

revoke all on function public.amc_trade_fund(
  text, double precision, double precision, double precision, text, boolean, numeric
) from public, anon;
grant execute on function public.amc_trade_fund(
  text, double precision, double precision, double precision, text, boolean, numeric
) to authenticated;

-- 레버리지 가격 문의: 차트는 현재 액면으로 소급 조정되며 당시 거래가는 당시
-- 액면으로 남는다는 설명을 보강하고, 재접속 뒤 장기 이력이 잘리던 문제를 수정했다.
update public.bug_reports
set status = 'fixed',
    admin_note = '레버리지 액면분할·병합 시 보유 좌수와 평단 정산을 재검증했고, 차트가 현재 액면으로 소급 조정되는 반면 거래내역은 당시 액면가를 유지한다는 안내를 추가했습니다. 재접속 후 차트 저장 범위도 40시간에서 240시간으로 늘렸습니다.',
    updated_at = now()
where game_id = 'titia8397'
  and title ilike '%레버리지 가격 오류%'
  and status in ('open', 'investigating');

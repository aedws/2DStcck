-- 2026-07-23 미해결 거래·계좌 신고 5건을 원인별로 정리한다.
-- 계정 조정은 기존 1회성 원장을 사용하므로 재접속·재저장에도 중복되지 않는다.

do $$
declare
  v_asset_user_id uuid;
  v_qing_user_id uuid;
begin
  select user_id into v_asset_user_id
  from public.bug_reports
  where id = 'fc6cc6fa-14cb-460b-9757-974c85201e8e'::uuid;

  select user_id into v_qing_user_id
  from public.bug_reports
  where id = '991c44e1-78d8-463f-8bee-24edf79c7d2e'::uuid;

  if v_asset_user_id is null or v_qing_user_id is null then
    raise exception 'target_bug_report_account_not_found';
  end if;

  -- 17:37:53 수동 상환 직후 17:37:55에 같은 VNSFL2 공매가 다시 상환되어
  -- 차감된 금액을 정확히 돌려준다. 같은 시각의 서버 원장 ETF는 실제 매도가
  -- 아니므로 별도 보정하지 않고 원장 좌수를 그대로 유지한다.
  insert into public.account_cash_adjustments (
    id, user_id, game_id, amount_cents, reason
  ) values (
    'duplicate-short-liquidation-refund-20260723-asset-management',
    v_asset_user_id,
    'asset_management',
    631890645106586400000000000000000000000000000000000000,
    '수동 상환 직후 발생한 VNSFL2 중복 강제상환액 복구'
  ) on conflict (id) do nothing;

  -- WWMNEI2가 $1 미만일 때 시장가 매도가 $1로 체결된 15건은 정상 최소
  -- 호가인 $0.01과의 차액(99%)만 회수한다.
  insert into public.account_cash_adjustments (
    id, user_id, game_id, amount_cents, reason
  ) values (
    'sub-dollar-market-sell-correction-20260723-qingxiao',
    v_qing_user_id,
    'qingxiao',
    -2539560435673392348804180,
    'WWMNEI2 시장가 매도의 잘못된 $1 하한으로 발생한 초과 체결대금 회수'
  ) on conflict (id) do nothing;

  -- 조정 트리거를 즉시 실행해 다음 로그인 전에도 서버 지갑에 반영한다.
  update public.game_saves
  set state = state,
      updated_at = now()
  where user_id in (v_asset_user_id, v_qing_user_id);
end;
$$;

update public.bug_reports
set status = 'fixed',
    admin_note = case id
      when '4ddfa543-8ef5-4a2c-ac16-b5e033342c03'::uuid then
        '회사 설립 뒤 IPO까지 신청한 서버 기록이 있는데 로컬 회사 상태가 사라진 경우를 확인했습니다. IPO 신청을 설립 완료의 강한 증거로 사용해 회사와 IPO 신청 상태를 자동 복원하도록 수정했으며 현재 PGHG 회사 상태도 정상 저장된 것을 확인했습니다.'
      when '991c44e1-78d8-463f-8bee-24edf79c7d2e'::uuid then
        '$1 미만 종목의 시장가 매도 하한이 잘못 $1로 고정된 원인을 수정해 이제 최소 $0.01과 실제 호가로 체결됩니다. WWMNEI2에서 발생한 15건의 초과 체결대금 2,539,560,435,673,392,348,804,180¢는 1회 회수했습니다.'
      when 'a1f566b2-908e-413f-ae3f-ac242cb4424b'::uuid then
        '포트폴리오 전체 수익률이 고정급·복권·출석·미니게임·운영 보상을 투자 수익으로 포함하던 문제를 수정했습니다. 이제 외부 현금 유입을 제외한 실제 투자 손익만 투자 수익률로 표시합니다.'
      when 'fc6cc6fa-14cb-460b-9757-974c85201e8e'::uuid then
        '17:37:53 수동 상환 직후 17:37:55에 동일 VNSFL2 공매가 다시 강제상환되고 보유 자산까지 정리된 기록을 확인했습니다. 유저 ETF 담보 누락, 청산 시각 미보존, 서버 원장 ETF 로컬 매도를 수정하고 중복 상환액 631,890,645,106,586,400,000,000,000,000,000,000,000,000,000,000¢를 1회 복구했습니다.'
      when 'e4553609-ffcb-4d53-86ec-6e29437d8c40'::uuid then
        '신고 계정에는 해당 시각 강제청산 기록이 없고 유저 ETF 좌수는 서버 원장에 남아 있었습니다. 계좌·총자산·시즌 수익률의 담보 및 평가액 계산에서 유저 ETF가 빠져 현금만 줄어든 것처럼 보인 원인을 수정해 서버 NAV 기준으로 함께 반영합니다.'
    end,
    updated_at = now()
where id in (
  '4ddfa543-8ef5-4a2c-ac16-b5e033342c03',
  '991c44e1-78d8-463f-8bee-24edf79c7d2e',
  'a1f566b2-908e-413f-ae3f-ac242cb4424b',
  'fc6cc6fa-14cb-460b-9757-974c85201e8e',
  'e4553609-ffcb-4d53-86ec-6e29437d8c40'
);

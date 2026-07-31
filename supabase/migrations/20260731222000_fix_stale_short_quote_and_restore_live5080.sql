-- FAUSL2 공매도 화면 호가($12.45 부근)와 주문 함수가 읽은 체결 호가($39.71)가
-- 시장 리플레이 교체 사이에 어긋나 전량 상환된 계정을 복구한다.
-- 오류 상환 뒤 초고액 계정 보호 로직이 현금을 복구지원금으로 교체했으므로,
-- 검증된 원 공매도 진입대금 전액을 1회 지급해 현재 활동을 덮어쓰지 않는다.

do $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id
  from public.bug_reports
  where id = '04d4676a-23e9-4599-add7-1f0ffc894ea7'::uuid;

  if v_user_id is null then
    raise exception 'target_bug_report_account_not_found';
  end if;

  insert into public.account_cash_adjustments (
    id,
    user_id,
    game_id,
    amount_cents,
    reason
  ) values (
    'stale-short-cover-quote-refund-20260731-live5080',
    v_user_id,
    'live5080',
    1148483604838357498500000000,
    'FAUSL2 비정상 호가 청산 직전 공매도 진입대금 복구'
  ) on conflict (id) do nothing;

  -- 조정 트리거를 즉시 실행하되 다른 포지션·회사 활동은 그대로 보존한다.
  update public.game_saves
  set state = state,
      updated_at = now()
  where user_id = v_user_id;
end;
$$;

update public.bug_reports
set
  status = 'fixed',
  admin_note = '22:48:15 FAUSL2 공매도는 $12.45에 체결됐으나 13초 뒤 화면 갱신과 주문 실행 사이의 호가가 어긋나 $39.71로 전량 상환된 기록을 확인했습니다. 화면에서 본 호가와 실제 실행 호가가 15% 넘게 달라지면 주문을 중단하도록 수정하고, 오류 직전 공매도 진입대금 1,148,483,604,838,357,498,500,000,000¢를 1회 복구했습니다.',
  updated_at = now()
where id = '04d4676a-23e9-4599-add7-1f0ffc894ea7'::uuid;

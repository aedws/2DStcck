-- 이오리 소프트웨어(IORI) 예약 상장 반영이 완료된 종목 요청을 신청자 화면에서도
-- '반영 완료'로 전환한다. 계정·접수 시각·종목명을 함께 확인해 동명이거나
-- 나중에 들어온 요청이 잘못 처리되지 않게 한다.

update public.stock_requests
set
  status = 'shipped',
  admin_note = '이오리 소프트웨어(IORI)를 2026-07-27 15:30 KST 상장 일정으로 반영했습니다. 개장 전까지 본주와 인버스·곱버스·2배 레버리지·커버드콜 파생상품이 모두 거래 불가·시초가 고정 상태로 대기하며, CEO 시로미 이오리 전용 대사와 반독점 규제 성향의 사건 편향도 함께 적용했습니다.',
  updated_at = now()
where lower(game_id) = 'luxury'
  and name ilike '%이오리 소프트웨어%'
  and created_at >= timestamptz '2026-07-24 01:36:00+00'
  and created_at < timestamptz '2026-07-24 01:40:00+00'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

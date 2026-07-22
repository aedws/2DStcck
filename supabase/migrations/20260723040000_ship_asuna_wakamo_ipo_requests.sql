-- 2026-07-25 신규 상장 반영이 완료된 두 IPO 요청을 신청자 화면에서도
-- '반영 완료'로 전환한다. 계정·접수 시각·종목명을 함께 확인해 동명이거나
-- 나중에 들어온 요청이 잘못 처리되지 않게 한다.

update public.stock_requests
set
  status = 'shipped',
  admin_note = '아스나 유업(ASNA)을 2026-07-25 15:00 KST 상장 일정으로 반영했습니다. 악재 후 회사 호재(기존 주주에게는 희석 악재일 수 있음)와 전용 품질 사건도 함께 적용했습니다.',
  updated_at = now()
where lower(game_id) = 'gudokza111'
  and name ilike '%아스나 유업%'
  and created_at >= timestamptz '2026-07-22 18:48:00+00'
  and created_at < timestamptz '2026-07-22 18:52:00+00'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

update public.stock_requests
set
  status = 'shipped',
  admin_note = '까모투자증권(KAMO)을 2026-07-25 18:00 KST 상장 일정으로 반영했습니다. 역행·엉뚱한 투자 사건, 고배당·고변동 성향과 자사주 매입 제외 규칙도 함께 적용했습니다.',
  updated_at = now()
where lower(game_id) = 'warning'
  and name ilike '%까모투자증권%'
  and created_at >= timestamptz '2026-07-22 17:48:00+00'
  and created_at < timestamptz '2026-07-22 17:52:00+00'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

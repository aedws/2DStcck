-- 2026-07-26 신규 상장 반영이 완료된 두 IPO 요청을 신청자 화면에서도
-- '반영 완료'로 전환한다. 운영 원장에서 확인한 요청 UUID를 기준으로 처리하고
-- 계정·종목명을 함께 확인해 다른 요청이 잘못 변경되지 않게 한다.

update public.stock_requests
set
  status = 'shipped',
  admin_note = '모모톡프렌즈(AHMF)를 2026-07-26 12:00 KST 상장 일정으로 반영했습니다. 메신저 트래픽, 페로로 페스티벌·크루세이더 전차 경품과 서비스 장애 사건도 함께 적용했습니다.',
  updated_at = now()
where id = '3d7e3c6a-8486-4bfb-bf67-23386b0ca3ec'
  and lower(game_id) = 'hcli'
  and name ilike '%모모톡프렌즈%'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

update public.stock_requests
set
  status = 'shipped',
  admin_note = '이프리트 화력발전(IFRT)을 2026-07-26 15:00 KST 상장 일정으로 반영했습니다. 대표의 직접 화력 공급에 따른 연료비 절감과 화력조절 실패·부품 수리 사건도 함께 적용했습니다.',
  updated_at = now()
where id = '21438e67-6850-4d55-a77e-2f993827dfb6'
  and lower(game_id) = 'gudokza111'
  and name ilike '%이프리트%'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

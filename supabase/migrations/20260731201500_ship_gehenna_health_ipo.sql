-- 2026-07-31 유저 종목 요청 반영
-- 게헨나헬스 그룹(GHH)을 정적 종목과 CEO·전용 사건·파생상품으로 예약 상장한다.

update public.stock_requests
set
  status = 'shipped',
  admin_note = '게헨나헬스 그룹(GHH)을 2026-08-03 21:00 KST에 공모가 $640로 예약 상장했습니다. 의료보험·의료시설 운영과 민간·공공보험 사업, 안정적인 분기 배당, 공공보험 확대·시설 효율화·의료비 상승 사건을 반영했습니다. CEO 히노미야 치나츠와 본주·인버스·곱버스·2배 레버리지·커버드콜은 같은 시각에 함께 개장합니다.',
  updated_at = now()
where lower(game_id) = 'luxury'
  and name like '%게헨나헬스 그룹%'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

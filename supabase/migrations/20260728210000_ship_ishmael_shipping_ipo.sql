-- 2026-07-28 유저 종목 요청 반영
-- 이스마엘 해운(ISML)을 정적 종목과 전용 사건·주주환원 정책으로 8/1 예약 상장한다.

update public.stock_requests
set
  status = 'shipped',
  admin_note = '이스마엘 해운(ISML)을 2026-08-01 15:00 KST에 공모가 $720로 예약 상장했습니다. 종합 해운·물류의 낮은 변동성과 안정 배당, 항로 최적화·유가 방어·항만 차질 전용 사건을 반영했습니다. 주가가 공모가 아래면 현금배당을 중단하고 같은 재원을 자사주 매입·소각 지지로 전환합니다. 본주와 인버스·곱버스·2배 레버리지·커버드콜은 같은 시각에 함께 개장합니다.',
  updated_at = now()
where lower(game_id) = 'gudokza111'
  and name like '%이스마엘%'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

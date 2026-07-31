-- 베르길리우스 다크 투어리즘(VRGL)이 운영 동적 IPO 목록에서 누락되어
-- 2026-07-31 15:00 KST 상장 뒤에도 거래 화면에 나타나지 않은 문제를 복구한다.
-- 새 클라이언트는 번들 정의를 사용하고, 이 행은 배포 전 구버전 클라이언트도
-- 같은 종목을 계속 받을 수 있게 하는 하위 호환 안전망이다.

insert into public.ipo_listings (
  id,
  ticker,
  name,
  sector,
  active,
  listing_epoch_ms,
  payload,
  created_by,
  game_id,
  updated_at
)
values (
  'vergilius',
  'VRGL',
  '베르길리우스 다크 투어리즘',
  '소비재·서비스',
  true,
  (extract(epoch from timestamptz '2026-07-31 06:00:00+00') * 1000)::bigint,
  jsonb_build_object(
    'id', 'vergilius',
    'ticker', 'VRGL',
    'name', '베르길리우스 다크 투어리즘',
    'sector', '소비재·서비스',
    'subsector', '다크 투어리즘',
    'initialPrice', 48000,
    'volatility', 0.058,
    'drift', 0.0007,
    'beta', 1.35,
    'description', '가이드 베르길리우스가 설립한 다크 투어리즘 기업. 비극적 사건과 역사적 분쟁의 현장을 해설하는 여행 상품을 운영하며, 지정학·역사·사회적 갈등이 커질수록 수요가 늘지만 여행 제한과 윤리 논란에 민감하다. 대표 문구는 “지옥으로 출발하지”. 유저 종목 요청으로 상장.',
    'listingEpochMs', (extract(epoch from timestamptz '2026-07-31 06:00:00+00') * 1000)::bigint
  ),
  null,
  'asterisk7262',
  now()
)
on conflict (id) do update set
  ticker = excluded.ticker,
  name = excluded.name,
  sector = excluded.sector,
  active = true,
  listing_epoch_ms = excluded.listing_epoch_ms,
  payload = excluded.payload,
  game_id = excluded.game_id,
  updated_at = now();

update public.bug_reports
set
  status = 'fixed',
  admin_note = '운영 서버의 활성 동적 IPO 목록에서 VRGL 행이 누락된 것을 확인했습니다. 베르길리우스 다크 투어리즘 본주와 파생상품을 앱 번들 종목으로 승격하고 서버 행도 복구해, 2026-07-31 15:00 KST 상장 시각부터 거래 화면에 표시되도록 수정했습니다.',
  updated_at = now()
where lower(game_id) = 'asterisk7262'
  and title ilike '%베르길리우스%'
  and status in ('open', 'investigating');

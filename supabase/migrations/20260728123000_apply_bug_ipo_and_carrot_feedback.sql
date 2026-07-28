-- 2026-07-28 운영 요청 반영
-- 1) 액면분할 뒤 거래 통계가 구 좌수·신 좌수를 직접 비교하던 버그 처리
-- 2) 캬롯 농장(CROT) 호재 편향·일일 하락 방어 완화
-- 3) 베르길리우스 다크 투어리즘 동적 IPO와 밀리테크 플레이어 회사 IPO
-- 4) 이가 증권은 IPO가 아닌 플레이어 회사 설립 허가 신청으로 승인

update public.bug_reports
set
  status = 'fixed',
  admin_note = '액면분할 전후 체결을 누적 액면배수로 경제가 환산해 실현손익·승률·일일 성과를 공통 계산하도록 수정했습니다. 구버전 체결도 청산 좌수가 진입 좌수를 초과하면 가치 중립 좌수로 호환 보정합니다. 제보된 WWMNE 31주 매수→10:1 분할→310주 매도는 실현이익 $12,391.32, 승리 1회로 계산됩니다.',
  updated_at = now()
where id = '3ae80139-17e0-4e1c-9864-84c1c7deb6c8'
  and status in ('open', 'investigating');

update public.feedback
set
  status = 'done',
  admin_note = '캬롯 농장(CROT)의 수확량 사건 선택 편향을 3→1.25, 호재 충격을 0.55→0.30, 장기 드리프트를 0.0008→0.0004로 낮췄습니다. 저변동 성격은 유지하되 일일 절대 하락 방어선은 -3%→-8%로 완화해 과도한 일방 상승을 줄였습니다.',
  updated_at = now()
where id = '7b946558-9243-46ab-9ffb-076f44b35c5b'
  and status in ('open', 'considering', 'planned');

-- 일반 종목 요청은 코드 배포 없이 동적 IPO로 예약한다.
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

update public.stock_requests
set
  status = 'shipped',
  admin_note = '베르길리우스 다크 투어리즘(VRGL)을 2026-07-31 15:00 KST 동적 IPO로 예약했습니다. 공모가는 $480, 변동성 5.8%, 베타 1.35이며 지정학·역사·사회적 갈등 수요와 여행 제한·윤리 논란 위험을 반영했습니다.',
  updated_at = now()
where id = '29396720-74a9-49dd-b223-8f102abca153'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

-- 플레이어 회사는 정적 종목·파생상품이 배포되므로 개장 전까지 회사 상태를 잠근다.
update public.stock_requests
set
  status = 'shipped',
  admin_note = '플레이어 회사 밀리테크 인터내셔널 아머먼츠(MILITC)를 2026-07-31 18:00 KST 상장 일정으로 반영했습니다. 방산 제조·사이버웨어·용병·군사 지원 사업과 전용 수주·안전성 조사 사건을 적용했으며, 개장 시 창업주 보통주가 계좌에 1회 반영됩니다.',
  updated_at = now()
where id = '9a8037b7-6ea1-4f81-82be-299b2427a399'
  and lower(game_id) = 'qprjsngls'
  and status in ('pending', 'reviewing', 'accepted', 'shipped');

update public.game_saves
set
  state = jsonb_set(
    jsonb_set(
      jsonb_set(
        state,
        '{playerCompany,status}',
        to_jsonb('ipo-requested'::text),
        true
      ),
      '{playerCompany,ipoListingStockId}',
      to_jsonb('militc'::text),
      true
    ),
    '{playerCompany,ipoListingAt}',
    to_jsonb((extract(epoch from timestamptz '2026-07-31 09:00:00+00') * 1000)::bigint),
    true
  ),
  wallet_revision = wallet_revision + 1,
  updated_at = now()
where upper(state -> 'playerCompany' ->> 'ticker') = 'MILITC'
  and jsonb_typeof(state -> 'playerCompany') = 'object';

-- 이 요청은 주식 상장이 아니라 회사 설립 허가다. 유저가 허가 확인 후 설립 비용을
-- 지불하고 회사를 만들면 클라이언트가 shipped 로 완료한다.
update public.stock_requests
set
  status = 'accepted',
  admin_note = '이가 증권(LEE) 회사 설립을 허가했습니다. 회사 탭에서 설립 비용을 결제해 창업을 완료한 뒤, 성장 조건을 충족하면 별도의 IPO를 신청할 수 있습니다.',
  updated_at = now()
where id = '510e2637-557c-41a8-ac81-c4b97d1ec792'
  and lower(game_id) = 'doglife'
  and status in ('pending', 'reviewing', 'accepted');

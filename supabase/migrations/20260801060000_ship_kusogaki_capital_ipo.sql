-- 플레이어 회사 Kusogaki Capital(KSGK)을 2026-08-04 12:00 KST에 예약 상장한다.
-- 신청서의 과거 주식수 대신 개장 시점 game_saves의 최신 founderShares를 지급한다.

update public.stock_requests
set
  status = 'shipped',
  admin_note = '플레이어 회사 Kusogaki Capital(KSGK)을 2026-08-04 12:00 KST에 공모가 $6,666.66로 예약 상장했습니다. 공매도·시장중립 차익거래의 하락장 방어력과 숏 스퀴즈 위험을 반영했으며, 본주와 인버스·곱버스·2배 레버리지가 같은 시각에 개장합니다. 신청 뒤 성장한 회사의 최신 총발행주식과 창업주 지분을 보존해 개장 시 창업주 보통주를 계좌에 1회 반영합니다.',
  updated_at = now()
where id = 'a04515de-04c4-4539-8a8a-eae27b1c8a93'
  and lower(game_id) = 'live5080'
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
      to_jsonb('ksgk'::text),
      true
    ),
    '{playerCompany,ipoListingAt}',
    to_jsonb((extract(epoch from timestamptz '2026-08-04 03:00:00+00') * 1000)::bigint),
    true
  ),
  wallet_revision = wallet_revision + 1,
  updated_at = now()
where user_id = '9085991b-7036-46dc-a993-bfcc8d13be86'
  and upper(state -> 'playerCompany' ->> 'ticker') = 'KSGK'
  and jsonb_typeof(state -> 'playerCompany') = 'object';

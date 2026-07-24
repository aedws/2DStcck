-- 2026-07-27~28 승인 IPO 4건을 개장 큐에 이어 붙인다.
-- 플레이어 회사 3사(LCID·NEXR·TEHTY)는 정적 종목이 먼저 배포돼도 ipoListingAt
-- 전에는 playerCompany 를 'ipo-requested' 로 잠그고 창업주 지분을 개장 시 1회만
-- 계좌에 반영한다. 레비(LEVI)는 캐릭터 기업이라 요청만 shipped 로 전환한다.
-- list_public_player_companies 는 game_saves 를 그대로 조회하는 제네릭 함수라
-- 별도 갱신이 필요 없다.

update public.stock_requests set
  status = 'shipped',
  admin_note = '플레이어 회사 레이크루시드증권(LCID)을 2026-07-27 18:00 KST 상장 일정으로 반영했습니다. 상장 시각 전에는 거래·시세·창업주 지분 반영이 잠기며, 개장 시 창업주 보통주가 계좌에 1회 반영됩니다.',
  updated_at = now()
where id = '3ab482b9-4d8f-4a1e-8293-6cf5c8a8a9fc'
  and lower(game_id) = 'asset_management'
  and status in ('pending','reviewing','accepted','shipped');

update public.stock_requests set
  status = 'shipped',
  admin_note = '플레이어 회사 NexR(NEXR)을 2026-07-28 12:00 KST 상장 일정으로 반영했습니다. 상장 시각 전에는 거래·시세·창업주 지분 반영이 잠기며, 기존 희석(창업주 82.6%)을 보존한 창업주 보통주가 개장 시 계좌에 1회 반영됩니다.',
  updated_at = now()
where id = 'fbde34e0-ed06-4c10-b7d8-4d054524c677'
  and lower(game_id) = 'luxury'
  and status in ('pending','reviewing','accepted','shipped');

update public.stock_requests set
  status = 'shipped',
  admin_note = '플레이어 회사 카르티시아 F&B(TEHTY)를 2026-07-28 15:00 KST 상장 일정으로 반영했습니다. 상장 시각 전에는 거래·시세·창업주 지분 반영이 잠기며, 개장 시 창업주 보통주가 계좌에 1회 반영됩니다.',
  updated_at = now()
where id = '461b3c4b-dbf9-48c2-a26c-768f93c6f3d5'
  and lower(game_id) = 'aemeath'
  and status in ('pending','reviewing','accepted','shipped');

update public.stock_requests set
  status = 'shipped',
  admin_note = '레비 종합보조서비스(LEVI)를 2026-07-27 21:00 KST 상장 일정으로 반영했습니다. 캐릭터 레비를 CEO로 한 구독형 생활 서비스 기업으로, 전용 파생상품·대사도 함께 적용했습니다.',
  updated_at = now()
where id = 'a28be6b0-ab0f-497e-bf64-9ee4c3a1b581'
  and lower(game_id) = 'gudokza111'
  and status in ('pending','reviewing','accepted','shipped');

with schedules(ticker, stock_id, listing_at) as (
  values
    ('LCID',  'lcid',  (extract(epoch from timestamptz '2026-07-27 09:00:00+00') * 1000)::bigint),
    ('NEXR',  'nexr',  (extract(epoch from timestamptz '2026-07-28 03:00:00+00') * 1000)::bigint),
    ('TEHTY', 'tehty', (extract(epoch from timestamptz '2026-07-28 06:00:00+00') * 1000)::bigint)
)
update public.game_saves as saves
set
  state = jsonb_set(
    jsonb_set(
      jsonb_set(
        saves.state,
        '{playerCompany,status}',
        to_jsonb('ipo-requested'::text),
        true
      ),
      '{playerCompany,ipoListingStockId}',
      to_jsonb(schedules.stock_id),
      true
    ),
    '{playerCompany,ipoListingAt}',
    to_jsonb(schedules.listing_at),
    true
  ),
  wallet_revision = saves.wallet_revision + 1,
  updated_at = now()
from schedules
where upper(saves.state -> 'playerCompany' ->> 'ticker') = schedules.ticker
  and jsonb_typeof(saves.state -> 'playerCompany') = 'object';

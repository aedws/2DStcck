-- tick-market 시세 크론을 완전히 제거한다.
--
-- 이유: 현재 클라이언트 시장은 100% 로컬 결정론 시뮬레이션(MARKET_EPOCH_MS 기준,
--   1초 로컬 틱)이라 서버 tick-market / market_global / orders 를 아무도 읽지 않는다
--   (클라이언트에 .from("market_global")/.from("orders") 호출 0건, orders 테이블 0행).
--   그런데 이 크론(10초 간격)이 Free 플랜 Edge Function 무료 한도의 주 소비자였고,
--   한도 고갈 → 게이트웨이 402 → game-account 가입 함수까지 차단 → 로그인 붕괴의
--   근본 원인이었다. 기능이 없는 크론이므로 완전히 제거한다.
--
-- 참고: 실행 이력상 이 크론은 이미 2026-07-13 05:40 이후 중단된 상태였다. 아래는
--   과거 스케줄명(20260704174523_cron_tick_10s.sql / 20260704171209_cron_tick_market.sql)이
--   다시 적용되더라도 재발하지 않도록 멱등적으로 스케줄을 제거한다.

do $$
begin
  perform cron.unschedule('tick-market-10s');
exception when others then
  null;
end $$;

do $$
begin
  perform cron.unschedule('tick-market-every-minute');
exception when others then
  null;
end $$;

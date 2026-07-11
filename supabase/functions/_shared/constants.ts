// AUTO-GENERATED from src/lib/market/constants.ts — edit the original and run `npm run sync:functions`
export const TICK_INTERVAL_MS = 1000;
export const MAX_PRICE_HISTORY = 120;
export const ORDER_BOOK_LEVELS = 5;
/** 가상 1거래일 = 실시간 3시간. 에포크 기준 정렬(00:00, 03:00, 06:00 … KST 09:00, 12:00 …) */
export const SESSION_DURATION_MS = 3 * 60 * 60 * 1000;
/** 뉴스 이벤트 최소 간격 — 직전 이벤트 후 이 시간이 지나야 다음 추첨 시작 */
export const EVENT_MIN_GAP_MS = 5 * 60 * 1000;
/** 최소 간격이 지난 뒤 틱당 이벤트 발생 확률 */
export const EVENT_CHANCE_PER_TICK = 0.06;
/** 캔들 1개당 틱 수 */
export const CANDLE_TICKS = 6;

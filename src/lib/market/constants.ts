export const TICK_INTERVAL_MS = 1000;
/** 서버 tick 간격 (pg_cron) — 초 */
export const SERVER_TICK_SECONDS = 10;

/** 공통 시장 기원점 (UTC). 로컬 모드는 이 시점부터 시드 고정 결정론 시뮬레이션으로
 * 시장을 계산하므로, 서버 없이도 모든 접속자가 동일한 시장을 본다. */
export const MARKET_EPOCH_MS = Date.UTC(2026, 6, 11); // 2026-07-11T00:00Z
/** 결정론 가격 규칙 변경 시 증가. 구버전 체크포인트만 폐기하고 지갑은 유지한다. */
export const MARKET_SIM_VERSION = 5;
/** 결정론 시뮬레이션 tick 간격 (ms) — 로컬 모드 1초 */
export const SIM_TICK_MS = 1000;

/** 시장가 슬리피지: 체결가 = 현재가 × (1 ± 0.005%) */
export const MARKET_ORDER_SLIPPAGE = 0.00005;

// ── 가격 엔진 (시간 기반: 틱 간격과 무관하게 하루 등락폭이 일정) ──
// 목표 일변동(3시간 거래일): 개별주 σ ≈ volatility×0.008×√86400/8 → vol 0.03이면 ~2.5%,
// 지수 ~1%, 채권 ~0.5%. 실제 시장 수준.
/** 개별 노이즈: volatility × 이 값 × √dt초 */
export const VOLATILITY_TIME_SCALE = 0.008;
/** 시장 공통 충격: beta × z × 이 값 × √dt초 (베타1 기준 일변동 ~1.25%) */
export const MARKET_SHOCK_TIME_SCALE = 0.00012;
/** 시장 사인파 추세 진폭(초당, 베타 1 기준) — 15분 주기 ±1% 내외 */
export const MARKET_TREND_BASE_PER_SEC = 0.00003;
/** 장기 성향: drift × 이 값 × dt초 (drift 0.001이면 하루 +0.03%) */
export const DRIFT_TIME_SCALE = 0.00003;
/** Broad-market long-run growth target per 3-hour trading session (~10% over 240 sessions). */
export const MARKET_SECULAR_GROWTH_PER_SESSION = 0.0004;
/** Fraction of a benchmark's downside gap recovered per trading session. */
export const MARKET_DOWNSIDE_REVERSION_PER_SESSION = 0.025;
/** 이벤트 임팩트: impact × 이 값 × dt초 × 감쇠 (impact 0.04면 총 ~0.6% 반영) */
export const EVENT_IMPACT_TIME_SCALE = 0.0035;
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

export const TICK_INTERVAL_MS = 1000;
/** 서버 tick 간격 (pg_cron) — 초 */
export const SERVER_TICK_SECONDS = 10;

/** 공통 시장 기원점 (UTC). 로컬 모드는 이 시점부터 시드 고정 결정론 시뮬레이션으로
 * 시장을 계산하므로, 서버 없이도 모든 접속자가 동일한 시장을 본다. */
export const MARKET_EPOCH_MS = Date.UTC(2026, 6, 11); // 2026-07-11T00:00Z
/** 결정론 가격 규칙 변경 시 증가. 구버전 체크포인트만 폐기하고 지갑은 유지한다.
 *  v9: 실시간 1틱 갱신에서 진행 중 봉이 덮어써져 완성 봉이 전부 점으로 남던
 *  버그(mergeCandles) 수정 — 기존 평면 캔들 체크포인트를 폐기하고 재생성한다.
 *  v10: 신규 섹터 5종(반도체·유틸리티·소재·모빌리티·보험) 상장 — 종목 구성이
 *  바뀌어 신규 종목이 결정론 히스토리를 갖도록 전체 리플레이를 강제한다.
 *  v11: 반도체를 밸류체인별로 분할(팹리스·파운드리·메모리·시스템반도체·장비) —
 *  종목 4종 추가로 다시 전체 리플레이를 강제한다. */
export const MARKET_SIM_VERSION = 11;
/**
 * 지갑(현금·보유·거래내역) 스키마 세대.
 * 증가 시 구세대 LocalStorage·cloud `game_saves` 를 폐기하고 초기 자금으로 다시 시작한다.
 * 시장 체크포인트(marketVersion)와 분리 — 가격 엔진만 바꿀 때는 올리지 않는다.
 * v1: 거래내역 미동기화·비정상 자산 시즌을 한 번 리셋해 정상화.
 * v2: 분배 체크포인트 회귀로 현금이 복제되던 시즌을 재리셋.
 * v3: epoch 판정이 초기값에 가려져 로컬 구저장분이 안 지워지던 버그 수정 후 재리셋.
 */
export const WALLET_EPOCH = 3;
/** 결정론 시뮬레이션 tick 간격 (ms) — 로컬 모드 1초 */
export const SIM_TICK_MS = 1000;

/** 시장가 슬리피지: 체결가 = 현재가 × (1 ± 0.005%) */
export const MARKET_ORDER_SLIPPAGE = 0.00005;

// ── 가격 엔진 (시간 기반: 틱 간격과 무관하게 하루 등락폭이 일정) ──
// 1시간 거래일로 압축해도 거래일당 변동폭이 크게 줄지 않도록 시간 계수를 보정한다.
// 지수 ~1%, 채권 ~0.5%. 실제 시장 수준.
/** 개별 노이즈: volatility × 이 값 × √dt초 */
export const VOLATILITY_TIME_SCALE = 0.014;
/** 시장 공통 충격: beta × z × 이 값 × √dt초 (베타1 기준 일변동 ~1.25%) */
export const MARKET_SHOCK_TIME_SCALE = 0.000208;
/** 시장 사인파 추세 진폭(초당, 베타 1 기준) — 15분 주기 ±1% 내외 */
export const MARKET_TREND_BASE_PER_SEC = 0.00003;
/** 장기 성향: drift × 이 값 × dt초 (drift 0.001이면 하루 +0.03%) */
export const DRIFT_TIME_SCALE = 0.00009;
/** Broad-market long-run growth target per 3-hour trading session (~10% over 240 sessions). */
export const MARKET_SECULAR_GROWTH_PER_SESSION = 0.0004;
/** Fraction of a benchmark's downside gap recovered per trading session. */
export const MARKET_DOWNSIDE_REVERSION_PER_SESSION = 0.025;
/** 이벤트 임팩트: impact × 이 값 × dt초 × 감쇠 (impact 0.04면 총 ~0.6% 반영) */
export const EVENT_IMPACT_TIME_SCALE = 0.0035;
export const MAX_PRICE_HISTORY = 120;
export const ORDER_BOOK_LEVELS = 5;
/** 가상 1거래일 = 실시간 1시간. 정시마다 새 거래일이 시작된다. */
export const SESSION_DURATION_MS = 60 * 60 * 1000;
/** 뉴스 이벤트 최소 간격 — 직전 이벤트 후 이 시간이 지나야 다음 추첨 시작 */
export const EVENT_MIN_GAP_MS = 5 * 60 * 1000;
/** 최소 간격이 지난 뒤 틱당 이벤트 발생 확률 */
export const EVENT_CHANCE_PER_TICK = 0.06;
/** history에서 임시 30초봉을 만들 때 묶을 1초 틱 수. */
export const CANDLE_TICKS = 30;
export const BASE_CANDLE_INTERVAL_MS = 30_000;

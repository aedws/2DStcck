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
 *  종목 4종 추가로 다시 전체 리플레이를 강제한다.
 *  v12: 반도체 섹터 ETF(SEMIX) 상장 — 종목 추가로 전체 리플레이를 강제한다.
 *  v13: 종합지수(BASPY 23종)·테크(BAQQQ) ETF 구성 개편 — 구성 종목이 바뀌어
 *  ETF 가격 경로가 달라지므로 전체 리플레이를 강제한다.
 *  v14: 배당 방어 ETF(DIVX) 상장 — 종목 추가로 전체 리플레이를 강제한다.
 *  v15: 밸런스 개편 — 전 종목 양방향 평균회귀(개별 노이즈 복리로 인한 ±극단
 *  이탈 방지) + 변동성 하향 + 벤치마크 드리프트 정합. 가격 규칙이 바뀌어 전체
 *  리플레이를 강제한다.
 *  v16: 레버리지·인버스 ETF를 '로그수익률 배수(power-law)' 모델로 교체 —
 *  prevDayClose 미갱신으로 복리가 소실돼 레버리지가 평평하던 버그 수정. 우상향이
 *  지속되면 배수만큼 본주를 앞지른다. 가격 규칙 변경으로 전체 리플레이를 강제한다.
 *  v17: 레버리지·인버스 ETF 액면분할·병합 도입 — 가격이 $500을 넘으면 5:1 분할,
 *  $50 밑으로 내리면 2:1 병합해 표시가를 [$50, $500) 밴드로 유지한다(보유 좌수는
 *  반대로 증감). 표시가 규칙이 바뀌어 전체 리플레이를 강제한다.
 *  v18: 기저 시장(이벤트 무관) 분산 축소 — 개별 노이즈(VOLATILITY_TIME_SCALE)를
 *  낮추고 양방향 평균회귀를 강화해, 아무 판단·이벤트 없이도 종목이 ±50~70%로
 *  달아나던 '복권 느낌'을 줄인다. 이벤트·판단이 분산을 만들도록 기저를 조인다.
 *  v19: 레버리지·인버스 ETF 액면분할·병합 밴드를 [$50,$500)→[$10,$1000)로 확장.
 *  분할·병합이 극단에서만 드물게 일어나 표시가 규칙이 바뀌므로 전체 리플레이를
 *  강제한다.
 *  v20: IPO 신규 상장 '레이센 제약(우동게)' 추가 — 종목 구성이 바뀌어 전체
 *  리플레이를 강제한다(상장 시각 전까지는 비거래·비노출·시뮬 동결).
 *  v21: IPO 신규 상장 '단테 정밀시계(단테)' + 명품 섹터 추가 — 종목 구성 변경으로
 *  전체 리플레이를 강제한다.
 *  v22: IPO 상장 틱을 절대 시각이 아닌 시장 기원점 기준 상대 틱으로 교정 — 상장 후에도
 *  공모가에 영구 동결되던 레이센 제약·단테 정밀시계의 시세·캔들을 재생성한다. */
export const MARKET_SIM_VERSION = 25;
/**
 * 지갑(현금·보유·거래내역) 스키마 세대.
 * 증가 시 구세대 LocalStorage·cloud `game_saves` 를 폐기하고 초기 자금으로 다시 시작한다.
 * 시장 체크포인트(marketVersion)와 분리 — 가격 엔진만 바꿀 때는 올리지 않는다.
 * v1: 거래내역 미동기화·비정상 자산 시즌을 한 번 리셋해 정상화.
 * v2: 분배 체크포인트 회귀로 현금이 복제되던 시즌을 재리셋.
 * v3: epoch 판정이 초기값에 가려져 로컬 구저장분이 안 지워지던 버그 수정 후 재리셋.
 * v4: 레버리지 옵션 분할 익스플로잇으로 비정상 자금이 반복 증식돼, 공정성을 위해
 *     새 시즌 강제 오픈 + 전 계정 초기화. 리셋 보상으로 마스터 프레임을 지급한다.
 */
export const WALLET_EPOCH = 4;
/** 결정론 시뮬레이션 tick 간격 (ms) — 로컬 모드 1초 */
export const SIM_TICK_MS = 1000;

/**
 * 리더보드 순자산 컬럼(Postgres int8) 안전 상한(센트). 게임 내 현금·순자산은
 * 상한 없이 무한히 커질 수 있고(그 규모에선 float 정밀도만 완만히 떨어질 뿐
 * 로직은 정상 동작), 다만 DB 저장 시 int8 범위(≈9.2e18)를 넘지 않도록 제출값만
 * 이 값으로 막는다. 게임플레이 제한이 아니라 저장 계층의 방어선이다.
 */
export const LEADERBOARD_MAX_NET_WORTH = 9_000_000_000_000_000_000;

/**
 * 오버플로우 복구 지원금(센트) — $10,000,000.
 * 자금 상한을 없애기 전, 2^53(≈$90.07조) 정수 경계를 넘겨 자산 계산이 깨진 채
 * 순자산이 비정상적으로 마이너스가 되거나 NaN/Infinity로 오염된 계정에 한해
 * 강제로 지급하는 복구 비용이다. 정상 플레이의 소소한 마이너스(공매도·마진)는
 * 대상이 아니며, 오직 오버플로우 파손(비유한값 또는 -$1조 미만)만 복구한다. */
export const OVERFLOW_RECOVERY_GRANT_CENTS = 1_000_000_000;
/** 오버플로우 파손 판정 하한(센트) — 순자산이 -$1조 미만이면 정상 플레이로는
 *  도달 불가능한 정밀도 붕괴로 간주한다. */
export const OVERFLOW_BROKEN_NET_WORTH_FLOOR = -100_000_000_000_000;

/** 시장가 슬리피지: 체결가 = 현재가 × (1 ± 0.005%) */
export const MARKET_ORDER_SLIPPAGE = 0.00005;

// ── 가격 엔진 (시간 기반: 틱 간격과 무관하게 하루 등락폭이 일정) ──
// 1시간 거래일로 압축해도 거래일당 변동폭이 크게 줄지 않도록 시간 계수를 보정한다.
// 지수 ~1%, 채권 ~0.5%. 실제 시장 수준.
/** 개별 노이즈: volatility × 이 값 × √dt초 */
export const VOLATILITY_TIME_SCALE = 0.008;
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
/**
 * 전 종목 양방향 평균회귀 강도(거래일당 로그 편차 교정 비율). 종목이 드리프트
 * 함축 앵커에서 멀어지면 되돌린다 — 개별 노이즈가 무한 복리로 ±극단(모닝·폭락)으로
 * 달아나지 못하게 묶는다. 반감기 ≈ ln2/κ. 위(과열)는 조금 더 세게, 아래(지지)는
 * 조금 완만하게 둔다.
 */
export const MEAN_REVERSION_UP_PER_SESSION = 0.11;
export const MEAN_REVERSION_DOWN_PER_SESSION = 0.08;
/** 이벤트 임팩트: impact × 이 값 × dt초 × 감쇠 (impact 0.04면 총 ~0.6% 반영) */
export const EVENT_IMPACT_TIME_SCALE = 0.0035;

// ── 레버리지·인버스 ETF 액면분할·병합 (센트 단위) ──
// power-law 레버리지가는 우상향이 길어지면 무한히 커지고 인버스는 0에 수렴한다.
// 표시가를 사람이 다루기 쉬운 밴드에 묶기 위해, 상단을 넘으면 분할(좌수↑·가격↓),
// 하단을 밑돌면 병합(좌수↓·가격↑)한다. 배수는 '현재가만의 순함수'라 결정론
// 리플레이에서 상태 없이 재구성된다. 밴드 = [MERGE_AT, SPLIT_AT) = [$10, $1000).
// 밴드를 넓게(100배) 잡아 분할·병합이 극단에서만 드물게 일어나게 한다 — 한번
// 조정되면 한참 그 상태로 둔다. 병합은 상장폐지 요건($10) 직전까지 미루고, 재분할은
// $1000을 넘기기 전엔 하지 않는다. (5:1 분할 $1000→$200, 2:1 병합 $10→$20 모두
// 밴드 안에 안착해 진동하지 않는다.)
/** 이 가격 이상이면 분할한다 — $1000 */
export const LEVERAGE_SPLIT_AT = 100_000;
/** 이 가격 미만이면 병합한다 — $10 (상장폐지 요건 직전) */
export const LEVERAGE_MERGE_AT = 1_000;
/** 분할 비율 5:1 (가격 ÷5, 좌수 ×5) */
export const LEVERAGE_SPLIT_RATIO = 5;
/** 병합 비율 2:1 (가격 ×2, 좌수 ÷2) */
export const LEVERAGE_MERGE_RATIO = 2;
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

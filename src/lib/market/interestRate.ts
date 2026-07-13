import type { MarketEvent, RateLevel, StockState } from "@/lib/types/market";

/**
 * 금리 레짐: 광의시장(V-NASDAQ)의 최근 수익률에 비례해 3단계로 움직인다.
 * 강세장이면 긴축(3단계), 약세장이면 완화(1단계) — 실제 중앙은행처럼.
 * 벤치마크 일봉에서 순수하게 계산되므로 전 클라이언트가 같은 금리를 본다.
 */

/** 금리 판단에 쓰는 추세 관측 창 (거래일) */
export const RATE_TRAILING_SESSIONS = 20;
/** 1거래년 = 240거래일 (연이율 → 거래일 이자 환산) */
export const SESSIONS_PER_YEAR = 240;

export const RATE_ANNUAL_PERCENT: Record<RateLevel, number> = {
  1: 3,
  2: 6,
  3: 9,
};
export const RATE_LABEL: Record<RateLevel, string> = {
  1: "완화",
  2: "중립",
  3: "긴축",
};

/** 공매도 대여수수료 (연 %) */
export const SHORT_BORROW_ANNUAL_PERCENT = 2;

const HIKE_THRESHOLD = 0.04; // 최근 수익률 > +4% → 긴축(3)
const CUT_THRESHOLD = -0.02; // 최근 수익률 < -2% → 완화(1)

export const RATE_BENCHMARK_ID = "vnasdaq";

export function getBenchmark(stocks: StockState[]): StockState | undefined {
  return stocks.find((s) => s.id === RATE_BENCHMARK_ID);
}

/** 일봉 close 기준, endIndex 시점에서 sessions 이전 대비 수익률 */
function trailingReturnAt(
  bench: StockState,
  endIndex: number,
  sessions: number,
): number {
  const candles = bench.dailyCandles ?? [];
  if (candles.length < 2 || endIndex < 1) return 0;
  const end = candles[Math.min(endIndex, candles.length - 1)];
  const pastIdx = Math.max(0, Math.min(endIndex, candles.length - 1) - sessions);
  const past = candles[pastIdx];
  if (!end || !past || past.close <= 0) return 0;
  return end.close / past.close - 1;
}

function levelFromReturn(r: number): RateLevel {
  if (r > HIKE_THRESHOLD) return 3;
  if (r < CUT_THRESHOLD) return 1;
  return 2;
}

/** 현재 금리 단계 */
export function getRateLevel(bench: StockState | undefined): RateLevel {
  if (!bench) return 2;
  const candles = bench.dailyCandles ?? [];
  return levelFromReturn(
    trailingReturnAt(bench, candles.length - 1, RATE_TRAILING_SESSIONS),
  );
}

/** 직전 거래일 시점의 금리 단계 (금리 변경 뉴스 판정용) */
export function getPrevRateLevel(bench: StockState | undefined): RateLevel {
  if (!bench) return 2;
  const candles = bench.dailyCandles ?? [];
  return levelFromReturn(
    trailingReturnAt(bench, candles.length - 2, RATE_TRAILING_SESSIONS),
  );
}

export function getAnnualRatePercent(level: RateLevel): number {
  return RATE_ANNUAL_PERCENT[level];
}

/** 금리 단계 변경 뉴스 (결정론 id — 같은 세션이면 모든 클라이언트가 동일 이벤트) */
export function buildRateChangeEvent(
  session: number,
  from: RateLevel,
  to: RateLevel,
  now: number,
): MarketEvent {
  const hiked = to > from;
  return {
    id: `rate-${session}`,
    title: hiked
      ? `중앙은행, 금리 인상 → ${to}단계(${RATE_LABEL[to]})`
      : `중앙은행, 금리 인하 → ${to}단계(${RATE_LABEL[to]})`,
    description: hiked
      ? `과열된 시장을 식히기 위해 기준금리를 올렸습니다. 대출 이자 부담이 커집니다.`
      : `둔화된 시장을 부양하기 위해 기준금리를 내렸습니다. 대출 이자 부담이 줄어듭니다.`,
    affectedStockIds: [],
    impact: 0, // 정보성 매크로 뉴스 (가격에 직접 충격 없음)
    timestamp: now,
    category: "macro",
    tag: "금리",
  };
}

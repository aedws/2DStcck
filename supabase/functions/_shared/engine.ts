// AUTO-GENERATED from src/lib/market/engine.ts — edit the original and run `npm run sync:functions`
import type {
  Candle,
  EventTemplate,
  MarketEvent,
  PricePoint,
  StockDefinition,
  StockState,
} from "./types.ts";
import {
  CANDLE_TICKS,
  DRIFT_TIME_SCALE,
  EVENT_CHANCE_PER_TICK,
  EVENT_IMPACT_TIME_SCALE,
  EVENT_MIN_GAP_MS,
  MARKET_SHOCK_TIME_SCALE,
  MARKET_TREND_BASE_PER_SEC,
  MAX_PRICE_HISTORY,
  SERVER_TICK_SECONDS,
  SESSION_DURATION_MS,
  VOLATILITY_TIME_SCALE,
} from "./constants.ts";
import {
  EVENT_TEMPLATES,
  getCompanyDefinitions,
  STOCK_DEFINITIONS,
} from "./stocks.ts";
import { getCharacterById } from "./characters.ts";
import { generateOrderBook } from "./orderBook.ts";

/** 사인파 추세 주기 (15분) */
const MARKET_TREND_PERIOD_MS = 900_000;
/** 선물의 추세 선행 시간 */
const FUTURES_LEAD_MS = 90_000;

function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function createInitialStockState(def: StockDefinition): StockState {
  const orderBook = generateOrderBook(def.initialPrice);
  const now = Date.now();
  return {
    ...def,
    currentPrice: def.initialPrice,
    prevDayClose: def.initialPrice,
    dayOpen: def.initialPrice,
    daySessionId: Math.floor(now / SESSION_DURATION_MS),
    priceHistory: [{ timestamp: now, price: def.initialPrice }],
    candles: [
      {
        timestamp: Math.floor(now / 60_000) * 60_000,
        open: def.initialPrice,
        high: def.initialPrice,
        low: def.initialPrice,
        close: def.initialPrice,
      },
    ],
    orderBook,
  };
}

function getActiveEventImpact(
  stock: StockState,
  events: MarketEvent[],
  now: number,
): number {
  let impact = 0;
  for (const event of events) {
    const elapsed = now - event.timestamp;
    if (elapsed >= 0 && elapsed < 90_000 && event.affectedStockIds.includes(stock.id)) {
      // macro 이벤트는 시장 민감도(베타)만큼 강하게 맞는다
      const betaScale = event.category === "macro" ? (stock.beta ?? 1) : 1;
      impact += event.impact * betaScale * (1 - elapsed / 90_000);
    }
  }
  return impact;
}

/** 시간 기반 가격 엔진: 모든 항이 dt(초)로 스케일되어
 * 틱 간격(로컬 1초 / 서버 10초)과 무관하게 하루 등락폭이 동일하다. */
export function calculateTickPrice(
  stock: StockState,
  events: MarketEvent[],
  now: number,
  marketShock = 0,
  dtSeconds = SERVER_TICK_SECONDS,
): number {
  const sqrtDt = Math.sqrt(dtSeconds);
  const eventImpact = getActiveEventImpact(stock, events, now);
  const noise =
    randomNormal() * stock.volatility * VOLATILITY_TIME_SCALE * sqrtDt;

  // ── 시장 팩터 (베타 모델): 종목 수익률 = 베타 × (추세 + 공통충격) + 개별 노이즈 ──
  // 약 15분 주기의 사인파 추세. 전 종목이 같은 위상을 공유하고,
  // 선물이 90초 선행한다(선행지표) → 선물을 보면 시장 방향을 미리 안다.
  const beta = stock.beta ?? 0;
  const trendLead = stock.sector === "선물" ? FUTURES_LEAD_MS : 0;
  const trendAmplitude =
    (stock.trendStrength ?? beta * MARKET_TREND_BASE_PER_SEC) * dtSeconds;
  const trend =
    trendAmplitude *
    Math.sin(((now + trendLead) / MARKET_TREND_PERIOD_MS) * 2 * Math.PI);
  // 공통 충격: 같은 틱의 모든 종목이 같은 z를 받아 지수와 동반 등락한다
  const shock = beta * marketShock * MARKET_SHOCK_TIME_SCALE * sqrtDt;

  const changeRate =
    stock.drift * DRIFT_TIME_SCALE * dtSeconds +
    trend +
    shock +
    eventImpact * EVENT_IMPACT_TIME_SCALE * dtSeconds +
    noise;
  const nextPrice = stock.currentPrice * (1 + changeRate);

  return Math.max(Math.round(nextPrice), 100);
}

/** 1분봉 유지: 같은 분이면 고저종 갱신, 새 분이면 새 봉 시작 */
export const MAX_CANDLES = 180;

export function applyTickToCandles(
  candles: Candle[],
  price: number,
  now: number,
): Candle[] {
  const minuteStart = Math.floor(now / 60_000) * 60_000;
  const last = candles[candles.length - 1];

  if (last && last.timestamp === minuteStart) {
    const updated: Candle = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    };
    return [...candles.slice(0, -1), updated];
  }

  return [
    ...candles,
    { timestamp: minuteStart, open: price, high: price, low: price, close: price },
  ].slice(-MAX_CANDLES);
}

/** 결정된 다음 가격을 종목 상태에 반영 (거래일 롤오버·호가·히스토리·캔들) */
function applyTickPrice(
  stock: StockState,
  nextPrice: number,
  now: number,
): StockState {
  // 거래일: 벽시계 3시간 단위. 경계를 넘으면 전일 종가·시초가 롤오버.
  // (구버전 상태는 daySessionId가 없음 → 롤오버 없이 현재 거래일에 편입)
  const session = Math.floor(now / SESSION_DURATION_MS);
  const isNewSession =
    stock.daySessionId !== undefined && stock.daySessionId !== session;
  let prevDayClose = stock.prevDayClose;
  let dayOpen = stock.dayOpen;

  if (isNewSession) {
    prevDayClose = stock.currentPrice;
    dayOpen = nextPrice;
  }

  const orderBook = generateOrderBook(nextPrice, stock.orderBook);
  const newHistory = [
    ...stock.priceHistory,
    { timestamp: now, price: nextPrice },
  ].slice(-MAX_PRICE_HISTORY);

  return {
    ...stock,
    daySessionId: session,
    prevDayClose,
    dayOpen,
    currentPrice: nextPrice,
    orderBook,
    priceHistory: newHistory,
    candles: applyTickToCandles(stock.candles ?? [], nextPrice, now),
  };
}

export function tickStock(
  stock: StockState,
  events: MarketEvent[],
  now: number,
  tick: number,
  marketShock = 0,
  dtSeconds = SERVER_TICK_SECONDS,
): StockState {
  const nextPrice = calculateTickPrice(stock, events, now, marketShock, dtSeconds);
  return applyTickPrice(stock, nextPrice, now);
}

/** NAV 추종 ETF 가격: 상장가 × Σ(비중 × 구성종목 수익률) */
export function computeEtfNav(
  etf: StockState,
  stocksById: Map<string, StockState>,
): number {
  let weightedReturn = 0;
  let weightSum = 0;

  for (const holding of etf.etfHoldings ?? []) {
    const constituent = stocksById.get(holding.stockId);
    const def = STOCK_DEFINITIONS.find((d) => d.id === holding.stockId);
    if (!constituent || !def || def.initialPrice <= 0) continue;
    weightedReturn += holding.weight * (constituent.currentPrice / def.initialPrice);
    weightSum += holding.weight;
  }

  if (weightSum === 0) return etf.currentPrice;
  return Math.max(Math.round(etf.initialPrice * (weightedReturn / weightSum)), 100);
}

/** 표시용 미세 틱 (서버 모드 클라이언트 전용):
 * 서버 확정가(10초) 사이를 살아있게 움직임. 다음 서버 동기화 때 실제 값으로 수렴. */
export function microTickStock(
  stock: StockState,
  now: number,
  anchorPrice?: number,
): StockState {
  const noise = randomNormal() * stock.volatility * 0.012;
  // 서버 확정가 방향으로 살짝 당기는 평균회귀 (틱당 간극의 8%)
  const anchor = anchorPrice ?? stock.currentPrice;
  const pull = ((anchor - stock.currentPrice) / Math.max(anchor, 1)) * 0.08;
  const nextPrice = Math.max(
    Math.round(stock.currentPrice * (1 + pull + noise)),
    100,
  );
  const history = stock.priceHistory;
  return {
    ...stock,
    currentPrice: nextPrice,
    orderBook: generateOrderBook(nextPrice, stock.orderBook),
    candles: applyTickToCandles(stock.candles ?? [], nextPrice, now),
    priceHistory: [
      ...history.slice(0, -1),
      { timestamp: now, price: nextPrice },
    ],
  };
}

export function tickAllStocks(
  stocks: StockState[],
  events: MarketEvent[],
  now: number,
  tick: number,
  dtSeconds = SERVER_TICK_SECONDS,
): StockState[] {
  // 이 틱의 공통 시장 충격 — 전 종목이 공유 (베타로 개별 스케일)
  const marketShock = randomNormal();

  // 1차: 일반 종목 (ETF 제외) — NAV 계산의 기준이 된다
  const ticked = stocks.map((stock) =>
    stock.etfHoldings?.length
      ? stock
      : tickStock(stock, events, now, tick, marketShock, dtSeconds),
  );

  // 2차: NAV 추종 ETF — 같은 틱의 구성종목 가격으로 산출
  const byId = new Map(ticked.map((s) => [s.id, s]));
  return ticked.map((stock) =>
    stock.etfHoldings?.length
      ? applyTickPrice(stock, computeEtfNav(stock, byId), now)
      : stock,
  );
}

function pickWeighted<T>(
  items: T[],
  weightOf: (item: T) => number,
): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(weightOf(item), 0), 0);
  if (total <= 0) return null;
  let r = Math.random() * total;
  for (const item of items) {
    r -= Math.max(weightOf(item), 0);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

/** 템플릿 → 실제 이벤트: 대상 종목 결정 + {company}/{ceo}/{title} 치환 */
export function resolveEventTemplate(
  template: EventTemplate,
  now: number,
): MarketEvent | null {
  let title = template.title;
  let description = template.description;
  let affectedStockIds: string[];

  if (template.category === "company") {
    const candidates = getCompanyDefinitions().filter(
      (c) => !template.requiresCeo || c.ceoId,
    );
    const company = pickWeighted(
      candidates,
      (c) => c.eventBias?.[template.tag] ?? 1,
    );
    if (!company) return null;

    const ceo = getCharacterById(company.ceoId);
    affectedStockIds = [company.id];
    const substitute = (text: string) =>
      text
        .replaceAll("{company}", company.name)
        .replaceAll("{ceo}", ceo?.name ?? "경영진")
        .replaceAll("{title}", ceo?.title ?? "");
    title = substitute(title);
    description = substitute(description);
  } else if (template.category === "sector" && template.sector) {
    affectedStockIds = STOCK_DEFINITIONS.filter(
      (d) => d.sector === template.sector,
    ).map((d) => d.id);
  } else {
    affectedStockIds =
      template.affectedStockIds ?? STOCK_DEFINITIONS.map((d) => d.id);
  }

  return {
    id: `event-${now}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    description,
    affectedStockIds,
    impact: template.impact,
    timestamp: now,
    category: template.category,
    tag: template.tag,
  };
}

/** 뉴스 템포: 직전 이벤트 후 EVENT_MIN_GAP_MS 경과 전에는 발생하지 않고,
 * 경과 후에는 틱당 EVENT_CHANCE_PER_TICK 확률로 추첨 (틱 간격과 무관한 시간 기반 템포) */
export function maybeGenerateEvent(
  tick: number,
  now: number,
  events: MarketEvent[] = [],
): MarketEvent | null {
  const lastEventAt = events.length
    ? Math.max(...events.map((e) => e.timestamp))
    : 0;
  if (now - lastEventAt < EVENT_MIN_GAP_MS) return null;
  if (Math.random() > EVENT_CHANCE_PER_TICK) return null;

  const template =
    EVENT_TEMPLATES[Math.floor(Math.random() * EVENT_TEMPLATES.length)];

  return resolveEventTemplate(template, now);
}

/** 전일 종가 대비 등락률 */
export function getDayChangePercent(stock: StockState): number {
  return getChangePercent(stock.currentPrice, stock.prevDayClose);
}

export function getDayChangeAmount(stock: StockState): number {
  return stock.currentPrice - stock.prevDayClose;
}

export function buildCandles(
  history: PricePoint[],
  ticksPerCandle = CANDLE_TICKS,
): Candle[] {
  if (history.length === 0) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < history.length; i += ticksPerCandle) {
    const chunk = history.slice(i, i + ticksPerCandle);
    const prices = chunk.map((p) => p.price);
    candles.push({
      timestamp: chunk[chunk.length - 1].timestamp,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
    });
  }
  return candles;
}

export function getChangePercent(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/** 가격 단위: 내부 정수 = 센트. 표시 = 달러 ($1,234.56) */
export function formatPrice(cents: number): string {
  return (
    "$" +
    (cents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** 등락 금액 ($ 부호 포함): +$12.34 / -$0.50 */
export function formatSignedMoney(cents: number): string {
  const sign = cents >= 0 ? "+" : "-";
  return (
    sign +
    "$" +
    (Math.abs(cents) / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** 지수·선물은 포인트(정수) 표기 */
export function isIndexLike(sector: string): boolean {
  return sector === "지수" || sector === "선물";
}

export function formatPoints(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** 종목 성격에 맞는 가격 표기 (지수·선물 = 포인트, 그 외 = 달러) */
export function formatStockValue(
  stock: { sector: string },
  value: number,
): string {
  return isIndexLike(stock.sector) ? formatPoints(value) : formatPrice(value);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatQuantity(qty: number): string {
  return qty.toLocaleString("ko-KR") + "주";
}

export function formatMarketTime(startedAt: number, tick: number): string {
  const elapsed = tick;
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export function formatTradeTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

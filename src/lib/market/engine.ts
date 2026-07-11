import type {
  Candle,
  EventTemplate,
  MarketEvent,
  PricePoint,
  StockDefinition,
  StockState,
} from "@/lib/types/market";
import {
  CANDLE_TICKS,
  EVENT_CHANCE_PER_TICK,
  EVENT_MIN_GAP_MS,
  MAX_PRICE_HISTORY,
  SESSION_DURATION_MS,
} from "@/lib/market/constants";
import {
  EVENT_TEMPLATES,
  getCompanyDefinitions,
  STOCK_DEFINITIONS,
} from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import { generateOrderBook } from "@/lib/market/orderBook";

const TICK_VOLATILITY_SCALE = 0.12;
const TICK_DRIFT_SCALE = 0.002;
/** 시장 팩터: 베타 1 기준 사인파 추세 진폭 (지수 trendStrength와 동일) */
const MARKET_TREND_BASE = 0.0012;
/** 시장 팩터: 전 종목 공통 충격의 틱당 변동성 (베타로 스케일) */
const MARKET_SHOCK_VOLATILITY = 0.002;
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

export function calculateTickPrice(
  stock: StockState,
  events: MarketEvent[],
  now: number,
  marketShock = 0,
): number {
  const eventImpact = getActiveEventImpact(stock, events, now);
  const noise = randomNormal() * stock.volatility * TICK_VOLATILITY_SCALE;

  // ── 시장 팩터 (베타 모델): 종목 수익률 = 베타 × (추세 + 공통충격) + 개별 노이즈 ──
  // 약 15분 주기의 사인파 추세. 전 종목이 같은 위상을 공유하고,
  // 선물이 90초 선행한다(선행지표) → 선물을 보면 시장 방향을 미리 안다.
  const beta = stock.beta ?? 0;
  const trendLead = stock.sector === "선물" ? FUTURES_LEAD_MS : 0;
  const trendAmplitude = stock.trendStrength ?? beta * MARKET_TREND_BASE;
  const trend =
    trendAmplitude *
    Math.sin(((now + trendLead) / MARKET_TREND_PERIOD_MS) * 2 * Math.PI);
  // 공통 충격: 같은 틱의 모든 종목이 같은 z를 받아 지수와 동반 등락한다
  const shock = beta * marketShock * MARKET_SHOCK_VOLATILITY;

  const changeRate =
    stock.drift * TICK_DRIFT_SCALE + trend + shock + eventImpact * 0.05 + noise;
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

export function tickStock(
  stock: StockState,
  events: MarketEvent[],
  now: number,
  tick: number,
  marketShock = 0,
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
  }

  const nextPrice = calculateTickPrice(stock, events, now, marketShock);
  const orderBook = generateOrderBook(nextPrice, stock.orderBook);
  const newHistory = [
    ...stock.priceHistory,
    { timestamp: now, price: nextPrice },
  ].slice(-MAX_PRICE_HISTORY);

  if (isNewSession) {
    dayOpen = nextPrice;
  }

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

/** 표시용 미세 틱 (서버 모드 클라이언트 전용):
 * 서버 확정가(10초) 사이를 살아있게 움직임. 다음 서버 동기화 때 실제 값으로 수렴. */
export function microTickStock(
  stock: StockState,
  now: number,
  anchorPrice?: number,
): StockState {
  const noise = randomNormal() * stock.volatility * 0.07;
  // 서버 확정가 방향으로 살짝 당기는 평균회귀 (틱당 간극의 6%)
  const anchor = anchorPrice ?? stock.currentPrice;
  const pull = ((anchor - stock.currentPrice) / Math.max(anchor, 1)) * 0.06;
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
): StockState[] {
  // 이 틱의 공통 시장 충격 — 전 종목이 공유 (베타로 개별 스케일)
  const marketShock = randomNormal();
  return stocks.map((stock) => tickStock(stock, events, now, tick, marketShock));
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

export function formatPrice(price: number): string {
  return price.toLocaleString("ko-KR") + "원";
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

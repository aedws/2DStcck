// AUTO-GENERATED from src/lib/market/engine.ts — edit the original and run `npm run sync:functions`
import type {
  Candle,
  MarketEvent,
  PricePoint,
  StockDefinition,
  StockState,
} from "./types.ts";
import {
  CANDLE_TICKS,
  MAX_PRICE_HISTORY,
  TICKS_PER_SESSION,
} from "./constants.ts";
import { MARKET_EVENT_POOL } from "./stocks.ts";
import { generateOrderBook } from "./orderBook.ts";

const TICK_VOLATILITY_SCALE = 0.12;
const TICK_DRIFT_SCALE = 0.002;

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
  stockId: string,
  events: MarketEvent[],
  now: number,
): number {
  let impact = 0;
  for (const event of events) {
    const elapsed = now - event.timestamp;
    if (elapsed >= 0 && elapsed < 90_000 && event.affectedStockIds.includes(stockId)) {
      impact += event.impact * (1 - elapsed / 90_000);
    }
  }
  return impact;
}

export function calculateTickPrice(
  stock: StockState,
  events: MarketEvent[],
  now: number,
): number {
  const eventImpact = getActiveEventImpact(stock.id, events, now);
  const noise = randomNormal() * stock.volatility * TICK_VOLATILITY_SCALE;
  // 추세 종목(지수·선물): 약 15분 주기의 사인파 추세
  const trend = stock.trendStrength
    ? stock.trendStrength *
      Math.sin((now / 900_000) * 2 * Math.PI + (stock.initialPrice % 7))
    : 0;
  const changeRate =
    stock.drift * TICK_DRIFT_SCALE + trend + eventImpact * 0.05 + noise;
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
): StockState {
  const isNewSession = tick > 0 && tick % TICKS_PER_SESSION === 0;
  let prevDayClose = stock.prevDayClose;
  let dayOpen = stock.dayOpen;

  if (isNewSession) {
    prevDayClose = stock.currentPrice;
  }

  const nextPrice = calculateTickPrice(stock, events, now);
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
  return stocks.map((stock) => tickStock(stock, events, now, tick));
}

export function maybeGenerateEvent(
  tick: number,
  now: number,
): MarketEvent | null {
  if (tick === 0 || tick % 12 !== 0 || Math.random() > 0.5) {
    return null;
  }

  const template =
    MARKET_EVENT_POOL[Math.floor(Math.random() * MARKET_EVENT_POOL.length)];

  return {
    ...template,
    id: `event-${now}-${Math.random().toString(36).slice(2, 8)}`,
    timestamp: now,
  };
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

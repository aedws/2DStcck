import type {
  Candle,
  MarketEvent,
  PricePoint,
  StockDefinition,
  StockState,
} from "@/lib/types/market";
import {
  CANDLE_TICKS,
  MAX_PRICE_HISTORY,
  TICKS_PER_SESSION,
} from "@/lib/market/constants";
import { MARKET_EVENT_POOL } from "@/data/stocks";
import { generateOrderBook } from "@/lib/market/orderBook";

const TICK_VOLATILITY_SCALE = 0.12;
const TICK_DRIFT_SCALE = 0.002;

function randomNormal(): number {
  const u1 = Math.random();
  const u2 = Math.random();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

export function createInitialStockState(def: StockDefinition): StockState {
  const orderBook = generateOrderBook(def.initialPrice);
  return {
    ...def,
    currentPrice: def.initialPrice,
    prevDayClose: def.initialPrice,
    dayOpen: def.initialPrice,
    priceHistory: [{ timestamp: Date.now(), price: def.initialPrice }],
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
    if (elapsed >= 0 && elapsed < 30_000 && event.affectedStockIds.includes(stockId)) {
      impact += event.impact * (1 - elapsed / 30_000);
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
  const changeRate = stock.drift * TICK_DRIFT_SCALE + eventImpact * 0.01 + noise;
  const nextPrice = stock.currentPrice * (1 + changeRate);

  return Math.max(Math.round(nextPrice), 100);
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
  if (tick === 0 || tick % 45 !== 0 || Math.random() > 0.4) {
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

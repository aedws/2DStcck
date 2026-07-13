import type { MarketEvent, StockState } from "@/lib/types/market";

/** 호가 잔량 기반 유사 거래대금 */
export function pseudoVolume(stock: StockState): number {
  const book = stock.orderBook;
  const total =
    book.asks.reduce((s, l) => s + l.quantity, 0) +
    book.bids.reduce((s, l) => s + l.quantity, 0);
  return total * stock.currentPrice;
}

/** 호가 잔량 기반 매수 비율 (%) */
export function buyRatio(stock: StockState): number {
  const bid = stock.orderBook.bids.reduce((s, l) => s + l.quantity, 0);
  const ask = stock.orderBook.asks.reduce((s, l) => s + l.quantity, 0);
  if (bid + ask === 0) return 50;
  return Math.round((bid / (bid + ask)) * 100);
}

/** 체결강도: 매수잔량/매도잔량 × 100 (100 이상이면 매수 우위) */
export function buyStrength(stock: StockState): number {
  const bid = stock.orderBook.bids.reduce((s, l) => s + l.quantity, 0);
  const ask = stock.orderBook.asks.reduce((s, l) => s + l.quantity, 0);
  if (ask === 0) return 100;
  return Math.round((bid / ask) * 100);
}

/** 해당 종목에 영향을 준 가장 최근 이벤트 */
export function latestEventFor(
  stockId: string,
  events: MarketEvent[],
): MarketEvent | undefined {
  for (let i = events.length - 1; i >= 0; i--) {
    if (events[i].affectedStockIds.includes(stockId)) return events[i];
  }
  return undefined;
}

/** 당일 최고/최저 (30초봉 기준) */
export function dayRange(stock: StockState): { high: number; low: number } {
  if (!stock.candles?.length) {
    return { high: stock.currentPrice, low: stock.currentPrice };
  }
  return {
    high: Math.max(...stock.candles.map((c) => c.high)),
    low: Math.min(...stock.candles.map((c) => c.low)),
  };
}

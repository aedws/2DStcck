import type { OrderBook, OrderBookLevel } from "@/lib/types/market";
import { ORDER_BOOK_LEVELS } from "@/lib/market/constants";

export function getTickSize(price: number): number {
  if (price >= 50000) return 100;
  if (price >= 10000) return 50;
  return 10;
}

function randomQuantity(): number {
  return (Math.floor(Math.random() * 400) + 10) * 10;
}

function jitterQuantity(base: number): number {
  const delta = Math.floor((Math.random() - 0.5) * 80);
  return Math.max(10, base + delta);
}

export function generateOrderBook(
  currentPrice: number,
  prevBook?: OrderBook,
): OrderBook {
  const tick = getTickSize(currentPrice);
  const spreadTicks = 1 + Math.floor(Math.random() * 2);
  const halfSpread = tick * spreadTicks;

  const bestBid = currentPrice - halfSpread;
  const bestAsk = currentPrice + halfSpread;

  const bids: OrderBookLevel[] = [];
  const asks: OrderBookLevel[] = [];

  for (let i = 0; i < ORDER_BOOK_LEVELS; i++) {
    const prevBidQty = prevBook?.bids[i]?.quantity;
    const prevAskQty = prevBook?.asks[i]?.quantity;

    bids.push({
      price: bestBid - i * tick,
      quantity: prevBidQty ? jitterQuantity(prevBidQty) : randomQuantity(),
    });
    asks.push({
      price: bestAsk + i * tick,
      quantity: prevAskQty ? jitterQuantity(prevAskQty) : randomQuantity(),
    });
  }

  return { bids, asks };
}

export function getBestBid(book: OrderBook): number {
  return book.bids[0]?.price ?? 0;
}

export function getBestAsk(book: OrderBook): number {
  return book.asks[0]?.price ?? 0;
}

export function getSpread(book: OrderBook): number {
  return getBestAsk(book) - getBestBid(book);
}

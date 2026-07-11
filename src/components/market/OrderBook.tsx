"use client";

import type { OrderBook as OrderBookType, StockState } from "@/lib/types/market";
import {
  formatPrice,
  formatQuantity,
  getDayChangePercent,
} from "@/lib/market/engine";
import { getBestAsk, getBestBid, getSpread } from "@/lib/market/orderBook";
import { upDownClass } from "@/lib/ui/marketColors";

/** 호가 레벨: $ 없이 소수 두 자리 (헤더에 $ 표기됨) */
function formatLevel(cents: number): string {
  return (cents / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface OrderBookProps {
  stock: StockState;
}

export function OrderBook({ stock }: OrderBookProps) {
  const { orderBook, currentPrice } = stock;
  const change = getDayChangePercent(stock);
  const spread = getSpread(orderBook);
  const bestAsk = getBestAsk(orderBook);
  const bestBid = getBestBid(orderBook);

  const maxQty = Math.max(
    ...orderBook.asks.map((l) => l.quantity),
    ...orderBook.bids.map((l) => l.quantity),
    1,
  );

  return (
    <div className="rounded-2xl bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-end justify-between">
          <div>
            <p className="text-xs text-[var(--muted)]">호가</p>
            <p className="text-xl font-mono font-semibold tabular-nums">
              {formatPrice(currentPrice)}
            </p>
          </div>
          <p className={`text-sm font-mono tabular-nums ${upDownClass(change)}`}>
            {change >= 0 ? "+" : ""}
            {change.toFixed(2)}%
          </p>
        </div>
        <p className="mt-1 text-xs text-[var(--muted)]">
          매도 {formatPrice(bestAsk)} · 매수 {formatPrice(bestBid)} · 스프레드{" "}
          {formatPrice(spread)}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-0 px-2 py-2 text-xs text-[var(--muted)]">
        <span className="px-2 text-right">잔량</span>
        <span className="px-2 text-center">호가</span>
        <span className="px-2">잔량</span>
      </div>

      <div className="space-y-0.5 px-2 pb-3">
        {[...orderBook.asks].reverse().map((level, i) => (
          <OrderBookRow
            key={`ask-${level.price}-${i}`}
            ask={level}
            maxQty={maxQty}
          />
        ))}

        <div className="my-1 border-y border-[var(--border)] py-1.5 text-center text-xs font-medium">
          {formatPrice(currentPrice)}
        </div>

        {orderBook.bids.map((level, i) => (
          <OrderBookRow
            key={`bid-${level.price}-${i}`}
            bid={level}
            maxQty={maxQty}
          />
        ))}
      </div>
    </div>
  );
}

function OrderBookRow({
  ask,
  bid,
  maxQty,
}: {
  ask?: OrderBookType["asks"][0];
  bid?: OrderBookType["bids"][0];
  maxQty: number;
}) {
  if (ask) {
    const width = (ask.quantity / maxQty) * 100;
    return (
      <div className="relative grid grid-cols-3 items-center text-sm">
        <span className="relative z-10 px-2 text-right font-mono text-[var(--muted)]">
          {formatQuantity(ask.quantity)}
        </span>
        <span className="relative z-10 px-2 text-center font-mono text-[var(--up)]">
          {formatLevel(ask.price)}
        </span>
        <span />
        <div
          className="absolute inset-y-0 right-1/2 mr-8 rounded-sm bg-[var(--up)]/10"
          style={{ width: `${width * 0.45}%` }}
        />
      </div>
    );
  }

  if (bid) {
    const width = (bid.quantity / maxQty) * 100;
    return (
      <div className="relative grid grid-cols-3 items-center text-sm">
        <span />
        <span className="relative z-10 px-2 text-center font-mono text-[var(--down)]">
          {formatLevel(bid.price)}
        </span>
        <span className="relative z-10 px-2 font-mono text-[var(--muted)]">
          {formatQuantity(bid.quantity)}
        </span>
        <div
          className="absolute inset-y-0 left-1/2 ml-8 rounded-sm bg-[var(--down)]/10"
          style={{ width: `${width * 0.45}%` }}
        />
      </div>
    );
  }

  return null;
}

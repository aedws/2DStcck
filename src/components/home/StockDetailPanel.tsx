"use client";

import type { MarketEvent, StockState } from "@/lib/types/market";
import {
  formatPrice,
  getDayChangeAmount,
  getDayChangePercent,
} from "@/lib/market/engine";
import {
  formatSignedPercent,
  formatSignedPrice,
  upDownClass,
} from "@/lib/ui/marketColors";
import { CandlestickChart } from "@/components/market/CandlestickChart";
import { OrderBook } from "@/components/market/OrderBook";
import { QuickOrderPanel } from "@/components/market/QuickOrderPanel";
import { useMarketStore } from "@/store/marketStore";

interface StockDetailPanelProps {
  stock: StockState | undefined;
  events: MarketEvent[];
}

export function StockDetailPanel({ stock, events }: StockDetailPanelProps) {
  const holding = useMarketStore((s) =>
    stock ? s.holdings.find((h) => h.stockId === stock.id) : undefined,
  );

  if (!stock) {
    return (
      <div className="flex flex-1 items-center justify-center text-[var(--muted)]">
        종목을 선택해 주세요
      </div>
    );
  }

  const change = getDayChangePercent(stock);
  const priceDiff = getDayChangeAmount(stock);
  const relatedEvent = events.find((e) =>
    e.affectedStockIds.includes(stock.id),
  );

  return (
    <section className="flex min-w-0 flex-1 overflow-hidden bg-[var(--background)]">
      {/* left: chart + order book */}
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <div className="border-b border-[var(--border)] px-6 py-4">
          <p className="text-xs text-[var(--muted)]">
            {stock.ticker} · {stock.sector}
          </p>
          <h1 className="mt-0.5 text-xl font-bold">{stock.name}</h1>
          <div className="mt-2 flex items-end gap-3">
            <p className="text-3xl font-bold tabular-nums">
              {formatPrice(stock.currentPrice)}
            </p>
            <div>
              <p className={`text-sm tabular-nums ${upDownClass(change)}`}>
                {formatSignedPrice(priceDiff)} {formatSignedPercent(change)}
              </p>
              <p className="text-xs text-[var(--muted)]">
                전일 종가 {formatPrice(stock.prevDayClose)} · 시초가{" "}
                {formatPrice(stock.dayOpen)}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4">
          <CandlestickChart
            history={stock.priceHistory}
            height={300}
            averagePrice={holding?.averagePrice}
            prevDayClose={stock.prevDayClose}
          />
        </div>

        {relatedEvent && (
          <div className="mx-6 mb-4 rounded-2xl bg-[var(--surface)] p-4">
            <div className="flex items-center gap-2">
              <span>✨</span>
              <h3 className="text-sm font-semibold">왜 움직였을까?</h3>
            </div>
            <p className="mt-2 text-sm font-medium">{relatedEvent.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              {relatedEvent.description}
            </p>
          </div>
        )}

        <div className="px-6 pb-6">
          <OrderBook stock={stock} />
        </div>
      </div>

      {/* right: quick order */}
      <div className="w-[300px] shrink-0 border-l border-[var(--border)]">
        <QuickOrderPanel stock={stock} />
      </div>
    </section>
  );
}

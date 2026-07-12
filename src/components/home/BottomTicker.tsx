"use client";

import type { StockState } from "@/lib/types/market";
import { formatStockValue, getDayChangePercent } from "@/lib/market/engine";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";

/** 하단 흐르는 시세 바 (토스증권 하단 티커) */
export function BottomTicker({ stocks }: { stocks: StockState[] }) {
  if (stocks.length === 0) return null;

  const items = stocks.map((s) => {
    const change = getDayChangePercent(s);
    return (
      <span key={s.id} className="mx-5 inline-flex items-baseline gap-1.5 text-xs">
        <span className="text-[var(--muted)]">{s.name}</span>
        <span className="tabular-nums">
          {formatStockValue(s, s.currentPrice)}
        </span>
        <span className={`tabular-nums ${upDownClass(change)}`}>
          {formatSignedPercent(change)}
        </span>
      </span>
    );
  });

  return (
    <div className="hidden shrink-0 overflow-hidden border-t border-[var(--border)] bg-[var(--background)] py-1.5 md:block">
      <div
        className="ticker-marquee flex w-max"
        style={{ animationDuration: `${Math.max(items.length * 3, 45)}s` }}
      >
        <div className="flex shrink-0 items-center">{items}</div>
        <div className="flex shrink-0 items-center" aria-hidden>
          {items}
        </div>
      </div>
    </div>
  );
}

"use client";

import type { PricePoint } from "@/lib/types/market";
import { formatTradeTime } from "@/lib/market/engine";

interface PriceChartProps {
  history: PricePoint[];
  width?: number;
  height?: number;
}

export function PriceChart({
  history,
  width = 600,
  height = 200,
}: PriceChartProps) {
  if (history.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-[var(--surface)] text-sm text-[var(--muted)]"
        style={{ height }}
      >
        실시간 시세 수집 중...
      </div>
    );
  }

  const prices = history.map((p) => p.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const padding = 20;
  const chartW = width - padding * 2;
  const chartH = height - padding * 2;

  const points = history.map((p, i) => {
    const x = padding + (i / (history.length - 1)) * chartW;
    const y = padding + chartH - ((p.price - min) / range) * chartH;
    return `${x},${y}`;
  });

  const lastPrice = prices[prices.length - 1];
  const firstPrice = prices[0];
  const isUp = lastPrice >= firstPrice;
  const strokeColor = isUp ? "var(--up)" : "var(--down)";

  return (
    <div className="rounded-2xl bg-[var(--surface)] p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        preserveAspectRatio="none"
      >
        <polyline
          fill="none"
          stroke={strokeColor}
          strokeWidth="2"
          points={points.join(" ")}
        />
      </svg>
      <div className="flex justify-between px-2 pb-1 text-xs text-[var(--muted)]">
        <span>{formatTradeTime(history[0].timestamp)}</span>
        <span>{formatTradeTime(history[history.length - 1].timestamp)}</span>
      </div>
    </div>
  );
}

"use client";

import Link from "next/link";
import type { StockState } from "@/lib/types/market";
import { getDayChangePercent } from "@/lib/market/engine";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";

const PALETTE = [
  "#3182f6",
  "#f04452",
  "#f2b94b",
  "#2dd4bf",
  "#a78bfa",
  "#fb923c",
  "#4ade80",
  "#f472b6",
  "#94a3b8",
  "#38bdf8",
  "#facc15",
  "#c084fc",
  "#34d399",
];

/** ETF 보유비중 도넛 + 구성종목 목록 */
export function EtfComposition({
  etf,
  stocks,
}: {
  etf: StockState;
  stocks: StockState[];
}) {
  const holdings = etf.etfHoldings ?? [];
  if (holdings.length === 0) return null;

  const items = holdings
    .map((h, i) => ({
      ...h,
      stock: stocks.find((s) => s.id === h.stockId),
      color: PALETTE[i % PALETTE.length],
    }))
    .sort((a, b) => b.weight - a.weight);

  // 도넛: strokeDasharray 세그먼트
  const R = 42;
  const C = 2 * Math.PI * R;
  let offset = 0;
  const segments = items.map((item) => {
    const seg = {
      ...item,
      dash: item.weight * C,
      offset,
    };
    offset += item.weight * C;
    return seg;
  });

  return (
    <div className="rounded-2xl bg-[var(--surface)] p-4">
      <h3 className="mb-3 text-sm font-semibold">
        보유 비중{" "}
        <span className="font-normal text-[var(--muted)]">
          · NAV 추종 {items.length}종목
        </span>
      </h3>
      <div className="flex flex-col items-center gap-5 sm:flex-row">
        <svg
          width="130"
          height="130"
          viewBox="0 0 130 130"
          className="shrink-0 -rotate-90"
        >
          {segments.map((seg) => (
            <circle
              key={seg.stockId}
              cx="65"
              cy="65"
              r={R}
              fill="none"
              stroke={seg.color}
              strokeWidth="16"
              strokeDasharray={`${seg.dash} ${C - seg.dash}`}
              strokeDashoffset={-seg.offset}
            />
          ))}
        </svg>

        <ul className="min-w-0 flex-1 space-y-1.5 self-stretch">
          {items.map((item) => {
            const change = item.stock ? getDayChangePercent(item.stock) : null;
            return (
              <li key={item.stockId} className="flex items-center gap-2 text-xs">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-sm"
                  style={{ backgroundColor: item.color }}
                />
                {item.stock ? (
                  <Link
                    href={`/stock/${item.stockId}`}
                    className="min-w-0 flex-1 truncate hover:underline"
                  >
                    {item.stock.name}
                  </Link>
                ) : (
                  <span className="min-w-0 flex-1 truncate text-[var(--muted)]">
                    {item.stockId}
                  </span>
                )}
                <span className="shrink-0 tabular-nums text-[var(--muted)]">
                  {(item.weight * 100).toFixed(1)}%
                </span>
                {change !== null && (
                  <span
                    className={`w-14 shrink-0 text-right tabular-nums ${upDownClass(change)}`}
                  >
                    {formatSignedPercent(change)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

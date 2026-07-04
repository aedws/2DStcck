"use client";

import type { StockState } from "@/lib/types/market";
import { getDayChangePercent } from "@/lib/market/engine";
import {
  formatSignedPercent,
  formatSignedPrice,
  upDownClass,
} from "@/lib/ui/marketColors";
import { Sparkline } from "@/components/ui/Sparkline";

interface IndexItem {
  id: string;
  name: string;
  value: number;
  change: number;
  changePercent: number;
  history: number[];
}

function buildIndices(stocks: StockState[]): IndexItem[] {
  const avg = (list: StockState[]) => {
    if (list.length === 0) return { value: 0, change: 0, changePercent: 0, history: [] as number[] };
    const value = list.reduce((s, st) => s + st.currentPrice, 0) / list.length;
    const changePercent =
      list.reduce((s, st) => s + getDayChangePercent(st), 0) / list.length;
    const change = value * (changePercent / 100);
    const history = list[0]?.priceHistory.map((p) => p.price) ?? [];
    return { value, change, changePercent, history };
  };

  const all = avg(stocks);
  const tech = avg(stocks.filter((s) => s.sector === "기술" || s.sector === "미디어"));
  const energy = avg(stocks.filter((s) => s.sector === "에너지"));
  const finance = avg(stocks.filter((s) => s.sector === "금융"));

  return [
    { id: "vkospi", name: "V-KOSPI", ...all },
    { id: "vtech", name: "V-TECH", ...tech },
    { id: "vnrg", name: "V-ENERGY", ...energy },
    { id: "vfin", name: "V-FINANCE", ...finance },
    {
      id: "vcomposite",
      name: "V-COMPOSITE",
      ...avg(stocks.slice(0, 3)),
    },
  ];
}

export function IndexTicker({ stocks }: { stocks: StockState[] }) {
  const indices = buildIndices(stocks);

  return (
    <div className="border-b border-[var(--border)] bg-[var(--background)]">
      <div className="flex gap-3 overflow-x-auto px-5 py-3 scrollbar-hide">
        {indices.map((idx) => (
          <div
            key={idx.id}
            className="flex min-w-[148px] shrink-0 flex-col rounded-xl bg-[var(--surface)] px-3 py-2.5"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="text-xs text-[var(--muted)]">{idx.name}</span>
              <Sparkline data={idx.history} width={56} height={24} />
            </div>
            <p className="mt-1 text-sm font-semibold tabular-nums">
              {idx.value.toLocaleString("ko-KR", { maximumFractionDigits: 0 })}
            </p>
            <p className={`text-xs tabular-nums ${upDownClass(idx.changePercent)}`}>
              {formatSignedPrice(Math.round(idx.change))}{" "}
              {formatSignedPercent(idx.changePercent)}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

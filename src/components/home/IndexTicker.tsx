"use client";

import type { StockState } from "@/lib/types/market";
import { getDayChangePercent, getDayChangeAmount } from "@/lib/market/engine";
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

/** 선행지표만 표시: 지수·선물 실제가 + 시장 전체 평균 */
function buildIndices(stocks: StockState[]): IndexItem[] {
  const items: IndexItem[] = [];

  // 지수·선물 종목은 실제 가격 그대로
  for (const s of stocks) {
    if (s.sector === "지수" || s.sector === "선물") {
      items.push({
        id: s.id,
        name: s.name,
        value: s.currentPrice,
        change: getDayChangeAmount(s),
        changePercent: getDayChangePercent(s),
        history: s.priceHistory.map((p) => p.price),
      });
    }
  }

  // V-COMPOSITE: 개별 종목(지수·선물 제외) 평균
  const individual = stocks.filter(
    (s) => s.sector !== "지수" && s.sector !== "선물",
  );
  if (individual.length > 0) {
    const value =
      individual.reduce((sum, st) => sum + st.currentPrice, 0) /
      individual.length;
    const changePercent =
      individual.reduce((sum, st) => sum + getDayChangePercent(st), 0) /
      individual.length;
    items.push({
      id: "vcomposite",
      name: "V-COMPOSITE",
      value,
      change: value * (changePercent / 100),
      changePercent,
      history: individual[0]?.priceHistory.map((p) => p.price) ?? [],
    });
  }

  return items;
}

export function IndexTicker({ stocks }: { stocks: StockState[] }) {
  const indices = buildIndices(stocks);

  return (
    <div className="flex gap-3 overflow-x-auto scrollbar-hide">
      {indices.map((idx) => (
        <div
          key={idx.id}
          className="flex min-w-[148px] shrink-0 flex-col rounded-xl bg-[var(--surface)] px-3 py-2.5"
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs text-[var(--muted)]">{idx.name}</span>
            <Sparkline data={idx.history} width={56} height={20} />
          </div>
          <span className="text-base font-bold tabular-nums">
            {Math.round(idx.value).toLocaleString("ko-KR")}
          </span>
          <span
            className={`text-xs tabular-nums ${upDownClass(idx.changePercent)}`}
          >
            {formatSignedPrice(Math.round(idx.change))}{" "}
            {formatSignedPercent(idx.changePercent)}
          </span>
        </div>
      ))}
    </div>
  );
}

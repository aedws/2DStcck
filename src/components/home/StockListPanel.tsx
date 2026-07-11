"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { StockState } from "@/lib/types/market";
import { getDayChangePercent } from "@/lib/market/engine";
import {
  formatCompactKRW,
  formatSignedPercent,
  upDownClass,
} from "@/lib/ui/marketColors";
import { Sparkline } from "@/components/ui/Sparkline";

const TABS = ["실시간 차트", "지금 뜨는 산업", "섹터별"];

interface StockListPanelProps {
  stocks: StockState[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}

function pseudoVolume(stock: StockState): number {
  const book = stock.orderBook;
  const total =
    book.asks.reduce((s, l) => s + l.quantity, 0) +
    book.bids.reduce((s, l) => s + l.quantity, 0);
  return total * stock.currentPrice;
}

export function StockListPanel({
  stocks,
  selectedId,
  onSelect,
}: StockListPanelProps) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [sector, setSector] = useState("전체");

  const sectors = useMemo(
    () => ["전체", ...Array.from(new Set(stocks.map((s) => s.sector)))],
    [stocks],
  );

  const sorted = useMemo(() => {
    let list = [...stocks];
    if (sector !== "전체") {
      list = list.filter((s) => s.sector === sector);
    }

    if (tab === 1) {
      list.sort((a, b) => b.volatility - a.volatility);
    } else if (tab === 2) {
      list.sort((a, b) => a.sector.localeCompare(b.sector));
    } else {
      list.sort(
        (a, b) => getDayChangePercent(b) - getDayChangePercent(a),
      );
    }
    return list;
  }, [stocks, sector, tab]);

  return (
    <aside className="flex w-[380px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--background)]">
      <div className="border-b border-[var(--border)] px-4 pt-3">
        <div className="flex gap-4">
          {TABS.map((label, i) => (
            <button
              key={label}
              onClick={() => setTab(i)}
              className={`pb-2.5 text-sm transition ${
                tab === i
                  ? "border-b-2 border-[var(--foreground)] font-semibold text-[var(--foreground)]"
                  : "text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5 overflow-x-auto py-3 scrollbar-hide">
          {sectors.map((s) => (
            <button
              key={s}
              onClick={() => setSector(s)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
                sector === s
                  ? "bg-[var(--foreground)] text-[var(--background)]"
                  : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-[var(--background)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">순위</th>
              <th className="px-2 py-2 text-left font-medium">종목</th>
              <th className="px-2 py-2 text-right font-medium">현재가</th>
              <th className="px-2 py-2 text-right font-medium">등락률</th>
              <th className="hidden px-2 py-2 text-right font-medium xl:table-cell">
                거래대금
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((stock, rank) => {
              const change = getDayChangePercent(stock);
              const selected = stock.id === selectedId;

              return (
                <tr
                  key={stock.id}
                  onClick={() => {
                    onSelect(stock.id);
                    router.push(`/stock/${stock.id}`);
                  }}
                  className={`cursor-pointer border-b border-[var(--border)]/50 transition ${
                    selected
                      ? "bg-[var(--surface-elevated)]"
                      : "hover:bg-[var(--surface)]/60"
                  }`}
                >
                  <td className="px-3 py-3 tabular-nums text-[var(--muted)]">
                    {rank + 1}
                  </td>
                  <td className="px-2 py-3">
                    <div className="flex items-center gap-2">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[10px] font-bold text-[var(--muted)]">
                        {stock.ticker.slice(0, 2)}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate font-medium">{stock.name}</p>
                        <p className="text-[10px] text-[var(--muted)]">
                          {stock.sector}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {stock.currentPrice.toLocaleString()}
                  </td>
                  <td
                    className={`px-2 py-3 text-right tabular-nums ${upDownClass(change)}`}
                  >
                    {formatSignedPercent(change)}
                  </td>
                  <td className="hidden px-2 py-3 text-right tabular-nums text-[var(--muted)] xl:table-cell">
                    {formatCompactKRW(pseudoVolume(stock))}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </aside>
  );
}

export function StockListSparkline({ stock }: { stock: StockState }) {
  return (
    <Sparkline
      data={stock.priceHistory.map((p) => p.price)}
      width={64}
      height={28}
    />
  );
}

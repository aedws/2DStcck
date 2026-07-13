"use client";

import { useMemo, useRef, useState, type PointerEvent } from "react";
import { useRouter } from "next/navigation";
import type { MarketEvent, StockState } from "@/lib/types/market";
import { formatStockValue, getDayChangePercent } from "@/lib/market/engine";
import {
  buyRatio,
  latestEventFor,
  pseudoVolume,
} from "@/lib/market/stats";
import {
  formatCompactUSD,
  formatSignedPercent,
  upDownClass,
} from "@/lib/ui/marketColors";
import { Sparkline } from "@/components/ui/Sparkline";
import { StockLogo } from "@/components/ui/StockLogo";
import { useSettingsStore } from "@/store/settingsStore";

const TABS = ["실시간 차트", "지금 뜨는 산업", "섹터별", "관심"];
const SORTS = ["급상승", "급하락", "거래대금"] as const;
type SortMode = (typeof SORTS)[number];

interface StockListPanelProps {
  stocks: StockState[];
  events: MarketEvent[];
}

export function StockListPanel({ stocks, events }: StockListPanelProps) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const [sort, setSort] = useState<SortMode>("급상승");
  const [sector, setSector] = useState("전체");
  const [expandedUnderlyings, setExpandedUnderlyings] = useState<Set<string>>(
    () => new Set(),
  );
  const groupDerivatives = useSettingsStore((state) => state.groupDerivatives);
  const watchlist = useSettingsStore((state) => state.watchlist);
  const toggleWatch = useSettingsStore((state) => state.toggleWatch);
  const filterStripRef = useRef<HTMLDivElement>(null);
  const filterDragRef = useRef({
    active: false,
    startX: 0,
    startScrollLeft: 0,
    moved: false,
  });
  const suppressFilterClickRef = useRef(false);
  const [isDraggingFilters, setIsDraggingFilters] = useState(false);

  const handleFilterPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType !== "mouse" || event.button !== 0) return;

    const strip = filterStripRef.current;
    if (!strip) return;

    filterDragRef.current = {
      active: true,
      startX: event.clientX,
      startScrollLeft: strip.scrollLeft,
      moved: false,
    };
  };

  const handleFilterPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const strip = filterStripRef.current;
    const drag = filterDragRef.current;
    if (!strip || !drag.active) return;

    const deltaX = event.clientX - drag.startX;
    if (Math.abs(deltaX) > 4 && !drag.moved) {
      drag.moved = true;
      setIsDraggingFilters(true);
      strip.setPointerCapture(event.pointerId);
    }
    if (!drag.moved) return;

    event.preventDefault();
    strip.scrollLeft = drag.startScrollLeft - deltaX;
  };

  const finishFilterDrag = (event: PointerEvent<HTMLDivElement>) => {
    const strip = filterStripRef.current;
    const drag = filterDragRef.current;
    if (!drag.active) return;

    suppressFilterClickRef.current = drag.moved;
    drag.active = false;
    setIsDraggingFilters(false);

    if (strip?.hasPointerCapture(event.pointerId)) {
      strip.releasePointerCapture(event.pointerId);
    }

    window.setTimeout(() => {
      suppressFilterClickRef.current = false;
    }, 0);
  };

  const sectors = useMemo(
    () => ["전체", ...Array.from(new Set(stocks.map((s) => s.sector)))],
    [stocks],
  );

  const watchSet = useMemo(() => new Set(watchlist), [watchlist]);

  const sorted = useMemo(() => {
    let list = [...stocks];
    if (tab === 3) {
      list = list.filter((s) => watchSet.has(s.id));
    }
    if (sector !== "전체") {
      list = list.filter((s) => s.sector === sector);
    }

    if (tab === 1) {
      list.sort((a, b) => b.volatility - a.volatility);
    } else if (tab === 2) {
      list.sort((a, b) => a.sector.localeCompare(b.sector));
    } else if (sort === "급하락") {
      list.sort((a, b) => getDayChangePercent(a) - getDayChangePercent(b));
    } else if (sort === "거래대금") {
      list.sort((a, b) => pseudoVolume(b) - pseudoVolume(a));
    } else {
      list.sort((a, b) => getDayChangePercent(b) - getDayChangePercent(a));
    }
    return list;
  }, [stocks, sector, tab, sort, watchSet]);

  const displayRows = useMemo(() => {
    if (!groupDerivatives || sector !== "전체" || tab === 3) {
      return sorted.map((stock, index) => ({
        stock,
        depth: 0,
        childCount: 0,
        rank: index + 1,
      }));
    }

    const childrenByUnderlying = new Map<string, StockState[]>();
    for (const stock of sorted) {
      const underlyingId =
        stock.leverageUnderlyingId ?? stock.coveredCallUnderlyingId;
      if (!underlyingId) continue;
      const children = childrenByUnderlying.get(underlyingId) ?? [];
      children.push(stock);
      childrenByUnderlying.set(underlyingId, children);
    }

    let baseRank = 0;
    return sorted.flatMap((stock) => {
      const underlyingId =
        stock.leverageUnderlyingId ?? stock.coveredCallUnderlyingId;
      if (underlyingId) return [];

      baseRank += 1;
      const children = childrenByUnderlying.get(stock.id) ?? [];
      const parent = {
        stock,
        depth: 0,
        childCount: children.length,
        rank: baseRank,
      };
      if (!expandedUnderlyings.has(stock.id)) return [parent];
      return [
        parent,
        ...children.map((child) => ({
          stock: child,
          depth: 1,
          childCount: 0,
          rank: 0,
        })),
      ];
    });
  }, [expandedUnderlyings, groupDerivatives, sector, sorted, tab]);

  const toggleUnderlying = (stockId: string) => {
    setExpandedUnderlyings((current) => {
      const next = new Set(current);
      if (next.has(stockId)) next.delete(stockId);
      else next.add(stockId);
      return next;
    });
  };

  return (
    <section className="flex min-w-0 flex-1 flex-col border-r border-[var(--border)] bg-[var(--background)]">
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
        <div
          ref={filterStripRef}
          aria-label="종목 필터 가로 스크롤"
          data-testid="stock-filter-strip"
          onPointerDown={handleFilterPointerDown}
          onPointerMove={handleFilterPointerMove}
          onPointerUp={finishFilterDrag}
          onPointerCancel={finishFilterDrag}
          onLostPointerCapture={finishFilterDrag}
          onClickCapture={(event) => {
            if (!suppressFilterClickRef.current) return;
            event.preventDefault();
            event.stopPropagation();
            suppressFilterClickRef.current = false;
          }}
          onDragStart={(event) => event.preventDefault()}
          className={`flex select-none items-center gap-1.5 overflow-x-auto py-3 scrollbar-hide ${
            isDraggingFilters ? "cursor-grabbing" : "cursor-grab"
          }`}
        >
          {tab === 0 &&
            SORTS.map((s) => (
              <button
                key={s}
                onClick={() => setSort(s)}
                className={`shrink-0 rounded-full px-3 py-1 text-xs transition ${
                  sort === s
                    ? "bg-[var(--surface-elevated)] font-semibold text-[var(--foreground)]"
                    : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {s}
              </button>
            ))}
          {tab === 0 && (
            <span className="mx-1 h-4 w-px shrink-0 bg-[var(--border)]" />
          )}
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
          <thead className="sticky top-0 z-10 bg-[var(--background)] text-[var(--muted)]">
            <tr>
              <th className="px-3 py-2 text-left font-medium">순위</th>
              <th className="px-2 py-2 text-left font-medium">종목</th>
              <th className="px-2 py-2 text-right font-medium">현재가</th>
              <th className="px-2 py-2 text-right font-medium">등락률</th>
              <th className="hidden px-2 py-2 text-right font-medium lg:table-cell">
                거래대금
              </th>
              <th className="hidden px-3 py-2 text-center font-medium xl:table-cell">
                매수 · 매도 비율
              </th>
              <th className="hidden px-2 py-2 text-left font-medium lg:table-cell">
                산업
              </th>
              <th className="hidden px-2 py-2 text-left font-medium xl:table-cell">
                요약
              </th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map(({ stock, depth, childCount, rank }) => {
              const change = getDayChangePercent(stock);
              const strongMove = Math.abs(change) >= 3;
              const buy = buyRatio(stock);
              const event = latestEventFor(stock.id, events);

              return (
                <tr
                  key={stock.id}
                  onClick={() => router.push(`/stock/${stock.id}`)}
                  className="cursor-pointer border-b border-[var(--border)]/50 transition hover:bg-[var(--surface)]/60"
                >
                  <td className="px-3 py-3 tabular-nums text-[var(--muted)]">
                    {depth ? "↳" : rank}
                  </td>
                  <td className="px-2 py-3">
                    <div
                      className={`flex items-center gap-2 ${depth ? "pl-4" : ""}`}
                    >
                      {childCount > 0 && (
                        <button
                          type="button"
                          aria-label={`${stock.name} 파생상품 ${
                            expandedUnderlyings.has(stock.id) ? "접기" : "펼치기"
                          }`}
                          onClick={(event) => {
                            event.stopPropagation();
                            toggleUnderlying(stock.id);
                          }}
                          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface)] text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
                        >
                          {expandedUnderlyings.has(stock.id) ? "−" : `+${childCount}`}
                        </button>
                      )}
                      <button
                        type="button"
                        aria-label={`${stock.name} 관심종목 ${
                          watchSet.has(stock.id) ? "해제" : "추가"
                        }`}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleWatch(stock.id);
                        }}
                        className={`shrink-0 text-sm leading-none transition ${
                          watchSet.has(stock.id)
                            ? "text-amber-400"
                            : "text-[var(--border)] hover:text-[var(--muted)]"
                        }`}
                      >
                        {watchSet.has(stock.id) ? "★" : "☆"}
                      </button>
                      <StockLogo stock={stock} size={28} />
                      <div className="min-w-0">
                        <p className="truncate font-medium">{stock.name}</p>
                        <p className="text-[10px] text-[var(--muted)]">
                          {stock.ticker}
                        </p>
                      </div>
                      <Sparkline
                        data={stock.priceHistory.map((p) => p.price)}
                        width={56}
                        height={22}
                        className="ml-1 hidden shrink-0 2xl:block"
                      />
                    </div>
                  </td>
                  <td className="px-2 py-3 text-right tabular-nums">
                    {formatStockValue(stock, stock.currentPrice)}
                  </td>
                  <td className="px-2 py-3 text-right">
                    <span
                      className={`inline-block rounded px-1.5 py-0.5 tabular-nums ${upDownClass(change)} ${
                        strongMove
                          ? change >= 0
                            ? "bg-[var(--up)]/15"
                            : "bg-[var(--down)]/15"
                          : ""
                      }`}
                    >
                      {formatSignedPercent(change)}
                    </span>
                  </td>
                  <td className="hidden px-2 py-3 text-right tabular-nums text-[var(--muted)] lg:table-cell">
                    {formatCompactUSD(pseudoVolume(stock))}
                  </td>
                  <td className="hidden px-3 py-3 xl:table-cell">
                    <div className="mx-auto flex w-28 items-center gap-1.5">
                      <span className="w-5 shrink-0 text-right text-[10px] tabular-nums text-[var(--up)]">
                        {buy}
                      </span>
                      <div className="h-1 flex-1 overflow-hidden rounded-full bg-[var(--down)]/50">
                        <div
                          className="h-full bg-[var(--up)]"
                          style={{ width: `${buy}%` }}
                        />
                      </div>
                      <span className="w-5 shrink-0 text-[10px] tabular-nums text-[var(--down)]">
                        {100 - buy}
                      </span>
                    </div>
                  </td>
                  <td className="hidden px-2 py-3 text-[var(--muted)] lg:table-cell">
                    <span className="block">{stock.sector}</span>
                    {stock.subsector && (
                      <span className="block text-[10px] text-[var(--muted)]">
                        {stock.subsector}
                      </span>
                    )}
                  </td>
                  <td className="hidden max-w-[140px] px-2 py-3 xl:table-cell">
                    {event ? (
                      <span className={`truncate ${upDownClass(event.impact)}`}>
                        {event.tag ?? event.title}
                      </span>
                    ) : (
                      <span className="text-[var(--muted)]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {tab === 3 && displayRows.length === 0 && (
              <tr>
                <td
                  colSpan={8}
                  className="px-4 py-12 text-center text-[var(--muted)]"
                >
                  관심종목이 없습니다. 종목 옆 ☆를 눌러 추가하세요.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

"use client";

import Link from "next/link";
import { StockLogo } from "@/components/ui/StockLogo";
import { formatStockValue, getDayChangePercent } from "@/lib/market/engine";
import type { StockState } from "@/lib/types/market";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";

function underlyingIdOf(stock: StockState): string {
  return (
    stock.leverageUnderlyingId ?? stock.coveredCallUnderlyingId ?? stock.id
  );
}

function relationLabel(stock: StockState, underlyingId: string): string {
  if (stock.id === underlyingId) return "기초자산";
  if (stock.coveredCallUnderlyingId === underlyingId) return "커버드콜";
  if (stock.leverage === 2) return "2배 레버리지";
  if (stock.leverage === -2) return "2배 인버스";
  if (stock.leverage === -1) return "인버스";
  if (stock.leverage !== undefined) return `${stock.leverage}배 추종`;
  return "관련 상품";
}

function relationOrder(stock: StockState, underlyingId: string): number {
  if (stock.id === underlyingId) return 0;
  if (stock.leverage === 2) return 1;
  if (stock.leverage === -1) return 2;
  if (stock.leverage === -2) return 3;
  if (stock.coveredCallUnderlyingId === underlyingId) return 4;
  return 5;
}

/** 기초자산과 레버리지·인버스·커버드콜 상품을 한곳에서 이동한다. */
export function RelatedStocksTab({
  stock,
  stocks,
}: {
  stock: StockState;
  stocks: StockState[];
}) {
  const underlyingId = underlyingIdOf(stock);
  const family = stocks
    .filter(
      (candidate) =>
        candidate.id === underlyingId ||
        candidate.leverageUnderlyingId === underlyingId ||
        candidate.coveredCallUnderlyingId === underlyingId,
    )
    .sort(
      (a, b) =>
        relationOrder(a, underlyingId) - relationOrder(b, underlyingId),
    );

  return (
    <div className="max-w-2xl">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">관련주 바로가기</h3>
        <p className="mt-1 text-xs text-[var(--muted)]">
          같은 기초자산을 추종하는 상품으로 빠르게 이동합니다.
        </p>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {family.map((candidate) => {
          const change = getDayChangePercent(candidate);
          const current = candidate.id === stock.id;
          return (
            <Link
              key={candidate.id}
              href={`/stock/${candidate.id}`}
              aria-current={current ? "page" : undefined}
              className={`flex items-center gap-3 rounded-2xl border p-3 transition ${
                current
                  ? "border-[var(--accent)] bg-[var(--accent)]/[0.07]"
                  : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--accent)]/60"
              }`}
            >
              <StockLogo stock={candidate} size={36} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold">
                    {candidate.name}
                  </p>
                  {current && (
                    <span className="shrink-0 rounded-full bg-[var(--accent)]/15 px-1.5 py-0.5 text-[9px] font-semibold text-[var(--accent)]">
                      현재
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                  {candidate.ticker} · {relationLabel(candidate, underlyingId)}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-xs font-semibold tabular-nums">
                  {formatStockValue(candidate, candidate.currentPrice)}
                </p>
                <p className={`text-[10px] tabular-nums ${upDownClass(change)}`}>
                  {formatSignedPercent(change)}
                </p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

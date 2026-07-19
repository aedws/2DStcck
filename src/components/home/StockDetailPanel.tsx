"use client";

import Link from "next/link";
import type { MarketEvent, StockState } from "@/lib/types/market";
import {
  formatPrice,
  formatSignedMoney,
  getDayChangeAmount,
  getDayChangePercent,
} from "@/lib/market/engine";
import {
  formatSignedPercent,
  upDownClass,
} from "@/lib/ui/marketColors";
import { CandlestickChart } from "@/components/market/CandlestickChart";
import { FuturesLeadBadge } from "@/components/market/FuturesLeadBadge";
import { useChartSeries } from "@/components/market/useChartSeries";
import { getCharacterById } from "@/data/characters";
import { useMarketStore } from "@/store/marketStore";

interface StockDetailPanelProps {
  stock: StockState | undefined;
  events: MarketEvent[];
}

/** 홈 우측 미리보기 패널: 등락률 1위 종목의 실시간 차트 + 뉴스 + 회사 정보 */
export function StockDetailPanel({ stock, events }: StockDetailPanelProps) {
  const holding = useMarketStore((s) =>
    stock ? s.holdings.find((h) => h.stockId === stock.id) : undefined,
  );
  const series = useChartSeries(stock);

  if (!stock) {
    return (
      <div className="hidden w-[400px] shrink-0 items-center justify-center text-[var(--muted)] lg:flex">
        종목을 선택해 주세요
      </div>
    );
  }

  const change = getDayChangePercent(stock);
  const priceDiff = getDayChangeAmount(stock);
  const relatedEvent = [...events].reverse().find((e) =>
    e.affectedStockIds.includes(stock.id),
  );
  const ceo = getCharacterById(stock.ceoId);

  return (
    <section className="hidden w-[400px] shrink-0 flex-col overflow-y-auto border-r border-[var(--border)] bg-[var(--background)] lg:flex">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <p className="text-xs text-[var(--muted)]">
          {stock.ticker} · {stock.sector}
          {stock.subsector ? ` · ${stock.subsector}` : ""}
        </p>
        <Link
          href={`/stock/${stock.id}`}
          className="mt-0.5 block text-lg font-bold hover:underline"
        >
          {stock.name}
        </Link>
        <div className="mt-1 flex items-end gap-2">
          <p className="text-2xl font-bold tabular-nums">
            {formatPrice(stock.currentPrice)}
          </p>
          <p className={`pb-0.5 text-xs tabular-nums ${upDownClass(change)}`}>
            {formatSignedMoney(priceDiff)} {formatSignedPercent(change)}
          </p>
        </div>
        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
          전일 종가 {formatPrice(stock.prevDayClose)} · 시초가{" "}
          {formatPrice(stock.dayOpen)}
        </p>
      </div>

      <div className="space-y-2 px-4 py-3">
        {stock.sector !== "선물" && <FuturesLeadBadge />}
        <CandlestickChart
          candles={series.candles}
          dailyCandles={series.dailyCandles}
          history={series.history}
          height={220}
          averagePrice={holding?.averagePrice}
          prevDayClose={stock.prevDayClose}
        />
      </div>

      {relatedEvent && (
        <div className="mx-4 mb-3 rounded-2xl bg-[var(--surface)] p-3.5">
          <div className="flex items-center gap-2">
            <span>✨</span>
            <h3 className="text-sm font-semibold">왜 움직였을까?</h3>
          </div>
          <p className="mt-1.5 text-sm font-medium">{relatedEvent.title}</p>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            {relatedEvent.description}
          </p>
          {relatedEvent.quote && (
            <p className="mt-2 border-l-2 border-[var(--accent)]/50 pl-2.5 text-xs italic leading-relaxed">
              “{relatedEvent.quote}”
              {relatedEvent.quoteBy && (
                <span className="ml-1 not-italic text-[var(--muted)]">
                  — {relatedEvent.quoteBy}
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {(stock.description || ceo) && (
        <div className="mx-4 mb-3 rounded-2xl bg-[var(--surface)] p-3.5">
          {stock.description && (
            <p className="text-xs leading-relaxed">{stock.description}</p>
          )}
          {ceo && (
            <div
              className={`flex items-center gap-2.5 ${stock.description ? "mt-2.5 border-t border-[var(--border)] pt-2.5" : ""}`}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--background)] text-base">
                {ceo.emoji}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold">
                  {ceo.name}{" "}
                  <span className="font-normal text-[var(--muted)]">
                    {ceo.title}
                  </span>
                </p>
                <p className="truncate text-[11px] text-[var(--muted)]">
                  {ceo.bio}
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="mx-4 mb-4">
        <Link
          href={`/stock/${stock.id}`}
          className="block rounded-xl bg-[var(--surface-elevated)] py-2.5 text-center text-sm font-semibold transition hover:bg-[var(--border)]"
        >
          주문하러 가기
        </Link>
      </div>
    </section>
  );
}

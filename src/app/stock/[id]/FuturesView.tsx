"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AccountSidebar } from "@/components/home/AccountSidebar";
import { BottomTicker } from "@/components/home/BottomTicker";
import { CandlestickChart } from "@/components/market/CandlestickChart";
import {
  formatStockValue,
  formatTradeTime,
  getDayChangeAmount,
  getDayChangePercent,
} from "@/lib/market/engine";
import { dayRange } from "@/lib/market/stats";
import type { StockState } from "@/lib/types/market";
import {
  formatSignedPercent,
  upDownClass,
} from "@/lib/ui/marketColors";
import { Sparkline } from "@/components/ui/Sparkline";
import { useMarketStore } from "@/store/marketStore";

/** 우측 지수·종목 브라우저 (토스 지수·환율 패널) */
function IndexBrowser({
  stocks,
  currentId,
}: {
  stocks: StockState[];
  currentId: string;
}) {
  const router = useRouter();
  const indices = stocks.filter(
    (s) => s.sector === "지수" || s.sector === "선물" || s.sector === "ETF",
  );
  const companies = stocks.filter(
    (s) => s.sector !== "지수" && s.sector !== "선물" && s.sector !== "ETF",
  );

  const renderRow = (s: StockState) => {
    const change = getDayChangePercent(s);
    return (
      <button
        key={s.id}
        onClick={() => router.push(`/stock/${s.id}`)}
        className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition hover:bg-[var(--surface)] ${
          s.id === currentId ? "bg-[var(--surface)]" : ""
        }`}
      >
        <Sparkline
          data={s.priceHistory.map((p) => p.price)}
          width={44}
          height={20}
          className="shrink-0"
        />
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {s.name}
        </span>
        <span className="shrink-0 text-right">
          <span className="block text-xs tabular-nums">
            {formatStockValue(s, s.currentPrice)}
          </span>
          <span
            className={`block text-[10px] tabular-nums ${upDownClass(change)}`}
          >
            {formatSignedPercent(change)}
          </span>
        </span>
      </button>
    );
  };

  return (
    <aside className="hidden w-[290px] shrink-0 flex-col overflow-y-auto border-l border-[var(--border)] p-3 lg:flex">
      <p className="mb-1.5 px-2.5 text-xs font-semibold text-[var(--muted)]">
        지수 · 선물 · ETF
      </p>
      <div className="space-y-0.5">{indices.map(renderRow)}</div>
      <p className="mb-1.5 mt-4 px-2.5 text-xs font-semibold text-[var(--muted)]">
        종목
      </p>
      <div className="space-y-0.5">{companies.map(renderRow)}</div>
    </aside>
  );
}

/** 지수·선물(거래 불가 지표) 전용 페이지: 주문 없이 차트 + 세부 뉴스만 */
export function FuturesView({ stock }: { stock: StockState }) {
  const stocks = useMarketStore((s) => s.stocks);
  const events = useMarketStore((s) => s.events);

  const isFutures = stock.sector === "선물";
  const change = getDayChangePercent(stock);
  const diff = getDayChangeAmount(stock);
  const { high, low } = dayRange(stock);
  const related = [...events]
    .reverse()
    .filter((e) => e.affectedStockIds.includes(stock.id));

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      {/* 헤더 */}
      <div className="flex shrink-0 items-center gap-6 border-b border-[var(--border)] px-5 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/"
            className="shrink-0 rounded-lg px-1.5 py-1 text-[var(--muted)] transition hover:text-[var(--foreground)]"
            aria-label="시장으로"
          >
            ←
          </Link>
          <div className="min-w-0">
            <p className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold">
                {stock.name}
              </span>
              <span className="shrink-0 text-xs text-[var(--muted)]">
                {stock.ticker}
              </span>
              <span className="shrink-0 rounded-full bg-[var(--surface-elevated)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                {isFutures ? "선행지표 · 거래 불가" : "지수 · 거래 불가"}
              </span>
            </p>
            <p className="flex items-baseline gap-2">
              <span className="text-xl font-bold tabular-nums">
                {stock.currentPrice.toLocaleString("ko-KR")}
              </span>
              <span className={`text-xs tabular-nums ${upDownClass(change)}`}>
                전일대비 {diff >= 0 ? "+" : ""}
                {diff.toLocaleString("ko-KR")} ({formatSignedPercent(change)})
              </span>
            </p>
          </div>
        </div>

        <div className="ml-auto hidden items-center gap-6 md:flex">
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-[var(--muted)]">시작</span>
            <span className="text-xs font-medium tabular-nums">
              {stock.dayOpen.toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-[var(--muted)]">당일 최저</span>
            <span className="text-xs font-medium tabular-nums">
              {low.toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-[var(--muted)]">당일 최고</span>
            <span className="text-xs font-medium tabular-nums">
              {high.toLocaleString("ko-KR")}
            </span>
          </div>
          <div className="flex flex-col gap-0.5">
            <span className="text-[11px] text-[var(--muted)]">전일 종가</span>
            <span className="text-xs font-medium tabular-nums">
              {stock.prevDayClose.toLocaleString("ko-KR")}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row md:overflow-hidden">
        <main className="min-w-0 flex-1 px-4 py-4 md:overflow-y-auto md:px-5">
          <CandlestickChart
            candles={stock.candles}
            dailyCandles={stock.dailyCandles}
            history={stock.priceHistory}
            height={380}
            mobileHeight={280}
            prevDayClose={stock.prevDayClose}
            priceKind="points"
          />

          <div className="mt-5 max-w-2xl">
            <div className="mb-3 flex items-center gap-2">
              <span>✨</span>
              <h3 className="text-sm font-semibold">왜 움직였을까?</h3>
            </div>
            <p className="mb-3 rounded-xl bg-[var(--surface)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--muted)]">
              {isFutures
                ? `${stock.name}은 시장 방향을 약 90초 먼저 반영하는 선행지표예요. 거래할 수 없지만, 이 차트가 먼저 움직인 방향으로 지수와 종목들이 따라 움직입니다.`
                : `${stock.name}는 시장 전체의 흐름을 나타내는 지수예요. 직접 살 수는 없고, ETF 상품(밀레니엄 테크 100 · 키보토스 종합지수)으로 간접 투자할 수 있습니다.`}
            </p>

            {related.length === 0 ? (
              <p className="py-8 text-center text-sm text-[var(--muted)]">
                아직 시장을 움직인 뉴스가 없어요.
              </p>
            ) : (
              <ul className="space-y-2">
                {related.map((event) => (
                  <li
                    key={event.id}
                    className="rounded-2xl bg-[var(--surface)] p-4"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`text-xs ${upDownClass(event.impact)}`}>
                        {event.impact >= 0 ? "▲" : "▼"}
                      </span>
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {event.title}
                      </p>
                      {event.tag && (
                        <span className="shrink-0 rounded-full bg-[var(--background)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                          {event.tag}
                        </span>
                      )}
                      <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                        {formatTradeTime(event.timestamp)}
                      </span>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                      {event.description}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </main>

        <IndexBrowser stocks={stocks} currentId={stock.id} />
        <AccountSidebar />
      </div>

      <BottomTicker stocks={stocks} />
    </div>
  );
}

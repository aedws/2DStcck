"use client";

import Link from "next/link";
import { useState } from "react";
import { FuturesView } from "./FuturesView";
import { AccountSidebar } from "@/components/home/AccountSidebar";
import { BottomTicker } from "@/components/home/BottomTicker";
import { CandlestickChart } from "@/components/market/CandlestickChart";
import { EtfComposition } from "@/components/market/EtfComposition";
import { OrderBook } from "@/components/market/OrderBook";
import { QuickOrderPanel } from "@/components/market/QuickOrderPanel";
import { getCharacterById } from "@/data/characters";
import {
  formatPrice,
  formatSignedMoney,
  formatTradeTime,
  getDayChangeAmount,
  getDayChangePercent,
} from "@/lib/market/engine";
import {
  buyStrength,
  dayRange,
  pseudoVolume,
} from "@/lib/market/stats";
import type { MarketEvent, StockState } from "@/lib/types/market";
import {
  formatCompactUSD,
  formatSignedPercent,
  upDownClass,
} from "@/lib/ui/marketColors";
import { StockLogo } from "@/components/ui/StockLogo";
import { useMarketStore } from "@/store/marketStore";

const SUB_TABS = ["차트 · 호가", "종목정보", "뉴스"] as const;

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      <span className="text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

/** 종목 헤더: 이름·현재가 + 지표 스트립 */
function StockHeader({ stock }: { stock: StockState }) {
  const change = getDayChangePercent(stock);
  const diff = getDayChangeAmount(stock);
  const { high, low } = dayRange(stock);
  const strength = buyStrength(stock);

  return (
    <div className="flex shrink-0 items-center gap-6 border-b border-[var(--border)] px-5 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/"
          className="shrink-0 rounded-lg px-1.5 py-1 text-[var(--muted)] transition hover:text-[var(--foreground)]"
          aria-label="시장으로"
        >
          ←
        </Link>
        <StockLogo stock={stock} size={36} />
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{stock.name}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {stock.ticker}
            </span>
          </p>
          <p className="flex items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums">
              {formatPrice(stock.currentPrice)}
            </span>
            <span className={`text-xs tabular-nums ${upDownClass(change)}`}>
              전일보다 {formatSignedMoney(diff)} ({formatSignedPercent(change)})
            </span>
          </p>
        </div>
      </div>

      <div className="ml-auto hidden items-center gap-6 md:flex">
        <HeaderStat
          label="1일 범위"
          value={`${formatPrice(low)} ~ ${formatPrice(high)}`}
        />
        <HeaderStat label="전일 종가" value={formatPrice(stock.prevDayClose)} />
        <HeaderStat label="거래대금" value={formatCompactUSD(pseudoVolume(stock))} />
        <HeaderStat label="체결강도" value={`${strength}%`} />
        {stock.beta !== undefined && (
          <HeaderStat label="베타" value={stock.beta.toFixed(1)} />
        )}
        <HeaderStat
          label="변동성"
          value={`${(stock.volatility * 100).toFixed(1)}%`}
        />
      </div>
    </div>
  );
}

/** 종목정보 탭: 회사 소개 + CEO + 투자 지표 */
function StockInfoTab({ stock }: { stock: StockState }) {
  const ceo = getCharacterById(stock.ceoId);

  return (
    <div className="max-w-2xl space-y-4">
      {stock.description && (
        <div className="rounded-2xl bg-[var(--surface)] p-4">
          <h3 className="mb-2 text-sm font-semibold">회사 소개</h3>
          <p className="text-sm leading-relaxed">{stock.description}</p>
        </div>
      )}

      {ceo && (
        <div className="rounded-2xl bg-[var(--surface)] p-4">
          <h3 className="mb-3 text-sm font-semibold">경영진</h3>
          <div className="flex items-start gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--background)] text-2xl">
              {ceo.emoji}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {ceo.name}{" "}
                <span className="font-normal text-[var(--muted)]">
                  {ceo.title}
                </span>
              </p>
              <div className="mt-1 flex flex-wrap gap-1">
                {ceo.traits.map((t) => (
                  <span
                    key={t}
                    className="rounded-full bg-[var(--background)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
                  >
                    {t}
                  </span>
                ))}
              </div>
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                {ceo.bio}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="rounded-2xl bg-[var(--surface)] p-4">
        <h3 className="mb-3 text-sm font-semibold">투자 지표</h3>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-2.5 text-sm md:grid-cols-3">
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-[var(--muted)]">섹터</dt>
            <dd>{stock.sector}</dd>
          </div>
          {stock.subsector && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-[var(--muted)]">세부 섹터</dt>
              <dd>{stock.subsector}</dd>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-[var(--muted)]">상장가</dt>
            <dd className="tabular-nums">{formatPrice(stock.initialPrice)}</dd>
          </div>
          {stock.beta !== undefined && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-[var(--muted)]">
                베타 (시장 민감도)
              </dt>
              <dd className="tabular-nums">{stock.beta.toFixed(1)}</dd>
            </div>
          )}
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-[var(--muted)]">변동성</dt>
            <dd className="tabular-nums">
              {(stock.volatility * 100).toFixed(1)}%
            </dd>
          </div>
          <div className="flex flex-col gap-0.5">
            <dt className="text-[11px] text-[var(--muted)]">1거래일</dt>
            <dd>3시간</dd>
          </div>
          {stock.leverage !== undefined && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-[var(--muted)]">
                레버리지 (V-NASDAQ 추종)
              </dt>
              <dd className="tabular-nums">×{stock.leverage}</dd>
            </div>
          )}
          {stock.coveredCallAnnualYield !== undefined && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-[var(--muted)]">월 분배</dt>
              <dd className="tabular-nums">
                20거래일마다 · 연 목표 {stock.coveredCallAnnualYield}%
              </dd>
              <dd className="text-[10px] text-[var(--muted)]">
                옵션 프리미엄에 따라 금액 변동
              </dd>
            </div>
          )}
          {stock.coveredCallUpsideCapture !== undefined && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-[var(--muted)]">상승 참여율</dt>
              <dd className="tabular-nums">
                {(stock.coveredCallUpsideCapture * 100).toFixed(0)}% (하락 100%)
              </dd>
            </div>
          )}
          {stock.quarterlyDividend !== undefined && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-[var(--muted)]">분기 배당</dt>
              <dd className="tabular-nums">
                60거래일마다 {formatPrice(stock.quarterlyDividend)}/주
              </dd>
            </div>
          )}
        </dl>
        {stock.eventBias && Object.keys(stock.eventBias).length > 0 && (
          <div className="mt-3 border-t border-[var(--border)] pt-3">
            <p className="mb-1.5 text-[11px] text-[var(--muted)]">이벤트 성향</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(stock.eventBias).map(([tag, mult]) => (
                <span
                  key={tag}
                  className="rounded-full bg-[var(--background)] px-2.5 py-1 text-xs"
                >
                  {tag}{" "}
                  <span
                    className={
                      mult >= 1 ? "text-[var(--up)]" : "text-[var(--muted)]"
                    }
                  >
                    ×{mult}
                  </span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** 뉴스 탭: 이 종목에 영향을 준 이벤트 목록 */
function StockNewsTab({
  stock,
  events,
}: {
  stock: StockState;
  events: MarketEvent[];
}) {
  const related = [...events]
    .reverse()
    .filter((e) => e.affectedStockIds.includes(stock.id));

  if (related.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-[var(--muted)]">
        아직 이 종목에 영향을 준 뉴스가 없어요.
      </p>
    );
  }

  return (
    <ul className="max-w-2xl space-y-2">
      {related.map((event) => (
        <li key={event.id} className="rounded-2xl bg-[var(--surface)] p-4">
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
  );
}

export function StockPageClient({ id }: { id: string }) {
  const [tab, setTab] = useState(0);
  const stocks = useMarketStore((s) => s.stocks);
  const events = useMarketStore((s) => s.events);
  const stock = stocks.find((s) => s.id === id);
  const holding = useMarketStore((s) =>
    s.holdings.find((h) => h.stockId === id),
  );

  if (!stock) {
    return (
      <div className="py-20 text-center text-[var(--muted)]">
        <p>종목을 찾을 수 없습니다.</p>
        <Link
          href="/"
          className="mt-2 inline-block text-[var(--accent)] hover:underline"
        >
          시장으로 돌아가기
        </Link>
      </div>
    );
  }

  // 지수·선물은 직접 거래 불가 — 주문 없이 차트·뉴스 전용 화면
  if (stock.sector === "선물" || stock.sector === "지수") {
    return <FuturesView stock={stock} />;
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:h-[calc(100vh-3.5rem)]">
      <StockHeader stock={stock} />

      <div className="flex shrink-0 gap-5 border-b border-[var(--border)] px-5">
        {SUB_TABS.map((label, i) => (
          <button
            key={label}
            onClick={() => setTab(i)}
            className={`py-2.5 text-sm transition ${
              tab === i
                ? "border-b-2 border-[var(--foreground)] font-semibold text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row md:overflow-hidden">
        <main className="min-w-0 flex-1 px-4 py-4 md:overflow-y-auto md:px-5">
          {tab === 0 && (
            <div className="space-y-4">
              <CandlestickChart
                candles={stock.candles}
                dailyCandles={stock.dailyCandles}
                history={stock.priceHistory}
                height={360}
                averagePrice={holding?.averagePrice}
                prevDayClose={stock.prevDayClose}
              />
              {stock.etfHoldings && stock.etfHoldings.length > 0 && (
                <EtfComposition etf={stock} stocks={stocks} />
              )}
              <OrderBook stock={stock} />
            </div>
          )}
          {tab === 1 && <StockInfoTab stock={stock} />}
          {tab === 2 && <StockNewsTab stock={stock} events={events} />}
        </main>

        <div className="w-full shrink-0 border-t border-[var(--border)] md:w-[320px] md:border-l md:border-t-0">
          <QuickOrderPanel stock={stock} />
        </div>

        <AccountSidebar />
      </div>

      <BottomTicker stocks={stocks} />
    </div>
  );
}

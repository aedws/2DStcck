"use client";

import Link from "next/link";
import { useState } from "react";
import { FuturesView } from "./FuturesView";
import { AccountSidebar } from "@/components/home/AccountSidebar";
import { BottomTicker } from "@/components/home/BottomTicker";
import { CandlestickChart } from "@/components/market/CandlestickChart";
import { FuturesLeadBadge } from "@/components/market/FuturesLeadBadge";
import { useChartSeries } from "@/components/market/useChartSeries";
import { EtfComposition } from "@/components/market/EtfComposition";
import { OrderBook } from "@/components/market/OrderBook";
import { OptionsPanel } from "@/components/market/OptionsPanel";
import { QuickOrderPanel } from "@/components/market/QuickOrderPanel";
import { PriceAlertPanel } from "@/components/market/PriceAlertPanel";
import { RelatedStocksTab } from "@/components/market/RelatedStocksTab";
import { FlashValue } from "@/components/ui/FlashValue";
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
import { isUpcomingIpo, listingCountdownLabel } from "@/lib/market/ipo";
import { useMarketStore } from "@/store/marketStore";

const SUB_TABS = ["차트 · 호가", "옵션", "종목정보", "뉴스", "관련주"] as const;

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
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-3 py-3 md:gap-6 md:px-5">
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
            <FlashValue
              value={stock.currentPrice}
              className="text-xl font-bold tabular-nums"
            >
              {formatPrice(stock.currentPrice)}
            </FlashValue>
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
            <dd>1시간</dd>
          </div>
          {stock.leverage !== undefined && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-[var(--muted)]">
                레버리지 배율
              </dt>
              <dd className="tabular-nums">×{stock.leverage}</dd>
            </div>
          )}
          {stock.leverage !== undefined && (
            <div className="col-span-2 flex flex-col gap-0.5">
              <dt className="text-[11px] text-[var(--muted)]">
                액면분할·병합
              </dt>
              <dd className="text-[11px] leading-relaxed text-[var(--muted)]">
                가격이 <b className="text-[var(--foreground)]">$1,000</b>을 넘으면
                5:1 분할(가격 ÷5·보유 좌수 ×5), <b className="text-[var(--foreground)]">$10</b>
                {" "}밑으로 내리면 2:1 병합(가격 ×2·보유 좌수 ÷2)됩니다. 밴드가 넓어
                한번 조정되면 한참 그대로 두며(병합은 상장폐지 요건 직전까지 미룸),
                표시가는 $10~$1,000 범위로 유지되고, <b className="text-[var(--foreground)]">
                포지션 가치는 그대로</b>입니다 — 오른 만큼은 좌수로 쌓입니다.
              </dd>
            </div>
          )}
          {stock.coveredCallAnnualYield !== undefined && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-[var(--muted)]">커버드콜 분배</dt>
              <dd className="tabular-nums">
                {stock.coveredCallDistributionIntervalDays ?? 20}거래일마다 · 연 목표 {stock.coveredCallAnnualYield}%
              </dd>
              <dd className="text-[10px] text-[var(--muted)]">
                옵션 프리미엄에 따라 금액 변동
              </dd>
            </div>
          )}
          {stock.coveredCallUpsideCapture !== undefined && (
            <div className="flex flex-col gap-0.5">
              <dt className="text-[11px] text-[var(--muted)]">기초자산 참여율</dt>
              <dd className="tabular-nums">
                상승·하락 ±{stock.coveredCallUpsideCapture.toFixed(1)}배
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
          {event.quote && (
            <p className="mt-2 border-l-2 border-[var(--accent)]/50 pl-3 text-xs italic leading-relaxed text-[var(--foreground)]">
              “{event.quote}”
              {event.quoteBy && (
                <span className="ml-1 not-italic text-[var(--muted)]">
                  — {event.quoteBy}
                </span>
              )}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}

/** 상장 예정 종목 화면: 공모가·CEO 소개 + 상장 카운트다운, 주문 불가. */
function UpcomingIpoView({ stock }: { stock: StockState }) {
  useMarketStore((s) => s.tick); // 카운트다운 실시간 갱신
  const ceo = getCharacterById(stock.ceoId);
  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link
        href="/ipo"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-[var(--muted)] transition hover:text-[var(--foreground)]"
      >
        ← IPO 일정
      </Link>
      <div className="rounded-3xl border border-[var(--accent)]/30 bg-[var(--accent)]/[0.06] p-6 text-center">
        <span className="inline-block rounded-full bg-[var(--accent)]/15 px-3 py-1 text-xs font-semibold text-[var(--accent)]">
          🔔 상장 예정
        </span>
        <div className="mt-4 flex justify-center">
          <StockLogo stock={stock} size={56} />
        </div>
        <h1 className="mt-3 text-2xl font-bold">{stock.name}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {stock.ticker} · {stock.sector}
        </p>
        <p className="mt-5 text-3xl font-black tabular-nums text-[var(--accent)]">
          {listingCountdownLabel(stock)}
        </p>
        <div className="mt-4 inline-flex flex-col gap-1 rounded-2xl bg-[var(--background)]/60 px-5 py-3">
          <span className="text-[11px] text-[var(--muted)]">
            공모가 · 상장 전까지 고정
          </span>
          <span className="text-lg font-bold tabular-nums">
            {formatPrice(stock.initialPrice)}
          </span>
        </div>
        <p className="mt-5 text-xs leading-relaxed text-[var(--muted)]">
          아직 상장 전이라 매수·매도·공매도·옵션 모두 불가하며, 주가는 상장 시각까지
          시초가(공모가)로 고정됩니다. 상장 시각이 지나면 시초가로 개장하며, 이
          화면이 자동으로 거래 화면으로 바뀝니다.
        </p>
      </div>

      {stock.description && (
        <div className="mt-4 rounded-2xl bg-[var(--surface)] p-4">
          <h3 className="mb-2 text-sm font-semibold">회사 소개</h3>
          <p className="text-sm leading-relaxed">{stock.description}</p>
        </div>
      )}

      {ceo && (
        <div className="mt-4 rounded-2xl bg-[var(--surface)] p-4">
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
              <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                {ceo.bio}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
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
  const series = useChartSeries(stock);

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

  // 상장 예정(IPO): 아직 거래 불가 — 주문 화면 없이 카운트다운만 노출한다.
  // (주소로 직행해도 매매·옵션·공매도가 열리지 않게 UI 자체를 막는다.)
  if (isUpcomingIpo(stock)) {
    return <UpcomingIpoView stock={stock} />;
  }

  // 지수·선물은 직접 거래 불가 — 주문 없이 차트·뉴스 전용 화면
  if (stock.sector === "선물" || stock.sector === "지수") {
    return <FuturesView stock={stock} />;
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:h-[calc(100vh-3.5rem)]">
      <StockHeader stock={stock} />

      <div className="flex shrink-0 items-center gap-4 border-b border-[var(--border)] px-3 md:gap-5 md:px-5">
        {SUB_TABS.map((label, i) => (
          <button
            key={label}
            onClick={() => setTab(i)}
            className={`min-h-11 py-2.5 text-sm transition ${
              tab === i
                ? "border-b-2 border-[var(--foreground)] font-semibold text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {label}
          </button>
        ))}
        <a
          href="#quick-order"
          className="ml-auto flex min-h-11 items-center text-xs font-semibold text-[var(--accent)] md:hidden"
        >
          주문하기 ↓
        </a>
      </div>

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row md:overflow-hidden">
        <main className="min-w-0 flex-1 px-4 py-4 md:overflow-y-auto md:px-5">
          {tab === 0 && (
            <div className="space-y-4">
              {stock.sector !== "선물" && <FuturesLeadBadge />}
              <CandlestickChart
                candles={series.candles}
                dailyCandles={series.dailyCandles}
                history={series.history}
                height={360}
                mobileHeight={260}
                averagePrice={holding?.averagePrice}
                prevDayClose={stock.prevDayClose}
              />
              <PriceAlertPanel stock={stock} />
              {stock.etfHoldings && stock.etfHoldings.length > 0 && (
                <EtfComposition etf={stock} stocks={stocks} />
              )}
              <OrderBook stock={stock} />
            </div>
          )}
          {tab === 1 && <OptionsPanel stock={stock} />}
          {tab === 2 && <StockInfoTab stock={stock} />}
          {tab === 3 && <StockNewsTab stock={stock} events={events} />}
          {tab === 4 && <RelatedStocksTab stock={stock} stocks={stocks} />}
        </main>

        <div
          id="quick-order"
          className="w-full scroll-mt-28 shrink-0 border-t border-[var(--border)] md:w-[320px] md:border-l md:border-t-0"
        >
          <QuickOrderPanel stock={stock} />
        </div>

        <AccountSidebar />
      </div>

      <BottomTicker stocks={stocks} />
    </div>
  );
}

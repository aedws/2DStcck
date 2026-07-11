"use client";

import { useEffect, useState } from "react";
import type { MarketEvent, StockState } from "@/lib/types/market";
import {
  formatTradeTime,
  getDayChangeAmount,
  getDayChangePercent,
} from "@/lib/market/engine";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { dayRange, latestEventFor } from "@/lib/market/stats";
import {
  formatSignedPercent,
  formatSignedPrice,
  upDownClass,
} from "@/lib/ui/marketColors";
import { Sparkline } from "@/components/ui/Sparkline";

/** 장 상태 바: 3시간 거래일 기준 마감까지 남은 시간 */
function MarketStatusBar() {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const sessionEnd = (Math.floor(now / SESSION_DURATION_MS) + 1) * SESSION_DURATION_MS;
  const remain = sessionEnd - now;
  const h = Math.floor(remain / 3_600_000);
  const m = Math.floor((remain % 3_600_000) / 60_000);
  const s = Math.floor((remain % 60_000) / 1000);
  const clock = [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");

  return (
    <div className="flex items-center gap-4 text-xs text-[var(--muted)]">
      <span className="flex items-center gap-1.5">
        <span className="inline-block h-1.5 w-1.5 rounded-full bg-[var(--up)]" />
        가상장 운영 중
      </span>
      <span>1거래일 = 3시간</span>
      <span className="tabular-nums">장 마감까지 {clock}</span>
    </div>
  );
}

interface OverviewCard {
  id: string;
  name: string;
  tag?: string;
  tagImpact?: number;
  value: number;
  changePercent: number;
  history: number[];
}

function buildCards(stocks: StockState[], events: MarketEvent[]): OverviewCard[] {
  const cards: OverviewCard[] = [];

  const futures = stocks.find((s) => s.sector === "선물");
  if (futures) {
    cards.push({
      id: futures.id,
      name: futures.name,
      tag: "90초 선행",
      value: futures.currentPrice,
      changePercent: getDayChangePercent(futures),
      history: futures.priceHistory.map((p) => p.price),
    });
  }

  const individual = stocks.filter(
    (s) => s.sector !== "지수" && s.sector !== "선물",
  );
  if (individual.length > 0) {
    const value =
      individual.reduce((sum, st) => sum + st.currentPrice, 0) / individual.length;
    const changePercent =
      individual.reduce((sum, st) => sum + getDayChangePercent(st), 0) /
      individual.length;
    cards.push({
      id: "vcomposite",
      name: "V-COMPOSITE",
      tag: "전 종목 평균",
      value,
      changePercent,
      history: individual[0]?.priceHistory.map((p) => p.price) ?? [],
    });
  }

  // 등락률 상위 변동 종목 (지수·선물 제외)
  const movers = [...individual]
    .sort(
      (a, b) =>
        Math.abs(getDayChangePercent(b)) - Math.abs(getDayChangePercent(a)),
    )
    .slice(0, 4);

  for (const s of movers) {
    const event = latestEventFor(s.id, events);
    cards.push({
      id: s.id,
      name: s.name,
      tag: event?.tag,
      tagImpact: event?.impact,
      value: s.currentPrice,
      changePercent: getDayChangePercent(s),
      history: s.priceHistory.map((p) => p.price),
    });
  }

  return cards.slice(0, 6);
}

export function MarketOverview({
  stocks,
  events,
}: {
  stocks: StockState[];
  events: MarketEvent[];
}) {
  const featured = stocks.find((s) => s.sector === "지수") ?? stocks[0];
  const cards = buildCards(stocks, events);
  const news = [...events].reverse().slice(0, 4);

  if (!featured) return null;

  const change = getDayChangePercent(featured);
  const { high: dayHigh, low: dayLow } = dayRange(featured);

  return (
    <div className="shrink-0 border-b border-[var(--border)] bg-[var(--background)] px-5 py-3">
      <div className="mb-2.5">
        <MarketStatusBar />
      </div>

      <div className="flex items-stretch gap-4">
        {/* 대표 지수 */}
        <div className="w-[250px] shrink-0">
          <p className="text-sm font-semibold">
            {featured.name}{" "}
            <span className="ml-1 text-lg font-bold tabular-nums">
              {featured.currentPrice.toLocaleString("ko-KR")}
            </span>{" "}
            <span className={`text-xs tabular-nums ${upDownClass(change)}`}>
              {formatSignedPrice(getDayChangeAmount(featured))} (
              {formatSignedPercent(change)})
            </span>
          </p>
          <Sparkline
            data={featured.priceHistory.map((p) => p.price)}
            width={240}
            height={58}
          />
          <div className="mt-1 flex gap-4 text-[11px] text-[var(--muted)]">
            <span>
              당일 최고 <span className="tabular-nums">{dayHigh.toLocaleString("ko-KR")}</span>
            </span>
            <span>
              당일 최저 <span className="tabular-nums">{dayLow.toLocaleString("ko-KR")}</span>
            </span>
          </div>
        </div>

        {/* 지수·주요 변동 종목 미니카드 */}
        <div className="grid min-w-0 flex-1 grid-cols-2 gap-x-6 gap-y-2 xl:grid-cols-3">
          {cards.map((card) => (
            <div key={card.id} className="flex min-w-0 items-center gap-3">
              <Sparkline data={card.history} width={52} height={24} className="shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="flex items-baseline gap-1.5 truncate text-xs">
                  <span className="font-medium">{card.name}</span>
                  {card.tag && (
                    <span
                      className={`truncate text-[10px] ${
                        card.tagImpact !== undefined
                          ? upDownClass(card.tagImpact)
                          : "text-[var(--muted)]"
                      }`}
                    >
                      {card.tag}
                    </span>
                  )}
                </p>
                <p className="text-sm tabular-nums">
                  {Math.round(card.value).toLocaleString("ko-KR")}{" "}
                  <span className={`text-xs ${upDownClass(card.changePercent)}`}>
                    {formatSignedPercent(card.changePercent)}
                  </span>
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* 주요 뉴스 */}
        <div className="hidden w-[290px] shrink-0 lg:block">
          <p className="mb-1 text-xs font-semibold text-[var(--muted)]">주요 뉴스</p>
          {news.length === 0 ? (
            <p className="text-xs text-[var(--muted)]">
              아직 발생한 뉴스가 없습니다.
            </p>
          ) : (
            <ul className="space-y-1">
              {news.map((event) => (
                <li key={event.id} className="flex min-w-0 items-center gap-1.5">
                  <span
                    className={`shrink-0 text-[10px] ${upDownClass(event.impact)}`}
                  >
                    {event.impact >= 0 ? "▲" : "▼"}
                  </span>
                  <span className="truncate text-xs">{event.title}</span>
                  <span className="ml-auto shrink-0 text-[10px] tabular-nums text-[var(--muted)]">
                    {formatTradeTime(event.timestamp)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

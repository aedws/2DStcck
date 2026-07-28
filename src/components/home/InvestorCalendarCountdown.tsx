"use client";

import Link from "next/link";
import { useMemo } from "react";
import {
  buildInvestorCalendar,
  calendarEventTone,
} from "@/lib/market/investorCalendar";
import { mergeAmcPortfolioFunds } from "@/lib/player/amcPortfolio";
import { listedFundToAmcState } from "@/lib/supabase/amcListedFunds";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";

export function InvestorCalendarCountdown({
  currentSession,
  expanded = false,
}: {
  currentSession: number;
  expanded?: boolean;
}) {
  const stocks = useMarketStore((state) => state.stocks);
  const holdings = useMarketStore((state) => state.holdings);
  const assetManager = useMarketStore((state) => state.assetManager);
  const listedAmcFunds = useMarketStore((state) => state.listedAmcFunds);
  const watchlist = useSettingsStore((state) => state.watchlist);
  const funds = useMemo(
    () =>
      mergeAmcPortfolioFunds(
        assetManager?.funds ?? [],
        listedAmcFunds.map(listedFundToAmcState),
      ),
    [assetManager, listedAmcFunds],
  );
  const events = useMemo(
    () =>
      buildInvestorCalendar({
        currentSession,
        watchlist,
        holdings,
        stocks,
        amcFunds: funds,
        horizonSessions: 90,
      }),
    [currentSession, funds, holdings, stocks, watchlist],
  );
  const visible = expanded ? events : events.slice(0, 3);

  return (
    <section
      id={expanded ? "investment-calendar" : undefined}
      className={`rounded-2xl border border-[var(--border)] bg-[var(--surface)] ${
        expanded ? "mb-6 p-5" : "p-4"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-amber-300">다음 접속 약속</p>
          <h2 className={expanded ? "mt-1 text-xl font-black" : "mt-1 font-black"}>
            실적·배당 캘린더
          </h2>
        </div>
        {!expanded && (
          <Link
            href="/portfolio#investment-calendar"
            className="text-xs font-bold text-[var(--accent)]"
          >
            내 계좌에서 전체 보기 →
          </Link>
        )}
      </div>
      {visible.length ? (
        <div className="mt-3 space-y-2">
          {visible.map((event) => (
            <Link
              key={event.id}
              href={event.href}
              className="flex items-center justify-between gap-3 rounded-xl bg-[var(--background)] px-3 py-3 transition hover:ring-1 hover:ring-[var(--border)]"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-bold">
                  {event.name} <span className="text-[var(--muted)]">{event.ticker}</span>
                </p>
                <span
                  className={`mt-1 inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ${calendarEventTone(event.type)}`}
                >
                  {event.title}
                </span>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-sm font-black text-amber-300">
                  D-{Math.max(0, event.session - currentSession)}
                </p>
                <p className="text-[10px] text-[var(--muted)]">
                  {event.session.toLocaleString()}거래일
                </p>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-3 rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
          관심 종목이나 보유 종목을 추가하면 향후 90거래일 일정을 보여드립니다.
        </p>
      )}
      {expanded && events.length > visible.length && null}
    </section>
  );
}

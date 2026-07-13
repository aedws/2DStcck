"use client";

import Link from "next/link";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { getBenchmark } from "@/lib/market/interestRate";
import {
  INVESTMENT_SEASON_SESSIONS,
  calculateSeasonPerformance,
  seasonExternalCashTotal,
  seasonTierForAlpha,
} from "@/lib/market/investmentSeasons";
import { useMarketStore } from "@/store/marketStore";

export function InvestmentSeasonBanner() {
  useMarketStore((state) => state.tick);
  const seasonState = useMarketStore((state) => state.investmentSeason);
  const stocks = useMarketStore((state) => state.stocks);
  const equity = useMarketStore((state) => state.getTotalAssets());
  const cashPayments = useMarketStore((state) => state.cashPayments);
  const current = seasonState.current;
  const benchmarkPrice = getBenchmark(stocks)?.currentPrice ?? 0;
  if (!current || benchmarkPrice <= 0) return null;

  const session = Math.floor(Date.now() / SESSION_DURATION_MS);
  const elapsed = Math.max(0, Math.min(INVESTMENT_SEASON_SESSIONS, session - current.startSession));
  const sessionsLeft = Math.max(0, current.endSession - session);
  const performance = calculateSeasonPerformance(
    current,
    equity,
    benchmarkPrice,
    seasonExternalCashTotal(cashPayments),
  );
  const tier = seasonTierForAlpha(performance.alpha);
  const progress = (elapsed / INVESTMENT_SEASON_SESSIONS) * 100;

  return (
    <section className="shrink-0 border-b border-violet-400/25 bg-violet-400/5 px-3 py-2.5 md:px-5">
      <div className="flex items-center gap-3 text-xs">
        <span className="text-2xl" aria-hidden>{tier.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="font-bold">투자 시즌 {current.number} · 예상 {tier.name}</p>
            <span className="text-[10px] text-[var(--muted)]">
              {elapsed}/20거래일 · {sessionsLeft}일 남음
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface)]">
            <div className="h-full rounded-full bg-violet-400" style={{ width: `${progress}%` }} />
          </div>
        </div>
        <div className="hidden text-right sm:block">
          <p className={performance.alpha >= 0 ? "font-bold text-[var(--up)]" : "font-bold text-[var(--down)]"}>
            지수 대비 {performance.alpha >= 0 ? "+" : ""}{(performance.alpha * 100).toFixed(2)}%p
          </p>
          <p className="text-[10px] text-[var(--muted)]">
            내 수익률 {(performance.playerReturn * 100).toFixed(2)}% · 지수 {(performance.benchmarkReturn * 100).toFixed(2)}%
          </p>
        </div>
        <Link
          href="/season"
          className="whitespace-nowrap rounded-lg border border-violet-400/30 bg-[var(--surface)] px-2.5 py-1.5 font-semibold hover:border-violet-400"
        >
          시즌 보기 →
        </Link>
      </div>
    </section>
  );
}

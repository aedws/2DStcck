"use client";

import Link from "next/link";
import { formatPrice } from "@/lib/market/engine";
import { getBenchmark } from "@/lib/market/interestRate";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  INVESTMENT_SEASON_SESSIONS,
  INVESTMENT_SEASON_TIERS,
  calculateSeasonPerformance,
  getInvestmentSeasonTier,
  seasonExternalCashTotal,
  seasonTierForAlpha,
} from "@/lib/market/investmentSeasons";
import type { InvestmentSeasonTierId } from "@/lib/market/investmentSeasons";
import { useMarketStore } from "@/store/marketStore";

const TIER_STYLE: Record<InvestmentSeasonTierId, string> = {
  bronze: "border-orange-700/40 bg-orange-700/10 text-orange-300",
  silver: "border-slate-300/40 bg-slate-300/10 text-slate-200",
  gold: "border-yellow-400/40 bg-yellow-400/10 text-yellow-300",
  platinum: "border-cyan-300/40 bg-cyan-300/10 text-cyan-200",
  diamond: "border-blue-400/40 bg-blue-400/10 text-blue-300",
  master: "border-pink-400/40 bg-pink-400/10 text-pink-300",
};

function signedPercent(value: number, point = false): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%${point ? "p" : ""}`;
}

export default function InvestmentSeasonPage() {
  useMarketStore((state) => state.tick);
  const seasonState = useMarketStore((state) => state.investmentSeason);
  const stocks = useMarketStore((state) => state.stocks);
  const equity = useMarketStore((state) => state.getTotalAssets());
  const cashPayments = useMarketStore((state) => state.cashPayments);
  const benchmarkPrice = getBenchmark(stocks)?.currentPrice ?? 0;
  const current = seasonState.current;
  const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);

  if (!current || benchmarkPrice <= 0) {
    return (
      <div className="mx-auto max-w-5xl pb-20">
        <h1 className="text-2xl font-bold">🏆 20거래일 투자 시즌</h1>
        <div className="mt-6 rounded-2xl bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
          공통 시장과 계좌를 불러온 뒤 첫 시즌이 자동으로 시작됩니다.
        </div>
      </div>
    );
  }

  const elapsed = Math.max(0, Math.min(INVESTMENT_SEASON_SESSIONS, currentSession - current.startSession));
  const sessionsLeft = Math.max(0, current.endSession - currentSession);
  const performance = calculateSeasonPerformance(
    current,
    equity,
    benchmarkPrice,
    seasonExternalCashTotal(cashPayments),
  );
  const projectedTier = seasonTierForAlpha(performance.alpha);
  const progress = (elapsed / INVESTMENT_SEASON_SESSIONS) * 100;
  const nextTier = INVESTMENT_SEASON_TIERS[
    INVESTMENT_SEASON_TIERS.findIndex((tier) => tier.id === projectedTier.id) + 1
  ];

  return (
    <div className="mx-auto max-w-5xl pb-20">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏆 20거래일 투자 시즌</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            절대 수익보다 같은 기간 V-NASDAQ을 얼마나 앞섰는지로 티어를 결정합니다.
          </p>
        </div>
        <Link href="/leaderboard" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:border-[var(--accent)]">
          전체 순자산 랭킹 →
        </Link>
      </div>

      <section className={`rounded-3xl border p-5 sm:p-7 ${TIER_STYLE[projectedTier.id]}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs opacity-75">진행 중 · 시즌 {current.number}</p>
            <h2 className="mt-2 text-3xl font-black">{projectedTier.emoji} 예상 {projectedTier.name}</h2>
            <p className="mt-2 text-sm opacity-80">
              지수 대비 <b>{signedPercent(performance.alpha, true)}</b>
              {nextTier
                ? ` · ${nextTier.name}까지 ${Math.max(0, (nextTier.minimumAlpha - performance.alpha) * 100).toFixed(2)}%p`
                : " · 최고 티어 기준 달성"}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">D-{sessionsLeft}</p>
            <p className="text-xs opacity-75">{elapsed}/20거래일 진행</p>
          </div>
        </div>
        <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-black/20">
          <div className="h-full rounded-full bg-current transition-all" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="현재 순자산" value={formatPrice(equity)} />
        <Stat label="내 시즌 수익률" value={signedPercent(performance.playerReturn)} tone={performance.playerReturn} />
        <Stat label="V-NASDAQ 수익률" value={signedPercent(performance.benchmarkReturn)} tone={performance.benchmarkReturn} />
        <Stat label="시즌 최대 낙폭" value={`${(performance.maxDrawdown * 100).toFixed(2)}%`} tone={-performance.maxDrawdown} />
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">티어 기준</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">시즌 마지막 거래일의 지수 대비 초과수익률로 확정하며, 중간 예상 티어는 계속 바뀝니다.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {INVESTMENT_SEASON_TIERS.map((tier) => (
            <div key={tier.id} className={`rounded-2xl border p-4 ${TIER_STYLE[tier.id]} ${tier.id === projectedTier.id ? "ring-2 ring-current" : ""}`}>
              <p className="font-bold">{tier.emoji} {tier.name}</p>
              <p className="mt-1 text-xs opacity-75">{tier.summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">지난 시즌</h2>
        {seasonState.history.length === 0 ? (
          <div className="mt-3 rounded-2xl bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
            첫 시즌이 끝나면 확정 티어와 초과수익률이 여기에 기록됩니다.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)]">
            {seasonState.history.map((season) => {
              const tier = getInvestmentSeasonTier(season.tierId);
              return (
                <div key={season.id} className="grid grid-cols-[1fr_auto] gap-4 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 last:border-b-0 sm:grid-cols-[110px_1fr_1fr_1fr]">
                  <p className="font-bold">시즌 {season.number}</p>
                  <p className="text-right font-semibold sm:text-left">{tier.emoji} {tier.name}</p>
                  <p className={season.alpha >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}>지수 대비 {signedPercent(season.alpha, true)}</p>
                  <p className="text-right text-[var(--muted)]">내 수익률 {signedPercent(season.playerReturn)}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const toneClass = tone === undefined
    ? ""
    : tone > 0
      ? "text-[var(--up)]"
      : tone < 0
        ? "text-[var(--down)]"
        : "";
  return (
    <div className="rounded-2xl bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`mt-2 text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

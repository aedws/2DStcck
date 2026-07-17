"use client";

import Link from "next/link";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { getMarketRegimeAtSession } from "@/lib/market/marketRegimes";
import { getMarketCycleAtSession } from "@/lib/market/marketCycles";
import {
  CRISIS_GAME_YEAR_SESSIONS,
  getActiveMarketCrisis,
  getNextMarketCrisis,
} from "@/lib/market/marketCrises";
import { useMarketStore } from "@/store/marketStore";

const REGIME_STYLE = {
  "risk-on": "border-[var(--up)]/40 bg-[var(--up)]/5",
  "risk-off": "border-[var(--down)]/40 bg-[var(--down)]/5",
  volatility: "border-amber-400/40 bg-amber-400/5",
  calm: "border-sky-400/40 bg-sky-400/5",
} as const;

export function MarketRegimeCard() {
  useMarketStore((state) => state.tick);
  const session = Math.floor(Date.now() / SESSION_DURATION_MS);
  const regime = getMarketRegimeAtSession(session);
  const cycle = getMarketCycleAtSession(session);
  const crisis = getActiveMarketCrisis(session);
  const nextCrisis = getNextMarketCrisis(session);
  const sessionsLeft = Math.max(1, regime.windowEnd - session);
  const direction = regime.marketReturnPerSession === 0
    ? "방향 중립"
    : `위험자산 ${regime.marketReturnPerSession > 0 ? "+" : ""}${(regime.marketReturnPerSession * 100).toFixed(2)}%/일`;
  const cyclePressure = `사이클 압력 ${cycle.sessionReturn > 0 ? "+" : ""}${(cycle.sessionReturn * 100).toFixed(2)}%`;
  const combinedVolatility = Math.min(
    4.5,
    Math.max(
      0.45,
      cycle.volatilityMultiplier *
        regime.volatilityMultiplier *
        (crisis?.phase.volatilityMultiplier ?? 1),
    ),
  );
  const nextCrisisYears = Math.max(
    0,
    (nextCrisis.startSession - session) / CRISIS_GAME_YEAR_SESSIONS,
  );
  const instrumentId = crisis
    ? crisis.phase.marketReturnPerSession < 0
      ? "vnsi"
      : "vnasdaq"
    : regime.instrumentId;
  const instrumentLabel = crisis
    ? crisis.phase.marketReturnPerSession < 0
      ? "V-NASDAQ 인버스"
      : "V-NASDAQ"
    : regime.instrumentLabel;

  return (
    <section
      className={`shrink-0 border-b px-3 py-2.5 md:px-5 ${
        crisis
          ? "border-red-500/50 bg-red-500/10"
          : REGIME_STYLE[regime.id]
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="text-2xl" aria-hidden>
          {crisis ? crisis.phase.emoji : cycle.emoji}
        </span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">
              {crisis
                ? `위기 경보 · ${crisis.theme.name}`
                : `경기 사이클 · ${cycle.name}`}
            </p>
            <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
              {crisis
                ? `${crisis.phase.name} · 단계 종료까지 ${crisis.phaseSessionsLeft}일`
                : `${cycle.cycleNumber}주기 ${cycle.cycleSession + 1}/200 · 단계 종료까지 ${cycle.sessionsLeft}일`}
            </span>
          </div>
          <p className="mt-0.5 text-[var(--muted)]">
            {crisis ? crisis.phase.description : cycle.summary}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-right">
          <div className="hidden sm:block">
            <p className="font-semibold">
              {crisis
                ? `${crisis.theme.emoji} 위기 전체 종료까지 ${crisis.sessionsLeft}일`
                : `이번 주 시황 · ${regime.name} · ${sessionsLeft}일 남음`}
            </p>
            <p className="text-[10px] text-[var(--muted)]">
              {crisis
                ? `위기 압력 ${crisis.phase.marketReturnPerSession > 0 ? "+" : ""}${(crisis.phase.marketReturnPerSession * 100).toFixed(2)}%/일 · 변동성 ×${combinedVolatility.toFixed(2)}`
                : `${cyclePressure} · ${direction} · 변동성 ×${combinedVolatility.toFixed(2)} · 다음 대형 위기 약 ${nextCrisisYears.toFixed(1)}게임년 후`}
            </p>
          </div>
          <Link
            href={`/stock/${instrumentId}`}
            className="whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-semibold hover:border-[var(--accent)]"
          >
            {instrumentLabel} →
          </Link>
        </div>
      </div>
    </section>
  );
}

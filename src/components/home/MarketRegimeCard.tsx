"use client";

import Link from "next/link";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { getMarketRegimeAtSession } from "@/lib/market/marketRegimes";
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
  const sessionsLeft = Math.max(1, regime.windowEnd - session);
  const direction = regime.marketReturnPerSession === 0
    ? "방향 중립"
    : `위험자산 ${regime.marketReturnPerSession > 0 ? "+" : ""}${(regime.marketReturnPerSession * 100).toFixed(2)}%/일`;

  return (
    <section className={`shrink-0 border-b px-3 py-2.5 md:px-5 ${REGIME_STYLE[regime.id]}`}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
        <span className="text-2xl" aria-hidden>{regime.emoji}</span>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-bold">시장 국면 · {regime.name}</p>
            <span className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
              {sessionsLeft}거래일 남음
            </span>
          </div>
          <p className="mt-0.5 text-[var(--muted)]">{regime.summary}</p>
        </div>
        <div className="ml-auto flex items-center gap-3 text-right">
          <div className="hidden sm:block">
            <p className="font-semibold">{direction} · 변동성 ×{regime.volatilityMultiplier.toFixed(2)}</p>
            <p className="text-[10px] text-[var(--muted)]">{regime.strategy}</p>
          </div>
          <Link
            href={`/stock/${regime.instrumentId}`}
            className="whitespace-nowrap rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 font-semibold hover:border-[var(--accent)]"
          >
            {regime.instrumentLabel} →
          </Link>
        </div>
      </div>
    </section>
  );
}

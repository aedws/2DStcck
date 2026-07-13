"use client";

import { useMemo, useState } from "react";
import { formatPrice, formatSignedMoney } from "@/lib/market/engine";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { buildDailyScorecard } from "@/lib/market/dailyScorecard";
import { useMarketStore } from "@/store/marketStore";

const GRADE_COLOR = {
  S: "bg-amber-400 text-black",
  A: "bg-[var(--up)] text-white",
  B: "bg-sky-500 text-white",
  C: "bg-[var(--accent)] text-white",
  D: "bg-orange-500 text-white",
  F: "bg-[var(--down)] text-white",
} as const;

export function DailyScorecardBanner() {
  const [expanded, setExpanded] = useState(false);
  useMarketStore((state) => state.tick);
  const trades = useMarketStore((state) => state.trades);
  const initialCash = useMarketStore((state) => state.initialCash);
  const marginCallAt = useMarketStore((state) => state.marginCallAt);
  const reportSession = Math.floor(Date.now() / SESSION_DURATION_MS) - 1;
  const scorecard = useMemo(
    () => buildDailyScorecard(trades, reportSession, initialCash, marginCallAt),
    [trades, reportSession, initialCash, marginCallAt],
  );

  return (
    <section className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 md:px-5">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <span className={`flex h-8 w-8 items-center justify-center rounded-lg text-base font-black ${GRADE_COLOR[scorecard.grade]}`}>
          {scorecard.grade}
        </span>
        <div>
          <p className="font-semibold">📊 {scorecard.marketDay}일차 마감 성적표</p>
          <p className="text-[var(--muted)]">점수 {scorecard.score} · 체결 {scorecard.tradeCount}건</p>
        </div>
        <div className="ml-auto text-right">
          <p className={scorecard.realizedPnl > 0 ? "font-semibold text-[var(--up)]" : scorecard.realizedPnl < 0 ? "font-semibold text-[var(--down)]" : "font-semibold"}>
            실현손익 {formatSignedMoney(scorecard.realizedPnl)}
          </p>
          <button
            onClick={() => setExpanded((value) => !value)}
            className="mt-0.5 text-[var(--accent)] hover:underline"
          >
            {expanded ? "접기" : "상세 보기"}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mt-3 grid gap-3 rounded-xl border border-[var(--border)] bg-[var(--background)] p-3 text-xs md:grid-cols-4">
          <Metric label="승률" value={scorecard.winRate === null ? "청산 없음" : `${Math.round(scorecard.winRate * 100)}%`} />
          <Metric label="회전율" value={`${scorecard.turnoverRate.toFixed(1)}배`} sub={formatPrice(scorecard.turnover)} />
          <Metric label="최고 청산" value={scorecard.bestTrade ? `${scorecard.bestTrade.ticker} ${formatSignedMoney(scorecard.bestTrade.pnl)}` : "없음"} />
          <Metric label="최악 청산" value={scorecard.worstTrade ? `${scorecard.worstTrade.ticker} ${formatSignedMoney(scorecard.worstTrade.pnl)}` : "없음"} />
          <p className="md:col-span-4 text-[var(--muted)]">코치 코멘트 · {scorecard.feedback}</p>
        </div>
      )}
    </section>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <p className="text-[var(--muted)]">{label}</p>
      <p className="mt-0.5 font-semibold tabular-nums">{value}</p>
      {sub && <p className="text-[10px] text-[var(--muted)]">{sub}</p>}
    </div>
  );
}

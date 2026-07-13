"use client";

import {
  getInvestmentSeasonTier,
  getSeasonGoal,
  getSeasonRivalPerformance,
} from "@/lib/market/investmentSeasons";
import type { InvestmentSeasonResult } from "@/lib/market/investmentSeasons";

function signedPercent(value: number, point = false): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%${point ? "p" : ""}`;
}

export function SeasonCeremonyModal({
  result,
  onClose,
}: {
  result: InvestmentSeasonResult;
  onClose: () => void;
}) {
  const tier = getInvestmentSeasonTier(result.tierId);
  const goal = getSeasonGoal(result.goalId);
  const rival = getSeasonRivalPerformance(
    result,
    result.endSession,
    result.seasonScore,
  );
  const beatRival = result.seasonScore >= rival.score;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="season-ceremony-title"
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-violet-400/40 bg-[var(--background)] shadow-2xl"
      >
        <div className="bg-gradient-to-br from-violet-500/20 via-transparent to-pink-500/15 px-6 py-7 text-center">
          <p className="text-xs font-semibold tracking-[0.25em] text-violet-300">SEASON COMPLETE</p>
          <div className="mt-4 text-6xl" aria-hidden>{tier.emoji}</div>
          <h2 id="season-ceremony-title" className="mt-3 text-2xl font-black">
            시즌 {result.number} · {tier.name}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            지수 대비 {signedPercent(result.alpha, true)} · 시즌 점수 {result.seasonScore}점
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 px-5 py-4 text-center">
          <ResultStat label="내 수익률" value={signedPercent(result.playerReturn)} />
          <ResultStat label="V-NASDAQ" value={signedPercent(result.benchmarkReturn)} />
          <ResultStat label="최대 낙폭" value={`${(result.maxDrawdown * 100).toFixed(2)}%`} />
        </div>

        {goal && (
          <div className="mx-5 rounded-2xl bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold">{goal.emoji} {goal.name} · 목표 {(result.goalTargetWeight! * 100).toFixed(0)}%</p>
              <p className="text-sm font-semibold">준수율 {(result.goalComplianceRate * 100).toFixed(0)}%</p>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              기본 {result.baseScore}점 · 목표 보너스 +{result.goalBonus} · 미달 감점 -{result.goalPenalty}
            </p>
          </div>
        )}

        <div className={`mx-5 mt-3 rounded-2xl border p-4 ${beatRival ? "border-[var(--up)]/40 bg-[var(--up)]/5" : "border-[var(--down)]/40 bg-[var(--down)]/5"}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>{rival.rival.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--muted)]">가상 라이벌 · {rival.rival.style}</p>
              <p className="font-bold">{rival.rival.name} {rival.score}점</p>
            </div>
            <p className={`text-lg font-black ${beatRival ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
              {beatRival ? "승리" : "패배"}
            </p>
          </div>
          <p className="mt-3 border-l-2 border-[var(--border)] pl-3 text-xs italic text-[var(--muted)]">
            “{rival.remark}”
          </p>
        </div>

        <div className="p-5">
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white"
          >
            결과 확인 · 다음 시즌 시작
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] px-2 py-3">
      <p className="text-[10px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

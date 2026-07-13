"use client";

import {
  INVESTMENT_STYLES,
  MASTERY_LEVEL_THRESHOLDS,
  masteryLevel,
} from "@/lib/market/investmentMastery";
import { useMarketStore } from "@/store/marketStore";

export default function InvestmentMasteryPage() {
  const mastery = useMarketStore((state) => state.investmentMastery);
  const ranked = [...INVESTMENT_STYLES].sort(
    (a, b) => mastery.xp[b.id] - mastery.xp[a.id],
  );
  const top = ranked[0];
  const totalXp = Object.values(mastery.xp).reduce((sum, xp) => sum + xp, 0);

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🎓 투자 스타일 숙련도</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          실제 운용 기록으로 스타일 경험치를 쌓습니다. 반복 주문보다 의뢰 성공과 의미 있는 운용 기록이 더 크게 반영됩니다.
        </p>
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5">
          <p className="text-xs text-[var(--muted)]">대표 투자 스타일</p>
          <p className="mt-2 text-xl font-bold">{top.emoji} {top.name}</p>
          <p className="mt-1 text-sm text-[var(--accent)]">
            {top.titles[masteryLevel(mastery.xp[top.id])]}
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--surface)] p-5">
          <p className="text-xs text-[var(--muted)]">누적 스타일 경험치</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{totalXp.toLocaleString()} XP</p>
          <p className="mt-1 text-xs text-[var(--muted)]">최고 레벨 5 · 능력치 보너스 없이 칭호와 숙련 기록으로 표시</p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {INVESTMENT_STYLES.map((style) => {
          const xp = mastery.xp[style.id];
          const level = masteryLevel(xp);
          const currentThreshold = MASTERY_LEVEL_THRESHOLDS[level];
          const nextThreshold = MASTERY_LEVEL_THRESHOLDS[level + 1];
          const progress = nextThreshold === undefined
            ? 100
            : ((xp - currentThreshold) / (nextThreshold - currentThreshold)) * 100;
          return (
            <article key={style.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
              <div className="flex items-start gap-3">
                <span className="text-2xl">{style.emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-bold">{style.name}</h2>
                    <span className="rounded-full bg-[var(--background)] px-2 py-0.5 text-xs font-bold">Lv.{level}</span>
                  </div>
                  <p className="mt-0.5 text-xs font-semibold text-[var(--accent)]">{style.titles[level]}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">{style.description}</p>
                </div>
              </div>
              <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--background)]">
                <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, progress))}%` }} />
              </div>
              <div className="mt-2 flex justify-between text-[10px] text-[var(--muted)]">
                <span>{xp.toLocaleString()} XP</span>
                <span>{nextThreshold === undefined ? "최고 레벨" : `다음 ${nextThreshold.toLocaleString()} XP`}</span>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

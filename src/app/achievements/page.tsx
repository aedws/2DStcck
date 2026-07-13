"use client";

import { useMemo } from "react";
import { ACHIEVEMENTS } from "@/data/achievements";
import { useMarketStore } from "@/store/marketStore";

export default function AchievementsPage() {
  const achievements = useMarketStore((s) => s.achievements);
  const unlocked = useMemo(
    () => new Set(achievements),
    [achievements],
  );
  const count = ACHIEVEMENTS.filter((a) => unlocked.has(a.id)).length;

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">🏆 업적</h1>
        <span className="text-xs text-[var(--muted)]">
          {count} / {ACHIEVEMENTS.length} 달성
        </span>
      </div>

      <div className="mb-5 h-2 overflow-hidden rounded-full bg-[var(--surface)]">
        <div
          className="h-full rounded-full bg-[var(--accent)] transition-all"
          style={{ width: `${(count / ACHIEVEMENTS.length) * 100}%` }}
        />
      </div>

      <ul className="grid gap-2.5 sm:grid-cols-2">
        {ACHIEVEMENTS.map((a) => {
          const got = unlocked.has(a.id);
          return (
            <li
              key={a.id}
              className={`flex items-start gap-3 rounded-2xl border p-4 ${
                got
                  ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                  : "border-[var(--border)] bg-[var(--surface)] opacity-60"
              }`}
            >
              <span
                className={`text-2xl ${got ? "" : "grayscale"}`}
                aria-hidden
              >
                {got ? a.emoji : "🔒"}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{a.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-[var(--muted)]">
                  {a.detail}
                </p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

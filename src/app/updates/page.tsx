"use client";

import {
  CHANGELOG,
  CHANGELOG_DAILY_SUMMARIES,
  type ChangelogEntry,
} from "@/data/changelog";

const TAG_STYLE: Record<NonNullable<ChangelogEntry["tag"]>, string> = {
  신규: "bg-emerald-500/15 text-emerald-400",
  개선: "bg-sky-500/15 text-sky-400",
  수정: "bg-amber-500/15 text-amber-400",
};

export default function UpdatesPage() {
  // 날짜별로 묶어 최신순으로 표시
  const byDate = new Map<string, ChangelogEntry[]>();
  for (const entry of CHANGELOG) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }
  const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1));

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">📢 업데이트</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          그동안의 변경 내역입니다. 최신 소식이 위에 있습니다.
        </p>
      </div>

      <div className="space-y-8">
        {dates.map((date) => {
          const summary = CHANGELOG_DAILY_SUMMARIES[date];

          return (
            <section key={date}>
              <div className="mb-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold tabular-nums">{date}</h2>
                  <div className="h-px flex-1 bg-[var(--border)]" />
                </div>
                {summary && (
                  <div className="mt-2.5 space-y-1 rounded-xl border border-sky-500/15 bg-sky-500/[0.06] px-3.5 py-3">
                    <p className="flex items-start gap-2 text-xs leading-relaxed">
                      <span className="shrink-0 font-semibold text-sky-400">
                        핵심 개선
                      </span>
                      <span className="text-[var(--foreground)]">
                        {summary.highlights}
                      </span>
                    </p>
                    <p className="flex items-start gap-2 text-xs leading-relaxed">
                      <span className="shrink-0 font-semibold text-violet-400">
                        개선 의도
                      </span>
                      <span className="text-[var(--muted)]">{summary.intent}</span>
                    </p>
                  </div>
                )}
              </div>
              <ul className="space-y-2.5">
                {byDate.get(date)!.map((entry, i) => (
                  <li
                    key={i}
                    className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
                  >
                    <div className="flex items-center gap-2">
                      {entry.tag && (
                        <span
                          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TAG_STYLE[entry.tag]}`}
                        >
                          {entry.tag}
                        </span>
                      )}
                      <p className="text-sm font-semibold">{entry.title}</p>
                    </div>
                    {entry.detail && (
                      <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                        {entry.detail}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  CHANGELOG,
  CHANGELOG_DAILY_SUMMARIES,
  type ChangelogEntry,
} from "@/data/changelog";

type Tag = NonNullable<ChangelogEntry["tag"]>;

const TAG_ORDER: Tag[] = ["신규", "개선", "수정"];

const TAG_STYLE: Record<Tag, string> = {
  신규: "bg-emerald-500/15 text-emerald-400",
  개선: "bg-sky-500/15 text-sky-400",
  수정: "bg-amber-500/15 text-amber-400",
};

const TAG_LABEL: Record<Tag, string> = {
  신규: "🆕 신규 기능",
  개선: "✨ 개선",
  수정: "🔧 버그 수정",
};

/** 한 줄로 접힌 항목 — 누르면 상세가 열린다. */
function EntryRow({ entry }: { entry: ChangelogEntry }) {
  const [open, setOpen] = useState(false);
  const hasDetail = Boolean(entry.detail);
  return (
    <li className="overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        onClick={() => hasDetail && setOpen((value) => !value)}
        className={`flex w-full items-center gap-2 px-3.5 py-2.5 text-left ${hasDetail ? "" : "cursor-default"}`}
      >
        {entry.tag && (
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TAG_STYLE[entry.tag]}`}
          >
            {entry.tag}
          </span>
        )}
        <span className="min-w-0 flex-1 text-sm font-medium">{entry.title}</span>
        {hasDetail && (
          <span
            className={`shrink-0 text-[var(--muted)] transition-transform ${open ? "rotate-180" : ""}`}
            aria-hidden
          >
            ⌄
          </span>
        )}
      </button>
      {open && entry.detail && (
        <p className="border-t border-[var(--border)] px-3.5 py-2.5 text-xs leading-relaxed text-[var(--muted)]">
          {entry.detail}
        </p>
      )}
    </li>
  );
}

export default function UpdatesPage() {
  // 날짜별로 묶어 최신순으로 표시
  const byDate = new Map<string, ChangelogEntry[]>();
  for (const entry of CHANGELOG) {
    const list = byDate.get(entry.date) ?? [];
    list.push(entry);
    byDate.set(entry.date, list);
  }
  const dates = [...byDate.keys()].sort((a, b) => (a < b ? 1 : -1));
  const [openDates, setOpenDates] = useState<Set<string>>(
    () => new Set(dates.slice(0, 1)),
  );
  const allDatesOpen = dates.every((date) => openDates.has(date));

  const toggleDate = (date: string) => {
    setOpenDates((current) => {
      const next = new Set(current);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  };

  const toggleAllDates = () => {
    setOpenDates(allDatesOpen ? new Set() : new Set(dates));
  };

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <div className="mb-5 rounded-2xl border border-sky-500/15 bg-gradient-to-br from-sky-500/[0.09] to-violet-500/[0.05] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-sky-400">
              RELEASE NOTES
            </p>
            <h1 className="mt-0.5 text-2xl font-bold">📢 업데이트</h1>
            <p className="mt-1 text-sm leading-relaxed text-[var(--muted)]">
              날짜별 핵심 변화와 개선 의도를 먼저 읽고, 필요한 상세 내역만
              펼쳐보세요.
            </p>
          </div>
          <button
            type="button"
            onClick={toggleAllDates}
            className="shrink-0 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--muted)]"
          >
            {allDatesOpen ? "모두 접기" : "모두 펼치기"}
          </button>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5 text-[10px] text-[var(--muted)]">
          <span className="rounded-full bg-black/10 px-2 py-1 dark:bg-white/5">
            최신 {dates[0]}
          </span>
          <span className="rounded-full bg-black/10 px-2 py-1 dark:bg-white/5">
            업데이트 {CHANGELOG.length}건
          </span>
          <span className="rounded-full bg-black/10 px-2 py-1 dark:bg-white/5">
            기록 {dates.length}일
          </span>
        </div>
      </div>

      <div className="space-y-3">
        {dates.map((date, dateIndex) => {
          const entries = byDate.get(date)!;
          const summary = CHANGELOG_DAILY_SUMMARIES[date];
          const highlightLines = summary
            ? Array.isArray(summary.highlights)
              ? summary.highlights
              : [summary.highlights]
            : [];
          const untagged = entries.filter((entry) => !entry.tag);
          const isOpen = openDates.has(date);

          return (
            <section
              key={date}
              className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]"
            >
              <button
                type="button"
                onClick={() => toggleDate(date)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-3 px-4 py-3 text-left"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold tabular-nums">{date}</h2>
                    {dateIndex === 0 && (
                      <span className="rounded-full bg-sky-500/15 px-2 py-0.5 text-[9px] font-bold text-sky-400">
                        최신
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--muted)]">
                      {entries.length}건
                    </span>
                  </div>
                  {!isOpen && highlightLines[0] && (
                    <p className="mt-1 truncate text-xs text-[var(--muted)]">
                      {highlightLines[0]}
                    </p>
                  )}
                </div>
                <span
                  className={`shrink-0 text-sm text-[var(--muted)] transition-transform ${isOpen ? "rotate-180" : ""}`}
                  aria-hidden
                >
                  ⌄
                </span>
              </button>

              {isOpen && (
                <div className="border-t border-[var(--border)] px-3.5 pb-4 pt-3">
                  {summary && (
                  <div className="mt-2.5 space-y-2 rounded-xl border border-sky-500/15 bg-sky-500/[0.06] px-3.5 py-3">
                    <div>
                      <p className="text-xs font-semibold text-sky-400">
                        핵심 변화 · {highlightLines.length}개 주제
                      </p>
                      {highlightLines.length > 1 ? (
                        <ul className="mt-1 space-y-1">
                          {highlightLines.map((line, i) => (
                            <li
                              key={i}
                              className="flex gap-1.5 text-xs leading-relaxed"
                            >
                              <span className="shrink-0 text-sky-400">·</span>
                              <span>{line}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="mt-1 text-xs leading-relaxed">
                          {highlightLines[0]}
                        </p>
                      )}
                    </div>
                    <p className="flex items-start gap-2 text-xs leading-relaxed">
                      <span className="shrink-0 font-semibold text-violet-400">
                        개선 의도
                      </span>
                      <span className="text-[var(--muted)]">
                        {summary.intent}
                      </span>
                    </p>
                  </div>
                  )}

                  <div className="mt-3 space-y-3">
                    {TAG_ORDER.map((tag) => {
                      const group = entries.filter((entry) => entry.tag === tag);
                      if (group.length === 0) return null;
                      return (
                        <div key={tag}>
                          <p className="mb-1.5 text-xs font-semibold text-[var(--muted)]">
                            {TAG_LABEL[tag]} · {group.length}
                          </p>
                          <ul className="space-y-1.5">
                            {group.map((entry, i) => (
                              <EntryRow key={i} entry={entry} />
                            ))}
                          </ul>
                        </div>
                      );
                    })}
                    {untagged.length > 0 && (
                      <ul className="space-y-1.5">
                        {untagged.map((entry, i) => (
                          <EntryRow key={`u${i}`} entry={entry} />
                        ))}
                      </ul>
                    )}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

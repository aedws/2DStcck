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

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">📢 업데이트</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          그동안의 변경 내역입니다. 항목을 누르면 자세한 설명이 열립니다.
        </p>
      </div>

      <div className="space-y-8">
        {dates.map((date) => {
          const entries = byDate.get(date)!;
          const summary = CHANGELOG_DAILY_SUMMARIES[date];
          const highlightLines = summary
            ? Array.isArray(summary.highlights)
              ? summary.highlights
              : [summary.highlights]
            : [];
          const untagged = entries.filter((entry) => !entry.tag);

          return (
            <section key={date}>
              <div className="mb-3">
                <div className="flex items-center gap-3">
                  <h2 className="text-sm font-semibold tabular-nums">{date}</h2>
                  <div className="h-px flex-1 bg-[var(--border)]" />
                  <span className="shrink-0 text-[10px] text-[var(--muted)]">
                    {entries.length}건
                  </span>
                </div>
                {summary && (
                  <div className="mt-2.5 space-y-2 rounded-xl border border-sky-500/15 bg-sky-500/[0.06] px-3.5 py-3">
                    <div>
                      <p className="text-xs font-semibold text-sky-400">
                        핵심 개선
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
              </div>

              <div className="space-y-3">
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
            </section>
          );
        })}
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";
import {
  listBugReports,
  BUG_REPORT_STATUS_LABEL,
  type BugReportRow,
} from "@/lib/supabase/bugReports";
import {
  listFeedback,
  FEEDBACK_STATUS_LABEL,
  type FeedbackRow,
} from "@/lib/supabase/feedback";

type HistoryItem = {
  id: string;
  kind: "bug" | "feedback";
  title: string;
  category: string | null;
  statusLabel: string;
  tone: "open" | "progress" | "done" | "declined";
  createdAt: string;
  adminNote: string | null;
};

const TONE_STYLE: Record<HistoryItem["tone"], string> = {
  open: "bg-slate-500/15 text-[var(--muted)]",
  progress: "bg-sky-500/15 text-sky-400",
  done: "bg-emerald-500/15 text-emerald-400",
  declined: "bg-rose-500/15 text-rose-400",
};

function bugTone(status: BugReportRow["status"]): HistoryItem["tone"] {
  if (status === "fixed") return "done";
  if (status === "wontfix" || status === "duplicate") return "declined";
  if (status === "investigating") return "progress";
  return "open";
}

function feedbackTone(status: FeedbackRow["status"]): HistoryItem["tone"] {
  if (status === "done") return "done";
  if (status === "declined") return "declined";
  if (status === "considering" || status === "planned") return "progress";
  return "open";
}

/**
 * 내가 제출한 버그 리포트·피드백(캐릭터 대사·국면·도감 요청 포함) 내역과
 * 처리 상태·운영자 회신을 한 곳에서 보여준다. RLS 로 본인 것만 조회된다.
 */
export function MyRequestHistory() {
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const auth = await getCurrentAuth();
      if (!alive) return;
      if (!auth) {
        setLoggedIn(false);
        setLoading(false);
        return;
      }
      setLoggedIn(true);
      const [bugs, feedback] = await Promise.all([
        listBugReports(),
        listFeedback(),
      ]);
      if (!alive) return;
      const merged: HistoryItem[] = [
        ...bugs
          .filter((r) => r.user_id === auth.userId)
          .map((r) => ({
            id: `bug-${r.id}`,
            kind: "bug" as const,
            title: r.title,
            category: r.category,
            statusLabel: BUG_REPORT_STATUS_LABEL[r.status] ?? r.status,
            tone: bugTone(r.status),
            createdAt: r.created_at,
            adminNote: r.admin_note,
          })),
        ...feedback
          .filter((r) => r.user_id === auth.userId)
          .map((r) => ({
            id: `fb-${r.id}`,
            kind: "feedback" as const,
            title: r.title,
            category: r.category,
            statusLabel: FEEDBACK_STATUS_LABEL[r.status] ?? r.status,
            tone: feedbackTone(r.status),
            createdAt: r.created_at,
            adminNote: r.admin_note,
          })),
      ].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      setItems(merged);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">내 피드백·리포트 내역</h2>
        <p className="mt-0.5 text-[11px] text-[var(--muted)]">
          내가 보낸 버그 리포트·피드백·요청의 처리 상태와 운영자 회신을 확인할 수
          있습니다.
        </p>
      </div>
      <div className="px-4 py-3">
        {loading ? (
          <p className="py-6 text-center text-xs text-[var(--muted)]">
            불러오는 중…
          </p>
        ) : loggedIn === false ? (
          <p className="py-4 text-center text-xs text-[var(--muted)]">
            로그인하면 내가 보낸 내역을 볼 수 있습니다.{" "}
            <Link href="/login" className="font-semibold text-[var(--accent)]">
              로그인 →
            </Link>
          </p>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--muted)]">
            아직 보낸 내역이 없습니다.
          </p>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.id}
                className="rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">
                      <span className="mr-1">
                        {item.kind === "bug" ? "🐞" : "💡"}
                      </span>
                      {item.title}
                    </p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      {item.category ? `${item.category} · ` : ""}
                      {new Date(item.createdAt).toLocaleDateString("ko-KR")}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${TONE_STYLE[item.tone]}`}
                  >
                    {item.statusLabel}
                  </span>
                </div>
                {item.adminNote && (
                  <p className="mt-2 whitespace-pre-wrap rounded-lg bg-[var(--surface)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--muted)]">
                    <span className="font-semibold text-[var(--foreground)]">
                      운영자 회신:{" "}
                    </span>
                    {item.adminNote}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

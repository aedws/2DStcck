"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/market/engine";
import {
  getCurrentAuth,
  isAdminEmail,
  listStockRequests,
  updateStockRequest,
  STOCK_REQUEST_STATUS_LABEL,
  type StockRequestRow,
  type StockRequestStatus,
} from "@/lib/supabase/stockRequests";
import {
  listBugReports,
  updateBugReport,
  BUG_REPORT_STATUS_LABEL,
  BUG_FIX_BOUNTY_CENTS,
  type BugReportRow,
  type BugReportStatus,
} from "@/lib/supabase/bugReports";
import {
  listFeedback,
  updateFeedback,
  FEEDBACK_STATUS_LABEL,
  FEEDBACK_REWARD_CENTS,
  type FeedbackRow,
  type FeedbackStatus,
} from "@/lib/supabase/feedback";

const STOCK_STATUSES: StockRequestStatus[] = [
  "pending",
  "reviewing",
  "accepted",
  "rejected",
  "shipped",
];

const STOCK_STATUS_STYLE: Record<StockRequestStatus, string> = {
  pending: "bg-[var(--surface)] text-[var(--muted)]",
  reviewing: "bg-sky-500/15 text-sky-400",
  accepted: "bg-amber-500/15 text-amber-400",
  rejected: "bg-rose-500/15 text-rose-400",
  shipped: "bg-emerald-500/15 text-emerald-400",
};

const BUG_STATUSES: BugReportStatus[] = [
  "open",
  "investigating",
  "fixed",
  "wontfix",
  "duplicate",
];

const BUG_STATUS_STYLE: Record<BugReportStatus, string> = {
  open: "bg-[var(--surface)] text-[var(--muted)]",
  investigating: "bg-sky-500/15 text-sky-400",
  fixed: "bg-emerald-500/15 text-emerald-400",
  wontfix: "bg-rose-500/15 text-rose-400",
  duplicate: "bg-[var(--surface)] text-[var(--muted)]",
};

const FEEDBACK_STATUSES: FeedbackStatus[] = [
  "open",
  "considering",
  "planned",
  "done",
  "declined",
];

const FEEDBACK_STATUS_STYLE: Record<FeedbackStatus, string> = {
  open: "bg-[var(--surface)] text-[var(--muted)]",
  considering: "bg-sky-500/15 text-sky-400",
  planned: "bg-amber-500/15 text-amber-400",
  done: "bg-emerald-500/15 text-emerald-400",
  declined: "bg-rose-500/15 text-rose-400",
};

type Tab = "stocks" | "bugs" | "feedback";

export default function AdminPage() {
  const [phase, setPhase] = useState<"loading" | "denied" | "ready">("loading");
  const [tab, setTab] = useState<Tab>("stocks");
  const [rows, setRows] = useState<StockRequestRow[]>([]);
  const [bugRows, setBugRows] = useState<BugReportRow[]>([]);
  const [feedbackRows, setFeedbackRows] = useState<FeedbackRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [noteDrafts, setNoteDrafts] = useState<Record<string, string>>({});
  const [expandedBugIds, setExpandedBugIds] = useState<Set<string>>(new Set());

  const toggleBugExpand = (id: string) =>
    setExpandedBugIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const refresh = useCallback(async () => {
    const [stocks, bugs, feedback] = await Promise.all([
      listStockRequests(),
      listBugReports(),
      listFeedback(),
    ]);
    setRows(stocks);
    setBugRows(bugs);
    setFeedbackRows(feedback);
  }, []);

  useEffect(() => {
    (async () => {
      const auth = await getCurrentAuth();
      if (!auth || !isAdminEmail(auth.email)) {
        setPhase("denied");
        return;
      }
      await refresh();
      setPhase("ready");
    })();
  }, [refresh]);

  async function setStockStatus(id: string, status: StockRequestStatus) {
    setSavingId(id);
    if (await updateStockRequest(id, { status })) {
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    }
    setSavingId(null);
  }

  const draftOf = (r: BugReportRow) =>
    noteDrafts[r.id] ?? r.admin_note ?? "";

  async function setBugStatus(id: string, status: BugReportStatus) {
    setSavingId(id);
    // 수정 완료·보류 처리 시엔 작성 중인 회신 메시지를 함께 저장해 유저에게 전달한다.
    const withNote = status === "fixed" || status === "wontfix";
    const note = withNote ? (noteDrafts[id]?.trim() ?? undefined) : undefined;
    if (
      await updateBugReport(id, {
        status,
        ...(note !== undefined ? { adminNote: note } : {}),
      })
    ) {
      setBugRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status, ...(note !== undefined ? { admin_note: note || null } : {}) }
            : r,
        ),
      );
    }
    setSavingId(null);
  }

  async function saveBugNote(id: string) {
    setSavingId(id);
    const note = noteDrafts[id]?.trim() ?? "";
    if (await updateBugReport(id, { adminNote: note })) {
      setBugRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, admin_note: note || null } : r)),
      );
    }
    setSavingId(null);
  }

  const feedbackDraftOf = (r: FeedbackRow) =>
    noteDrafts[r.id] ?? r.admin_note ?? "";

  async function setFeedbackStatus(id: string, status: FeedbackStatus) {
    setSavingId(id);
    // 반영 완료·반려 처리 시엔 작성 중인 회신 메시지를 함께 저장해 유저에게 전달한다.
    const withNote = status === "done" || status === "declined";
    const note = withNote ? (noteDrafts[id]?.trim() ?? undefined) : undefined;
    if (
      await updateFeedback(id, {
        status,
        ...(note !== undefined ? { adminNote: note } : {}),
      })
    ) {
      setFeedbackRows((prev) =>
        prev.map((r) =>
          r.id === id
            ? { ...r, status, ...(note !== undefined ? { admin_note: note || null } : {}) }
            : r,
        ),
      );
    }
    setSavingId(null);
  }

  async function saveFeedbackNote(id: string) {
    setSavingId(id);
    const note = noteDrafts[id]?.trim() ?? "";
    if (await updateFeedback(id, { adminNote: note })) {
      setFeedbackRows((prev) =>
        prev.map((r) => (r.id === id ? { ...r, admin_note: note || null } : r)),
      );
    }
    setSavingId(null);
  }

  if (phase === "loading") {
    return (
      <div className="py-20 text-center text-sm text-[var(--muted)]">
        확인 중…
      </div>
    );
  }

  if (phase === "denied") {
    return (
      <div className="py-20 text-center text-sm text-[var(--muted)]">
        <p>이 페이지는 관리자만 볼 수 있습니다.</p>
        <Link href="/" className="mt-2 inline-block text-[var(--accent)]">
          홈으로 돌아가기
        </Link>
      </div>
    );
  }

  const pendingStocks = rows.filter((r) => r.status === "pending").length;
  const openBugs = bugRows.filter((r) => r.status === "open").length;
  const openFeedback = feedbackRows.filter((r) => r.status === "open").length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🛠️ 관리자</h1>
        <button
          type="button"
          onClick={refresh}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
        >
          새로고침
        </button>
      </div>

      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => setTab("stocks")}
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
            tab === "stocks"
              ? "bg-[var(--accent)] text-white"
              : "border border-[var(--border)] text-[var(--muted)]"
          }`}
        >
          종목 요청 {pendingStocks > 0 && `· ${pendingStocks}`}
        </button>
        <button
          type="button"
          onClick={() => setTab("bugs")}
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
            tab === "bugs"
              ? "bg-[var(--accent)] text-white"
              : "border border-[var(--border)] text-[var(--muted)]"
          }`}
        >
          🐞 버그 리포트 {openBugs > 0 && `· ${openBugs}`}
        </button>
        <button
          type="button"
          onClick={() => setTab("feedback")}
          className={`rounded-xl px-3 py-1.5 text-sm font-semibold transition ${
            tab === "feedback"
              ? "bg-[var(--accent)] text-white"
              : "border border-[var(--border)] text-[var(--muted)]"
          }`}
        >
          💡 피드백 {openFeedback > 0 && `· ${openFeedback}`}
        </button>
      </div>

      {tab === "stocks" ? (
        <>
          <p className="text-sm text-[var(--muted)]">
            총 {rows.length}건 · 대기 {pendingStocks}건
          </p>
          {rows.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
              아직 요청이 없습니다.
            </div>
          ) : (
            <ul className="space-y-3">
              {rows.map((r) => (
                <li
                  key={r.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {r.name}
                        {r.sector && (
                          <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                            · {r.sector}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        @{r.game_id} ·{" "}
                        {new Date(r.created_at).toLocaleString("ko-KR")} ·{" "}
                        {formatPrice(r.cost_paid)}
                      </p>
                    </div>
                    <span
                      className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${STOCK_STATUS_STYLE[r.status]}`}
                    >
                      {STOCK_REQUEST_STATUS_LABEL[r.status]}
                    </span>
                  </div>
                  {r.description && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
                      {r.description}
                    </p>
                  )}
                  {r.reference_url && (
                    <a
                      href={r.reference_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mt-2 inline-block break-all text-xs text-[var(--accent)] underline"
                    >
                      {r.reference_url}
                    </a>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {STOCK_STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={savingId === r.id || r.status === s}
                        onClick={() => setStockStatus(r.id, s)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                          r.status === s
                            ? "bg-[var(--accent)] text-white"
                            : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {STOCK_REQUEST_STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : tab === "bugs" ? (
        <>
          <p className="text-sm text-[var(--muted)]">
            총 {bugRows.length}건 · 접수 {openBugs}건
          </p>
          {bugRows.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
              아직 버그 리포트가 없습니다.
            </div>
          ) : (
            <ul className="space-y-3">
              {bugRows.map((r) => {
                // 처리 완료(수정 완료·보류·중복)된 리포트는 기본으로 접어 목록을 정리한다.
                const terminal =
                  r.status === "fixed" ||
                  r.status === "wontfix" ||
                  r.status === "duplicate";
                const collapsed = terminal && !expandedBugIds.has(r.id);
                if (collapsed) {
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => toggleBugExpand(r.id)}
                        className="flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-3 py-2 text-left transition hover:bg-[var(--surface)]"
                      >
                        <span className="text-[10px] text-[var(--muted)]">▶</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${BUG_STATUS_STYLE[r.status]}`}
                        >
                          {BUG_REPORT_STATUS_LABEL[r.status]}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {r.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-[var(--muted)]">
                          @{r.game_id}
                        </span>
                      </button>
                    </li>
                  );
                }
                return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {r.title}
                        {r.category && (
                          <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                            · {r.category}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        @{r.game_id} ·{" "}
                        {new Date(r.created_at).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${BUG_STATUS_STYLE[r.status]}`}
                      >
                        {BUG_REPORT_STATUS_LABEL[r.status]}
                      </span>
                      {terminal && (
                        <button
                          type="button"
                          onClick={() => toggleBugExpand(r.id)}
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                        >
                          접기 ▲
                        </button>
                      )}
                    </div>
                  </div>
                  {r.description && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
                      {r.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {BUG_STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={savingId === r.id || r.status === s}
                        onClick={() => setBugStatus(r.id, s)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                          r.status === s
                            ? "bg-[var(--accent)] text-white"
                            : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {BUG_REPORT_STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>

                  {/* 회신 작성: 수정 완료 시 보상 + 회신, 보류 시 회신 메시지 전달.
                      한 번 회신을 보내면(수정 완료·보류) 재전송을 막기 위해 비활성화한다. */}
                  {(() => {
                    const responded = r.status === "fixed" || r.status === "wontfix";
                    return (
                      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-3">
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-[11px] font-semibold text-[var(--muted)]">
                            유저 회신 메시지
                          </p>
                          {responded ? (
                            <span className="text-[10px] font-semibold text-emerald-400">
                              ✓ 회신 전송됨 · {BUG_REPORT_STATUS_LABEL[r.status]}
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-400">
                              수정 완료 시 자동 보상 {formatPrice(BUG_FIX_BOUNTY_CENTS)}
                            </span>
                          )}
                        </div>
                        <textarea
                          value={draftOf(r)}
                          disabled={responded}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                          rows={2}
                          maxLength={1000}
                          placeholder="예) 신고해 주신 90조 오버플로우 이슈를 수정했어요. 감사합니다!"
                          className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs leading-relaxed outline-none focus:border-[var(--accent)] disabled:opacity-50"
                        />
                        {responded ? (
                          <p className="mt-2 text-[10px] text-[var(--muted)]">
                            이미 회신을 보낸 리포트입니다. 재전송·중복 지급을 막기 위해
                            잠겼습니다.
                          </p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={savingId === r.id}
                              onClick={() => setBugStatus(r.id, "fixed")}
                              className="rounded-lg bg-emerald-500/90 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                            >
                              ✅ 수정 완료 + 보상·회신
                            </button>
                            <button
                              type="button"
                              disabled={savingId === r.id}
                              onClick={() => setBugStatus(r.id, "wontfix")}
                              className="rounded-lg bg-rose-500/80 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-500 disabled:opacity-40"
                            >
                              📮 보류 + 회신 전송
                            </button>
                            <button
                              type="button"
                              disabled={savingId === r.id}
                              onClick={() => saveBugNote(r.id)}
                              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:opacity-40"
                            >
                              메모만 저장
                            </button>
                          </div>
                        )}
                        {r.admin_note && (
                          <p className="mt-2 text-[10px] text-[var(--muted)]">
                            저장된 회신: {r.admin_note}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </li>
                );
              })}
            </ul>
          )}
        </>
      ) : (
        <>
          <p className="text-sm text-[var(--muted)]">
            총 {feedbackRows.length}건 · 접수 {openFeedback}건
          </p>
          {feedbackRows.length === 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
              아직 피드백이 없습니다.
            </div>
          ) : (
            <ul className="space-y-3">
              {feedbackRows.map((r) => {
                // 처리 완료(반영 완료·반려)된 피드백은 기본으로 접어 목록을 정리한다.
                const terminal = r.status === "done" || r.status === "declined";
                const collapsed = terminal && !expandedBugIds.has(r.id);
                if (collapsed) {
                  return (
                    <li key={r.id}>
                      <button
                        type="button"
                        onClick={() => toggleBugExpand(r.id)}
                        className="flex w-full items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)]/60 px-3 py-2 text-left transition hover:bg-[var(--surface)]"
                      >
                        <span className="text-[10px] text-[var(--muted)]">▶</span>
                        <span
                          className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold ${FEEDBACK_STATUS_STYLE[r.status]}`}
                        >
                          {FEEDBACK_STATUS_LABEL[r.status]}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-xs font-medium">
                          {r.title}
                        </span>
                        <span className="shrink-0 text-[10px] text-[var(--muted)]">
                          @{r.game_id}
                        </span>
                      </button>
                    </li>
                  );
                }
                return (
                <li
                  key={r.id}
                  className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {r.title}
                        {r.category && (
                          <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                            · {r.category}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                        @{r.game_id} ·{" "}
                        {new Date(r.created_at).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${FEEDBACK_STATUS_STYLE[r.status]}`}
                      >
                        {FEEDBACK_STATUS_LABEL[r.status]}
                      </span>
                      {terminal && (
                        <button
                          type="button"
                          onClick={() => toggleBugExpand(r.id)}
                          className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                        >
                          접기 ▲
                        </button>
                      )}
                    </div>
                  </div>
                  {r.description && (
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-[var(--foreground)]">
                      {r.description}
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {FEEDBACK_STATUSES.map((s) => (
                      <button
                        key={s}
                        type="button"
                        disabled={savingId === r.id || r.status === s}
                        onClick={() => setFeedbackStatus(r.id, s)}
                        className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition disabled:opacity-40 ${
                          r.status === s
                            ? "bg-[var(--accent)] text-white"
                            : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                        }`}
                      >
                        {FEEDBACK_STATUS_LABEL[s]}
                      </button>
                    ))}
                  </div>

                  {/* 회신 작성: 반영 완료 시 보상 + 회신, 반려 시 회신 메시지 전달.
                      한 번 회신을 보내면(반영 완료·반려) 재전송을 막기 위해 비활성화한다. */}
                  {(() => {
                    const responded = r.status === "done" || r.status === "declined";
                    return (
                      <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-3">
                        <div className="mb-1.5 flex items-center justify-between">
                          <p className="text-[11px] font-semibold text-[var(--muted)]">
                            유저 회신 메시지
                          </p>
                          {responded ? (
                            <span className="text-[10px] font-semibold text-emerald-400">
                              ✓ 회신 전송됨 · {FEEDBACK_STATUS_LABEL[r.status]}
                            </span>
                          ) : (
                            <span className="text-[10px] text-emerald-400">
                              반영 완료 시 자동 보상 {formatPrice(FEEDBACK_REWARD_CENTS)}
                            </span>
                          )}
                        </div>
                        <textarea
                          value={feedbackDraftOf(r)}
                          disabled={responded}
                          onChange={(e) =>
                            setNoteDrafts((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                          rows={2}
                          maxLength={1000}
                          placeholder="예) 제안해 주신 기능을 이번 업데이트에 반영했어요. 감사합니다!"
                          className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs leading-relaxed outline-none focus:border-[var(--accent)] disabled:opacity-50"
                        />
                        {responded ? (
                          <p className="mt-2 text-[10px] text-[var(--muted)]">
                            이미 회신을 보낸 피드백입니다. 재전송·중복 지급을 막기 위해
                            잠겼습니다.
                          </p>
                        ) : (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              disabled={savingId === r.id}
                              onClick={() => setFeedbackStatus(r.id, "done")}
                              className="rounded-lg bg-emerald-500/90 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
                            >
                              ✅ 반영 완료 + 보상·회신
                            </button>
                            <button
                              type="button"
                              disabled={savingId === r.id}
                              onClick={() => setFeedbackStatus(r.id, "declined")}
                              className="rounded-lg bg-rose-500/80 px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-rose-500 disabled:opacity-40"
                            >
                              📮 반려 + 회신 전송
                            </button>
                            <button
                              type="button"
                              disabled={savingId === r.id}
                              onClick={() => saveFeedbackNote(r.id)}
                              className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted)] transition hover:text-[var(--foreground)] disabled:opacity-40"
                            >
                              메모만 저장
                            </button>
                          </div>
                        )}
                        {r.admin_note && (
                          <p className="mt-2 text-[10px] text-[var(--muted)]">
                            저장된 회신: {r.admin_note}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

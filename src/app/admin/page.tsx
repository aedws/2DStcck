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
  type BugReportRow,
  type BugReportStatus,
} from "@/lib/supabase/bugReports";

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

type Tab = "stocks" | "bugs";

export default function AdminPage() {
  const [phase, setPhase] = useState<"loading" | "denied" | "ready">("loading");
  const [tab, setTab] = useState<Tab>("stocks");
  const [rows, setRows] = useState<StockRequestRow[]>([]);
  const [bugRows, setBugRows] = useState<BugReportRow[]>([]);
  const [savingId, setSavingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [stocks, bugs] = await Promise.all([
      listStockRequests(),
      listBugReports(),
    ]);
    setRows(stocks);
    setBugRows(bugs);
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

  async function setBugStatus(id: string, status: BugReportStatus) {
    setSavingId(id);
    if (await updateBugReport(id, { status })) {
      setBugRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
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
      ) : (
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
              {bugRows.map((r) => (
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
                    <span
                      className={`shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold ${BUG_STATUS_STYLE[r.status]}`}
                    >
                      {BUG_REPORT_STATUS_LABEL[r.status]}
                    </span>
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
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

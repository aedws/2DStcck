"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ASSET_RECOVERY_STATUS_LABEL,
  listAssetRecoveryRequests,
  payVerifiedAssetRecovery,
  verifyAssetRecoveryRequest,
  type AssetRecoveryRequestRow,
} from "@/lib/supabase/assetRecovery";

const STATUS_STYLE: Record<AssetRecoveryRequestRow["status"], string> = {
  under_review: "bg-sky-500/15 text-sky-400",
  verified: "bg-amber-500/15 text-amber-400",
  paid: "bg-emerald-500/15 text-emerald-400",
  corrected: "bg-violet-500/15 text-violet-400",
  rejected: "bg-rose-500/15 text-rose-400",
};

export function AssetRecoveryReviewPanel() {
  const [rows, setRows] = useState<AssetRecoveryRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setRows(await listAssetRecoveryRequests());
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function verify(row: AssetRecoveryRequestRow) {
    setSavingId(row.id);
    const result = await verifyAssetRecoveryRequest(
      row.id,
      amounts[row.id]?.trim() ?? "",
      evidence[row.id]?.trim() ?? "",
    );
    setMessage(result.message);
    if (result.success) await refresh();
    setSavingId(null);
  }

  async function pay(row: AssetRecoveryRequestRow) {
    setSavingId(row.id);
    const result = await payVerifiedAssetRecovery(
      row.id,
      resolutions[row.id]?.trim() ?? "",
    );
    setMessage(result.message);
    if (result.success) await refresh();
    setSavingId(null);
  }

  if (loading) {
    return <p className="py-8 text-center text-sm text-[var(--muted)]">복구 심사 원장을 불러오는 중...</p>;
  }

  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
        <p className="text-sm font-semibold text-amber-300">확인 후 1회 지급 원칙</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          서버 근거가 충분하면 원장과 대조하고, 근거가 부족해도 운영 정책상 지급 사유와
          정수 센트 금액을 확정할 수 있습니다. 확정 후 별도 지급 버튼으로 1회만 지급되며 중복 지급은 차단됩니다.
        </p>
      </div>
      {message && (
        <p className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs">
          {message}
        </p>
      )}
      {rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-[var(--muted)]">복구 심사 요청이 없습니다.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => {
            const closed =
              row.status === "paid" ||
              row.status === "corrected" ||
              row.status === "rejected";
            return (
              <li key={row.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold">@{row.game_id}</p>
                    <p className="mt-0.5 text-[11px] text-[var(--muted)]">
                      {row.source_kind === "bug" ? "버그 리포트" : "피드백"} · {new Date(row.created_at).toLocaleString("ko-KR")}
                    </p>
                  </div>
                  <span className={`rounded-lg px-2 py-1 text-[11px] font-semibold ${STATUS_STYLE[row.status]}`}>
                    {ASSET_RECOVERY_STATUS_LABEL[row.status]}
                  </span>
                </div>
                {row.requested_amount_text && (
                  <p className="mt-3 whitespace-pre-wrap rounded-xl bg-[var(--background)]/60 p-3 text-xs leading-relaxed">
                    {row.requested_amount_text}
                  </p>
                )}
                {row.status === "under_review" && (
                  <div className="mt-3 grid gap-2">
                    <input
                      value={amounts[row.id] ?? ""}
                      onChange={(event) => setAmounts((prev) => ({ ...prev, [row.id]: event.target.value.replace(/\D/g, "") }))}
                      placeholder="확정 복구액 (정수 센트)"
                      inputMode="numeric"
                      className="rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
                    />
                    <textarea
                      value={evidence[row.id] ?? ""}
                      onChange={(event) => setEvidence((prev) => ({ ...prev, [row.id]: event.target.value }))}
                      placeholder="서버 검증 근거 또는 근거 부족 시 정책 지급 사유"
                      rows={3}
                      className="resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
                    />
                    <button
                      type="button"
                      disabled={savingId === row.id || !(amounts[row.id]?.length > 0) || (evidence[row.id]?.trim().length ?? 0) < 10}
                      onClick={() => verify(row)}
                      className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-black disabled:opacity-40"
                    >
                      1단계 · 지급 사유와 금액 확정
                    </button>
                  </div>
                )}
                {!closed && (
                  <div className="mt-3 grid gap-2">
                    <textarea
                      value={resolutions[row.id] ?? ""}
                      onChange={(event) => setResolutions((prev) => ({ ...prev, [row.id]: event.target.value }))}
                      placeholder="유저에게 전달할 판정 근거와 처리 결과"
                      rows={3}
                      className="resize-y rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs outline-none focus:border-[var(--accent)]"
                    />
                    <div className="grid gap-2">
                      <button
                        type="button"
                        disabled={savingId === row.id || row.status !== "verified" || (resolutions[row.id]?.trim().length ?? 0) < 10}
                        onClick={() => pay(row)}
                        className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        2단계 · 확정액 1회 지급
                      </button>
                    </div>
                  </div>
                )}
                {row.evidence_note && <p className="mt-3 text-[11px] text-[var(--muted)]">검증 근거: {row.evidence_note}</p>}
                {row.resolution_note && <p className="mt-1 text-[11px] text-[var(--muted)]">처리 결과: {row.resolution_note}</p>}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

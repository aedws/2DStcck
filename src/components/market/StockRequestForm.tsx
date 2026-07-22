"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";
import { useToastStore } from "@/store/toastStore";
import {
  getCurrentAuth,
  listMyStockRequests,
  submitStockRequest,
  STOCK_REQUEST_COST,
  STOCK_REQUEST_COOLDOWN_DAYS,
  STOCK_REQUEST_PROGRESS,
  STOCK_REQUEST_STATUS_LABEL,
  stockRequestProgressIndex,
  stockRequestRefundCents,
  type StockRequestRow,
  type StockRequestStatus,
} from "@/lib/supabase/stockRequests";
import { isCompanyFoundationRequestRow } from "@/lib/supabase/companyFoundationRequests";

const REQUEST_STATUS_STYLE: Record<StockRequestStatus, string> = {
  pending: "bg-slate-500/15 text-[var(--muted)]",
  reviewing: "bg-sky-500/15 text-sky-400",
  accepted: "bg-amber-500/15 text-amber-400",
  rejected: "bg-rose-500/15 text-rose-400",
  shipped: "bg-emerald-500/15 text-emerald-400",
};

/**
 * 종목 추가 요청 폼 — 캐릭터 상세에서 "이런 종목/캐릭터를 추가해달라"를 제출한다.
 * 로그인 필수(저장할 곳이 Supabase 뿐), 현금 차감 + 쿨다운으로 스팸을 막는다.
 * 저장 성공이 확인된 뒤에만 재화를 차감한다.
 */
export function StockRequestForm({
  defaultSector,
  contextLabel,
}: {
  defaultSector?: string;
  contextLabel?: string;
}) {
  const cash = useMarketStore((s) => s.cash);
  const canRequestStock = useMarketStore((s) => s.canRequestStock);
  const chargeStockRequest = useMarketStore((s) => s.chargeStockRequest);
  const saveCloud = useMarketStore((s) => s.saveCloud);
  const push = useToastStore((s) => s.push);

  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [sector, setSector] = useState(defaultSector ?? "");
  const [description, setDescription] = useState("");
  const [referenceUrl, setReferenceUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [myRequests, setMyRequests] = useState<StockRequestRow[] | null>(null);

  const refreshMyRequests = useCallback(async () => {
    setMyRequests(
      (await listMyStockRequests()).filter(
        (request) => !isCompanyFoundationRequestRow(request),
      ),
    );
  }, []);

  useEffect(() => {
    let cancelled = false;
    setMounted(true);
    void (async () => {
      const auth = await getCurrentAuth();
      if (cancelled) return;
      setLoggedIn(Boolean(auth));
      if (auth) await refreshMyRequests();
      else setMyRequests([]);
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshMyRequests]);

  useEffect(() => {
    if (loggedIn !== true) return;
    const refresh = () => void refreshMyRequests();
    const interval = window.setInterval(refresh, 60_000);
    window.addEventListener("focus", refresh);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refresh);
    };
  }, [loggedIn, refreshMyRequests]);

  if (!mounted) return null;

  const gate = canRequestStock();

  async function handleSubmit() {
    if (submitting) return;
    const trimmed = name.trim();
    if (trimmed.length < 1) {
      push("추가하고 싶은 종목·캐릭터 이름을 적어주세요.", "info");
      return;
    }
    const g = canRequestStock();
    if (!g.ok) {
      push(
        g.reason === "cooldown"
          ? `요청 쿨다운이 ${g.daysLeft ?? 0}거래일 남았습니다.`
          : `현금이 부족합니다 (요청 비용 ${formatPrice(STOCK_REQUEST_COST)}).`,
        "info",
      );
      return;
    }
    setSubmitting(true);
    const res = await submitStockRequest({
      sector: sector || undefined,
      name: trimmed,
      description: description || undefined,
      referenceUrl: referenceUrl || undefined,
      costPaid: STOCK_REQUEST_COST,
    });
    if (!res.success) {
      push(res.message, "error");
      setSubmitting(false);
      return;
    }
    // 저장 성공 확인 후에만 차감·쿨다운 기록.
    chargeStockRequest();
    void saveCloud();
    push(`✅ 요청 접수 · ${formatPrice(STOCK_REQUEST_COST)} 사용. 고마워요!`, "success");
    setName("");
    setDescription("");
    setReferenceUrl("");
    setOpen(false);
    await refreshMyRequests();
    setSubmitting(false);
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between">
        <div className="min-w-0">
          <h2 className="text-sm font-bold">➕ 종목 추가 요청</h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            추가됐으면 하는 종목·캐릭터를 제안하세요. 검토 후 반영될 수 있어요.
            요청 1건에 {formatPrice(STOCK_REQUEST_COST)} · {STOCK_REQUEST_COOLDOWN_DAYS}
            거래일마다 1회. 반려되면 사유와 함께 신청 비용 전액을 돌려드립니다.
          </p>
        </div>
      </div>

      {loggedIn === false ? (
        <div className="mt-3 rounded-xl bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
          요청을 저장하려면 로그인이 필요합니다.{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)]">
            로그인하기 →
          </Link>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          disabled={!gate.ok}
          className="mt-3 w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {gate.ok
            ? "요청 작성하기"
            : gate.reason === "cooldown"
              ? `쿨다운 ${gate.daysLeft ?? 0}거래일 남음`
              : "현금 부족"}
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value.slice(0, 60))}
            placeholder={
              contextLabel
                ? `추가할 종목·캐릭터 이름 (예: ${contextLabel} 관련)`
                : "추가할 종목·캐릭터 이름 (필수)"
            }
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            value={sector}
            onChange={(e) => setSector(e.target.value.slice(0, 40))}
            placeholder="섹터 (선택 · 예: 반도체, 게임, 방산)"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 1000))}
            placeholder="설명 (선택 · 어떤 회사·캐릭터인지, 왜 넣고 싶은지)"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <input
            value={referenceUrl}
            onChange={(e) => setReferenceUrl(e.target.value.slice(0, 500))}
            placeholder="참고 링크 (선택 · 나무위키 등)"
            inputMode="url"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || !gate.ok}
              className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {submitting
                ? "제출 중…"
                : `제출 (${formatPrice(STOCK_REQUEST_COST)})`}
            </button>
          </div>
          <p className="text-center text-[11px] text-[var(--muted)]">
            보유 현금 {formatPrice(cash)}
          </p>
        </div>
      )}

      {loggedIn === true && (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold">내 IPO 신청 현황</h3>
              <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                대기 · 검토 중 · 반영 예정 · 반려 · 반영 완료
              </p>
            </div>
            <button
              type="button"
              onClick={() => void refreshMyRequests()}
              className="shrink-0 rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--foreground)]"
            >
              새로고침
            </button>
          </div>

          {myRequests === null ? (
            <p className="mt-3 text-center text-xs text-[var(--muted)]">
              신청 내역을 불러오는 중…
            </p>
          ) : myRequests.length === 0 ? (
            <p className="mt-3 rounded-xl bg-[var(--background)] p-4 text-center text-xs text-[var(--muted)]">
              아직 신청한 IPO가 없습니다.
            </p>
          ) : (
            <ul className="mt-3 space-y-2.5">
              {myRequests.map((request) => {
                const currentStep = stockRequestProgressIndex(request.status);
                const rejected = request.status === "rejected";
                return (
                  <li
                    key={request.id}
                    className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{request.name}</p>
                        <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                          {new Date(request.created_at).toLocaleString("ko-KR")}
                          {request.sector ? ` · ${request.sector}` : ""}
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${REQUEST_STATUS_STYLE[request.status]}`}
                      >
                        {STOCK_REQUEST_STATUS_LABEL[request.status]}
                      </span>
                    </div>

                    {!rejected ? (
                      <ol className="mt-3 grid grid-cols-4 gap-1" aria-label="IPO 신청 진행 단계">
                        {STOCK_REQUEST_PROGRESS.map((status, index) => {
                          const active = index === currentStep;
                          const passed = index < currentStep;
                          return (
                            <li
                              key={status}
                              className={`rounded-md px-1 py-1.5 text-center text-[9px] font-semibold ${
                                active
                                  ? "bg-[var(--accent)] text-white"
                                  : passed
                                    ? "bg-emerald-500/15 text-emerald-400"
                                    : "bg-[var(--surface)] text-[var(--muted)] opacity-60"
                              }`}
                            >
                              {passed ? "✓ " : ""}
                              {STOCK_REQUEST_STATUS_LABEL[status]}
                            </li>
                          );
                        })}
                      </ol>
                    ) : (
                      <div className="mt-3 rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
                        <p className="text-[10px] font-semibold text-rose-400">반려 사유</p>
                        <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed">
                          {request.admin_note || "운영자 사유를 확인 중입니다."}
                        </p>
                        <p className="mt-2 text-[10px] font-semibold text-emerald-400">
                          신청 비용 {formatPrice(stockRequestRefundCents(request))} 환불 처리
                        </p>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

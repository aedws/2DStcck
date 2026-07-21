"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";
import { useToastStore } from "@/store/toastStore";
import {
  getCurrentAuth,
  submitStockRequest,
  STOCK_REQUEST_COST,
  STOCK_REQUEST_COOLDOWN_DAYS,
} from "@/lib/supabase/stockRequests";

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

  useEffect(() => {
    setMounted(true);
    getCurrentAuth().then((a) => setLoggedIn(Boolean(a)));
  }, []);

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
    </section>
  );
}

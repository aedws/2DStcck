"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/market/engine";
import { COMPANY_SECTOR_ORDER } from "@/lib/market/taxonomy";
import { CHARACTERS } from "@/data/characters";
import {
  normalizeStoredIpoListing,
  type StoredIpoListing,
} from "@/lib/market/dynamicListings";
import {
  listAdminIpoListings,
  setIpoListingActive,
  upsertIpoListing,
  type IpoListingRow,
} from "@/lib/supabase/ipoListings";

/** datetime-local(로컬 시각) → epoch ms. */
function localInputToMs(value: string): number {
  return value ? new Date(value).getTime() : NaN;
}

/** 기본 상장 시각: 지금부터 1시간 뒤(로컬 시각 문자열). */
function defaultListingInput(): string {
  const d = new Date(Date.now() + 60 * 60 * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

interface FormState {
  ticker: string;
  id: string;
  name: string;
  sector: string;
  subsector: string;
  priceUsd: string;
  drift: string;
  volatility: string;
  beta: string;
  dividendUsd: string;
  description: string;
  ceoId: string;
  listing: string;
}

const EMPTY_FORM: FormState = {
  ticker: "",
  id: "",
  name: "",
  sector: COMPANY_SECTOR_ORDER[0] ?? "금융",
  subsector: "",
  priceUsd: "1000",
  drift: "0.0006",
  volatility: "0.04",
  beta: "1",
  dividendUsd: "0",
  description: "",
  ceoId: "",
  listing: defaultListingInput(),
};

/** 도감 캐릭터 선택 목록(이름순). */
const CHARACTER_OPTIONS = [...CHARACTERS]
  .map((c) => ({ id: c.id, name: c.name }))
  .sort((a, b) => a.name.localeCompare(b.name, "ko"));

/**
 * 관리자 즉시 IPO 발행 — 코드 배포 없이 미래 시각에 상장할 종목을 등록한다.
 * 시장은 종목별 (틱, id) 시드 난수로 가격을 만들어, 미래 상장하는 독립 종목을 더해도
 * 기존 종목·체크포인트에 영향이 없다. 등록하면 모든 클라이언트가 목록을 읽어 같은
 * 정의로 상장 카운트다운을 보고, 상장 시각에 동시에 개장한다.
 */
export function IpoComposer() {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [rows, setRows] = useState<IpoListingRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(
    null,
  );

  const refresh = useCallback(async () => {
    setRows(await listAdminIpoListings());
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  // 티커를 바꾸면 id를 티커 소문자로 자동 제안(직접 수정 전까지).
  const effectiveId = (form.id || form.ticker).trim().toLowerCase();

  const preview = useMemo(
    () =>
      normalizeStoredIpoListing({
        id: effectiveId,
        ticker: form.ticker,
        name: form.name,
        sector: form.sector,
        subsector: form.subsector || undefined,
        initialPrice: Math.round(Number(form.priceUsd) * 100),
        volatility: Number(form.volatility),
        drift: Number(form.drift),
        beta: Number(form.beta),
        quarterlyDividend: Math.round(Number(form.dividendUsd) * 100) || undefined,
        description: form.description || undefined,
        ceoId: form.ceoId || undefined,
        listingEpochMs: localInputToMs(form.listing),
      }),
    [form, effectiveId],
  );

  const listingMs = localInputToMs(form.listing);
  const listingInFuture = Number.isFinite(listingMs) && listingMs > Date.now();
  const canSubmit = Boolean(preview) && listingInFuture && !saving;

  const submit = async () => {
    if (!preview) {
      setMessage({ ok: false, text: "입력값이 유효하지 않습니다 (티커·이름·섹터·id 확인)." });
      return;
    }
    if (!listingInFuture) {
      setMessage({ ok: false, text: "상장 시각은 반드시 미래여야 합니다." });
      return;
    }
    setSaving(true);
    setMessage(null);
    const result = await upsertIpoListing(preview);
    setSaving(false);
    if (result.ok) {
      setMessage({
        ok: true,
        text: `${preview.name} (${preview.ticker}) 상장 예약 완료 — ${new Date(preview.listingEpochMs).toLocaleString("ko-KR")} 개장.`,
      });
      setForm({ ...EMPTY_FORM, listing: defaultListingInput() });
      void refresh();
    } else {
      const reason =
        result.error === "listing_must_be_future"
          ? "상장 시각이 이미 지났습니다."
          : result.error.includes("invalid_id")
            ? "id 형식이 올바르지 않습니다 (영문 소문자로 시작, 2~12자)."
            : result.error === "invalid_input"
              ? "입력값이 유효하지 않습니다."
              : `등록 실패: ${result.error}`;
      setMessage({ ok: false, text: reason });
    }
  };

  const toggleActive = async (row: IpoListingRow) => {
    if (await setIpoListingActive(row.id, !row.active)) void refresh();
  };

  const fieldClass =
    "mt-1 w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs outline-none focus:border-[var(--accent)]";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-emerald-400/20 bg-[var(--surface)] p-4">
        <h2 className="text-sm font-bold">🆕 IPO 발행 (즉시 상장)</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
          코드 배포 없이 미래 시각에 상장할 종목을 등록합니다. 등록 즉시 모든 유저의
          IPO 탭에 상장 카운트다운으로 뜨고, 지정 시각에 공모가로 동시에 개장합니다.
          결정론 시장이라 시장 버전 변경·체크포인트 재생성이 필요 없습니다.
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2.5">
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            티커 (영문 대문자 1~6)
            <input
              value={form.ticker}
              onChange={(e) => set("ticker", e.target.value.toUpperCase().slice(0, 6))}
              placeholder="KOYU"
              className={fieldClass}
            />
          </label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            종목 id (영소문자 시작, 2~12)
            <input
              value={form.id}
              onChange={(e) => set("id", e.target.value.toLowerCase().slice(0, 12))}
              placeholder={form.ticker.toLowerCase() || "koyu"}
              className={fieldClass}
            />
          </label>
          <label className="col-span-2 text-[11px] font-semibold text-[var(--muted)]">
            종목명
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value.slice(0, 40))}
              placeholder="코유키 정보해석"
              className={fieldClass}
            />
          </label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            섹터
            <select
              value={form.sector}
              onChange={(e) => set("sector", e.target.value)}
              className={fieldClass}
            >
              {COMPANY_SECTOR_ORDER.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            세부 산업 (선택)
            <input
              value={form.subsector}
              onChange={(e) => set("subsector", e.target.value.slice(0, 20))}
              placeholder="데이터 분석"
              className={fieldClass}
            />
          </label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            공모가 ($)
            <input
              type="number"
              value={form.priceUsd}
              onChange={(e) => set("priceUsd", e.target.value)}
              min={1}
              max={100000}
              className={fieldClass}
            />
          </label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            분기 배당 ($, 선택)
            <input
              type="number"
              value={form.dividendUsd}
              onChange={(e) => set("dividendUsd", e.target.value)}
              min={0}
              step={0.5}
              className={fieldClass}
            />
          </label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            드리프트 (-0.005~0.005)
            <input
              type="number"
              value={form.drift}
              onChange={(e) => set("drift", e.target.value)}
              step={0.0001}
              className={fieldClass}
            />
          </label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            변동성 (0.005~0.2)
            <input
              type="number"
              value={form.volatility}
              onChange={(e) => set("volatility", e.target.value)}
              step={0.005}
              className={fieldClass}
            />
          </label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            베타 (0~3)
            <input
              type="number"
              value={form.beta}
              onChange={(e) => set("beta", e.target.value)}
              step={0.1}
              className={fieldClass}
            />
          </label>
          <label className="text-[11px] font-semibold text-[var(--muted)]">
            상장 시각 (미래)
            <input
              type="datetime-local"
              value={form.listing}
              onChange={(e) => set("listing", e.target.value)}
              className={fieldClass}
            />
          </label>
          <label className="col-span-2 text-[11px] font-semibold text-[var(--muted)]">
            도감 캐릭터 연동 (선택)
            <select
              value={form.ceoId}
              onChange={(e) => set("ceoId", e.target.value)}
              className={fieldClass}
            >
              <option value="">연동 안 함</option>
              {CHARACTER_OPTIONS.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </label>
          <label className="col-span-2 text-[11px] font-semibold text-[var(--muted)]">
            회사 소개 (선택)
            <textarea
              value={form.description}
              onChange={(e) => set("description", e.target.value.slice(0, 400))}
              rows={2}
              placeholder="한 줄 소개"
              className={`${fieldClass} resize-none`}
            />
          </label>
        </div>

        {preview && (
          <p className="mt-2 text-[10px] text-[var(--muted)]">
            미리보기: {preview.name} ({preview.ticker}) · 공모가{" "}
            {formatPrice(preview.initialPrice)} · {preview.sector}
            {preview.subsector ? ` · ${preview.subsector}` : ""} · 상장{" "}
            {new Date(preview.listingEpochMs).toLocaleString("ko-KR")}
            {preview.ceoId
              ? ` · 도감 🔗 ${
                  CHARACTER_OPTIONS.find((c) => c.id === preview.ceoId)?.name ??
                  preview.ceoId
                }`
              : ""}
          </p>
        )}
        {!listingInFuture && form.listing && (
          <p className="mt-2 text-[10px] text-rose-400">
            ⚠ 상장 시각이 과거입니다. 결정론 정합성을 위해 미래 시각만 등록됩니다.
          </p>
        )}
        {message && (
          <p
            className={`mt-2 text-[11px] ${message.ok ? "text-emerald-400" : "text-rose-400"}`}
          >
            {message.text}
          </p>
        )}

        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className="mt-3 w-full rounded-lg bg-emerald-500/90 px-3 py-2 text-xs font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-40"
        >
          {saving ? "등록 중…" : "🚀 IPO 상장 예약"}
        </button>
      </div>

      <div>
        <p className="text-sm text-[var(--muted)]">
          발행된 상장 {rows.length}건
        </p>
        {rows.length === 0 ? (
          <div className="mt-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
            아직 발행한 IPO가 없습니다.
          </div>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((row) => {
              const listed = row.listing_epoch_ms <= Date.now();
              return (
                <li
                  key={row.id}
                  className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">
                        {row.name}{" "}
                        <span className="text-xs text-[var(--muted)]">
                          {row.ticker} · {row.sector}
                        </span>
                      </p>
                      <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                        공모가 {formatPrice(row.payload.initialPrice)} ·{" "}
                        {listed ? "상장됨" : "상장 예정"}{" "}
                        {new Date(row.listing_epoch_ms).toLocaleString("ko-KR")}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${
                          row.active
                            ? "bg-emerald-500/15 text-emerald-400"
                            : "bg-[var(--surface)] text-[var(--muted)]"
                        }`}
                      >
                        {row.active ? "활성" : "비활성"}
                      </span>
                      <button
                        type="button"
                        onClick={() => toggleActive(row)}
                        className="rounded-lg border border-[var(--border)] px-2 py-1 text-[10px] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                      >
                        {row.active ? "내리기" : "올리기"}
                      </button>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

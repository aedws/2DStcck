"use client";

import { useEffect, useMemo, useState } from "react";
import {
  amountToReachTargetAverage,
  quantityFromAddAmount,
  quantityToReachTargetAverage,
  simulateAveragingBuy,
} from "@/lib/market/averagingCalculator";
import {
  formatCompactMoney,
  formatPrice,
  formatSignedMoney,
} from "@/lib/market/engine";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";

type AddMode = "quantity" | "amount";

function cleanDecimal(value: string): string {
  return value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

function dollarsToCents(raw: string): number {
  const dollars = Number(raw);
  if (!Number.isFinite(dollars) || dollars <= 0) return Number.NaN;
  return Math.round(dollars * 100);
}

function formatQty(quantity: number): string {
  return quantity.toLocaleString("ko-KR", { maximumFractionDigits: 6 });
}

export interface AveragingCalculatorProps {
  /** 보유 수량 프리필 */
  initialQuantity?: number;
  /** 평단(센트) 프리필 */
  initialAveragePrice?: number;
  /** 추가 매수 단가(센트) 프리필 — 보통 현재가 */
  initialAddPrice?: number;
  /** 현재가(센트) — 미실현 손익 미리보기용 */
  markPrice?: number;
  /** 종목 라벨 */
  stockLabel?: string;
  compact?: boolean;
}

export function AveragingCalculator({
  initialQuantity = 0,
  initialAveragePrice = 0,
  initialAddPrice = 0,
  markPrice,
  stockLabel,
  compact = false,
}: AveragingCalculatorProps) {
  const [quantityInput, setQuantityInput] = useState(
    initialQuantity > 0 ? String(initialQuantity) : "",
  );
  const [averageInput, setAverageInput] = useState(
    initialAveragePrice > 0 ? (initialAveragePrice / 100).toFixed(2) : "",
  );
  const [addPriceInput, setAddPriceInput] = useState(
    initialAddPrice > 0 ? (initialAddPrice / 100).toFixed(2) : "",
  );
  const [addMode, setAddMode] = useState<AddMode>("quantity");
  const [addQuantityInput, setAddQuantityInput] = useState("");
  const [addAmountInput, setAddAmountInput] = useState("");
  const [targetAvgInput, setTargetAvgInput] = useState("");
  const [targetRequested, setTargetRequested] = useState(false);
  const [markInput, setMarkInput] = useState(
    markPrice && markPrice > 0 ? (markPrice / 100).toFixed(2) : "",
  );

  useEffect(() => {
    if (initialQuantity > 0) setQuantityInput(String(initialQuantity));
  }, [initialQuantity]);

  useEffect(() => {
    if (initialAveragePrice > 0) {
      setAverageInput((initialAveragePrice / 100).toFixed(2));
    }
  }, [initialAveragePrice]);

  useEffect(() => {
    if (initialAddPrice > 0) {
      setAddPriceInput((initialAddPrice / 100).toFixed(2));
    }
  }, [initialAddPrice]);

  useEffect(() => {
    if (markPrice && markPrice > 0) {
      setMarkInput((markPrice / 100).toFixed(2));
    }
  }, [markPrice]);

  const quantity = Number(quantityInput);
  const averagePrice = dollarsToCents(averageInput);
  const addPrice = dollarsToCents(addPriceInput);
  const mark = dollarsToCents(markInput);

  const addQuantity = useMemo(() => {
    if (addMode === "quantity") {
      const qty = Number(addQuantityInput);
      return Number.isFinite(qty) && qty > 0 ? qty : Number.NaN;
    }
    const amount = dollarsToCents(addAmountInput);
    const fromAmount = quantityFromAddAmount(addPrice, amount);
    return fromAmount ?? Number.NaN;
  }, [addMode, addQuantityInput, addAmountInput, addPrice]);

  const result = useMemo(
    () =>
      simulateAveragingBuy({
        quantity,
        averagePrice,
        addPrice,
        addQuantity,
      }),
    [quantity, averagePrice, addPrice, addQuantity],
  );

  const targetAveragePrice = dollarsToCents(targetAvgInput);
  const targetNeedQty = useMemo(
    () =>
      quantityToReachTargetAverage({
        quantity,
        averagePrice,
        addPrice,
        targetAveragePrice,
      }),
    [quantity, averagePrice, addPrice, targetAveragePrice],
  );
  const targetNeedAmount = useMemo(
    () =>
      amountToReachTargetAverage({
        quantity,
        averagePrice,
        addPrice,
        targetAveragePrice,
      }),
    [quantity, averagePrice, addPrice, targetAveragePrice],
  );

  const targetMessage = useMemo(() => {
    if (!targetAvgInput) return "목표 평단을 입력해 주세요.";
    if (!Number.isFinite(quantity) || quantity <= 0) {
      return "상단의 보유 수량을 먼저 입력해 주세요.";
    }
    if (!Number.isFinite(averagePrice) || averagePrice <= 0) {
      return "상단의 현재 평단을 먼저 입력해 주세요.";
    }
    if (!Number.isFinite(addPrice) || addPrice <= 0) {
      return "상단의 추가 매수 단가를 먼저 입력해 주세요.";
    }
    if (!Number.isFinite(targetAveragePrice) || targetAveragePrice <= 0) {
      return "0보다 큰 목표 평단을 입력해 주세요.";
    }
    if (targetAveragePrice === averagePrice) {
      return "이미 현재 평단이 입력한 목표 평단과 같습니다.";
    }
    if (targetAveragePrice === addPrice) {
      return "추가 매수 단가와 같은 평단은 유한한 수량으로 도달할 수 없습니다.";
    }
    const lowerBound = Math.min(averagePrice, addPrice);
    const upperBound = Math.max(averagePrice, addPrice);
    if (targetAveragePrice <= lowerBound || targetAveragePrice >= upperBound) {
      return "목표 평단은 현재 평단과 추가 매수 단가 사이의 값이어야 합니다.";
    }
    return "입력값을 다시 확인해 주세요.";
  }, [targetAvgInput, quantity, averagePrice, addPrice, targetAveragePrice]);

  const previewPnl =
    result.ok && Number.isFinite(mark) && mark > 0
      ? (mark - result.newAveragePrice) * result.newQuantity
      : null;
  const previewPct =
    result.ok && Number.isFinite(mark) && mark > 0
      ? ((mark - result.newAveragePrice) / result.newAveragePrice) * 100
      : null;

  const modeLabel =
    result.ok && result.mode === "water"
      ? "물타기"
      : result.ok && result.mode === "fire"
        ? "불타기"
        : result.ok
          ? "평단 유지"
          : null;

  const fieldClass =
    "w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]";

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {stockLabel && (
        <p className="text-xs font-semibold text-[var(--muted)]">{stockLabel}</p>
      )}

      <div className={`grid gap-3 ${compact ? "grid-cols-1" : "sm:grid-cols-2"}`}>
        <Field label="보유 수량(주)">
          <input
            value={quantityInput}
            onChange={(event) => setQuantityInput(cleanDecimal(event.target.value))}
            inputMode="decimal"
            placeholder="예: 10"
            className={fieldClass}
          />
        </Field>
        <Field label="현재 평단($)">
          <input
            value={averageInput}
            onChange={(event) => setAverageInput(cleanDecimal(event.target.value))}
            inputMode="decimal"
            placeholder="예: 100.00"
            className={fieldClass}
          />
        </Field>
        <Field label="추가 매수 단가($)">
          <input
            value={addPriceInput}
            onChange={(event) => setAddPriceInput(cleanDecimal(event.target.value))}
            inputMode="decimal"
            placeholder="예: 80.00"
            className={fieldClass}
          />
        </Field>
        <Field label="현재가 미리보기($ · 선택)">
          <input
            value={markInput}
            onChange={(event) => setMarkInput(cleanDecimal(event.target.value))}
            inputMode="decimal"
            placeholder="미실현 손익용"
            className={fieldClass}
          />
        </Field>
      </div>

      <div className="flex gap-1 rounded-xl bg-[var(--surface)] p-1">
        <ModeButton
          active={addMode === "quantity"}
          onClick={() => setAddMode("quantity")}
          label="수량으로"
        />
        <ModeButton
          active={addMode === "amount"}
          onClick={() => setAddMode("amount")}
          label="금액으로"
        />
      </div>

      {addMode === "quantity" ? (
        <Field label="추가 매수 수량(주)">
          <input
            value={addQuantityInput}
            onChange={(event) =>
              setAddQuantityInput(cleanDecimal(event.target.value))
            }
            inputMode="decimal"
            placeholder="예: 10"
            className={fieldClass}
          />
        </Field>
      ) : (
        <Field label="추가 매수 금액($)">
          <input
            value={addAmountInput}
            onChange={(event) => setAddAmountInput(cleanDecimal(event.target.value))}
            inputMode="decimal"
            placeholder="예: 800.00"
            className={fieldClass}
          />
        </Field>
      )}

      {result.ok ? (
        <div
          className={`rounded-2xl border p-4 ${
            result.mode === "water"
              ? "border-sky-400/40 bg-sky-400/10"
              : result.mode === "fire"
                ? "border-orange-400/40 bg-orange-400/10"
                : "border-[var(--border)] bg-[var(--surface)]"
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-bold">
              {modeLabel} 결과
            </p>
            <span className="text-xs text-[var(--muted)]">
              추가 {formatQty(addQuantity)}주 · {formatPrice(result.addCost)}
            </span>
          </div>
          <div className={`mt-3 grid gap-2 ${compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4"}`}>
            <Stat label="새 평단" value={formatPrice(result.newAveragePrice)} />
            <Stat label="총 수량" value={`${formatQty(result.newQuantity)}주`} />
            <Stat label="총 원금" value={formatCompactMoney(result.totalCost)} />
            <Stat
              label="평단 변화"
              value={`${formatSignedMoney(result.averageDelta)} (${formatSignedPercent(result.averageDeltaPct)})`}
              tone={result.averageDelta}
            />
          </div>
          {previewPnl !== null && previewPct !== null && (
            <p className={`mt-3 text-xs ${upDownClass(previewPnl)}`}>
              현재가 기준 미실현 {formatSignedMoney(previewPnl)}{" "}
              {formatSignedPercent(previewPct)}
            </p>
          )}
        </div>
      ) : (
        <p className="rounded-xl border border-dashed border-[var(--border)] p-3 text-xs text-[var(--muted)]">
          보유 수량·평단·추가 매수 단가·수량을 입력하면 새 평단이 계산됩니다.
          {result.message ? ` (${result.message})` : ""}
        </p>
      )}

      <form
        className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
        onSubmit={(event) => {
          event.preventDefault();
          setTargetRequested(true);
        }}
      >
        <p className="text-sm font-bold">목표 평단 역산</p>
        <p className="mt-1 text-[11px] text-[var(--muted)]">
          지금 추가 매수 단가로 평단을 목표까지 낮추거나 높이려면 필요한 수량·금액입니다.
        </p>
        <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <Field label="목표 평단($)">
            <input
              value={targetAvgInput}
              onChange={(event) => {
                setTargetAvgInput(cleanDecimal(event.target.value));
                setTargetRequested(false);
              }}
              inputMode="decimal"
              enterKeyHint="done"
              placeholder="예: 90.00"
              className={fieldClass}
            />
          </Field>
          <button
            type="submit"
            className="min-h-10 rounded-xl bg-[var(--accent)] px-4 py-2.5 text-sm font-bold text-white transition active:scale-[0.98]"
          >
            목표 평단 계산
          </button>
        </div>
        {targetNeedQty !== null && targetNeedAmount !== null ? (
          <div
            className="mt-3 grid grid-cols-2 gap-2"
            role="status"
            aria-live="polite"
          >
            <Stat label="필요 수량" value={`${formatQty(targetNeedQty)}주`} />
            <Stat label="필요 금액" value={formatPrice(targetNeedAmount)} />
          </div>
        ) : (
          <p
            className={`mt-3 text-xs ${targetRequested ? "text-amber-400" : "text-[var(--muted)]"}`}
            role="status"
            aria-live="polite"
          >
            {targetMessage}
          </p>
        )}
      </form>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-semibold text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function ModeButton({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
        active
          ? "bg-[var(--accent)] text-white"
          : "text-[var(--muted)] hover:text-[var(--foreground)]"
      }`}
    >
      {label}
    </button>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: number;
}) {
  return (
    <div className="rounded-xl bg-[var(--background)]/70 px-3 py-2">
      <p className="text-[10px] text-[var(--muted)]">{label}</p>
      <p
        className={`mt-0.5 truncate text-sm font-bold tabular-nums ${
          tone === undefined ? "" : upDownClass(tone)
        }`}
        title={value}
      >
        {value}
      </p>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import {
  OPTIONS_TUTORIAL_STEPS,
  ZERO_DTE_TUTORIAL_STEPS,
} from "@/data/featureTutorials";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";
import type { StockState } from "@/lib/types/market";
import { formatPrice } from "@/lib/market/engine";
import { upDownClass } from "@/lib/ui/marketColors";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { getAnnualRatePercent } from "@/lib/market/interestRate";
import { toastResult } from "@/store/toastStore";
import { playResultSound } from "@/lib/ui/sound";
import {
  listExpiriesWithZeroDte,
  isZeroDteExpiry,
  listStrikes,
  optionPremium,
  positionMark,
  optionLabel,
} from "@/lib/market/options";

/** 0DTE 남은 시간을 사람이 읽는 문자열로 (분 단위). */
function zeroDteRemainingLabel(now: number): string {
  const remainingMs = SESSION_DURATION_MS - (now % SESSION_DURATION_MS);
  const mins = Math.max(0, Math.floor(remainingMs / 60000));
  return mins >= 1 ? `약 ${mins}분 남음` : "곧 마감";
}

function cleanIntegerInput(value: string): string {
  return value.replace(/\D/g, "");
}

function formatContractQuantity(quantity: number): string {
  return quantity.toLocaleString("ko-KR", { maximumFractionDigits: 0 });
}

export function OptionsPanel({ stock }: { stock: StockState }) {
  const [mounted, setMounted] = useState(false);
  const onboarded = useSettingsStore((s) => s.onboarded);
  const tutorialSeen = useSettingsStore((s) => s.optionsTutorialSeen);
  const setTutorialSeen = useSettingsStore((s) => s.setOptionsTutorialSeen);
  const zeroDteTutorialSeen = useSettingsStore((s) => s.zeroDteTutorialSeen);
  const setZeroDteTutorialSeen = useSettingsStore(
    (s) => s.setZeroDteTutorialSeen,
  );
  // 수동 다시 보기: null | "options" | "zerodte"
  const [manualTutorial, setManualTutorial] = useState<
    "options" | "zerodte" | null
  >(null);
  useEffect(() => setMounted(true), []);
  const live = useMarketStore((s) => s.getStockById(stock.id)) ?? stock;
  const stocks = useMarketStore((s) => s.stocks);
  const allOptions = useMarketStore((s) => s.options);
  const positions = useMemo(
    () => allOptions.filter((o) => o.stockId === stock.id),
    [allOptions, stock.id],
  );
  const buyOption = useMarketStore((s) => s.buyOption);
  const writeOption = useMarketStore((s) => s.writeOption);
  const closeOption = useMarketStore((s) => s.closeOption);
  const getRateLevel = useMarketStore((s) => s.getRateLevel);

  // 입력 중에는 문자열을 그대로 유지한다. number 상태로 왕복시키면 1e21 이상에서
  // 브라우저가 지수 표기로 바꾸고, 다음 숫자 입력 때 값이 훼손된다.
  const [quantityInput, setQuantityInput] = useState("1");
  const [msg, setMsg] = useState<string | null>(null);

  const quantity = Number(quantityInput);
  const validQuantity =
    quantityInput.length > 0 &&
    Number.isFinite(quantity) &&
    Number.isInteger(quantity) &&
    quantity >= 1;

  const now = Date.now();
  const session = Math.floor(now / SESSION_DURATION_MS);
  // 옵션 가격/마크는 장중 잔존만기(소수 거래일)로 평가 — 0DTE 세타를 실시간 반영.
  const sessionExact = now / SESSION_DURATION_MS;
  const rate = getAnnualRatePercent(getRateLevel()) / 100;
  const expiries = useMemo(() => listExpiriesWithZeroDte(session), [session]);
  const [expiry, setExpiry] = useState(expiries[0]);
  const activeExpiry = expiries.includes(expiry) ? expiry : expiries[0];
  const activeIsZeroDte = isZeroDteExpiry(activeExpiry, session);
  const strikes = useMemo(
    () => listStrikes(live.currentPrice),
    [live.currentPrice],
  );

  function act(fn: () => { success: boolean; message: string }) {
    const r = fn();
    setMsg(r.message);
    toastResult(r);
    playResultSound(r, "buy");
  }

  function actWithQuantity(
    fn: (orderQuantity: number) => { success: boolean; message: string },
  ) {
    if (!validQuantity) {
      act(() => ({
        success: false,
        message: "수량은 1 이상의 정수로 입력해 주세요.",
      }));
      return;
    }
    act(() => fn(quantity));
  }

  const daysToExpiry = activeExpiry - session;

  // 표시할 튜토리얼 결정: 수동 > 옵션 최초 > 0DTE 최초.
  const activeTutorial: "options" | "zerodte" | null = manualTutorial
    ? manualTutorial
    : mounted && onboarded && !tutorialSeen
      ? "options"
      : mounted && onboarded && tutorialSeen && activeIsZeroDte && !zeroDteTutorialSeen
        ? "zerodte"
        : null;

  function finishTutorial() {
    if (manualTutorial) {
      setManualTutorial(null);
      return;
    }
    if (activeTutorial === "options") setTutorialSeen(true);
    else if (activeTutorial === "zerodte") setZeroDteTutorialSeen(true);
  }

  return (
    <div className="max-w-2xl space-y-4">
      {activeTutorial && (
        <FeatureTutorialModal
          key={activeTutorial}
          steps={
            activeTutorial === "zerodte"
              ? ZERO_DTE_TUTORIAL_STEPS
              : OPTIONS_TUTORIAL_STEPS
          }
          onFinish={finishTutorial}
        />
      )}
      <div className="rounded-2xl bg-[var(--surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm leading-relaxed text-[var(--muted)]">
            유럽식 현금정산 옵션(1계약 = 1주). 매수는 프리미엄만큼 손실이
            한정되고, 발행은 프리미엄을 받되 증거금과 큰 손실 위험이 있습니다.
            프리미엄은 변동성·금리·잔존만기로 산정됩니다.
          </p>
          <button
            type="button"
            onClick={() => setManualTutorial("options")}
            className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ⓘ 안내
          </button>
        </div>
      </div>

      {/* 만기·수량 */}
      <div className="flex flex-wrap items-center gap-2">
        {expiries.map((e) => {
          const zd = isZeroDteExpiry(e, session);
          return (
            <button
              key={e}
              onClick={() => setExpiry(e)}
              className={`rounded-lg px-3 py-1.5 text-xs transition ${
                e === activeExpiry
                  ? "bg-[var(--accent)] text-white"
                  : zd
                    ? "bg-[var(--down)]/15 text-[var(--down)]"
                    : "bg-[var(--surface)] text-[var(--muted)]"
              }`}
            >
              {zd ? "⚡ 0DTE (오늘 마감)" : `만기 ${e - session}거래일 후`}
            </button>
          );
        })}
        <div className="ml-auto min-w-[12rem] flex-1 sm:max-w-[17rem]">
          <label
            htmlFor="option-order-quantity"
            className="mb-1 block text-xs text-[var(--muted)]"
          >
            주문 수량
          </label>
          <input
            id="option-order-quantity"
            inputMode="numeric"
            autoComplete="off"
            aria-invalid={!validQuantity}
            value={quantityInput}
            onChange={(event) =>
              setQuantityInput(cleanIntegerInput(event.target.value))
            }
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-right text-sm tabular-nums outline-none focus:border-[var(--accent)]"
          />
          <p className="mt-1 text-right text-[10px] text-[var(--muted)]">
            숫자를 그대로 이어서 입력할 수 있습니다
          </p>
        </div>
      </div>

      {/* 0DTE 경고 */}
      {activeIsZeroDte && (
        <div className="flex items-start justify-between gap-3 rounded-2xl border border-[var(--down)]/40 bg-[var(--down)]/10 p-3">
          <p className="text-xs leading-relaxed text-[var(--down)]">
            ⚡ <b>제로데이(0DTE)</b> — 오늘 거래일 마감({zeroDteRemainingLabel(now)})에
            자동 정산됩니다. 시간가치가 매우 빠르게 소멸하고 현재가 근처에서 손익이
            급변하는 초고위험 상품입니다. 잃어도 되는 소액만 쓰세요.
          </p>
          <button
            type="button"
            onClick={() => setManualTutorial("zerodte")}
            className="shrink-0 rounded-lg border border-[var(--down)]/40 px-2 py-1 text-[11px] font-semibold text-[var(--down)]"
          >
            0DTE란?
          </button>
        </div>
      )}

      {/* 옵션 체인 */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        <div className="grid grid-cols-[1fr_auto] items-center border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[11px] text-[var(--muted)]">
          <span>
            행사가 ·{" "}
            {activeIsZeroDte
              ? `0DTE · ${zeroDteRemainingLabel(now)}`
              : `잔존 ${daysToExpiry}거래일`}
          </span>
          <span>콜 / 풋 프리미엄 · 매수/발행</span>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {strikes.map((strike) => {
            const call = optionPremium(
              "call",
              strike,
              activeExpiry,
              live,
              sessionExact,
              rate,
            );
            const put = optionPremium(
              "put",
              strike,
              activeExpiry,
              live,
              sessionExact,
              rate,
            );
            const atm = Math.abs(strike - live.currentPrice) < live.currentPrice * 0.001;
            return (
              <li
                key={strike}
                className={`px-4 py-3 ${atm ? "bg-[var(--accent)]/5" : ""}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-semibold tabular-nums">
                    {formatPrice(strike)}
                  </span>
                  {atm && (
                    <span className="rounded bg-[var(--accent)]/15 px-1.5 py-0.5 text-[10px] text-[var(--accent)]">
                      ATM
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <ChainCell
                    label="콜"
                    premium={call}
                    onBuy={() =>
                      actWithQuantity((orderQuantity) =>
                        buyOption(stock.id, "call", strike, activeExpiry, orderQuantity),
                      )
                    }
                    onWrite={() =>
                      actWithQuantity((orderQuantity) =>
                        writeOption(stock.id, "call", strike, activeExpiry, orderQuantity),
                      )
                    }
                  />
                  <ChainCell
                    label="풋"
                    premium={put}
                    onBuy={() =>
                      actWithQuantity((orderQuantity) =>
                        buyOption(stock.id, "put", strike, activeExpiry, orderQuantity),
                      )
                    }
                    onWrite={() =>
                      actWithQuantity((orderQuantity) =>
                        writeOption(stock.id, "put", strike, activeExpiry, orderQuantity),
                      )
                    }
                  />
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {msg && (
        <p className="text-center text-xs text-[var(--muted)]">{msg}</p>
      )}

      {/* 보유 옵션 포지션 */}
      {positions.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)]">
          <h3 className="border-b border-[var(--border)] px-4 py-2.5 text-sm font-semibold">
            보유 옵션
          </h3>
          <ul className="divide-y divide-[var(--border)]">
            {positions.map((pos) => {
              const mark = positionMark(pos, live, sessionExact, rate, stocks);
              const value =
                (pos.side === "long" ? mark : -mark) * pos.quantity;
              const posZeroDte = isZeroDteExpiry(pos.expirySession, session);
              return (
                <li
                  key={pos.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {optionLabel(pos.kind, pos.side)} · {formatPrice(pos.strike)}
                      {posZeroDte && (
                        <span className="ml-1.5 rounded bg-[var(--down)]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[var(--down)]">
                          ⚡ 0DTE
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {formatContractQuantity(pos.quantity)}계약 ·{" "}
                      {posZeroDte
                        ? "오늘 마감"
                        : `만기 ${pos.expirySession - session}거래일 후`}{" "}
                      · 진입 {formatPrice(pos.openPremium)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className={`tabular-nums ${upDownClass(value)}`}>
                      {formatPrice(mark)}
                    </p>
                  </div>
                  <button
                    onClick={() => act(() => closeOption(pos.id, pos.quantity))}
                    className="shrink-0 rounded-lg bg-[var(--surface)] px-3 py-1.5 text-xs hover:text-[var(--foreground)]"
                  >
                    청산
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

function ChainCell({
  label,
  premium,
  onBuy,
  onWrite,
}: {
  label: string;
  premium: number;
  onBuy: () => void;
  onWrite: () => void;
}) {
  return (
    <div className="rounded-xl bg-[var(--surface)] p-2">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[11px] text-[var(--muted)]">{label}</span>
        <span className="text-xs font-semibold tabular-nums">
          {formatPrice(premium)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1">
        <button
          onClick={onBuy}
          className="rounded-lg bg-[var(--up)]/15 py-1.5 text-[11px] font-semibold text-[var(--up)] hover:bg-[var(--up)]/25"
        >
          매수
        </button>
        <button
          onClick={onWrite}
          className="rounded-lg bg-[var(--down)]/15 py-1.5 text-[11px] font-semibold text-[var(--down)] hover:bg-[var(--down)]/25"
        >
          발행
        </button>
      </div>
    </div>
  );
}

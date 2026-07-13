"use client";

import { useMemo, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import type { StockState } from "@/lib/types/market";
import { formatPrice } from "@/lib/market/engine";
import { upDownClass } from "@/lib/ui/marketColors";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { getAnnualRatePercent } from "@/lib/market/interestRate";
import { toastResult } from "@/store/toastStore";
import { playResultSound } from "@/lib/ui/sound";
import {
  listExpiries,
  listStrikes,
  optionPremium,
  positionMark,
  optionLabel,
} from "@/lib/market/options";

export function OptionsPanel({ stock }: { stock: StockState }) {
  const live = useMarketStore((s) => s.getStockById(stock.id)) ?? stock;
  const allOptions = useMarketStore((s) => s.options);
  const positions = useMemo(
    () => allOptions.filter((o) => o.stockId === stock.id),
    [allOptions, stock.id],
  );
  const buyOption = useMarketStore((s) => s.buyOption);
  const writeOption = useMarketStore((s) => s.writeOption);
  const closeOption = useMarketStore((s) => s.closeOption);
  const getRateLevel = useMarketStore((s) => s.getRateLevel);

  const [qty, setQty] = useState(1);
  const [msg, setMsg] = useState<string | null>(null);

  const session = Math.floor(Date.now() / SESSION_DURATION_MS);
  const rate = getAnnualRatePercent(getRateLevel()) / 100;
  const expiries = useMemo(() => listExpiries(session), [session]);
  const [expiry, setExpiry] = useState(expiries[0]);
  const activeExpiry = expiries.includes(expiry) ? expiry : expiries[0];
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

  const daysToExpiry = activeExpiry - session;

  return (
    <div className="max-w-2xl space-y-4">
      <div className="rounded-2xl bg-[var(--surface)] p-4">
        <p className="text-sm leading-relaxed text-[var(--muted)]">
          유럽식 현금정산 옵션(1계약 = 1주). 매수는 프리미엄만큼 손실이
          한정되고, 발행은 프리미엄을 받되 증거금과 큰 손실 위험이 있습니다.
          프리미엄은 변동성·금리·잔존만기로 산정됩니다.
        </p>
      </div>

      {/* 만기·수량 */}
      <div className="flex flex-wrap items-center gap-2">
        {expiries.map((e) => (
          <button
            key={e}
            onClick={() => setExpiry(e)}
            className={`rounded-lg px-3 py-1.5 text-xs transition ${
              e === activeExpiry
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--muted)]"
            }`}
          >
            만기 {e - session}거래일 후
          </button>
        ))}
        <div className="ml-auto flex items-center gap-1.5">
          <span className="text-xs text-[var(--muted)]">수량</span>
          <input
            inputMode="numeric"
            value={qty}
            onChange={(e) =>
              setQty(Math.max(1, parseInt(e.target.value.replace(/\D/g, "")) || 1))
            }
            className="w-16 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-right text-sm tabular-nums outline-none"
          />
        </div>
      </div>

      {/* 옵션 체인 */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
        <div className="grid grid-cols-[1fr_auto] items-center border-b border-[var(--border)] bg-[var(--surface)] px-4 py-2 text-[11px] text-[var(--muted)]">
          <span>행사가 · 잔존 {daysToExpiry}거래일</span>
          <span>콜 / 풋 프리미엄 · 매수/발행</span>
        </div>
        <ul className="divide-y divide-[var(--border)]">
          {strikes.map((strike) => {
            const call = optionPremium(
              "call",
              strike,
              activeExpiry,
              live,
              session,
              rate,
            );
            const put = optionPremium(
              "put",
              strike,
              activeExpiry,
              live,
              session,
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
                      act(() => buyOption(stock.id, "call", strike, activeExpiry, qty))
                    }
                    onWrite={() =>
                      act(() => writeOption(stock.id, "call", strike, activeExpiry, qty))
                    }
                  />
                  <ChainCell
                    label="풋"
                    premium={put}
                    onBuy={() =>
                      act(() => buyOption(stock.id, "put", strike, activeExpiry, qty))
                    }
                    onWrite={() =>
                      act(() => writeOption(stock.id, "put", strike, activeExpiry, qty))
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
              const mark = positionMark(pos, live, session, rate);
              const value =
                (pos.side === "long" ? mark : -mark) * pos.quantity;
              return (
                <li
                  key={pos.id}
                  className="flex items-center gap-3 px-4 py-3 text-sm"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {optionLabel(pos.kind, pos.side)} · {formatPrice(pos.strike)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      {pos.quantity}계약 · 만기 {pos.expirySession - session}
                      거래일 후 · 진입 {formatPrice(pos.openPremium)}
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

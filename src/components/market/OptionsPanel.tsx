"use client";

import { useEffect, useMemo, useState } from "react";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
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
  listExpiries,
  listStrikes,
  optionPremium,
  positionMark,
  optionLabel,
} from "@/lib/market/options";

const OPTIONS_TUTORIAL_STEPS = [
  {
    emoji: "↗️",
    title: "콜은 상승, 풋은 하락",
    body: "콜옵션은 기초 주가가 행사가보다 높아질수록, 풋옵션은 낮아질수록 유리합니다. 이 게임의 1계약은 기초자산 1주입니다.",
  },
  {
    emoji: "🎟️",
    title: "매수자는 프리미엄을 냅니다",
    body: "옵션 매수의 최대 손실은 처음 낸 프리미엄입니다. 방향이 맞아도 만기까지 움직임이 부족하면 프리미엄이 줄어들 수 있습니다.",
  },
  {
    emoji: "⚠️",
    title: "발행은 훨씬 위험합니다",
    body: "옵션 발행은 프리미엄을 먼저 받지만 큰 손실과 증거금 부담이 생깁니다. 유지증거금이 부족하면 다른 포지션과 함께 강제 청산될 수 있습니다.",
  },
  {
    emoji: "⏳",
    title: "만기에는 현금으로 정산",
    body: "유럽식 옵션이라 만기 전에는 행사하지 않고 거래로 청산합니다. 만기일에는 기초 주가와 행사가의 차이를 기준으로 자동 현금 정산됩니다.",
  },
];

export function OptionsPanel({ stock }: { stock: StockState }) {
  const [mounted, setMounted] = useState(false);
  const onboarded = useSettingsStore((s) => s.onboarded);
  const tutorialSeen = useSettingsStore((s) => s.optionsTutorialSeen);
  const setTutorialSeen = useSettingsStore((s) => s.setOptionsTutorialSeen);
  useEffect(() => setMounted(true), []);
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
      {mounted && onboarded && !tutorialSeen && (
        <FeatureTutorialModal
          steps={OPTIONS_TUTORIAL_STEPS}
          onFinish={() => setTutorialSeen(true)}
        />
      )}
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

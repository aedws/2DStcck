"use client";

import { useState } from "react";
import { formatPrice } from "@/lib/market/engine";
import {
  LOTTERY_MAX_PER_WINDOW,
  LOTTERY_TICKET_PRICE,
  type LotteryPrize,
} from "@/lib/market/lottery";
import { useMarketStore } from "@/store/marketStore";

const TIER_STYLE: Record<string, string> = {
  lose: "text-[var(--muted)]",
  refund: "text-sky-400",
  small: "text-emerald-400",
  mid: "text-emerald-400",
  big: "text-amber-400",
  jackpot: "text-amber-300",
};

export default function LotteryPage() {
  const cash = useMarketStore((s) => s.cash);
  const buyLottery = useMarketStore((s) => s.buyLottery);
  const getLotteryTicketsLeft = useMarketStore((s) => s.getLotteryTicketsLeft);
  const saveCloud = useMarketStore((s) => s.saveCloud);
  const [last, setLast] = useState<LotteryPrize | null>(null);
  const [popKey, setPopKey] = useState(0);

  const left = getLotteryTicketsLeft();
  const canBuy = left > 0 && cash >= LOTTERY_TICKET_PRICE;

  function draw() {
    const r = buyLottery();
    if (r.prize) {
      setLast(r.prize);
      setPopKey((k) => k + 1);
      void saveCloud();
    } else if (!r.success) {
      setLast({ amount: 0, tier: "lose", label: r.message });
      setPopKey((k) => k + 1);
    }
  }

  return (
    <div className="mx-auto max-w-md pb-20">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">🎟️ 복권</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          5거래일마다 최대 {LOTTERY_MAX_PER_WINDOW}장. 사면 바로 결과가
          나옵니다. 잭팟 $500,000!
        </p>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-gradient-to-b from-[var(--surface)] to-[var(--background)] p-6 text-center">
        <div
          key={popKey}
          className={`toast-in mx-auto flex h-40 w-full max-w-xs flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] ${
            last ? "" : "text-[var(--muted)]"
          }`}
        >
          {last ? (
            <>
              <span className="text-4xl">
                {last.tier === "jackpot"
                  ? "🎊"
                  : last.tier === "lose"
                    ? "🙈"
                    : "🎉"}
              </span>
              <span
                className={`mt-2 text-2xl font-bold ${TIER_STYLE[last.tier] ?? ""}`}
              >
                {last.label}
              </span>
              {last.tier !== "lose" && (
                <span className="mt-1 text-xs text-[var(--muted)]">당첨!</span>
              )}
            </>
          ) : (
            <span className="text-sm">복권을 긁어보세요</span>
          )}
        </div>

        <div className="mt-5 flex items-center justify-center gap-4 text-sm">
          <span className="text-[var(--muted)]">
            남은 티켓{" "}
            <span className="font-semibold text-[var(--foreground)]">
              {left}
            </span>
            /{LOTTERY_MAX_PER_WINDOW}
          </span>
          <span className="text-[var(--muted)]">
            장당 {formatPrice(LOTTERY_TICKET_PRICE)}
          </span>
        </div>

        <button
          onClick={draw}
          disabled={!canBuy}
          className="mt-4 w-full rounded-2xl bg-[var(--accent)] py-4 text-base font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
        >
          {left <= 0
            ? "이번 회차 소진 — 다음 회차를 기다리세요"
            : cash < LOTTERY_TICKET_PRICE
              ? "현금 부족"
              : `복권 구매 (${formatPrice(LOTTERY_TICKET_PRICE)})`}
        </button>
        <p className="mt-3 text-xs text-[var(--muted)]">
          보유 현금 {formatPrice(cash)}
        </p>
      </div>

      <p className="mt-4 text-center text-[11px] leading-relaxed text-[var(--muted)]">
        기대값은 티켓가보다 낮습니다. 재미로 즐기고, 자산은 투자로 키우세요.
      </p>
    </div>
  );
}

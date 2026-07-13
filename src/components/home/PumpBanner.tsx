"use client";

import { useMarketStore } from "@/store/marketStore";
import type { StockState } from "@/lib/types/market";
import { formatPrice, getChangePercent } from "@/lib/market/engine";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";
import { toastResult } from "@/store/toastStore";
import { playResultSound } from "@/lib/ui/sound";

/** 활성 급등주 인라인 매매 배너 (정적 상세 페이지가 없어 홈에서 바로 거래) */
export function PumpBanner({ pumps }: { pumps: StockState[] }) {
  const buyMarket = useMarketStore((s) => s.buyMarket);
  const sellMarket = useMarketStore((s) => s.sellMarket);
  const holdings = useMarketStore((s) => s.holdings);

  if (pumps.length === 0) return null;

  return (
    <div className="mx-3 mt-3 space-y-2 md:mx-5">
      {pumps.map((stock) => {
        const held = holdings.find((h) => h.stockId === stock.id);
        const change = getChangePercent(stock.currentPrice, stock.initialPrice);
        function trade(kind: "buy" | "sell") {
          const r =
            kind === "buy"
              ? buyMarket(stock.id, 1)
              : sellMarket(stock.id, 1);
          toastResult(r);
          playResultSound(r, kind);
        }
        return (
          <div
            key={stock.id}
            className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3"
          >
            <span className="text-2xl" aria-hidden>
              🚀
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-semibold">
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] text-amber-500">
                  급등주 · 2거래일 내 상장폐지
                </span>
                <span className="truncate">
                  {stock.name}{" "}
                  <span className="text-xs text-[var(--muted)]">
                    {stock.ticker}
                  </span>
                </span>
              </p>
              <p className="mt-0.5 flex items-baseline gap-2">
                <span className="text-lg font-bold tabular-nums">
                  {formatPrice(stock.currentPrice)}
                </span>
                <span className={`text-xs tabular-nums ${upDownClass(change)}`}>
                  상장가 대비 {formatSignedPercent(change)}
                </span>
                {held && (
                  <span className="text-xs text-[var(--muted)]">
                    · 보유 {held.quantity.toLocaleString("ko-KR", {
                      maximumFractionDigits: 6,
                    })}주
                  </span>
                )}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => trade("buy")}
                className="rounded-xl bg-[var(--up)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              >
                매수
              </button>
              <button
                onClick={() => trade("sell")}
                disabled={!held || held.quantity < 1}
                className="rounded-xl bg-[var(--down)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                매도
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

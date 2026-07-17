"use client";

import Link from "next/link";
import { useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import type { StockState } from "@/lib/types/market";
import {
  formatPrice,
  getChangePercent,
  getMarketBuyPrice,
} from "@/lib/market/engine";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";
import { toastResult } from "@/store/toastStore";
import { playResultSound } from "@/lib/ui/sound";

type QtyMode = 1 | 10 | 100 | "all";
const QTY_MODES: QtyMode[] = [1, 10, 100, "all"];
const modeLabel = (m: QtyMode) => (m === "all" ? "전체" : String(m));

/** 활성 급등주 인라인 매매 배너 (정적 상세 페이지가 없어 홈에서 바로 거래) */
export function PumpBanner({ pumps }: { pumps: StockState[] }) {
  if (pumps.length === 0) return null;
  return (
    <div className="mx-3 mt-3 space-y-2 md:mx-5">
      {pumps.map((stock) => (
        <PumpRow key={stock.id} stock={stock} />
      ))}
    </div>
  );
}

function PumpRow({ stock }: { stock: StockState }) {
  const buyMarket = useMarketStore((s) => s.buyMarket);
  const sellMarket = useMarketStore((s) => s.sellMarket);
  const getBuyingPower = useMarketStore((s) => s.getBuyingPower);
  const held =
    useMarketStore((s) => s.holdings.find((h) => h.stockId === stock.id))
      ?.quantity ?? 0;
  const [mode, setMode] = useState<QtyMode>(1);
  const change = getChangePercent(stock.currentPrice, stock.initialPrice);

  function quantityFor(kind: "buy" | "sell"): number {
    if (mode !== "all") return mode;
    if (kind === "sell") return held;
    const ask = getMarketBuyPrice(stock.currentPrice);
    return ask > 0 ? Math.floor(getBuyingPower() / ask) : 0;
  }

  function trade(kind: "buy" | "sell") {
    const quantity = quantityFor(kind);
    if (quantity < 1) {
      toastResult({
        success: false,
        message: kind === "buy" ? "매수여력이 부족합니다." : "보유 수량이 없습니다.",
      });
      return;
    }
    const result =
      kind === "buy"
        ? buyMarket(stock.id, quantity)
        : sellMarket(stock.id, quantity);
    toastResult(result);
    playResultSound(result, kind);
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-3">
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
            <span className="text-xs text-[var(--muted)]">{stock.ticker}</span>
          </span>
        </p>
        <p className="mt-0.5 flex items-baseline gap-2">
          <span className="text-lg font-bold tabular-nums">
            {formatPrice(stock.currentPrice)}
          </span>
          <span className={`text-xs tabular-nums ${upDownClass(change)}`}>
            상장가 대비 {formatSignedPercent(change)}
          </span>
          {held > 0 && (
            <span className="text-xs text-[var(--muted)]">
              · 보유 {held.toLocaleString("ko-KR", { maximumFractionDigits: 6 })}주
            </span>
          )}
        </p>
        <Link
          href="/pump"
          className="mt-1 inline-block text-xs font-semibold text-amber-500 hover:underline"
        >
          📊 차트·정밀주문 (지정가·공매도) →
        </Link>
      </div>

      <div className="flex flex-col items-stretch gap-2">
        <div className="flex justify-end gap-1">
          {QTY_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`min-w-11 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition ${
                mode === m
                  ? "bg-amber-500 text-black"
                  : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {modeLabel(m)}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => trade("buy")}
            className="flex-1 rounded-xl bg-[var(--up)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {modeLabel(mode)} 매수
          </button>
          <button
            onClick={() => trade("sell")}
            disabled={held < 1}
            className="flex-1 rounded-xl bg-[var(--down)] px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {modeLabel(mode)} 매도
          </button>
        </div>
      </div>
    </div>
  );
}

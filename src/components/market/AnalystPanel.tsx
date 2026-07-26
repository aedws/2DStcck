"use client";

import { useMemo } from "react";
import { formatPrice } from "@/lib/market/engine";
import {
  computeAnalystRating,
  type AnalystOpinion,
} from "@/lib/market/analystRating";
import type { StockState } from "@/lib/types/market";

const SEGMENTS: { opinion: AnalystOpinion; label: string; color: string }[] = [
  { opinion: "strong_sell", label: "강력매도", color: "bg-rose-500" },
  { opinion: "sell", label: "매도", color: "bg-orange-400" },
  { opinion: "hold", label: "중립", color: "bg-slate-400" },
  { opinion: "buy", label: "매수", color: "bg-emerald-400" },
  { opinion: "strong_buy", label: "강력매수", color: "bg-emerald-500" },
];

/**
 * 애널리스트 리포트 카드 — 목표주가·투자의견(강력매도~강력매수 막대)·근거를 보여준다.
 * 시세와 별개로 적정가치 대비 위치를 제시해 중장기 판단을 돕는다.
 */
export function AnalystPanel({ stock }: { stock: StockState }) {
  const rating = useMemo(() => computeAnalystRating(stock), [stock]);
  if (!rating) return null;
  const upsidePct = rating.upside * 100;
  const upColor =
    rating.upside > 0.02
      ? "text-emerald-400"
      : rating.upside < -0.02
        ? "text-rose-400"
        : "text-[var(--muted)]";

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-bold">📊 애널리스트 리포트</h3>
        <span className="text-[10px] text-[var(--muted)]">
          적정가치 {formatPrice(rating.fairValue)}
        </span>
      </div>

      {/* 투자의견 막대 (강력매도 ~ 강력매수) */}
      <div className="mt-3 flex gap-1">
        {SEGMENTS.map((seg, index) => {
          const active = index === rating.score;
          return (
            <div key={seg.opinion} className="flex-1 text-center">
              <div
                className={`h-2 rounded-full ${active ? seg.color : "bg-[var(--background)]"}`}
              />
              <p
                className={`mt-1 text-[9px] ${active ? "font-bold text-[var(--foreground)]" : "text-[var(--muted)]"}`}
              >
                {seg.label}
              </p>
            </div>
          );
        })}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-[var(--background)]/50 p-2.5">
          <p className="text-[10px] text-[var(--muted)]">투자의견</p>
          <p className="mt-0.5 text-base font-bold">{rating.label}</p>
        </div>
        <div className="rounded-xl bg-[var(--background)]/50 p-2.5">
          <p className="text-[10px] text-[var(--muted)]">목표주가 · 상승여력</p>
          <p className="mt-0.5 text-sm font-bold tabular-nums">
            {formatPrice(rating.targetPrice)}{" "}
            <span className={`text-xs ${upColor}`}>
              ({upsidePct >= 0 ? "+" : ""}
              {upsidePct.toFixed(1)}%)
            </span>
          </p>
        </div>
      </div>

      {rating.reasons.length > 0 && (
        <ul className="mt-3 space-y-1.5">
          {rating.reasons.map((reason, index) => (
            <li
              key={index}
              className="flex gap-1.5 text-[11px] leading-relaxed text-[var(--muted)]"
            >
              <span className="text-[var(--accent)]">•</span>
              <span>{reason}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-[9px] leading-relaxed text-[var(--muted)]">
        적정가치·목표주가는 종목의 장기 성장 경로를 기준으로 산정한 추정치이며 투자
        권유가 아닙니다.
      </p>
    </section>
  );
}

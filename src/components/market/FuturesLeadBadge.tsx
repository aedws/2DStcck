"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import type { StockState } from "@/lib/types/market";

/** 선물이 지수를 선행하는 시간(엔진의 FUTURES_LEAD_MS와 동일). */
const LEAD_MS = 90_000;
/** 모멘텀 측정 창 — 선물 최근 60초 기울기. */
const WINDOW_MS = 60_000;
/** 이 절댓값 미만이면 방향 없음(중립)으로 본다. */
const DEADBAND = 0.001;

function futuresMomentum(futures: StockState): number | null {
  const history = futures.priceHistory;
  if (!history || history.length < 2) return null;
  const last = history[history.length - 1];
  const target = last.timestamp - WINDOW_MS;
  // target 시각에 가장 가까운(그 이전 포함) 과거 점을 찾는다.
  let past = history[0];
  for (let i = history.length - 1; i >= 0; i--) {
    if (history[i].timestamp <= target) {
      past = history[i];
      break;
    }
  }
  if (past.price <= 0) return null;
  return (last.price - past.price) / past.price;
}

/**
 * 선물 선행 신호 — 지수 선물이 시장을 약 90초 앞서 움직인다는 이 게임의 기제를
 * 스켈핑 보조로 노출한다. 선물의 최근 60초 모멘텀으로 시장 공통 방향의 힌트를
 * 준다(개별 종목엔 베타만큼 전달). 실제 유동성이 아니라 방향 신호다.
 */
export function FuturesLeadBadge() {
  const stocks = useMarketStore((s) => s.stocks);
  useMarketStore((s) => s.tick); // 틱마다 갱신
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const futures = useMemo(
    () => stocks.find((s) => s.sector === "선물"),
    [stocks],
  );
  const momentum = useMemo(
    () => (futures ? futuresMomentum(futures) : null),
    [futures],
  );

  if (!mounted || !futures || momentum === null) return null;

  const rising = momentum > DEADBAND;
  const falling = momentum < -DEADBAND;
  const arrow = rising ? "▲" : falling ? "▼" : "─";
  const label = rising ? "상승 우세" : falling ? "하락 우세" : "방향 중립";
  const tone = rising
    ? "border-[var(--up)]/40 bg-[var(--up)]/10 text-[var(--up)]"
    : falling
      ? "border-[var(--down)]/40 bg-[var(--down)]/10 text-[var(--down)]"
      : "border-[var(--border)] bg-[var(--surface)] text-[var(--muted)]";

  return (
    <div
      className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs ${tone}`}
    >
      <span className="text-sm">🔮</span>
      <span className="font-bold">
        선물 {arrow} {label}
      </span>
      <span className="font-mono tabular-nums opacity-80">
        {(momentum * 100).toFixed(2)}%
      </span>
      <span className="ml-auto text-[10px] text-[var(--muted)]">
        지수 90초 선행 · 60초 모멘텀
      </span>
    </div>
  );
}

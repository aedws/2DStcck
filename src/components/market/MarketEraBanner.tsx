"use client";

import { useEffect, useState } from "react";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  getMarketEra,
  MARKET_ERA_SESSIONS,
  MARKET_ERA_START_SESSION,
} from "@/lib/market/marketEras";
import { useMarketStore } from "@/store/marketStore";

/**
 * 이번 시장 국면(에라) 배너. 국면 진행 중이면 이름·남은 거래일을,
 * 시작 전이면 시작까지 카운트다운을 보여준다. (전역 국면이라 모두 동일)
 */
export function MarketEraBanner() {
  const [mounted, setMounted] = useState(false);
  useMarketStore((s) => s.tick); // 틱 진행에 맞춰 갱신
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const session = Math.floor(Date.now() / SESSION_DURATION_MS);
  const era = getMarketEra(session);

  if (era.index < 0) {
    const until = MARKET_ERA_START_SESSION - session;
    if (until > MARKET_ERA_SESSIONS) return null; // 너무 멀면 숨김
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm">
        <span className="min-w-0 truncate text-[var(--muted)]">
          🕒 시장 국면 시작 예정 — 60거래일마다 시장 성격이 바뀝니다
        </span>
        <span className="shrink-0 font-semibold tabular-nums">D-{until}</span>
      </div>
    );
  }

  const left = Math.max(0, era.endSession - session);
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-400/25 bg-violet-500/10 px-4 py-2.5 text-sm">
      <span className="min-w-0 truncate font-semibold text-violet-100">
        {era.emoji} 이번 시장 국면 · {era.name}
      </span>
      <span className="shrink-0 tabular-nums text-[var(--muted)]">
        {left}거래일 남음
      </span>
    </div>
  );
}

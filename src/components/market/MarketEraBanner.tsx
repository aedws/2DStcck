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
  const boomBubble = era.boomBubble;
  const economyAsUsual = era.economyAsUsual;
  const whyIsItRising = era.whyIsItRising;
  const crisisToWar = era.crisisToWar;
  const phaseText =
    boomBubble?.phase === "sideways"
      ? "횡보 관망 · 판정 비공개"
      : boomBubble?.phase === "boom"
        ? "대호황 · 상승 재개"
        : boomBubble?.phase === "crash"
          ? "버블 판정 · 대폭락"
          : boomBubble?.phase === "decline"
            ? "버블 판정 · 하락 지속"
            : boomBubble
              ? "강한 상승 · 호황/버블 판정 비공개"
              : whyIsItRising?.phase === "reveal"
                ? `숨겨진 ${whyIsItRising.hiddenArchetypeId} 국면 공개 · 종가까지 강한 랠리`
                : whyIsItRising
                  ? `${whyIsItRising.displayMode === "sideways" ? "횡보" : "하락"} 위장 중 · 실제 국면은 80% 지점에 공개`
                  : crisisToWar?.phase === "crisis"
                    ? "기존 경제위기 확대 · 전 업종 충격 증폭"
                    : crisisToWar?.phase === "recovery"
                      ? "5거래일 회복·횡보 구간"
                      : crisisToWar?.phase === "war"
                        ? "전면전 규칙 전환 · 방산·식품·의료 강세"
                        : economyAsUsual?.phase === "active"
                ? "경제 이상 징후 확산 · 위기 종류 비공개"
                : economyAsUsual?.phase === "warning"
                  ? "비공개 판정 발생 · 4거래일 뒤 시장 반영"
                  : economyAsUsual
                    ? "겉보기 시황 유지 · 경제위기 판정 비공개"
                    : null;
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-violet-400/25 bg-violet-500/10 px-4 py-2.5 text-sm">
      <span className="min-w-0">
        <span className="block truncate font-semibold text-violet-100">
          {era.emoji} 이번 시장 국면 · {era.name}
        </span>
        {phaseText && (
          <span className="mt-0.5 block truncate text-[11px] text-[var(--muted)]">
            {phaseText}
          </span>
        )}
      </span>
      <span className="shrink-0 tabular-nums text-[var(--muted)]">
        {left}거래일 남음
      </span>
    </div>
  );
}

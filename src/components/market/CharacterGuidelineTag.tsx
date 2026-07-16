"use client";

import { useEffect, useState } from "react";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { getMarketEra } from "@/lib/market/marketEras";
import { getCharacterGuideline } from "@/lib/market/marketGuidelines";
import { useMarketStore } from "@/store/marketStore";

/** 캐릭터의 이번 시장 국면 운영 지침 카드. 국면 시작 전이면 중립으로 안내. */
export function CharacterGuidelineTag({ ceoId }: { ceoId: string }) {
  const [mounted, setMounted] = useState(false);
  useMarketStore((s) => s.tick); // 국면 전환에 맞춰 갱신
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const session = Math.floor(Date.now() / SESSION_DURATION_MS);
  const era = getMarketEra(session);
  const guideline = getCharacterGuideline(ceoId, era);

  return (
    <div className="rounded-2xl border border-violet-400/25 bg-violet-500/5 p-4">
      <p className="text-xs text-[var(--muted)]">
        이번 시장 국면 운영 지침
        {era.index >= 0 ? ` · ${era.emoji} ${era.name}` : " (국면 시작 전)"}
      </p>
      <p className="mt-1 text-lg font-bold">
        {guideline.emoji} {guideline.name}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
        {guideline.desc}
      </p>
    </div>
  );
}

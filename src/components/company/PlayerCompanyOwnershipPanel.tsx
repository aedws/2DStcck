"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  exactOwnershipPercent,
  formatExactShareQuantity,
  getPlayerCompanyFounderOwnershipSummary,
  type PlayerCompanyFounderOwnershipSummary,
} from "@/lib/supabase/playerCompanyOwnership";

export function PlayerCompanyOwnershipPanel({
  stockId,
  localFounderQuantityExact,
  totalSharesExact,
  currentSession,
}: {
  stockId: string;
  localFounderQuantityExact: string;
  totalSharesExact: string;
  currentSession: number;
}) {
  const [summary, setSummary] =
    useState<PlayerCompanyFounderOwnershipSummary | null>(null);

  const refresh = useCallback(async () => {
    setSummary(await getPlayerCompanyFounderOwnershipSummary(stockId));
  }, [stockId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [currentSession, refresh]);

  const founderQuantity =
    summary?.founderQuantityExact ?? localFounderQuantityExact;
  const totalShares = summary?.totalSharesExact ?? totalSharesExact;
  const ownershipPercent = useMemo(
    () =>
      summary?.founderOwnershipPercent ??
      exactOwnershipPercent(founderQuantity, totalShares),
    [founderQuantity, summary?.founderOwnershipPercent, totalShares],
  );
  const expectedVotePercent =
    summary?.founderExpectedVotePercent ?? ownershipPercent;

  return (
    <section className="mb-5 rounded-3xl border border-amber-400/30 bg-amber-400/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-amber-300">실제 계좌 연동</p>
          <h2 className="mt-1 text-lg font-black">창업주 지분·예상 의결권</h2>
        </div>
        <span className="rounded-full bg-[var(--background)] px-3 py-1 text-[11px] text-[var(--muted)]">
          현재 {summary?.currentSession ?? currentSession}회차 · 마감마다 확정
        </span>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <OwnershipStat
          label="내 실제 보유주식"
          value={`${formatExactShareQuantity(founderQuantity)}주`}
        />
        <OwnershipStat
          label="창업주 실제 지분율"
          value={`${ownershipPercent.toFixed(4)}%`}
        />
        <OwnershipStat
          label="다음 주총 예상 단독 의결권"
          value={`${expectedVotePercent.toFixed(4)}%`}
        />
        <OwnershipStat
          label="확인된 다른 주주"
          value={`${summary?.trackedShareholderCount.toLocaleString() ?? "0"}명`}
          detail={`${formatExactShareQuantity(
            summary?.trackedPublicQuantityExact ?? "0",
          )}주 보유`}
        />
      </div>

      <div className="mt-4 h-3 overflow-hidden rounded-full bg-cyan-500/25">
        <div
          className="h-full bg-amber-400"
          style={{ width: `${Math.min(100, Math.max(0, ownershipPercent))}%` }}
        />
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-[var(--muted)]">
        <span>
          총 발행 {formatExactShareQuantity(totalShares)}주 중 실제 계좌 보유량
        </span>
        <span>
          다음 주총 예상 유효 의결권{" "}
          {formatExactShareQuantity(
            summary?.eligibleVoteWeightExact ?? founderQuantity,
          )}
          주
        </span>
      </div>

      <p className="mt-3 rounded-xl bg-[var(--background)] p-3 text-[11px] leading-relaxed text-[var(--muted)]">
        상장 후 창업주 주식수는 회사 설립 당시 장부 수량이 아니라 내 계좌의 실제
        보유량으로 표시합니다. 예상 단독 의결권은 현재 창업주 보유량과 90거래일
        이상 연속 보유한 다른 주주의 투표 가능 수량을 기준으로 계산하며, 매
        거래일 마감 후 서버 저장분으로 갱신됩니다.
      </p>
    </section>
  );
}

function OwnershipStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 break-all text-lg font-black tabular-nums">{value}</p>
      {detail && (
        <p className="mt-1 break-all text-[10px] text-[var(--muted)]">{detail}</p>
      )}
    </div>
  );
}

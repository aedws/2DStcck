"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  choosePlayerCompanyBoardDecision,
  listPlayerCompanyBoardDecisions,
  type PlayerCompanyBoardDecision,
  type PlayerCompanyBoardDecisionType,
} from "@/lib/supabase/playerCompanyGovernance";

const DECISIONS: Array<{
  type: PlayerCompanyBoardDecisionType;
  icon: string;
  title: string;
  description: string;
}> = [
  {
    type: "research",
    icon: "🧪",
    title: "연구개발",
    description: "다음 실적 성장률과 기술 기업 명성을 높입니다.",
  },
  {
    type: "dividend",
    icon: "💵",
    title: "배당 확대",
    description: "주주 친화 명성을 높이고 다음 분기 배당을 강화합니다.",
  },
  {
    type: "buyback",
    icon: "📈",
    title: "자사주 매입",
    description: "유통 주식 수를 줄여 주당 가치와 수급을 개선합니다.",
  },
  {
    type: "acquisition",
    icon: "🚀",
    title: "스타트업 인수",
    description: "성공 시 성장률이 크게 오르지만 실패 위험이 있습니다.",
  },
];

export function PlayerCompanyBoardPanel({
  stockId,
  currentSession,
}: {
  stockId: string;
  currentSession: number;
}) {
  const [decisions, setDecisions] = useState<PlayerCompanyBoardDecision[]>([]);
  const [choosing, setChoosing] = useState<PlayerCompanyBoardDecisionType | null>(
    null,
  );
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setDecisions(await listPlayerCompanyBoardDecisions(stockId));
  }, [stockId]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const pending = useMemo(
    () => decisions.find((decision) => decision.status === "pending"),
    [decisions],
  );
  const latestResolved = useMemo(
    () => decisions.find((decision) => decision.status === "resolved"),
    [decisions],
  );

  const choose = async (type: PlayerCompanyBoardDecisionType) => {
    setChoosing(type);
    const result = await choosePlayerCompanyBoardDecision(stockId, type);
    setMessage(result.message);
    if (result.success) await refresh();
    setChoosing(null);
  };

  return (
    <section className="mb-5 rounded-3xl border border-violet-400/30 bg-violet-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-violet-300">24거래일 경영 사이클</p>
          <h2 className="mt-1 text-xl font-black">이사회 분기 경영 선택</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            한 분기에 하나를 선택하며 결과는 다음 분기 실적 발표와 공통 주가에 반영됩니다.
          </p>
        </div>
        {pending && (
          <span className="rounded-xl bg-violet-400/15 px-3 py-2 text-xs font-bold text-violet-200">
            결과까지 {Math.max(0, pending.resolveSession - currentSession)}거래일
          </span>
        )}
      </div>

      {pending ? (
        <div className="mt-4 rounded-2xl border border-violet-400/30 bg-[var(--background)] p-4">
          <p className="font-bold">
            {DECISIONS.find((item) => item.type === pending.decisionType)?.icon}{" "}
            {DECISIONS.find((item) => item.type === pending.decisionType)?.title}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            선택이 확정됐습니다. {pending.resolveSession.toLocaleString()}거래일의
            다음 분기 실적 발표에서 결과가 공개됩니다.
          </p>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {DECISIONS.map((decision) => (
            <button
              key={decision.type}
              type="button"
              disabled={choosing !== null}
              onClick={() => void choose(decision.type)}
              className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4 text-left transition hover:border-violet-400/60 disabled:opacity-60"
            >
              <p className="font-bold">
                {decision.icon} {decision.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
                {decision.description}
              </p>
            </button>
          ))}
        </div>
      )}

      {latestResolved && (
        <div className="mt-3 rounded-2xl bg-[var(--background)] p-3 text-xs">
          <span className="font-bold">최근 분기 결과</span>
          <span className="ml-2 text-[var(--muted)]">
            {latestResolved.outcomeLabel ?? "실적에 반영 완료"}
            {latestResolved.earningsGrowthDelta
              ? ` · 성장률 ${latestResolved.earningsGrowthDelta > 0 ? "+" : ""}${latestResolved.earningsGrowthDelta.toFixed(1)}%p`
              : ""}
            {latestResolved.reputationDelta
              ? ` · 명성 ${latestResolved.reputationDelta > 0 ? "+" : ""}${latestResolved.reputationDelta}`
              : ""}
          </span>
        </div>
      )}
      {message && <p className="mt-3 text-xs text-violet-200">{message}</p>}
    </section>
  );
}

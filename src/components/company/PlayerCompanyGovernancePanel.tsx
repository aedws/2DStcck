"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  castPlayerCompanyGovernanceVote,
  createPlayerCompanyGovernanceProposal,
  listPlayerCompanyGovernanceProposals,
  PLAYER_COMPANY_LONG_TERM_VOTE_SESSIONS,
  type PlayerCompanyGovernanceProposal,
  type PlayerCompanyProposalType,
} from "@/lib/supabase/playerCompanyGovernance";

const PROPOSAL_LABEL: Record<PlayerCompanyProposalType, string> = {
  dividend: "다음 1회 배당 예산",
  issue: "유상증자",
  retire: "자사주 소각",
  expansion: "사업 확장",
  ceo_change: "CEO 교체 요구",
  asset_sale: "비핵심 자산 매각",
};

function valueLabel(proposal: PlayerCompanyGovernanceProposal) {
  if (proposal.proposalType === "expansion") return "신사업 진출";
  if (proposal.proposalType === "ceo_change") return "경영진 교체";
  return `${(proposal.proposedValue * 100).toFixed(1)}%`;
}

export function PlayerCompanyGovernancePanel({
  founderStockId,
  currentSession,
}: {
  founderStockId?: string;
  currentSession: number;
}) {
  const [proposals, setProposals] = useState<PlayerCompanyGovernanceProposal[]>(
    [],
  );
  const [proposalType, setProposalType] =
    useState<PlayerCompanyProposalType>("dividend");
  const [proposedValue, setProposedValue] = useState(2);
  const [working, setWorking] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    setProposals(await listPlayerCompanyGovernanceProposals());
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const open = useMemo(
    () => proposals.filter((proposal) => proposal.status === "open"),
    [proposals],
  );
  const recent = useMemo(
    () => proposals.filter((proposal) => proposal.status !== "open").slice(0, 3),
    [proposals],
  );

  const createProposal = async () => {
    if (!founderStockId) return;
    setWorking(true);
    const result = await createPlayerCompanyGovernanceProposal({
      stockId: founderStockId,
      proposalType,
      proposedValue:
        proposalType === "expansion" || proposalType === "ceo_change"
          ? 1
          : proposedValue / 100,
    });
    setMessage(result.message);
    if (result.success) await refresh();
    setWorking(false);
  };

  const vote = async (proposalId: string, choice: "yes" | "no") => {
    setWorking(true);
    const result = await castPlayerCompanyGovernanceVote(proposalId, choice);
    setMessage(result.message);
    if (result.success) await refresh();
    setWorking(false);
  };

  return (
    <section className="mb-5 rounded-3xl border border-cyan-400/30 bg-cyan-500/5 p-5">
      <div>
        <p className="text-xs font-bold text-cyan-300">플레이어 회사 거버넌스</p>
        <h2 className="mt-1 text-xl font-black">주주총회 투표</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          창업주와 {PLAYER_COMPANY_LONG_TERM_VOTE_SESSIONS}거래일 이상 연속
          보유한 장기 주주가 지분 가중 투표권을 행사합니다. 결과는 공통 주가와
          회사 명성에 반영됩니다.
        </p>
        <p className="mt-2 rounded-xl bg-cyan-400/10 p-3 text-[11px] leading-relaxed text-cyan-200">
          행동주의 안건인 CEO 교체·비핵심 자산 매각도 같은 주주총회에서
          표결합니다. 가결 시 경영 전환 또는 자산 효율화 효과가, 부결 시
          주주 갈등과 신뢰 하락이 공통 시장에 반영됩니다.
        </p>
      </div>

      {founderStockId && (
        <div className="mt-4 grid gap-3 rounded-2xl border border-cyan-400/20 bg-[var(--background)] p-4 sm:grid-cols-[1fr_1fr_auto]">
          <select
            value={proposalType}
            onChange={(event) =>
              setProposalType(event.target.value as PlayerCompanyProposalType)
            }
            className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
          >
            {Object.entries(PROPOSAL_LABEL).map(([type, label]) => (
              <option key={type} value={type}>
                {label}
              </option>
            ))}
          </select>
          {proposalType === "expansion" || proposalType === "ceo_change" ? (
            <div className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm text-[var(--muted)]">
              {proposalType === "expansion"
                ? "신사업 진출안"
                : "행동주의 주주 경영진 교체안"}
            </div>
          ) : (
            <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-sm">
              <input
                type="number"
                min={0.1}
                max={proposalType === "dividend" ? 15 : 20}
                step={0.1}
                value={proposedValue}
                onChange={(event) => setProposedValue(Number(event.target.value))}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
              %
            </label>
          )}
          <button
            type="button"
            disabled={working || open.some((item) => item.stockId === founderStockId)}
            onClick={() => void createProposal()}
            className="rounded-xl bg-cyan-500 px-4 py-2 text-sm font-black text-white disabled:opacity-50"
          >
            안건 상정
          </button>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {open.length === 0 && (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
            현재 진행 중인 주주총회 안건이 없습니다.
          </div>
        )}
        {open.map((proposal) => {
          const total = proposal.yesWeight + proposal.noWeight;
          const yesPercent = total > 0 ? (proposal.yesWeight / total) * 100 : 50;
          return (
            <article
              key={proposal.id}
              className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold">
                    {proposal.companyName} · {PROPOSAL_LABEL[proposal.proposalType]}
                  </p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    제안 {valueLabel(proposal)} · 마감까지{" "}
                    {Math.max(0, proposal.closesSession - currentSession)}거래일
                  </p>
                </div>
                <span
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    proposal.eligible
                      ? "bg-emerald-400/15 text-emerald-300"
                      : "bg-zinc-500/15 text-[var(--muted)]"
                  }`}
                >
                  {proposal.eligible
                    ? `투표권 ${proposal.votingWeight.toLocaleString()}주`
                    : "장기 보유 요건 미충족"}
                </span>
              </div>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-rose-400/30">
                <div
                  className="h-full bg-emerald-400"
                  style={{ width: `${yesPercent}%` }}
                />
              </div>
              <div className="mt-1 flex justify-between text-[11px] text-[var(--muted)]">
                <span>찬성 {proposal.yesWeight.toLocaleString()}</span>
                <span>반대 {proposal.noWeight.toLocaleString()}</span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  disabled={!proposal.eligible || working}
                  onClick={() => void vote(proposal.id, "yes")}
                  className={`rounded-xl px-3 py-2 text-xs font-bold ${
                    proposal.myVote === "yes"
                      ? "bg-emerald-500 text-white"
                      : "border border-emerald-400/40 text-emerald-300"
                  } disabled:opacity-40`}
                >
                  찬성
                </button>
                <button
                  type="button"
                  disabled={!proposal.eligible || working}
                  onClick={() => void vote(proposal.id, "no")}
                  className={`rounded-xl px-3 py-2 text-xs font-bold ${
                    proposal.myVote === "no"
                      ? "bg-rose-500 text-white"
                      : "border border-rose-400/40 text-rose-300"
                  } disabled:opacity-40`}
                >
                  반대
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {recent.length > 0 && (
        <div className="mt-4 space-y-2">
          <p className="text-xs font-bold text-[var(--muted)]">최근 의결 결과</p>
          {recent.map((proposal) => (
            <div
              key={proposal.id}
              className="flex justify-between rounded-xl bg-[var(--background)] px-3 py-2 text-xs"
            >
              <span>
                {proposal.companyName} · {PROPOSAL_LABEL[proposal.proposalType]}
              </span>
              <span
                className={
                  proposal.status === "passed"
                    ? "text-emerald-300"
                    : "text-rose-300"
                }
              >
                {proposal.status === "passed" ? "가결" : "부결"}
              </span>
            </div>
          ))}
        </div>
      )}
      {message && <p className="mt-3 text-xs text-cyan-200">{message}</p>}
    </section>
  );
}

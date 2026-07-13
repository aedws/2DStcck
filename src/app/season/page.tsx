"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { SeasonCeremonyModal } from "@/components/season/SeasonCeremonyModal";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import { formatPrice } from "@/lib/market/engine";
import { getBenchmark } from "@/lib/market/interestRate";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  INVESTMENT_SEASON_SESSIONS,
  INVESTMENT_SEASON_TIERS,
  SEASON_GOALS,
  calculateSeasonGoalAllocation,
  calculateSeasonPerformance,
  calculateSeasonScore,
  getInvestmentSeasonTier,
  getSeasonGoal,
  getSeasonRivalPerformance,
  seasonExternalCashTotal,
  seasonTierForAlpha,
} from "@/lib/market/investmentSeasons";
import type {
  InvestmentSeasonTierId,
  SeasonGoalId,
} from "@/lib/market/investmentSeasons";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";

const SEASON_TUTORIAL_VERSION = 2;
const SEASON_TUTORIAL_STEPS = [
  {
    emoji: "🏁",
    title: "20거래일 동안 지수와 경쟁합니다",
    body: "첫 접속부터 개인 투자 시즌이 자동 시작됩니다. 1거래일은 실제 3시간이며 게임을 닫아도 시장과 남은 기간은 계속 진행됩니다.",
  },
  {
    emoji: "⚖️",
    title: "절대 수익보다 초과수익이 중요합니다",
    body: "내 순자산 수익률에서 같은 기간 V-NASDAQ 수익률을 뺀 값으로 티어를 평가합니다. 지수가 -10%일 때 -5%만 기록해도 초과수익은 +5%p입니다.",
  },
  {
    emoji: "🎯",
    title: "시즌 운용 목표와 비중을 선택합니다",
    body: "성장·인컴·방어 중 하나와 목표 비중을 고릅니다. 거래일이 바뀔 때 비중이 기준보다 낮으면 시즌 점수가 2점 감소하며, 지킨 날에는 목표 난도에 따른 보너스가 쌓입니다.",
  },
  {
    emoji: "⚔️",
    title: "가상 라이벌과 시즌 점수를 겨룹니다",
    body: "시즌마다 결정론적으로 정해지는 가상 투자자가 같은 20거래일을 달립니다. 상대와 성과 경로는 재접속해도 바뀌지 않으며 종료 시 시즌 점수로 승패를 정합니다.",
  },
  {
    emoji: "🧾",
    title: "투자 실력만 평가합니다",
    body: "매매 손익·배당·분배금·이자 비용은 반영하지만 고정급과 복권 손익은 제외합니다. 티어는 초과수익률, 시즌 점수는 목표 준수와 라이벌 승부에 사용됩니다.",
  },
  {
    emoji: "🎉",
    title: "시상식 후 다음 시즌이 시작됩니다",
    body: "별도 제출 없이 자동 정산되고 티어·점수·목표 준수율·라이벌 승패를 시상식에서 확인합니다. 결과는 지난 시즌 기록에 보존됩니다.",
  },
];

const TIER_STYLE: Record<InvestmentSeasonTierId, string> = {
  bronze: "border-orange-700/40 bg-orange-700/10 text-orange-300",
  silver: "border-slate-300/40 bg-slate-300/10 text-slate-200",
  gold: "border-yellow-400/40 bg-yellow-400/10 text-yellow-300",
  platinum: "border-cyan-300/40 bg-cyan-300/10 text-cyan-200",
  diamond: "border-blue-400/40 bg-blue-400/10 text-blue-300",
  master: "border-pink-400/40 bg-pink-400/10 text-pink-300",
};

function signedPercent(value: number, point = false): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%${point ? "p" : ""}`;
}

export default function InvestmentSeasonPage() {
  const [mounted, setMounted] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<SeasonGoalId>("growth");
  const [selectedTarget, setSelectedTarget] = useState(0.2);
  const onboarded = useSettingsStore((state) => state.onboarded);
  const tutorialSeen = useSettingsStore((state) => state.seasonTutorialSeen);
  const setTutorialSeen = useSettingsStore((state) => state.setSeasonTutorialSeen);
  const tutorialVersion = useSettingsStore((state) => state.seasonTutorialVersion);
  const setTutorialVersion = useSettingsStore((state) => state.setSeasonTutorialVersion);
  useEffect(() => setMounted(true), []);

  useMarketStore((state) => state.tick);
  const seasonState = useMarketStore((state) => state.investmentSeason);
  const stocks = useMarketStore((state) => state.stocks);
  const holdings = useMarketStore((state) => state.holdings);
  const equity = useMarketStore((state) => state.getTotalAssets());
  const cashPayments = useMarketStore((state) => state.cashPayments);
  const selectGoal = useMarketStore((state) => state.selectInvestmentSeasonGoal);
  const markCeremonySeen = useMarketStore((state) => state.markSeasonCeremonySeen);
  const benchmarkPrice = getBenchmark(stocks)?.currentPrice ?? 0;
  const current = seasonState.current;
  const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
  const pendingCeremony = seasonState.history.find(
    (result) => !seasonState.seenCeremonyIds.includes(result.id),
  );
  const tutorial = mounted && onboarded && (!tutorialSeen || tutorialVersion < SEASON_TUTORIAL_VERSION) ? (
    <FeatureTutorialModal
      steps={SEASON_TUTORIAL_STEPS}
      onFinish={() => {
        setTutorialSeen(true);
        setTutorialVersion(SEASON_TUTORIAL_VERSION);
      }}
    />
  ) : null;
  const ceremony = pendingCeremony ? (
    <SeasonCeremonyModal
      result={pendingCeremony}
      onClose={() => markCeremonySeen(pendingCeremony.id)}
    />
  ) : null;

  if (!current || benchmarkPrice <= 0) {
    return (
      <div className="mx-auto max-w-5xl pb-20">
        {ceremony}
        {tutorial}
        <h1 className="text-2xl font-bold">🏆 20거래일 투자 시즌</h1>
        <div className="mt-6 rounded-2xl bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
          공통 시장과 계좌를 불러온 뒤 첫 시즌이 자동으로 시작됩니다.
        </div>
      </div>
    );
  }

  const elapsed = Math.max(0, Math.min(INVESTMENT_SEASON_SESSIONS, currentSession - current.startSession));
  const sessionsLeft = Math.max(0, current.endSession - currentSession);
  const performance = calculateSeasonPerformance(current, equity, benchmarkPrice, seasonExternalCashTotal(cashPayments));
  const projectedTier = seasonTierForAlpha(performance.alpha);
  const score = calculateSeasonScore(current, performance);
  const rival = getSeasonRivalPerformance(current, currentSession, score.totalScore);
  const goal = getSeasonGoal(current.goalId);
  const goalAllocation = calculateSeasonGoalAllocation(current.goalId, holdings, stocks, equity);
  const progress = (elapsed / INVESTMENT_SEASON_SESSIONS) * 100;
  const nextTier = INVESTMENT_SEASON_TIERS[
    INVESTMENT_SEASON_TIERS.findIndex((tier) => tier.id === projectedTier.id) + 1
  ];
  const selectedGoal = getSeasonGoal(selectedGoalId)!;

  function chooseGoal(goalId: SeasonGoalId) {
    const definition = getSeasonGoal(goalId)!;
    setSelectedGoalId(goalId);
    setSelectedTarget(definition.targetWeights[0]);
  }

  return (
    <div className="mx-auto max-w-5xl pb-20">
      {ceremony}
      {tutorial}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">🏆 20거래일 투자 시즌</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            V-NASDAQ 대비 티어를 올리고 선택 목표와 가상 라이벌로 시즌 점수를 겨룹니다.
          </p>
        </div>
        <Link href="/leaderboard" className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-semibold hover:border-[var(--accent)]">
          전체 순자산 랭킹 →
        </Link>
      </div>

      <section className={`rounded-3xl border p-5 sm:p-7 ${TIER_STYLE[projectedTier.id]}`}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs opacity-75">진행 중 · 시즌 {current.number}</p>
            <h2 className="mt-2 text-3xl font-black">{projectedTier.emoji} 예상 {projectedTier.name}</h2>
            <p className="mt-2 text-sm opacity-80">
              지수 대비 <b>{signedPercent(performance.alpha, true)}</b>
              {nextTier
                ? ` · ${nextTier.name}까지 ${Math.max(0, (nextTier.minimumAlpha - performance.alpha) * 100).toFixed(2)}%p`
                : " · 최고 티어 기준 달성"}
            </p>
          </div>
          <div className="flex gap-5 text-right">
            <div>
              <p className="text-2xl font-black tabular-nums">{score.totalScore}점</p>
              <p className="text-xs opacity-75">예상 시즌 점수</p>
            </div>
            <div>
              <p className="text-2xl font-bold tabular-nums">D-{sessionsLeft}</p>
              <p className="text-xs opacity-75">{elapsed}/20거래일</p>
            </div>
          </div>
        </div>
        <div className="mt-6 h-2.5 overflow-hidden rounded-full bg-black/20">
          <div className="h-full rounded-full bg-current transition-all" style={{ width: `${progress}%` }} />
        </div>
      </section>

      <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="현재 순자산" value={formatPrice(equity)} />
        <Stat label="내 시즌 수익률" value={signedPercent(performance.playerReturn)} tone={performance.playerReturn} />
        <Stat label="V-NASDAQ 수익률" value={signedPercent(performance.benchmarkReturn)} tone={performance.benchmarkReturn} />
        <Stat label="시즌 최대 낙폭" value={`${(performance.maxDrawdown * 100).toFixed(2)}%`} tone={-performance.maxDrawdown} />
      </section>

      {!goal ? (
        <section className="mt-8 rounded-3xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5">
          <h2 className="text-lg font-bold">🎯 이번 시즌 운용 목표 선택</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">한 번 확정하면 다음 시즌까지 바꿀 수 없습니다. 목표를 늦게 고르면 남은 거래일만 점검합니다.</p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            {SEASON_GOALS.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                onClick={() => chooseGoal(candidate.id)}
                className={`rounded-2xl border p-4 text-left ${selectedGoalId === candidate.id ? "border-[var(--accent)] bg-[var(--surface)]" : "border-[var(--border)]"}`}
              >
                <p className="font-bold">{candidate.emoji} {candidate.name}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">{candidate.description}</p>
              </button>
            ))}
          </div>
          <div className="mt-4 rounded-2xl bg-[var(--surface)] p-4">
            <p className="text-xs text-[var(--muted)]">포함 자산 · {selectedGoal.includedAssets}</p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="mr-1 text-sm font-semibold">목표 비중</span>
              {selectedGoal.targetWeights.map((target) => (
                <button
                  key={target}
                  type="button"
                  onClick={() => setSelectedTarget(target)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-bold ${selectedTarget === target ? "bg-[var(--accent)] text-white" : "border border-[var(--border)]"}`}
                >
                  {(target * 100).toFixed(0)}%
                </button>
              ))}
              <button
                type="button"
                onClick={() => selectGoal(selectedGoalId, selectedTarget)}
                className="ml-auto rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-bold text-white"
              >
                이 목표로 확정
              </button>
            </div>
          </div>
        </section>
      ) : (
        <section className="mt-8 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs text-[var(--muted)]">확정된 시즌 목표</p>
              <h2 className="mt-1 text-lg font-bold">{goal.emoji} {goal.name} · {(current.goalTargetWeight! * 100).toFixed(0)}%</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">{goal.includedAssets}</p>
            </div>
            <div className="text-right">
              <p className={`text-xl font-black ${goalAllocation + 1e-9 >= current.goalTargetWeight! ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                현재 {(goalAllocation * 100).toFixed(1)}%
              </p>
              <p className="text-xs text-[var(--muted)]">준수 {(current.goalMetChecks ?? 0)}/{current.goalChecks ?? 0}일 · 미달 {current.goalMisses ?? 0}일</p>
            </div>
          </div>
          <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--background)]">
            <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${Math.min(100, goalAllocation / current.goalTargetWeight! * 100)}%` }} />
          </div>
          <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]">
            <span>기본 {score.baseScore}점 · 목표 보너스 +{score.goalBonus} · 미달 감점 -{score.goalPenalty}</span>
            <span>비중 미달 거래일마다 -2점</span>
          </div>
        </section>
      )}

      <section className="mt-4 rounded-3xl border border-violet-400/30 bg-violet-400/5 p-5">
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-4xl" aria-hidden>{rival.rival.emoji}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-[var(--muted)]">가상 라이벌 · {rival.rival.style}</p>
            <h2 className="mt-1 text-lg font-bold">{rival.rival.name}</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">{rival.rival.description}</p>
          </div>
          <div className="grid grid-cols-2 gap-5 text-right">
            <div><p className="text-xs text-[var(--muted)]">라이벌 점수</p><p className="text-xl font-black">{rival.score}</p></div>
            <div><p className="text-xs text-[var(--muted)]">초과수익</p><p className="text-xl font-black">{signedPercent(rival.alpha, true)}</p></div>
          </div>
        </div>
        <p className="mt-4 border-l-2 border-violet-400/50 pl-3 text-sm italic text-[var(--muted)]">“{rival.remark}”</p>
        <p className={`mt-3 text-right text-sm font-bold ${score.totalScore >= rival.score ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
          현재 {Math.abs(score.totalScore - rival.score)}점 {score.totalScore >= rival.score ? "앞서는 중" : "뒤처지는 중"}
        </p>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">티어 기준</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">티어는 초과수익률로만 확정하며 목표 감점은 시즌 점수와 라이벌 승부에 반영됩니다.</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {INVESTMENT_SEASON_TIERS.map((tier) => (
            <div key={tier.id} className={`rounded-2xl border p-4 ${TIER_STYLE[tier.id]} ${tier.id === projectedTier.id ? "ring-2 ring-current" : ""}`}>
              <p className="font-bold">{tier.emoji} {tier.name}</p>
              <p className="mt-1 text-xs opacity-75">{tier.summary}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="text-lg font-bold">지난 시즌·트로피</h2>
        {seasonState.history.length === 0 ? (
          <div className="mt-3 rounded-2xl bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
            첫 시즌 시상식이 끝나면 티어와 라이벌 승패가 여기에 기록됩니다.
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--border)]">
            {seasonState.history.map((season) => {
              const tier = getInvestmentSeasonTier(season.tierId);
              const pastRival = getSeasonRivalPerformance(season, season.endSession, season.seasonScore);
              const won = season.seasonScore >= pastRival.score;
              return (
                <div key={season.id} className="grid grid-cols-[1fr_auto] gap-3 border-b border-[var(--border)] bg-[var(--surface)] px-4 py-3 last:border-b-0 sm:grid-cols-[100px_1fr_1fr_1fr_1fr]">
                  <p className="font-bold">시즌 {season.number}</p>
                  <p className="text-right font-semibold sm:text-left">{tier.emoji} {tier.name}</p>
                  <p>{season.seasonScore}점</p>
                  <p className={season.alpha >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}>지수 대비 {signedPercent(season.alpha, true)}</p>
                  <p className={`text-right font-semibold ${won ? "text-[var(--up)]" : "text-[var(--down)]"}`}>{pastRival.rival.emoji} {won ? "승리" : "패배"}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: number }) {
  const toneClass = tone === undefined ? "" : tone > 0 ? "text-[var(--up)]" : tone < 0 ? "text-[var(--down)]" : "";
  return (
    <div className="rounded-2xl bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`mt-2 text-lg font-bold tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

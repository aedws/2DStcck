"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { SeasonCeremonyModal } from "@/components/season/SeasonCeremonyModal";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  getDailyOperationOffer,
  getDailyOperationOffers,
  getDailyOperationProgress,
} from "@/lib/market/dailyOperations";
import { buildDailyScorecard } from "@/lib/market/dailyScorecard";
import { formatSignedMoney } from "@/lib/market/engine";
import {
  calculateSeasonPerformance,
  calculateSeasonScore,
  getSeasonRivalPerformance,
  seasonExternalCashTotal,
  seasonTierForAlpha,
} from "@/lib/market/investmentSeasons";
import { getBenchmark } from "@/lib/market/interestRate";
import { getMarketRegimeAtSession } from "@/lib/market/marketRegimes";
import {
  getAmcPortfolioLookThroughPositions,
  mergeAmcPortfolioFunds,
} from "@/lib/player/amcPortfolio";
import { listedFundToAmcState } from "@/lib/supabase/amcListedFunds";
import {
  getStoryArcAtSession,
  getStoryDecisionOffer,
  storyStageAtSession,
} from "@/lib/market/storyArcs";
import { useMarketStore } from "@/store/marketStore";

const GRADE_STYLE = {
  S: "bg-amber-400 text-black",
  A: "bg-[var(--up)] text-white",
  B: "bg-sky-500 text-white",
  C: "bg-[var(--accent)] text-white",
  D: "bg-orange-500 text-white",
  F: "bg-[var(--down)] text-white",
} as const;

const STORY_STAGE = {
  rumor: "발표 예고",
  clue: "판단 선택",
  resolution: "결말 공개",
} as const;

function remainingTime(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1_000));
  const hours = Math.floor(seconds / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  const rest = seconds % 60;
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분 ${rest}초`;
}

export function OperationBriefing() {
  const [message, setMessage] = useState<string | null>(null);
  useMarketStore((state) => state.tick);
  const stocks = useMarketStore((state) => state.stocks);
  const holdings = useMarketStore((state) => state.holdings);
  const trades = useMarketStore((state) => state.trades);
  const cash = useMarketStore((state) => state.cash);
  const cashPayments = useMarketStore((state) => state.cashPayments);
  const initialCash = useMarketStore((state) => state.initialCash);
  const marginCallAt = useMarketStore((state) => state.marginCallAt);
  const assetManager = useMarketStore((state) => state.assetManager);
  const listedAmcFunds = useMarketStore((state) => state.listedAmcFunds);
  const mission = useMarketStore((state) => state.investmentMission);
  const storyDecision = useMarketStore((state) => state.storyDecision);
  const seasonState = useMarketStore((state) => state.investmentSeason);
  const dailyOperation = useMarketStore((state) => state.dailyOperation);
  const portfolioStrategySelectedAt = useMarketStore((state) => state.portfolioStrategySelectedAt);
  const acceptDailyOperation = useMarketStore((state) => state.acceptDailyOperation);
  const markSeasonCeremonySeen = useMarketStore((state) => state.markSeasonCeremonySeen);
  const equity = useMarketStore((state) => state.getTotalAssets());
  const userEtfPositions = useMemo(
    () =>
      getAmcPortfolioLookThroughPositions(
        holdings,
        mergeAmcPortfolioFunds(
          assetManager?.funds ?? [],
          listedAmcFunds.map(listedFundToAmcState),
        ),
        stocks,
      ),
    [holdings, assetManager, listedAmcFunds, stocks],
  );
  const now = Date.now();
  const session = Math.floor(now / SESSION_DURATION_MS);
  const benchmark = getBenchmark(stocks);
  const benchmarkPrice = benchmark?.currentPrice ?? 0;
  const regime = getMarketRegimeAtSession(session);
  const arc = getStoryArcAtSession(session);
  const storyStage = storyStageAtSession(arc, session);
  const currentDecision = storyDecision?.storyId === arc.id ? storyDecision : null;
  const scorecard = useMemo(
    () => buildDailyScorecard(trades, session - 1, initialCash, marginCallAt),
    [trades, session, initialCash, marginCallAt],
  );
  const currentSeason = seasonState.current;
  const seasonPerformance = currentSeason && benchmarkPrice > 0
    ? calculateSeasonPerformance(
        currentSeason,
        equity,
        benchmarkPrice,
        seasonExternalCashTotal(cashPayments),
      )
    : null;
  const seasonScore = currentSeason && seasonPerformance
    ? calculateSeasonScore(currentSeason, seasonPerformance)
    : null;
  const seasonTier = seasonPerformance ? seasonTierForAlpha(seasonPerformance.alpha) : null;
  const seasonRival = currentSeason && seasonScore
    ? getSeasonRivalPerformance(currentSeason, session, seasonScore.totalScore)
    : null;
  const pendingCeremony = seasonState.history.find(
    (result) => !seasonState.seenCeremonyIds.includes(result.id),
  );
  const operationProgress = dailyOperation?.status === "active" && benchmark
    ? getDailyOperationProgress(dailyOperation, {
        now,
        equity,
        benchmarkPrice,
        cash,
        holdings,
        stocks,
        userEtfPositions,
        trades,
        marginCallAt,
      })
    : null;
  const completedThisSession =
    dailyOperation?.status !== "active" && dailyOperation?.startSession === session;
  const canChooseOperation = !dailyOperation ||
    (dailyOperation.status !== "active" && !completedThisSession);
  const operationOffers = getDailyOperationOffers(session);

  const nextAction = !dailyOperation || canChooseOperation
    ? { href: "#daily-operation", label: "오늘의 작전 선택", emoji: "🎯" }
    : portfolioStrategySelectedAt <= 0
      ? { href: "/strategy", label: "포트폴리오 전략 선언", emoji: "🧭" }
    : currentSeason && !currentSeason.traitId
      ? { href: "/season", label: "시즌 특성 3택 1", emoji: "🃏" }
      : currentSeason && !currentSeason.goalId
        ? { href: "/season", label: "시즌 목표 확정", emoji: "🏆" }
        : storyStage === "clue" && !currentDecision
          ? { href: "/missions", label: "사건 판단 제출", emoji: "🔎" }
          : mission?.status !== "active"
            ? { href: "/missions", label: "5일 투자 의뢰 선택", emoji: "📋" }
            : { href: `/stock/${regime.instrumentId}`, label: regime.strategy, emoji: regime.emoji };

  return (
    <>
      {pendingCeremony && (
        <SeasonCeremonyModal
          result={pendingCeremony}
          onClose={() => markSeasonCeremonySeen(pendingCeremony.id)}
        />
      )}
      <section className="shrink-0 border-b border-[var(--border)] bg-gradient-to-br from-[var(--surface)] to-[var(--accent)]/[0.04] px-3 py-4 md:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold text-[var(--accent)]">
              MARKET DAY {scorecard.marketDay + 1}
            </p>
            <h2 className="mt-0.5 text-lg font-black">🗂️ 오늘의 작전 브리핑</h2>
          </div>
          <Link
            href={nextAction.href}
            className="max-w-full rounded-xl border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-2 text-xs font-semibold text-[var(--accent)] hover:bg-[var(--accent)]/15"
          >
            {nextAction.emoji} 다음 행동 · {nextAction.label} →
          </Link>
        </div>

        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <BriefingCard
            label="이번 주 시황"
            title={`${regime.emoji} ${regime.name}`}
            detail={`${Math.max(1, regime.windowEnd - session)}일 남음 · ${regime.strategy}`}
            href={`/stock/${regime.instrumentId}`}
          />
          <BriefingCard
            label="투자 시즌"
            title={currentSeason && seasonTier && seasonScore
              ? `${seasonTier.emoji} ${seasonScore.totalScore}점 · ${seasonTier.name}`
              : "시즌 준비 중"}
            detail={currentSeason && seasonRival
              ? `${Math.max(0, currentSeason.endSession - session)}일 남음 · ${seasonRival.rival.emoji} ${seasonRival.rival.name} ${seasonRival.score}점`
              : "시장 동기화 후 시작"}
            href="/season"
          />
          <BriefingCard
            label="연속 사건"
            title={`${arc.character?.emoji ?? "🏢"} ${arc.company.name} · ${STORY_STAGE[storyStage]}`}
            detail={currentDecision
              ? `내 판단 · ${getStoryDecisionOffer(currentDecision.kind).title}`
              : storyStage === "clue"
                ? "지금 판단을 선택할 수 있습니다."
                : `결말까지 ${Math.max(0, arc.resolveSession - session)}일`}
            href="/missions"
          />
          <BriefingCard
            label="전일 성적표"
            title={`${scorecard.grade}등급 · ${scorecard.score}점`}
            detail={`체결 ${scorecard.tradeCount}건 · 실현손익 ${formatSignedMoney(scorecard.realizedPnl)}`}
            href="/history"
            badgeClass={GRADE_STYLE[scorecard.grade]}
          />
        </div>

        <div id="daily-operation" className="mt-3 rounded-2xl border border-violet-400/25 bg-violet-400/[0.06] p-3.5">
          {dailyOperation?.status === "active" && operationProgress ? (
            <div>
              <div className="flex flex-wrap items-start gap-3">
                <span className="text-2xl">{getDailyOperationOffer(dailyOperation.offerId).emoji}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-bold">오늘의 작전 · {getDailyOperationOffer(dailyOperation.offerId).title}</p>
                    <span className="rounded-full bg-violet-400/15 px-2 py-0.5 text-[10px] font-semibold text-violet-300">
                      남은 시간 {remainingTime(dailyOperation.endAt - now)}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {getDailyOperationOffer(dailyOperation.offerId).target} · 현재 {operationProgress.detail}
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--background)]">
                    <div
                      className={`h-full rounded-full transition-all ${operationProgress.passing ? "bg-[var(--up)]" : "bg-violet-400"}`}
                      style={{ width: `${operationProgress.percent}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs font-semibold text-violet-300">성공 시 평판 +{dailyOperation.reward}</span>
              </div>
            </div>
          ) : completedThisSession && dailyOperation ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span className="text-2xl">{getDailyOperationOffer(dailyOperation.offerId).emoji}</span>
              <div className="flex-1">
                <p className="font-bold">
                  오늘의 작전 {dailyOperation.status === "completed" ? "성공" : "실패"} · {getDailyOperationOffer(dailyOperation.offerId).title}
                </p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">{dailyOperation.resultDetail}</p>
              </div>
              <span className={dailyOperation.status === "completed" ? "font-bold text-[var(--up)]" : "font-bold text-[var(--down)]"}>
                {dailyOperation.status === "completed" ? `평판 +${dailyOperation.reward}` : "다음 거래일 재도전"}
              </span>
            </div>
          ) : (
            <div>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <p className="font-bold">🎯 1거래일 미니 목표 3택 1</p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">수락 시점부터 정확히 1시간 진행하며 현금 대신 평판을 얻습니다.</p>
                </div>
                <span className="text-[10px] text-[var(--muted)]">거래일마다 후보 교체</span>
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                {operationOffers.map((offer) => (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => {
                      const result = acceptDailyOperation(offer.id);
                      setMessage(result.message);
                    }}
                    className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-violet-400/60 hover:bg-violet-400/5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{offer.emoji}</span>
                      <span className="text-sm font-bold">{offer.title}</span>
                      <span className="ml-auto text-[10px] font-semibold text-violet-300">+{offer.reward}</span>
                    </div>
                    <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">{offer.target}</p>
                  </button>
                ))}
              </div>
              {message && <p className="mt-2 text-xs text-[var(--muted)]">{message}</p>}
            </div>
          )}
        </div>
      </section>
    </>
  );
}

function BriefingCard({
  label,
  title,
  detail,
  href,
  badgeClass,
}: {
  label: string;
  title: string;
  detail: string;
  href: string;
  badgeClass?: string;
}) {
  return (
    <Link
      href={href}
      className="group rounded-xl border border-[var(--border)] bg-[var(--background)]/60 p-3 transition hover:border-[var(--accent)]/50"
    >
      <p className="text-[10px] font-semibold text-[var(--muted)]">{label}</p>
      <div className="mt-1 flex items-center gap-2">
        {badgeClass && (
          <span className={`flex h-5 w-5 items-center justify-center rounded text-[10px] font-black ${badgeClass}`}>
            {title.slice(0, 1)}
          </span>
        )}
        <p className="truncate text-xs font-bold group-hover:text-[var(--accent)]">{title}</p>
      </div>
      <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-[var(--muted)]">{detail}</p>
    </Link>
  );
}

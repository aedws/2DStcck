"use client";

import { useState } from "react";
import {
  getInvestmentSeasonTier,
  getSeasonGoal,
  getSeasonTrait,
  getSeasonRivalPerformance,
} from "@/lib/market/investmentSeasons";
import type { InvestmentSeasonResult } from "@/lib/market/investmentSeasons";
import {
  buildSeasonMarketReview,
  type SeasonAssetAssessment,
} from "@/lib/market/seasonMarketReview";
import { getSeasonReward } from "@/lib/player/seasonRewards";

function signedPercent(value: number, point = false): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(2)}%${point ? "p" : ""}`;
}

export function SeasonCeremonyModal({
  result,
  onClose,
}: {
  result: InvestmentSeasonResult;
  onClose: () => void;
}) {
  const [step, setStep] = useState<"ceremony" | "market-review">("ceremony");
  const tier = getInvestmentSeasonTier(result.tierId);
  const goal = getSeasonGoal(result.goalId);
  const trait = getSeasonTrait(result.traitId);
  const rival = getSeasonRivalPerformance(
    result,
    result.endSession,
    result.seasonScore,
  );
  const beatRival = result.seasonScore >= rival.score;
  const seasonReward = getSeasonReward(`season-frame-${result.tierId}`);
  const marketReview = buildSeasonMarketReview(
    result.startSession,
    result.endSession,
  );

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="season-ceremony-title"
        className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-violet-400/40 bg-[var(--background)] shadow-2xl"
      >
        {step === "ceremony" ? (
          <>
        <div className="bg-gradient-to-br from-violet-500/20 via-transparent to-pink-500/15 px-6 py-7 text-center">
          <p className="text-xs font-semibold tracking-[0.25em] text-violet-300">SEASON COMPLETE</p>
          <div className="mt-4 text-6xl" aria-hidden>{tier.emoji}</div>
          <h2 id="season-ceremony-title" className="mt-3 text-2xl font-black">
            시즌 {result.number} · {tier.name}
          </h2>
          <p className="mt-1 text-sm text-[var(--muted)]">
            지수 대비 {signedPercent(result.alpha, true)} · 시즌 점수 {result.seasonScore}점
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 px-5 py-4 text-center">
          <ResultStat label="내 수익률" value={signedPercent(result.playerReturn)} />
          <ResultStat label="V-NASDAQ" value={signedPercent(result.benchmarkReturn)} />
          <ResultStat label="최대 낙폭" value={`${(result.maxDrawdown * 100).toFixed(2)}%`} />
        </div>

        {seasonReward && (
          <div className={`mx-5 rounded-2xl border p-4 ring-1 ${seasonReward.frameClass}`}>
            <p className="text-[10px] font-semibold tracking-[0.15em] text-[var(--muted)]">PERMANENT SEASON REWARD</p>
            <div className="mt-2 flex items-center gap-3">
              <span className="text-3xl">{seasonReward.emoji}</span>
              <div>
                <p className="font-black">영구 해금 · {seasonReward.name}</p>
                <p className="mt-0.5 text-xs text-[var(--muted)]">프로필에서 장착할 수 있으며 하위 티어 프레임도 함께 해금됩니다.</p>
              </div>
            </div>
          </div>
        )}

        {goal && (
          <div className="mx-5 rounded-2xl bg-[var(--surface)] p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold">{goal.emoji} {goal.name} · 목표 {(result.goalTargetWeight! * 100).toFixed(0)}%</p>
              <p className="text-sm font-semibold">준수율 {(result.goalComplianceRate * 100).toFixed(0)}%</p>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">
              기본 {result.baseScore}점 · 목표 보너스 +{result.goalBonus} · 미달 감점 -{result.goalPenalty}
            </p>
          </div>
        )}

        {trait && (
          <div className="mx-5 mt-3 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="font-bold">{trait.emoji} {trait.name}</p>
              <p className={`text-sm font-black ${result.traitScore >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                특성 {result.traitScore >= 0 ? "+" : ""}{result.traitScore}점
              </p>
            </div>
            <p className="mt-2 text-xs text-[var(--muted)]">{trait.description}</p>
          </div>
        )}

        <div className={`mx-5 mt-3 rounded-2xl border p-4 ${beatRival ? "border-[var(--up)]/40 bg-[var(--up)]/5" : "border-[var(--down)]/40 bg-[var(--down)]/5"}`}>
          <div className="flex items-center gap-3">
            <span className="text-3xl" aria-hidden>{rival.rival.emoji}</span>
            <div className="min-w-0 flex-1">
              <p className="text-xs text-[var(--muted)]">가상 라이벌 · {rival.rival.style}</p>
              <p className="font-bold">{rival.rival.name} {rival.score}점</p>
            </div>
            <p className={`text-lg font-black ${beatRival ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
              {beatRival ? "승리" : "패배"}
            </p>
          </div>
          <p className="mt-3 border-l-2 border-[var(--border)] pl-3 text-xs italic text-[var(--muted)]">
            “{rival.remark}”
          </p>
        </div>

        <div className="p-5">
          <button
            type="button"
            onClick={() => setStep("market-review")}
            className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white"
          >
            시장 상태 평가 보기 →
          </button>
        </div>
          </>
        ) : (
          <MarketReviewStep review={marketReview} onClose={onClose} />
        )}
      </div>
    </div>
  );
}

function MarketReviewStep({
  review,
  onClose,
}: {
  review: ReturnType<typeof buildSeasonMarketReview>;
  onClose: () => void;
}) {
  const biasColor =
    review.bias === "bullish"
      ? "text-[var(--up)]"
      : review.bias === "bearish"
        ? "text-[var(--down)]"
        : "text-amber-300";

  return (
    <>
      <div className="bg-gradient-to-br from-cyan-500/15 via-transparent to-violet-500/15 px-6 py-6">
        <p className="text-xs font-semibold tracking-[0.2em] text-cyan-300">
          SEASON MARKET REVIEW
        </p>
        <h2
          id="season-ceremony-title"
          className={`mt-3 text-2xl font-black ${biasColor}`}
        >
          {review.headline}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          {review.summary}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 px-5 py-4 text-center">
        <ResultStat
          label="국면 방향 효과"
          value={signedPercent(review.benchmarkStateReturn)}
        />
        <ResultStat
          label="평균 변동성"
          value={`×${review.averageVolatilityMultiplier.toFixed(2)}`}
        />
        <ResultStat label="위기 영향" value={`${review.crisisSessions}일`} />
      </div>

      <div className="mx-5 rounded-2xl bg-[var(--surface)] p-4">
        <p className="text-xs font-bold">시장 상태 구성</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {review.dominantRegimes.slice(0, 2).map((state) => (
            <span
              key={`regime-${state.id}`}
              className="rounded-full bg-[var(--background)] px-2.5 py-1 text-[11px]"
            >
              {state.emoji} {state.name} {state.sessions}일
            </span>
          ))}
          {review.dominantCycles.slice(0, 2).map((state) => (
            <span
              key={`cycle-${state.id}`}
              className="rounded-full bg-[var(--background)] px-2.5 py-1 text-[11px]"
            >
              {state.emoji} {state.name} {state.sessions}일
            </span>
          ))}
          {review.crisisLabel && (
            <span className="rounded-full bg-red-500/10 px-2.5 py-1 text-[11px] text-red-300">
              🚨 {review.crisisLabel} {review.crisisSessions}일
            </span>
          )}
        </div>
      </div>

      <div className="mx-5 mt-3 grid gap-3 sm:grid-cols-2">
        <AssetList
          title="유리했던 종목"
          emoji="▲"
          items={review.favorable}
          positive
        />
        <AssetList
          title="불리했던 종목"
          emoji="▼"
          items={review.unfavorable}
          positive={false}
        />
      </div>

      <p className="mx-5 mt-3 text-[10px] leading-relaxed text-[var(--muted)]">
        기계적 복기: 시장 국면·200거래일 사이클·대형 위기 업종 민감도와 파생상품
        배율만 재계산했습니다. 개별 기업 뉴스, 무작위 가격 노이즈와 실제 매매 시점은
        제외되므로 다음 시즌의 예측값이 아닙니다.
      </p>

      <div className="p-5">
        <button
          type="button"
          onClick={onClose}
          className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white"
        >
          복기 완료 · 다음 시즌 시작
        </button>
      </div>
    </>
  );
}

function AssetList({
  title,
  emoji,
  items,
  positive,
}: {
  title: string;
  emoji: string;
  items: SeasonAssetAssessment[];
  positive: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-3 ${
        positive
          ? "border-[var(--up)]/30 bg-[var(--up)]/5"
          : "border-[var(--down)]/30 bg-[var(--down)]/5"
      }`}
    >
      <p className={`text-xs font-bold ${positive ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
        {emoji} {title}
      </p>
      <div className="mt-2 space-y-2.5">
        {items.map((item, index) => (
          <div key={item.stockId}>
            <div className="flex items-baseline justify-between gap-2">
              <p className="min-w-0 truncate text-xs font-semibold">
                {index + 1}. {item.name}
              </p>
              <p
                className={`shrink-0 text-xs font-bold tabular-nums ${
                  item.mechanicalReturn >= 0
                    ? "text-[var(--up)]"
                    : "text-[var(--down)]"
                }`}
              >
                {signedPercent(item.mechanicalReturn)}
              </p>
            </div>
            <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--muted)]">
              {item.ticker} · {item.reason}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

function ResultStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--surface)] px-2 py-3">
      <p className="text-[10px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

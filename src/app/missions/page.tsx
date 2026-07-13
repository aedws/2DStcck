"use client";

import Link from "next/link";
import { useState } from "react";
import { formatPercent, formatPrice } from "@/lib/market/engine";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  INVESTMENT_MISSION_OFFERS,
  getMissionOffer,
  missionProgressPercent,
} from "@/lib/market/missions";
import {
  STORY_DECISION_OFFERS,
  getStoryArcAtSession,
  getStoryDecisionOffer,
  storyStageAtSession,
} from "@/lib/market/storyArcs";
import { useMarketStore } from "@/store/marketStore";

export default function MissionsPage() {
  useMarketStore((state) => state.tick);
  const mission = useMarketStore((state) => state.investmentMission);
  const history = useMarketStore((state) => state.missionHistory);
  const reputation = useMarketStore((state) => state.reputation);
  const accept = useMarketStore((state) => state.acceptInvestmentMission);
  const storyDecision = useMarketStore((state) => state.storyDecision);
  const storyDecisionHistory = useMarketStore((state) => state.storyDecisionHistory);
  const chooseStoryDecision = useMarketStore((state) => state.chooseStoryDecision);
  const getEquity = useMarketStore((state) => state.getEquity);
  const benchmark = useMarketStore((state) =>
    state.stocks.find((stock) => stock.id === "vnasdaq"),
  );
  const [message, setMessage] = useState<string | null>(null);
  const now = Date.now();
  const session = Math.floor(now / SESSION_DURATION_MS);
  const arc = getStoryArcAtSession(session);
  const stage = storyStageAtSession(arc, session);
  const currentStoryDecision = storyDecision?.storyId === arc.id ? storyDecision : null;
  const equity = getEquity();
  const benchmarkPrice = benchmark?.currentPrice ?? 0;

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">📋 사건·투자 의뢰</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            5거래일마다 하나의 사건을 추적하고 투자 의뢰 하나를 선택합니다.
          </p>
        </div>
        <div className="rounded-xl bg-[var(--surface)] px-4 py-2 text-right">
          <p className="text-[11px] text-[var(--muted)]">투자 평판</p>
          <p className="font-bold tabular-nums text-[var(--accent)]">{reputation.toLocaleString()}</p>
        </div>
      </div>

      <section className="mb-8 rounded-2xl border border-[var(--accent)]/30 bg-[var(--accent)]/5 p-5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-xs font-semibold text-[var(--accent)]">
            {stage === "rumor" ? "1단계 · 루머" : stage === "clue" ? "2단계 · 단서" : "3단계 · 결말"}
          </span>
          <span className="text-xs text-[var(--muted)]">결말 거래일 {arc.resolveSession}</span>
        </div>
        <div className="mt-4 flex items-start gap-3">
          <span className="text-3xl">{arc.character?.emoji ?? "🏢"}</span>
          <div>
            <Link href={`/stock/${arc.company.id}`} className="text-lg font-bold hover:underline">
              {arc.company.name}
            </Link>
            <p className="text-sm text-[var(--muted)]">
              {arc.character?.name} {arc.character?.title} · {arc.character?.traits.join(" · ")}
            </p>
            <p className="mt-2 text-sm leading-relaxed">
              {stage === "rumor"
                ? "중대한 발표가 예고됐지만 방향은 아직 공개되지 않았습니다."
                : stage === "clue"
                  ? `경영진 발언 신뢰도는 ${arc.confidence}%입니다. 단서가 틀릴 가능성도 고려해 포지션을 구성하세요.`
                  : `사건 결말이 공개됐습니다. 최종 가격 충격은 ${formatPercent(arc.impact * 100)}입니다.`}
            </p>
          </div>
        </div>
        {stage === "rumor" && (
          <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
            단서가 공개되는 거래일부터 상승·하락·관망 중 하나를 선택할 수 있습니다.
          </div>
        )}
        {stage === "clue" && !currentStoryDecision && (
          <div className="mt-4 grid gap-2 md:grid-cols-3">
            {STORY_DECISION_OFFERS.map((offer) => (
              <button
                key={offer.kind}
                onClick={() => {
                  const result = chooseStoryDecision(offer.kind);
                  setMessage(result.message);
                }}
                className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-left transition hover:border-[var(--accent)] hover:bg-[var(--accent)]/5"
              >
                <span className="text-lg">{offer.emoji}</span>
                <span className="ml-2 text-sm font-bold">{offer.title}</span>
                <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">
                  {offer.description}
                </span>
              </button>
            ))}
          </div>
        )}
        {currentStoryDecision && (
          <StoryDecisionResult decision={currentStoryDecision} />
        )}
        {stage === "resolution" && !currentStoryDecision && (
          <div className="mt-4 rounded-xl bg-[var(--surface)] p-3 text-sm text-[var(--muted)]">
            이번 사건에는 판단을 제출하지 않았습니다. 다음 사건의 단서를 노려보세요.
          </div>
        )}
        <Link href="/news" className="mt-4 inline-block text-sm font-semibold text-[var(--accent)] hover:underline">
          단계별 뉴스 확인 →
        </Link>
      </section>

      <section>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-bold">5거래일 투자 의뢰</h2>
          <span className="text-xs text-[var(--muted)]">
            {mission?.status === "active"
              ? `종료까지 ${Math.max(0, mission.endSession - session)}거래일`
              : "수락 후 5거래일 진행"}
          </span>
        </div>

        {mission?.status === "active" ? (
          <ActiveMission
            mission={mission}
            equity={equity}
            benchmarkPrice={benchmarkPrice}
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-3">
            {INVESTMENT_MISSION_OFFERS.map((offer) => (
              <div key={offer.kind} className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-2xl">{offer.emoji}</div>
                <h3 className="mt-2 font-bold">{offer.title}</h3>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-[var(--muted)]">{offer.description}</p>
                <p className="mt-3 text-xs font-semibold">목표 · {offer.target}</p>
                <p className="mt-1 text-xs text-[var(--accent)]">보상 · 평판 +{offer.reward}</p>
                <button
                  onClick={() => {
                    const result = accept(offer.kind);
                    setMessage(result.message);
                  }}
                  className="mt-4 rounded-xl bg-[var(--accent)] px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
                >
                  이 의뢰 선택
                </button>
              </div>
            ))}
          </div>
        )}
        {message && <p className="mt-3 text-sm text-[var(--muted)]">{message}</p>}
      </section>

      {history.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">최근 의뢰</h2>
          <ul className="space-y-2">
            {history.slice(0, 8).map((item) => {
              const offer = getMissionOffer(item.kind);
              return (
                <li key={item.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface)] p-3 text-sm">
                  <span>{offer.emoji}</span>
                  <span className="flex-1 font-medium">{offer.title}</span>
                  <span className={item.status === "completed" ? "text-[var(--up)]" : "text-[var(--down)]"}>
                    {item.status === "completed" ? `성공 · +${item.reward}` : "실패"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {storyDecisionHistory.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">최근 사건 판단</h2>
          <ul className="space-y-2">
            {storyDecisionHistory.slice(0, 8).map((item) => {
              const offer = getStoryDecisionOffer(item.kind);
              const delta = item.reputationDelta ?? 0;
              return (
                <li key={item.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface)] p-3 text-sm">
                  <span>{offer.emoji}</span>
                  <span className="flex-1 font-medium">{offer.title}</span>
                  <span className={delta > 0 ? "text-[var(--up)]" : delta < 0 ? "text-[var(--down)]" : "text-[var(--muted)]"}>
                    {delta > 0 ? `평판 +${delta}` : delta < 0 ? `평판 ${delta}` : "변동 없음"}
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

function StoryDecisionResult({
  decision,
}: {
  decision: NonNullable<ReturnType<typeof useMarketStore.getState>["storyDecision"]>;
}) {
  const offer = getStoryDecisionOffer(decision.kind);
  const delta = decision.reputationDelta ?? 0;
  return (
    <div className="mt-4 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-lg">{offer.emoji}</span>
        <span className="font-bold">내 판단 · {offer.title}</span>
        {decision.status === "active" ? (
          <span className="ml-auto text-xs text-[var(--accent)]">결말까지 선택 잠금</span>
        ) : (
          <span className={`ml-auto text-xs font-semibold ${delta > 0 ? "text-[var(--up)]" : delta < 0 ? "text-[var(--down)]" : "text-[var(--muted)]"}`}>
            {delta > 0 ? `평판 +${delta}` : delta < 0 ? `평판 ${delta}` : "평판 변동 없음"}
          </span>
        )}
      </div>
      {decision.status === "resolved" && (
        <p className="mt-1 text-xs text-[var(--muted)]">
          실제 결말은 {decision.outcomePositive ? "호재" : "악재"}였습니다.
        </p>
      )}
    </div>
  );
}

function ActiveMission({
  mission,
  equity,
  benchmarkPrice,
}: {
  mission: NonNullable<ReturnType<typeof useMarketStore.getState>["investmentMission"]>;
  equity: number;
  benchmarkPrice: number;
}) {
  const offer = getMissionOffer(mission.kind);
  const progress = missionProgressPercent(mission, equity, benchmarkPrice);
  const playerReturn = mission.startEquity > 0 ? (equity / mission.startEquity - 1) * 100 : 0;
  const benchmarkReturn = mission.startBenchmarkPrice > 0
    ? (benchmarkPrice / mission.startBenchmarkPrice - 1) * 100
    : 0;
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{offer.emoji}</span>
        <div className="flex-1">
          <p className="font-bold">{offer.title}</p>
          <p className="text-xs text-[var(--muted)]">{offer.target}</p>
        </div>
        <span className={mission.status === "completed" ? "text-[var(--up)]" : mission.status === "failed" ? "text-[var(--down)]" : "text-[var(--accent)]"}>
          {mission.status === "active" ? "진행 중" : mission.status === "completed" ? "성공" : "실패"}
        </span>
      </div>
      <div className="mt-4 h-2 overflow-hidden rounded-full bg-[var(--background)]">
        <div className="h-full rounded-full bg-[var(--accent)]" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3 text-xs">
        <div><p className="text-[var(--muted)]">현재 순자산</p><p className="font-semibold">{formatPrice(equity)}</p></div>
        <div><p className="text-[var(--muted)]">내 수익률</p><p className="font-semibold">{formatPercent(playerReturn)}</p></div>
        <div><p className="text-[var(--muted)]">시장 수익률</p><p className="font-semibold">{formatPercent(benchmarkReturn)}</p></div>
      </div>
    </div>
  );
}

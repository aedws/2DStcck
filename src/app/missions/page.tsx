"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCharacterById } from "@/data/characters";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import { formatPercent, formatPrice } from "@/lib/market/engine";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  INVESTMENT_MISSION_OFFERS,
  getMissionOffer,
  missionProgressPercent,
} from "@/lib/market/missions";
import {
  STORY_DECISION_OFFERS,
  STORY_BOND_DECISION_OFFER,
  getStoryArcAtSession,
  getStoryDecisionOffer,
  getPrivateStoryClue,
  storyStageAtSession,
} from "@/lib/market/storyArcs";
import {
  canUseBondChoice,
  CHARACTER_MISSION_AFFINITY,
  getCharacterProgress,
  PRIVATE_CLUE_AFFINITY,
} from "@/lib/market/characterProgress";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";

const MISSION_TUTORIAL_STEPS = [
  {
    emoji: "📋",
    title: "캐릭터의 5거래일 투자 의뢰",
    body: "현재 사건의 캐릭터가 의뢰인이 됩니다. 세 가지 목표 중 하나를 골라 5거래일 동안 순자산 성과를 만들어 보세요.",
  },
  {
    emoji: "🤝",
    title: "신뢰도는 실력의 증명",
    body: "의뢰에 성공하면 해당 캐릭터의 신뢰도가 5 오릅니다. 신뢰가 높을수록 개인 메시지에서 더 구체적이고 정확한 정보를 공유합니다.",
  },
  {
    emoji: "💗",
    title: "호감도는 관계의 깊이",
    body: "직접 주식을 순자산의 3% 이상으로 5거래일 보유하거나, 의뢰를 끝까지 수행하고 연속 사건에서 상승 지지 선택을 하면 호감도가 오릅니다.",
  },
  {
    emoji: "🌟",
    title: "호감도 100 특별 선택",
    body: "호감도 30부터 비공개 단서, 50부터 고난도 전용 의뢰가 열립니다. 사건 시작 전 호감도 100을 달성했다면 해당 캐릭터의 중요 사건에서 최상급 판정이 확정됩니다.",
  },
];

export default function MissionsPage() {
  useMarketStore((state) => state.tick);
  const mission = useMarketStore((state) => state.investmentMission);
  const history = useMarketStore((state) => state.missionHistory);
  const reputation = useMarketStore((state) => state.reputation);
  const characterProgressMap = useMarketStore((state) => state.characterProgress);
  const accept = useMarketStore((state) => state.acceptInvestmentMission);
  const storyDecision = useMarketStore((state) => state.storyDecision);
  const storyDecisionHistory = useMarketStore((state) => state.storyDecisionHistory);
  const chooseStoryDecision = useMarketStore((state) => state.chooseStoryDecision);
  const getEquity = useMarketStore((state) => state.getEquity);
  const benchmark = useMarketStore((state) =>
    state.stocks.find((stock) => stock.id === "vnasdaq"),
  );
  const [message, setMessage] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const onboarded = useSettingsStore((state) => state.onboarded);
  const tutorialSeen = useSettingsStore((state) => state.missionTutorialSeen);
  const setTutorialSeen = useSettingsStore((state) => state.setMissionTutorialSeen);
  useEffect(() => setMounted(true), []);
  const now = Date.now();
  const session = Math.floor(now / SESSION_DURATION_MS);
  const arc = getStoryArcAtSession(session);
  const stage = storyStageAtSession(arc, session);
  const currentStoryDecision = storyDecision?.storyId === arc.id ? storyDecision : null;
  const equity = getEquity();
  const benchmarkPrice = benchmark?.currentPrice ?? 0;
  const relationship = getCharacterProgress(characterProgressMap, arc.character?.id);
  const bondChoiceAvailable = canUseBondChoice(relationship, arc.windowStart);
  const missionOffers = INVESTMENT_MISSION_OFFERS.filter(
    (offer) =>
      offer.kind !== "character" ||
      relationship.affinity >= CHARACTER_MISSION_AFFINITY,
  );

  return (
    <div className="mx-auto max-w-4xl pb-20">
      {mounted && onboarded && !tutorialSeen && (
        <FeatureTutorialModal
          steps={MISSION_TUTORIAL_STEPS}
          onFinish={() => setTutorialSeen(true)}
        />
      )}
      <div className="mb-6 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">📋 사건·투자 의뢰</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            5거래일마다 하나의 사건을 추적하고 투자 의뢰 하나를 선택합니다.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/decisions"
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:border-[var(--accent)]"
          >
            결과 기록관
          </Link>
          <div className="rounded-xl bg-[var(--surface)] px-4 py-2 text-right">
            <p className="text-[11px] text-[var(--muted)]">투자 평판</p>
            <p className="font-bold tabular-nums text-[var(--accent)]">{reputation.toLocaleString()}</p>
          </div>
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
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="rounded-full bg-blue-500/10 px-2.5 py-1 text-blue-400">
                신뢰도 {relationship.trust}/100
              </span>
              <span className="rounded-full bg-pink-500/10 px-2.5 py-1 text-pink-400">
                호감도 {relationship.affinity}/120
              </span>
            </div>
            <p className="mt-2 text-sm leading-relaxed">
              {stage === "rumor"
                ? "중대한 발표가 예고됐지만 방향은 아직 공개되지 않았습니다."
                : stage === "clue"
                  ? `공개 단서 신뢰도는 ${arc.confidence}%입니다. 캐릭터 업무 신뢰도와 별개이며, 단서가 틀릴 가능성도 고려하세요.`
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
          <>
            {relationship.affinity >= PRIVATE_CLUE_AFFINITY && (
              <div className="mt-4 rounded-2xl border border-pink-500/30 bg-pink-500/5 p-4">
                <p className="text-xs font-bold text-pink-400">💬 비공개 개인 메시지</p>
                <p className="mt-2 text-sm leading-relaxed">
                  {getPrivateStoryClue(arc, relationship.trust)}
                </p>
              </div>
            )}
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
              {bondChoiceAvailable && (
                <button
                  onClick={() => {
                    const result = chooseStoryDecision(STORY_BOND_DECISION_OFFER.kind);
                    setMessage(result.message);
                  }}
                  className="rounded-xl border border-amber-400/60 bg-amber-400/10 p-3 text-left transition hover:bg-amber-400/15 md:col-span-3"
                >
                  <span className="text-lg">{STORY_BOND_DECISION_OFFER.emoji}</span>
                  <span className="ml-2 text-sm font-bold text-amber-300">
                    {STORY_BOND_DECISION_OFFER.title}
                  </span>
                  <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">
                    {STORY_BOND_DECISION_OFFER.description}
                  </span>
                </button>
              )}
            </div>
          </>
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
            {missionOffers.map((offer) => (
              <div key={offer.kind} className="flex flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-2xl">{offer.emoji}</div>
                <h3 className="mt-2 font-bold">{offer.title}</h3>
                <p className="mt-1 flex-1 text-xs leading-relaxed text-[var(--muted)]">{offer.description}</p>
                <p className="mt-3 text-xs font-semibold">목표 · {offer.target}</p>
                <p className="mt-1 text-xs text-[var(--accent)]">보상 · 평판 +{offer.reward}</p>
                <p className="mt-1 text-[11px] text-pink-400">
                  {arc.character?.emoji} {arc.character?.name} 의뢰 · 성공 시 신뢰 +{offer.kind === "character" ? 8 : 5} · 호감 +{offer.kind === "character" ? 6 : 4}
                </p>
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
              const issuer = getCharacterById(item.issuerCharacterId);
              return (
                <li key={item.id} className="flex items-center gap-3 rounded-xl bg-[var(--surface)] p-3 text-sm">
                  <span>{offer.emoji}</span>
                  <span className="flex-1 font-medium">
                    {offer.title}
                    {issuer && <span className="ml-2 text-xs font-normal text-[var(--muted)]">{issuer.emoji} {issuer.name}</span>}
                  </span>
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
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">최근 사건 판단</h2>
            <Link href="/decisions" className="text-xs font-semibold text-[var(--accent)] hover:underline">
              전체 결과 기록관 →
            </Link>
          </div>
          <ul className="space-y-2">
            {storyDecisionHistory.slice(0, 3).map((item) => {
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
        {decision.topGrade && (
          <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10px] font-bold text-amber-300">최상급 판정</span>
        )}
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
  const issuer = getCharacterById(mission.issuerCharacterId);
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
          {issuer && <p className="mt-0.5 text-xs text-pink-400">{issuer.emoji} {issuer.name}의 전용 의뢰</p>}
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

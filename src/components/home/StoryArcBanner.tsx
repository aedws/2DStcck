"use client";

import Link from "next/link";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  getStoryArcAtSession,
  getStoryDecisionOffer,
  storyStageAtSession,
} from "@/lib/market/storyArcs";
import { useMarketStore } from "@/store/marketStore";

const STAGE_COPY = {
  rumor: ["1단계 · 발표 예고", "결말의 방향은 아직 알 수 없습니다."],
  clue: ["2단계 · 단서 공개", "캐릭터 성격과 발언 신뢰도를 읽어보세요."],
  resolution: ["3단계 · 결말 공개", "이번 사건의 결과가 주가에 반영됐습니다."],
} as const;

export function StoryArcBanner() {
  useMarketStore((state) => state.tick);
  const storyDecision = useMarketStore((state) => state.storyDecision);
  const session = Math.floor(Date.now() / SESSION_DURATION_MS);
  const arc = getStoryArcAtSession(session);
  const stage = storyStageAtSession(arc, session);
  const currentDecision = storyDecision?.storyId === arc.id ? storyDecision : null;
  const [stageLabel, detail] = STAGE_COPY[stage];
  const daysLeft = Math.max(0, arc.resolveSession - session);

  return (
    <div className="border-b border-[var(--border)] bg-[var(--accent)]/5 px-3 py-2.5 md:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
        <span className="rounded-full bg-[var(--accent)]/15 px-2 py-1 font-semibold text-[var(--accent)]">
          연속 사건 · {stageLabel}
        </span>
        <Link href={`/stock/${arc.company.id}`} className="font-semibold hover:underline">
          {arc.character?.emoji} {arc.company.name}
        </Link>
        <span className="text-[var(--muted)]">{detail}</span>
        {stage !== "resolution" && (
          <span className="text-[var(--muted)]">결말까지 {daysLeft}거래일</span>
        )}
        {currentDecision && (
          <span className="font-semibold text-[var(--accent)]">
            내 판단 · {getStoryDecisionOffer(currentDecision.kind).emoji} {getStoryDecisionOffer(currentDecision.kind).title}
          </span>
        )}
        <Link href="/missions" className="ml-auto font-semibold text-[var(--accent)] hover:underline">
          {stage === "clue" && !currentDecision ? "판단 선택하기 →" : "사건·투자 의뢰 보기 →"}
        </Link>
      </div>
    </div>
  );
}

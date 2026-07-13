"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  getStoryArcForWindow,
  getStoryDecisionOffer,
} from "@/lib/market/storyArcs";
import type { StoryDecision } from "@/lib/types/market";
import { useMarketStore } from "@/store/marketStore";

type ArchiveFilter = "all" | "success" | "miss" | "observe";

const FILTERS: { id: ArchiveFilter; label: string }[] = [
  { id: "all", label: "전체" },
  { id: "success", label: "적중·절제" },
  { id: "miss", label: "오판" },
  { id: "observe", label: "관망" },
];

const THEME_LABEL = {
  contract: "대형 계약",
  earnings: "분기 실적",
  product: "신제품",
  scandal: "경영진 의혹",
} as const;

export default function DecisionArchivePage() {
  const history = useMarketStore((state) => state.storyDecisionHistory);
  const [filter, setFilter] = useState<ArchiveFilter>("all");
  const resolved = useMemo(
    () => history.filter((item) => item.status === "resolved"),
    [history],
  );
  const directional = resolved.filter((item) => item.kind !== "observe");
  const directionalWins = directional.filter((item) => (item.reputationDelta ?? 0) > 0).length;
  const reputation = resolved.reduce((sum, item) => sum + (item.reputationDelta ?? 0), 0);
  const disciplineWins = resolved.filter(
    (item) => item.kind === "observe" && (item.reputationDelta ?? 0) > 0,
  ).length;
  const filtered = useMemo(
    () => resolved.filter((item) => matchesFilter(item, filter)),
    [resolved, filter],
  );

  return (
    <div className="mx-auto max-w-5xl pb-20">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold text-[var(--accent)]">INVESTMENT JOURNAL</p>
          <h1 className="mt-1 text-2xl font-bold">🗃️ 사건 선택 결과 기록관</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            단서와 내 판단, 실제 결말을 비교해 다음 선택의 근거로 활용합니다.
          </p>
        </div>
        <Link href="/missions" className="text-sm font-semibold text-[var(--accent)] hover:underline">
          현재 사건으로 돌아가기 →
        </Link>
      </div>

      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Summary label="정산 판단" value={`${resolved.length}회`} />
        <Summary
          label="방향 적중률"
          value={directional.length > 0 ? `${Math.round((directionalWins / directional.length) * 100)}%` : "—"}
        />
        <Summary label="거짓 단서 회피" value={`${disciplineWins}회`} />
        <Summary
          label="누적 평판"
          value={`${reputation > 0 ? "+" : ""}${reputation}`}
          tone={reputation > 0 ? "up" : reputation < 0 ? "down" : undefined}
        />
      </section>

      <div className="mb-4 flex flex-wrap gap-2" role="group" aria-label="사건 결과 필터">
        {FILTERS.map((item) => (
          <button
            key={item.id}
            onClick={() => setFilter(item.id)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
              filter === item.id
                ? "bg-[var(--accent)] text-white"
                : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] p-10 text-center">
          <p className="font-semibold">기록된 결과가 없습니다.</p>
          <p className="mt-1 text-sm text-[var(--muted)]">
            사건 단서 단계에서 판단을 선택하고 결말 거래일까지 기다려보세요.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {filtered.map((item) => <DecisionRecord key={item.id} decision={item} />)}
        </ul>
      )}
    </div>
  );
}

function matchesFilter(decision: StoryDecision, filter: ArchiveFilter): boolean {
  if (filter === "all") return true;
  if (filter === "observe") return decision.kind === "observe";
  const delta = decision.reputationDelta ?? 0;
  if (filter === "success") return delta > 0;
  return decision.kind !== "observe" && delta < 0;
}

function DecisionRecord({ decision }: { decision: StoryDecision }) {
  const arc = getStoryArcForWindow(decision.windowStart);
  const offer = getStoryDecisionOffer(decision.kind);
  const delta = decision.reputationDelta ?? 0;
  const marketDay =
    decision.windowStart - Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS) + 1;
  const outcomePositive = decision.outcomePositive ?? arc.positive;
  const clueCorrect = arc.cluePositive === outcomePositive;

  return (
    <li className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="text-3xl" aria-hidden>{arc.character?.emoji ?? "🏢"}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/stock/${decision.companyId}`} className="font-bold hover:underline">
              {arc.company.name}
            </Link>
            <span className="rounded-full bg-[var(--background)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
              {marketDay}일차 · {THEME_LABEL[arc.theme]}
            </span>
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            단서 {arc.cluePositive ? "긍정" : "부정"} · 신뢰도 {arc.confidence}% · 실제 결말 {outcomePositive ? "호재" : "악재"}
          </p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${
          delta > 0
            ? "bg-[var(--up)]/10 text-[var(--up)]"
            : delta < 0
              ? "bg-[var(--down)]/10 text-[var(--down)]"
              : "bg-[var(--background)] text-[var(--muted)]"
        }`}>
          {delta > 0 ? `평판 +${delta}` : delta < 0 ? `평판 ${delta}` : "평판 변동 없음"}
        </span>
      </div>
      <div className="mt-3 grid gap-2 text-xs sm:grid-cols-3">
        <RecordFact label="내 선택" value={`${offer.emoji} ${offer.title}`} />
        <RecordFact label="단서 판정" value={clueCorrect ? "진짜 단서" : "거짓 단서"} />
        <RecordFact
          label="선택 결과"
          value={delta > 0 ? "성공" : delta < 0 ? "오판" : decision.kind === "observe" ? "관망 유지" : "중립"}
        />
      </div>
    </li>
  );
}

function Summary({ label, value, tone }: { label: string; value: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-2xl bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${tone === "up" ? "text-[var(--up)]" : tone === "down" ? "text-[var(--down)]" : ""}`}>
        {value}
      </p>
    </div>
  );
}

function RecordFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[var(--background)] px-3 py-2">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="ml-2 font-semibold">{value}</span>
    </div>
  );
}

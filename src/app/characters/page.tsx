"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { getCompanyDefinitions } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import {
  getCharacterRelation,
  type CharacterRelationStatus,
} from "@/lib/market/characterRelations";
import type { Character, StockDefinition } from "@/lib/types/market";
import { useMarketStore } from "@/store/marketStore";
import {
  getCharacterProgress,
  getRelationshipTier,
  MAX_CHARACTER_AFFINITY,
} from "@/lib/market/characterProgress";

const CARD_STYLE: Record<CharacterRelationStatus, string> = {
  leverage: "border-pink-400/60 bg-pink-500/10",
  hostile: "border-red-500/60 bg-red-500/10",
  "covered-call": "border-amber-400/60 bg-amber-400/10",
  direct: "border-sky-400/60 bg-sky-500/10",
  locked: "border-[var(--border)] bg-[var(--surface)] opacity-65",
};

const BADGE_STYLE: Record<CharacterRelationStatus, string> = {
  leverage: "bg-pink-500/20 text-pink-300",
  hostile: "bg-red-500/20 text-red-400",
  "covered-call": "bg-amber-500/20 text-amber-300",
  direct: "bg-sky-500/20 text-sky-300",
  locked: "bg-[var(--background)] text-[var(--muted)]",
};

export default function CharactersPage() {
  const holdings = useMarketStore((state) => state.holdings);
  const characterProgress = useMarketStore((state) => state.characterProgress);
  const preferredShares = useMarketStore((state) => state.preferredShares);
  const preferredByCharacter = useMemo(
    () => new Set(preferredShares.map((share) => share.characterId)),
    [preferredShares],
  );
  const entries = useMemo(
    () =>
      getCompanyDefinitions()
        .map((company) => ({ company, ceo: getCharacterById(company.ceoId) }))
        .filter((entry): entry is { company: StockDefinition; ceo: Character } => Boolean(entry.ceo)),
    [],
  );
  const relations = useMemo(
    () => new Map(entries.map(({ company }) => [company.id, getCharacterRelation(company.id, holdings)])),
    [entries, holdings],
  );
  const discovered = entries.filter(
    ({ company }) => relations.get(company.id)?.unlocked,
  ).length;
  const favorites = entries.filter(
    ({ ceo }) =>
      getCharacterProgress(characterProgress, ceo.id).affinity >=
      MAX_CHARACTER_AFFINITY,
  ).length;

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <div className="mb-4 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">🎭 캐릭터 도감</h1>
        <span className="text-xs text-[var(--muted)]">
          활성화 {discovered} / {entries.length}
        </span>
      </div>
      <div className="mb-5 grid grid-cols-3 gap-2">
        <SummaryStat label="활성화" value={`${discovered}/${entries.length}`} tone="text-sky-400" />
        <SummaryStat label="최애 ⭐" value={`${favorites}/${entries.length}`} tone="text-amber-400" />
        <SummaryStat label="우선주 🎖️" value={`${preferredShares.length}/${entries.length}`} tone="text-emerald-400" />
      </div>
      <p className="mb-5 text-sm text-[var(--muted)]">
        일반 주식·레버리지·커버드콜을 보유하면 도감이 활성화됩니다. 인버스만 보유하면 상세 정보는 잠긴 채 적대 관계로 표시됩니다.
      </p>
      <div className="mb-5 flex flex-wrap gap-2 text-[11px]">
        <Legend color="bg-pink-400" label="레버리지 동맹 · 최우선" />
        <Legend color="bg-red-500" label="인버스 적대" />
        <Legend color="bg-amber-400" label="커버드콜" />
        <Legend color="bg-sky-400" label="일반 보유" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(({ company, ceo }) => {
          const relation = relations.get(company.id)!;
          const progress = getCharacterProgress(characterProgress, ceo.id);
          const content = (
            <>
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--background)] text-2xl">
                {relation.status === "locked" ? "❔" : ceo.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold">
                    {relation.status === "locked" ? "미발견" : ceo.name}
                  </p>
                  <span className="shrink-0 text-[11px] text-[var(--muted)]">
                    {relation.unlocked ? ceo.title : "보유 시 활성화"}
                  </span>
                  <span className={`ml-auto shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${BADGE_STYLE[relation.status]}`}>
                    {relation.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {company.name} <span className="text-[var(--border)]">·</span> {company.ticker}
                </p>
                {relation.unlocked && ceo.traits.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ceo.traits.map((trait) => (
                      <span key={trait} className="rounded-full bg-[var(--background)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                        {trait}
                      </span>
                    ))}
                  </div>
                )}
                {relation.unlocked && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[10px]">
                    {progress.affinity < 0 ? (
                      <span className="rounded-full bg-red-500/15 px-2 py-0.5 font-semibold text-red-400">
                        ⚔️ 적대
                      </span>
                    ) : (
                      <span className="rounded-full bg-pink-500/15 px-2 py-0.5 font-semibold text-pink-300">
                        {getRelationshipTier(progress.affinity).emoji}{" "}
                        {getRelationshipTier(progress.affinity).name}
                      </span>
                    )}
                    <span className="text-[var(--muted)]">
                      신뢰 <span className="text-blue-400">{progress.trust}</span> · 호감{" "}
                      <span className="text-pink-400">{progress.affinity}</span>
                    </span>
                    {progress.affinity >= MAX_CHARACTER_AFFINITY && (
                      <span className="font-semibold text-amber-400">관계 완성 ★</span>
                    )}
                    {preferredByCharacter.has(ceo.id) && (
                      <span className="rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-300">
                        🎖️ 우선주
                      </span>
                    )}
                  </div>
                )}
                {relation.unlocked && ceo.bio && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">{ceo.bio}</p>
                )}
              </div>
            </>
          );
          const className = `flex items-start gap-3 rounded-2xl border p-4 transition ${CARD_STYLE[relation.status]} ${relation.unlocked ? "hover:border-[var(--accent)]/70" : "cursor-not-allowed"}`;

          return relation.unlocked ? (
            <Link key={company.id} href={`/characters/${company.id}`} className={className}>
              {content}
            </Link>
          ) : (
            <div key={company.id} className={className} aria-disabled="true">
              {content}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-center">
      <p className="text-[10px] text-[var(--muted)]">{label}</p>
      <p className={`mt-0.5 text-lg font-bold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5 rounded-full bg-[var(--surface)] px-2.5 py-1 text-[var(--muted)]">
      <span className={`h-2 w-2 rounded-full ${color}`} />
      {label}
    </span>
  );
}

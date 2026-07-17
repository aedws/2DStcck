"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getCompanyDefinitions } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import { CharacterGuidelineTag } from "@/components/market/CharacterGuidelineTag";
import { formatPrice } from "@/lib/market/engine";
import { getCharacterRelation } from "@/lib/market/characterRelations";
import {
  getCharacterProgress,
  getRelationshipTier,
  MAX_CHARACTER_AFFINITY,
  PREFERRED_SHARE_AFFINITY,
} from "@/lib/market/characterProgress";
import { computeCharacterConcentration } from "@/lib/market/characterConcentration";
import { isPreferredActive } from "@/lib/player/preferredShares";
import { useMarketStore } from "@/store/marketStore";

export function CharacterDetailClient({ id }: { id: string }) {
  const company = useMemo(
    () => getCompanyDefinitions().find((c) => c.id === id),
    [id],
  );
  const ceo = getCharacterById(company?.ceoId);
  const live = useMarketStore((s) => s.getStockById(id));
  const holdings = useMarketStore((state) => state.holdings);
  const events = useMarketStore((s) => s.events);
  const characterProgress = useMarketStore((s) => s.characterProgress);
  const preferredShares = useMarketStore((s) => s.preferredShares);
  const allStocks = useMarketStore((s) => s.stocks);
  const getEquity = useMarketStore((s) => s.getEquity);
  const relatedNews = useMemo(
    () =>
      events.filter((e) => e.quoteBy && e.affectedStockIds.includes(id)),
    [events, id],
  );

  if (!company || !ceo) {
    return (
      <div className="py-20 text-center text-[var(--muted)]">
        <p>캐릭터를 찾을 수 없습니다.</p>
        <Link href="/characters" className="mt-2 inline-block text-[var(--accent)]">
          도감으로 돌아가기
        </Link>
      </div>
    );
  }

  const relation = getCharacterRelation(id, holdings);
  const progress = getCharacterProgress(characterProgress, ceo.id);
  const tier = getRelationshipTier(progress.affinity);
  const preferredShare = preferredShares.find((s) => s.characterId === ceo.id);
  const untilAlly = Math.max(0, PREFERRED_SHARE_AFFINITY - progress.affinity);
  const concentration = computeCharacterConcentration(
    holdings,
    allStocks,
    getEquity(),
  );
  const preferredActive = preferredShare
    ? isPreferredActive(preferredShare, concentration)
    : false;
  if (!relation.unlocked) {
    return (
      <div className="mx-auto max-w-2xl pb-20">
        <Link href="/characters" className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]">
          ← 도감
        </Link>
        <div className={`mt-4 rounded-2xl border p-8 text-center ${relation.status === "hostile" ? "border-red-500/60 bg-red-500/10" : "border-[var(--border)] bg-[var(--surface)]"}`}>
          <p className="text-4xl">{relation.status === "hostile" ? "⚔️" : "🔒"}</p>
          <h1 className="mt-3 text-xl font-bold">{relation.label}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            일반 주식·레버리지·커버드콜을 보유하면 캐릭터 상세 정보가 활성화됩니다.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <Link
        href="/characters"
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        ← 도감
      </Link>

      <div className="mt-4 flex items-start gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface)] text-5xl">
          {ceo.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold">{ceo.name}</h1>
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${relation.status === "leverage" ? "bg-pink-500/20 text-pink-300" : relation.status === "hostile" ? "bg-red-500/20 text-red-400" : relation.status === "covered-call" ? "bg-amber-500/20 text-amber-300" : "bg-sky-500/20 text-sky-300"}`}>
              {relation.label}
            </span>
            <span className="rounded-full bg-pink-500/15 px-2 py-0.5 text-[10px] font-semibold text-pink-300">
              {tier.emoji} {tier.name}
            </span>
            {progress.affinity >= MAX_CHARACTER_AFFINITY && (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-300">
                관계 완성 ★
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--muted)]">
            {ceo.title} · {company.name}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {ceo.traits.map((t) => (
              <span
                key={t}
                className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {ceo.bio && (
        <p className="mt-4 rounded-2xl bg-[var(--surface)] p-4 text-sm leading-relaxed">
          {ceo.bio}
        </p>
      )}

      <div className="mt-4">
        <CharacterGuidelineTag ceoId={ceo.id} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/5 p-4">
          <p className="text-xs text-blue-400">업무 신뢰도</p>
          <p className="mt-1 text-xl font-bold tabular-nums">{progress.trust}<span className="text-xs font-normal text-[var(--muted)]"> / 100</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--background)]">
            <div className="h-full rounded-full bg-blue-400" style={{ width: `${progress.trust}%` }} />
          </div>
        </div>
        <div className={`rounded-2xl border p-4 ${progress.affinity < 0 ? "border-red-500/30 bg-red-500/5" : "border-pink-500/20 bg-pink-500/5"}`}>
          <p className={`text-xs ${progress.affinity < 0 ? "text-red-400" : "text-pink-400"}`}>
            개인 호감도{progress.affinity < 0 ? " · ⚔️ 적대" : ""}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums">{progress.affinity}<span className="text-xs font-normal text-[var(--muted)]"> / 120</span></p>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--background)]">
            <div className="h-full rounded-full bg-pink-400" style={{ width: `${Math.max(0, (progress.affinity / 120) * 100)}%` }} />
          </div>
        </div>
      </div>

      {progress.affinity < 0 && (
        <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs leading-relaxed text-red-300">
          ⚔️ 인버스·곱버스로 이 캐릭터에 반대 베팅 중입니다. 호감도가 음수로 내려가
          주주 권리가 약해져 우선주 배당이 감소하고, 우선주 발행도 막힙니다.
        </p>
      )}

      {preferredShare ? (
        <div className={`mt-4 rounded-2xl border p-4 ${preferredActive ? "border-amber-400/40 bg-amber-400/10" : "border-[var(--border)] bg-[var(--surface)]"}`}>
          <p className={`flex items-center gap-2 text-sm font-bold ${preferredActive ? "text-amber-300" : "text-[var(--muted)]"}`}>
            🎖️ 동맹 보상 우선주 {preferredShare.shares}좌{" "}
            {preferredActive ? "· 활성" : "· 💤 휴면(집중 해제)"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {company.name}이(가) 발행한 매매불가 특별주(액면 = 발행 시 본주×1.15). 액면{" "}
            {formatPrice(preferredShare.faceValue * preferredShare.shares)} · 분기 배당{" "}
            {formatPrice(preferredShare.dividendPerShare * preferredShare.shares)}.{" "}
            {preferredActive
              ? "집중 유지 중이라 총자산·랭킹·배당에 반영됩니다."
              : "집중(원 앤 온리·트윈 스타·트리플 하르모니아)을 다시 만들면 자산·배당이 되살아납니다. 지금은 휴면입니다."}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] p-4">
          <p className="text-sm font-semibold">🎖️ 동맹 보상 우선주</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            호감도 {PREFERRED_SHARE_AFFINITY}(동맹) 도달 + 집중 투자(원 앤 온리·트윈
            스타·트리플 하르모니아) 상태일 때 {company.name}이(가) 고배당 우선주
            1좌를 발행합니다. 앞으로 호감{" "}
            <span className="font-semibold text-pink-400">{untilAlly}</span> 더 필요.
          </p>
        </div>
      )}

      <div className="mt-4 rounded-2xl border border-[var(--border)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">
              {company.name}{" "}
              <span className="text-xs text-[var(--muted)]">
                {company.ticker}
              </span>
            </p>
            <p className="text-xs text-[var(--muted)]">
              {company.sector}
              {company.subsector ? ` · ${company.subsector}` : ""}
            </p>
          </div>
          {live && (
            <p className="text-lg font-bold tabular-nums">
              {formatPrice(live.currentPrice)}
            </p>
          )}
        </div>
        {company.description && (
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            {company.description}
          </p>
        )}
        <Link
          href={`/stock/${company.id}`}
          className="mt-3 block rounded-xl bg-[var(--accent)] py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
        >
          거래하기
        </Link>
      </div>

      {relatedNews.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold">최근 한마디</h2>
          <ul className="space-y-2">
            {[...relatedNews]
              .reverse()
              .slice(0, 5)
              .map((e) => (
                <li
                  key={e.id}
                  className="rounded-2xl bg-[var(--surface)] p-3 text-xs"
                >
                  <p className="font-medium">{e.title}</p>
                  {e.quote && (
                    <p className="mt-1 italic text-[var(--muted)]">
                      “{e.quote}”
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

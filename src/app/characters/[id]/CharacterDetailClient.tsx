"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getCompanyDefinitions } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import { CharacterGuidelineTag } from "@/components/market/CharacterGuidelineTag";
import { StockRequestForm } from "@/components/market/StockRequestForm";
import { formatPrice } from "@/lib/market/engine";
import { getCharacterRelation } from "@/lib/market/characterRelations";
import {
  getCharacterProgress,
  getRelationshipTier,
  LONG_HOLD_SESSIONS,
  MAX_CHARACTER_AFFINITY,
  PREFERRED_SHARE_AFFINITY,
} from "@/lib/market/characterProgress";
import { computeCharacterConcentration } from "@/lib/market/characterConcentration";
import {
  isPreferredActive,
  preferredGrantIntervalSessions,
} from "@/lib/player/preferredShares";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { sessionEta } from "@/lib/market/sessionTime";
import {
  getAmcCharacterLinkedHoldings,
  mergeAmcPortfolioFunds,
} from "@/lib/player/amcPortfolio";
import { listedFundToAmcState } from "@/lib/supabase/amcListedFunds";
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
  const assetManager = useMarketStore((s) => s.assetManager);
  const listedAmcFunds = useMarketStore((s) => s.listedAmcFunds);
  const preferredShares = useMarketStore((s) => s.preferredShares);
  const preferredIssuedCharacterIds = useMarketStore(
    (s) => s.preferredIssuedCharacterIds,
  );
  const allStocks = useMarketStore((s) => s.stocks);
  const getEquity = useMarketStore((s) => s.getEquity);
  // 이 캐릭터가 실제로 말한 뉴스만 노출한다. quoteBy 는 "이모지 이름" 표시
  // 문자열이라, 이 캐릭터의 표시명과 일치하는 대사만 고른다(다른 캐릭터가
  // 반응한 섹터·거시 뉴스가 섞여 나오던 문제 해결).
  const speakerLabel = ceo ? `${ceo.emoji} ${ceo.name}` : "";
  const relatedNews = useMemo(
    () =>
      speakerLabel
        ? events.filter((e) => e.quoteBy === speakerLabel)
        : [],
    [events, speakerLabel],
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

  const progress = getCharacterProgress(characterProgress, ceo.id);
  const userEtfFunds = mergeAmcPortfolioFunds(
    assetManager?.funds ?? [],
    listedAmcFunds.map(listedFundToAmcState),
  );
  const relation = getCharacterRelation(id, holdings, {
    stocks: allStocks,
    funds: userEtfFunds,
    permanentlyUnlocked:
      progress.bondedAtSession !== undefined || progress.affinity >= 100,
  });
  const tier = getRelationshipTier(progress.affinity);
  const preferredShare = preferredShares.find((s) => s.characterId === ceo.id);
  const untilAlly = Math.max(0, PREFERRED_SHARE_AFFINITY - progress.affinity);
  const concentration = computeCharacterConcentration(
    holdings,
    allStocks,
    getEquity(),
    getAmcCharacterLinkedHoldings(holdings, userEtfFunds, allStocks),
  );
  const preferredActive = preferredShare
    ? isPreferredActive(preferredShare, concentration)
    : false;
  // 발행됐다가 집중 해제로 매각되어 사라진 상태(재발행 불가)
  const preferredSoldGone =
    !preferredShare && preferredIssuedCharacterIds.includes(ceo.id);

  // 실제 시간 타이머(1거래일 = 1시간). 다음 호감도 상승·우선주 지급 시각을 계산한다.
  const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
  const affinitySessionsLeft =
    LONG_HOLD_SESSIONS - ((progress.holdingSessions ?? 0) % LONG_HOLD_SESSIONS);
  const affinityEta = sessionEta(affinitySessionsLeft);
  const grantSessionsLeft = preferredShare
    ? Math.max(
        0,
        preferredGrantIntervalSessions(progress.affinity) -
          (currentSession -
            (preferredShare.lastIssuedSession ?? preferredShare.issuedSession)),
      )
    : 0;
  const grantEta = sessionEta(grantSessionsLeft);
  // 호감도가 실제로 오르는 상태(우선주 보유 또는 이 캐릭터 포지션 보유)에서만
  // 다음 상승 타이머를 보여준다.
  const affinityGaining =
    progress.affinity < MAX_CHARACTER_AFFINITY &&
    progress.affinity >= 0 &&
    (preferredShare != null ||
      concentration.ranked.some((r) => r.characterId === ceo.id && r.share > 0));
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
            일반 주식·레버리지·커버드콜 또는 해당 캐릭터를 담은 유저 ETF를
            보유하면 캐릭터 상세 정보가 활성화됩니다.
          </p>
        </div>
        <div className="mt-4">
          <StockRequestForm
            defaultSector={company.sector}
            contextLabel={ceo.name}
          />
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
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${relation.status === "leverage" ? "bg-pink-500/20 text-pink-300" : relation.status === "hostile" ? "bg-red-500/20 text-red-400" : relation.status === "covered-call" ? "bg-amber-500/20 text-amber-300" : relation.status === "bonded" ? "bg-violet-500/20 text-violet-300" : "bg-sky-500/20 text-sky-300"}`}>
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
          {affinityGaining && (
            <p className="mt-1.5 text-[10px] text-pink-300/80">
              ⏱️ 다음 상승 {affinityEta.countdown}
            </p>
          )}
        </div>
      </div>

      {progress.affinity < 0 && (
        <p className="mt-3 rounded-2xl border border-red-500/30 bg-red-500/5 px-4 py-3 text-xs leading-relaxed text-red-300">
          ⚔️ 인버스·곱버스로 이 캐릭터에 반대 베팅 중입니다. 호감도가 음수로 내려가
          주주 권리가 약해져 우선주 배당이 감소하고, 우선주 발행도 막힙니다.
        </p>
      )}

      {preferredShare ? (
        <div className={`mt-4 rounded-2xl border p-4 ${preferredActive ? "border-amber-400/40 bg-amber-400/10" : "border-orange-400/40 bg-orange-400/10"}`}>
          <p className={`flex items-center gap-2 text-sm font-bold ${preferredActive ? "text-amber-300" : "text-orange-300"}`}>
            🎖️ 동맹 보상 우선주 {preferredShare.shares}좌{" "}
            {preferredActive ? "· 활성" : "· 💤 휴면(집중 해제)"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {company.name}이(가) 발행한 매매불가 특별주. 가치는 본주 등락을 비대칭
            추종(상승 200%·하락 20%)합니다. 현재 가치{" "}
            {formatPrice(preferredShare.faceValue * preferredShare.shares)} · 20일 배당{" "}
            {formatPrice(preferredShare.dividendPerShare * preferredShare.shares)}.{" "}
            {preferredActive
              ? "집중과 호감 100 이상을 유지하면 5거래일당 100%(20거래일마다 가치의 400%)를 배당합니다. 추가 지급은 호감 100→5거래일·120→3거래일·150→2거래일마다 1좌입니다."
              : "지금은 휴면(자산·배당 0)입니다. 다시 집중하면 부활하지만, 5캐릭터 이상으로 분산하는 순간 전량 소멸하며 환급되지 않습니다."}
          </p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--muted)]">
            ℹ️ 좌당 가치·배당은 매 거래일 갱신되어 저장되며, 발행 시점의 본주
            가격을 기준으로 계산됩니다. 같은 캐릭터라도 발행 시점에 따라 좌당
            가치·배당이 다를 수 있습니다.
          </p>
          {preferredActive && (
            <p className="mt-1.5 text-[10px] font-semibold text-amber-300/90">
              ⏱️ 다음 1좌 지급 {grantEta.countdown} · {grantEta.clock} (호감{" "}
              {progress.affinity} · {preferredGrantIntervalSessions(progress.affinity)}
              거래일마다)
            </p>
          )}
        </div>
      ) : preferredSoldGone ? (
        <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-sm font-semibold text-[var(--muted)]">🎖️ 동맹 보상 우선주 · 매각 완료</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            이미 발행되었다가 장기 분산으로 매각되었습니다. 현금화된 우선주는 무한
            재발행을 막기 위해 다시 지급되지 않습니다.
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-2xl border border-dashed border-[var(--border)] p-4">
          <p className="text-sm font-semibold">🎖️ 동맹 보상 우선주</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            호감도 {PREFERRED_SHARE_AFFINITY}(동맹) 도달 + 집중 투자(원 앤 온리·트윈
            스타·트리플 하르모니아) 상태일 때 {company.name}이(가) 고배당 우선주
            1좌를 지급합니다. 이후 조건을 유지하면 호감 100→5거래일·120→3거래일·150→
            2거래일마다 1좌를 추가 지급합니다. 앞으로 호감{" "}
            <span className="font-semibold text-pink-400">{untilAlly}</span> 더 필요.
          </p>
          <p className="mt-1.5 text-[10px] leading-relaxed text-[var(--muted)]">
            ℹ️ 우선주 좌당 가치·배당은 매 거래일 갱신·저장되며, 발행 시점의 본주
            가격을 기준으로 하므로 발행 시점에 따라 달라집니다.
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

      <div className="mt-4">
        <StockRequestForm
          defaultSector={company.sector}
          contextLabel={ceo.name}
        />
      </div>
    </div>
  );
}

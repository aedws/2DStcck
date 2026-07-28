"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMarketStore } from "@/store/marketStore";
import {
  isRecentlyListed,
  isUpcomingIpo,
  listingCountdownLabel,
} from "@/lib/market/ipo";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  getActiveScheduledWar,
  getScheduledWarFrontline,
  scheduledWarFactionName,
} from "@/lib/market/scheduledWar";
import { getCharacterById } from "@/data/characters";
import { ScheduledWarTerritoryMap } from "@/components/home/ScheduledWarTerritoryMap";

/** 상장 후 이 시간 동안 '신규 상장' 알림을 홈에 띄운다. 지나면 홈에서 내린다. */
const RECENT_WINDOW_MS = 12 * 60 * 60 * 1000;

/**
 * 홈 IPO 배너 — 곧 상장할 종목의 카운트다운과, 방금(24시간 내) 상장한 종목의
 * '신규 상장' 알림을 홈 상단에 띄운다. 종목 신청은 재화가 드는 만큼, 상장이
 * 시행되는 순간을 놓치지 않게 홈에서 눈에 띄게 알려준다.
 */
export function HomeIpoBanner() {
  const stocks = useMarketStore((s) => s.stocks);
  const events = useMarketStore((s) => s.events);
  useMarketStore((s) => s.tick);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  // 파생상품(인버스·레버리지·커버드콜)은 기초 종목과 함께 상장되므로, 배너엔
  // 대표 종목(기초 기업)만 노출한다.
  const isPrimary = (s: (typeof stocks)[number]) =>
    !s.universalDerivative &&
    s.leverage === undefined &&
    !s.coveredCallUnderlyingId;
  const recent = useMemo(
    () =>
      stocks
        .filter((s) => isPrimary(s) && isRecentlyListed(s, RECENT_WINDOW_MS, now))
        .sort((a, b) => (b.listingEpochMs ?? 0) - (a.listingEpochMs ?? 0)),
    [stocks, now],
  );
  const upcoming = useMemo(
    () =>
      stocks
        .filter((s) => isPrimary(s) && isUpcomingIpo(s, now))
        .sort((a, b) => (a.listingEpochMs ?? 0) - (b.listingEpochMs ?? 0)),
    [stocks, now],
  );
  const activeWar = getActiveScheduledWar(
    Math.floor(now / SESSION_DURATION_MS),
  );

  if (!mounted) return null;
  if (activeWar) {
    const frontline = getScheduledWarFrontline(activeWar);
    const latestWarNews = [...events]
      .filter(
        (event) =>
          event.id.startsWith("gt-war-") ||
          event.tag === "전쟁",
      )
      .sort((a, b) => b.timestamp - a.timestamp)[0];
    const leaderLabel = frontline.leader
      ? `${scheduledWarFactionName(frontline.leader)} 우세`
      : "백중세";
    return (
      <section className="overflow-hidden rounded-3xl border border-rose-400/40 bg-[linear-gradient(135deg,rgba(69,10,10,0.96),rgba(15,23,42,0.98)_48%,rgba(8,47,73,0.96))] text-white shadow-[0_18px_45px_rgba(15,23,42,0.3)]">
        <div className="border-b border-white/10 px-4 py-3 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/20 px-2.5 py-1 text-[10px] font-black tracking-[0.16em] text-rose-200">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-rose-400" />
                LIVE
              </span>
              <h2 className="text-sm font-black sm:text-base">
                게-트 대전쟁 전황
              </h2>
            </div>
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-[11px] font-bold text-slate-200">
              {activeWar.phase.emoji} {activeWar.phase.name} ·{" "}
              {activeWar.phaseSession + 1}/{activeWar.phase.duration}거래일
            </span>
          </div>
        </div>

        <div className="px-4 py-4 sm:px-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-[11px] font-black">
              <span className="rounded-full bg-rose-500/20 px-2.5 py-1 text-rose-200">
                게헨나 {frontline.gehennaRegions}곳
              </span>
              <span className="rounded-full bg-amber-400/15 px-2.5 py-1 text-amber-200">
                교전 {frontline.contestedRegions}곳
              </span>
              <span className="rounded-full bg-sky-500/20 px-2.5 py-1 text-sky-200">
                트리니티 {frontline.trinityRegions}곳
              </span>
            </div>
            <span className="rounded-full bg-white/10 px-3 py-1 text-[10px] font-bold text-white/80">
              {leaderLabel} · 전략 점유율{" "}
              {Math.max(
                frontline.gehennaControl,
                frontline.trinityControl,
              ).toFixed(0)}
              %
            </span>
          </div>

          <ScheduledWarTerritoryMap regions={frontline.regions} />

          <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-black/15 p-3">
              <p className="text-[10px] font-black tracking-[0.12em] text-amber-200">
                현재 상황
              </p>
              <p className="mt-1.5 text-xs leading-relaxed text-slate-200">
                {frontline.situation}
              </p>
            </div>
            <Link
              href="/news"
              className="rounded-2xl border border-white/10 bg-white/5 p-3 transition hover:border-white/25 hover:bg-white/10"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black tracking-[0.12em] text-sky-200">
                  전쟁 속보
                </p>
                <span className="text-[10px] text-white/60">뉴스 →</span>
              </div>
              <p className="mt-1.5 text-xs font-bold leading-relaxed text-white">
                {latestWarNews?.title ?? frontline.headline}
              </p>
              <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-slate-300">
                {latestWarNews?.description ?? activeWar.phase.description}
              </p>
            </Link>
          </div>

          <div className="mt-3 flex items-center justify-between gap-3 text-[10px] text-slate-300">
            <span>전 계정 동일 점령 상황 · 전역 세션마다 자동 갱신</span>
            <span className="font-bold text-white">
              종료까지 {activeWar.sessionsLeft}거래일
            </span>
          </div>
        </div>
      </section>
    );
  }
  // 방금 상장은 모두, 상장 예정은 임박순 최대 4개까지 띄운다.
  const listedList = recent.slice(0, 3);
  const upcomingList = upcoming.slice(0, 4);
  if (listedList.length === 0 && upcomingList.length === 0) return null;

  const emojiOf = (ceoId?: string) => getCharacterById(ceoId)?.emoji ?? "📈";

  return (
    <div className="space-y-2">
      {listedList.map((listed) => (
        <Link
          key={listed.id}
          href={`/stock/${listed.id}`}
          className="flex items-center gap-3 rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/10 px-4 py-3 transition hover:border-[var(--accent)]/70"
        >
          <span className="text-2xl">{emojiOf(listed.ceoId)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold">
              🎉 신규 상장! {listed.name}{" "}
              <span className="text-[var(--muted)]">({listed.ticker})</span>
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              방금 상장했어요 — 신청해 두셨다면 지금 바로 거래할 수 있습니다.
            </p>
          </div>
          <span className="shrink-0 text-xs font-semibold text-[var(--accent)]">
            거래하기 →
          </span>
        </Link>
      ))}
      {upcomingList.map((next) => (
        <Link
          key={next.id}
          href="/ipo"
          className="flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 transition hover:border-[var(--accent)]/50"
        >
          <span className="text-xl">{emojiOf(next.ceoId)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">
              🔔 상장 예정 · {next.name}{" "}
              <span className="text-[var(--muted)]">({next.ticker})</span>
            </p>
            <p className="mt-0.5 text-[11px] text-[var(--muted)]">
              {listingCountdownLabel(next, now)} · 시각 맞춰 자동 개장
            </p>
          </div>
          <span className="shrink-0 text-xs text-[var(--muted)]">IPO →</span>
        </Link>
      ))}
    </div>
  );
}

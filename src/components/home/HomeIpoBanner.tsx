"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMarketStore } from "@/store/marketStore";
import {
  isRecentlyListed,
  isUpcomingIpo,
  listingCountdownLabel,
} from "@/lib/market/ipo";
import { getCharacterById } from "@/data/characters";

/** 상장 후 이 시간 동안 '신규 상장' 알림을 홈에 띄운다. */
const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000;

/**
 * 홈 IPO 배너 — 곧 상장할 종목의 카운트다운과, 방금(24시간 내) 상장한 종목의
 * '신규 상장' 알림을 홈 상단에 띄운다. 종목 신청은 재화가 드는 만큼, 상장이
 * 시행되는 순간을 놓치지 않게 홈에서 눈에 띄게 알려준다.
 */
export function HomeIpoBanner() {
  const stocks = useMarketStore((s) => s.stocks);
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

  if (!mounted) return null;
  // 방금 상장은 모두, 상장 예정은 임박순 최대 4개까지 띄운다.
  const listedList = recent.slice(0, 3);
  const upcomingList = upcoming.slice(0, 4);
  if (listedList.length === 0 && upcomingList.length === 0) return null;

  const emojiOf = (ceoId?: string) => getCharacterById(ceoId)?.emoji ?? "📈";

  return (
    <div className="mx-4 mt-3 space-y-2 md:mx-5">
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

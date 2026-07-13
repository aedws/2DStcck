"use client";

import Link from "next/link";
import { useMemo } from "react";
import { getCharacterById } from "@/data/characters";
import {
  EARNINGS_INTERVAL_SESSIONS,
  getEarningsCalendar,
  type EarningsCalendarEntry,
} from "@/lib/market/earningsCalendar";
import {
  MARKET_EPOCH_MS,
  SESSION_DURATION_MS,
} from "@/lib/market/constants";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";
import { useMarketStore } from "@/store/marketStore";

const EPOCH_SESSION = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);

export default function EarningsCalendarPage() {
  useMarketStore((state) => state.tick);
  const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
  const entries = useMemo(
    () => getEarningsCalendar(currentSession - 5, currentSession + 20),
    [currentSession],
  );
  const upcoming = entries.filter((entry) => entry.session >= currentSession);
  const recent = entries.filter((entry) => entry.session < currentSession).reverse();

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <div className="mb-6">
        <h1 className="text-2xl font-bold">🗓️ 실적 캘린더</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          기업별 {EARNINGS_INTERVAL_SESSIONS}거래일 주기로 예정된 실적 발표를 확인하고 현물·옵션 포지션을 준비하세요.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3 text-center">
        <Summary label="오늘 발표" value={String(upcoming.filter((entry) => entry.session === currentSession).length)} />
        <Summary label="향후 5일" value={String(upcoming.filter((entry) => entry.session <= currentSession + 5).length)} />
        <Summary label="다음 발표" value={upcoming[0] ? dayLabel(upcoming[0].session, currentSession) : "없음"} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold">예정된 발표</h2>
        <div className="space-y-2">
          {upcoming.map((entry) => (
            <EarningsCard key={entry.id} entry={entry} currentSession={currentSession} />
          ))}
        </div>
      </section>

      {recent.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-bold">최근 발표 결과</h2>
          <div className="space-y-2">
            {recent.map((entry) => (
              <EarningsCard key={entry.id} entry={entry} currentSession={currentSession} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function EarningsCard({
  entry,
  currentSession,
}: {
  entry: EarningsCalendarEntry;
  currentSession: number;
}) {
  const announced = entry.session <= currentSession;
  const character = getCharacterById(entry.company.ceoId);
  const resultLabel =
    entry.result === "beat" ? "예상 상회" : entry.result === "miss" ? "예상 하회" : "예상 부합";

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[var(--background)] text-xl">
          {character?.emoji ?? "🏢"}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Link href={`/stock/${entry.company.id}`} className="font-bold hover:underline">
              {entry.company.name}
            </Link>
            <span className="text-xs text-[var(--muted)]">{entry.company.ticker} · {entry.quarter}분기</span>
            {announced && (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${upDownClass(entry.impact)}`}>
                {resultLabel}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-[var(--muted)]">
            시장 예상 매출 성장률 {entry.consensusGrowthPercent.toFixed(1)}% · 예상 변동폭 ±{entry.expectedMovePercent.toFixed(1)}%
          </p>
          {announced && (
            <p className="mt-1 text-sm">
              실제 {entry.actualGrowthPercent.toFixed(1)}% · 차이 {entry.surprisePoint >= 0 ? "+" : ""}{entry.surprisePoint.toFixed(1)}%p · 주가 충격 <span className={upDownClass(entry.impact)}>{formatSignedPercent(entry.impact * 100)}</span>
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="text-sm font-bold">{dayLabel(entry.session, currentSession)}</p>
          <p className="text-[10px] text-[var(--muted)]">시장 {entry.session - EPOCH_SESSION + 1}일차</p>
        </div>
      </div>
    </article>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-bold tabular-nums">{value}</p>
    </div>
  );
}

function dayLabel(session: number, currentSession: number): string {
  const delta = session - currentSession;
  if (delta === 0) return "오늘";
  if (delta > 0) return `D-${delta}`;
  return `D+${Math.abs(delta)}`;
}

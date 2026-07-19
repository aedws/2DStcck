"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { formatPrice } from "@/lib/market/engine";
import {
  isUpcomingIpo,
  isRecentlyListed,
  listingCountdownLabel,
} from "@/lib/market/ipo";
import { StockRequestForm } from "@/components/market/StockRequestForm";
import { BugReportForm } from "@/components/market/BugReportForm";
import { useMarketStore } from "@/store/marketStore";

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24시간

export default function IpoPage() {
  const stocks = useMarketStore((s) => s.stocks);
  const [mounted, setMounted] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    setMounted(true);
    const t = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(t);
  }, []);

  const upcoming = useMemo(
    () =>
      stocks
        .filter((s) => isUpcomingIpo(s, now))
        .sort((a, b) => (a.listingEpochMs ?? 0) - (b.listingEpochMs ?? 0)),
    [stocks, now],
  );
  const recent = useMemo(
    () =>
      stocks
        .filter((s) => isRecentlyListed(s, RECENT_WINDOW_MS, now))
        .sort((a, b) => (b.listingEpochMs ?? 0) - (a.listingEpochMs ?? 0)),
    [stocks, now],
  );

  return (
    <div className="mx-auto max-w-md pb-20">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">📈 IPO</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          곧 상장할 신규 종목을 미리 확인하고, 원하는 종목·캐릭터를 직접
          신청하세요. 상장 시각이 되면 공모가로 자동 개장됩니다.
        </p>
      </div>

      {/* 상장 예정 */}
      <section className="mb-5">
        <h2 className="mb-2 text-sm font-bold">상장 예정</h2>
        {!mounted ? null : upcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-xs text-[var(--muted)]">
            예정된 IPO가 없습니다. 아래에서 새 종목을 신청해 보세요.
          </div>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((s) => (
              <li
                key={s.id}
                className="rounded-2xl border border-[var(--accent)]/40 bg-[var(--accent)]/5 p-4"
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="font-bold">
                      {s.name}
                      <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                        {s.ticker} · {s.sector}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-[var(--muted)]">
                      공모가 {formatPrice(s.initialPrice)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-[var(--accent)] px-2.5 py-1 text-xs font-semibold text-white">
                    {listingCountdownLabel(s, now)}
                  </span>
                </div>
                {s.description && (
                  <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                    {s.description}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* 최근 상장 */}
      {mounted && recent.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 text-sm font-bold">🆕 최근 상장</h2>
          <ul className="space-y-2">
            {recent.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
              >
                <div className="min-w-0">
                  <p className="font-semibold">
                    {s.name}
                    <span className="ml-2 text-xs font-normal text-[var(--muted)]">
                      {s.ticker}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-[var(--muted)]">
                    현재가 {formatPrice(s.currentPrice)}
                  </p>
                </div>
                <Link
                  href={`/stock/${s.id}`}
                  className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-1.5 text-xs font-semibold text-white"
                >
                  거래하기
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* 종목 신청 */}
      <StockRequestForm />

      {/* 버그 리포트 */}
      <div className="mt-4">
        <BugReportForm />
      </div>
    </div>
  );
}

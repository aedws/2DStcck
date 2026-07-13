"use client";

import Link from "next/link";
import { formatTradeTime } from "@/lib/market/engine";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";
import { useMarketStore } from "@/store/marketStore";

/** 시장 뉴스 아카이브: 저장된 이벤트(최근 50건)를 최신순으로 */
export default function NewsPage() {
  const events = useMarketStore((s) => s.events);
  const stocks = useMarketStore((s) => s.stocks);
  const history = [...events].reverse();

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-xl font-bold">📰 시장 뉴스</h1>
        <div className="flex items-center gap-3">
          <Link href="/calendar" className="text-xs font-semibold text-[var(--accent)] hover:underline">
            실적 캘린더 →
          </Link>
          <span className="text-xs text-[var(--muted)]">최근 {history.length}건</span>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--muted)]">
          아직 발생한 뉴스가 없습니다. 뉴스가 뜨면 관련 종목이 움직입니다.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {history.map((event) => {
            const affected = event.affectedStockIds
              .map((id) => stocks.find((s) => s.id === id))
              .filter((s) => s !== undefined);

            return (
              <li key={event.id} className="rounded-2xl bg-[var(--surface)] p-4">
                <div className="flex items-center gap-2">
                  {event.storyStageLabel && (
                    <span className="shrink-0 rounded-full bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-semibold text-[var(--accent)]">
                      {event.storyStageLabel}
                    </span>
                  )}
                  <span className={`text-xs ${upDownClass(event.impact)}`}>
                    {event.impact >= 0 ? "▲" : "▼"}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                    {event.title}
                  </p>
                  {event.tag && (
                    <span className="shrink-0 rounded-full bg-[var(--background)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                      {event.tag}
                    </span>
                  )}
                  <span
                    className={`shrink-0 text-[11px] tabular-nums ${upDownClass(event.impact)}`}
                  >
                    {formatSignedPercent(event.impact * 100)}
                  </span>
                  <span className="shrink-0 text-[11px] tabular-nums text-[var(--muted)]">
                    {formatTradeTime(event.timestamp)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                  {event.description}
                </p>
                {event.quote && (
                  <p className="mt-2 border-l-2 border-[var(--accent)]/50 pl-3 text-xs italic leading-relaxed text-[var(--foreground)]">
                    “{event.quote}”
                    {event.quoteBy && (
                      <span className="ml-1 not-italic text-[var(--muted)]">
                        — {event.quoteBy}
                      </span>
                    )}
                  </p>
                )}
                {affected.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {affected.slice(0, 8).map((s) => (
                      <Link
                        key={s.id}
                        href={`/stock/${s.id}`}
                        className="rounded-full bg-[var(--background)] px-2.5 py-1 text-[11px] text-[var(--muted)] transition hover:text-[var(--foreground)]"
                      >
                        {s.name}
                      </Link>
                    ))}
                    {affected.length > 8 && (
                      <span className="px-1 py-1 text-[11px] text-[var(--muted)]">
                        외 {affected.length - 8}종목
                      </span>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

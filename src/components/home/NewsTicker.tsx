"use client";

import type { MarketEvent } from "@/lib/types/market";
import { formatTradeTime } from "@/lib/market/engine";
import { upDownClass } from "@/lib/ui/marketColors";

/** 상단 우측 뉴스 패널: 최근 시장 이벤트 3건 */
export function NewsTicker({ events }: { events: MarketEvent[] }) {
  const recent = [...events].reverse().slice(0, 3);

  return (
    <div className="flex min-w-0 flex-1 flex-col justify-center rounded-xl bg-[var(--surface)] px-4 py-2">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--muted)]">
          📰 시장 뉴스
        </span>
      </div>
      {recent.length === 0 ? (
        <p className="truncate text-xs text-[var(--muted)]">
          아직 발생한 뉴스가 없습니다. 뉴스가 뜨면 관련 종목이 움직입니다.
        </p>
      ) : (
        <ul className="space-y-0.5">
          {recent.map((event) => (
            <li key={event.id} className="flex min-w-0 items-center gap-2">
              <span
                className={`shrink-0 text-[10px] font-semibold ${upDownClass(event.impact)}`}
              >
                {event.impact >= 0 ? "▲" : "▼"}
              </span>
              <span className="truncate text-xs font-medium">
                {event.title}
              </span>
              <span className="hidden shrink-0 truncate text-[11px] text-[var(--muted)] lg:inline">
                {event.description}
              </span>
              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-[var(--muted)]">
                {formatTradeTime(event.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

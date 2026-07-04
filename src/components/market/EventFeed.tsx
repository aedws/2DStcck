"use client";

import type { MarketEvent } from "@/lib/types/market";
import { formatPercent, formatTradeTime } from "@/lib/market/engine";

export function EventFeed({ events }: { events: MarketEvent[] }) {
  const recent = [...events].reverse().slice(0, 8);

  if (recent.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <h2 className="mb-2 text-sm font-medium text-zinc-400">시장 이벤트</h2>
        <p className="text-sm text-zinc-600">아직 발생한 이벤트가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <h2 className="mb-3 text-sm font-medium text-zinc-400">시장 이벤트</h2>
      <ul className="space-y-3">
        {recent.map((event) => (
          <li
            key={event.id}
            className="border-b border-zinc-800 pb-3 last:border-0 last:pb-0"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-medium">{event.title}</span>
              <span className="text-xs text-zinc-500">
                {formatTradeTime(event.timestamp)}
              </span>
            </div>
            <p className="mt-1 text-xs text-zinc-500">{event.description}</p>
            <p
              className={`mt-1 text-xs font-mono ${
                event.impact >= 0 ? "text-emerald-400" : "text-red-400"
              }`}
            >
              영향: {formatPercent(event.impact * 100)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

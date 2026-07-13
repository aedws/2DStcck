"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice, formatPercent } from "@/lib/market/engine";
import {
  fetchLeaderboard,
  getCurrentUserId,
  type LeaderboardEntry,
} from "@/lib/supabase/cloudSave";
import { IS_CLOUD_ENABLED, useMarketStore } from "@/store/marketStore";
import { upDownClass } from "@/lib/ui/marketColors";

const RANK_MEDAL = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const getTotalAssets = useMarketStore((s) => s.getTotalAssets);
  const initialCash = useMarketStore((s) => s.initialCash);

  const load = useCallback(async () => {
    if (!IS_CLOUD_ENABLED) {
      setLoading(false);
      return;
    }
    setLoading(true);
    const [rows, id] = await Promise.all([
      fetchLeaderboard(100),
      getCurrentUserId(),
    ]);
    setEntries(rows);
    setMyId(id);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const myTotal = getTotalAssets();
  const myReturn =
    initialCash > 0 ? ((myTotal - initialCash) / initialCash) * 100 : 0;

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">🏆 랭킹</h1>
        {IS_CLOUD_ENABLED && (
          <button
            onClick={load}
            className="rounded-lg bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            새로고침
          </button>
        )}
      </div>
      <p className="mb-5 text-sm text-[var(--muted)]">
        모두가 같은 시장에서 경쟁합니다. 순위 기준은 <b>순자산</b>(현금 + 주식 +
        사치재)입니다.
      </p>

      {!IS_CLOUD_ENABLED ? (
        <div className="space-y-4">
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5">
            <p className="text-sm font-semibold">내 순자산 (로컬)</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {formatPrice(myTotal)}
            </p>
            <p className={`text-sm ${upDownClass(myReturn)}`}>
              {formatPercent(myReturn)}
            </p>
          </div>
          <p className="rounded-xl bg-[var(--surface)] px-4 py-3 text-xs leading-relaxed text-[var(--muted)]">
            공유 랭킹은 클라우드(Supabase) 계정 모드에서 활성화됩니다. 로그인하면
            같은 시장의 다른 플레이어와 순자산 순위를 겨룰 수 있어요.
          </p>
        </div>
      ) : loading ? (
        <p className="py-16 text-center text-sm text-[var(--muted)]">
          불러오는 중…
        </p>
      ) : entries.length === 0 ? (
        <p className="py-16 text-center text-sm text-[var(--muted)]">
          아직 랭킹에 오른 플레이어가 없습니다. 로그인하고 거래를 시작하면 순위에
          등록됩니다.
        </p>
      ) : (
        <ol className="space-y-2">
          {entries.map((entry, i) => {
            const isMe = entry.userId === myId;
            return (
              <li
                key={entry.userId}
                className={`flex items-center gap-3 rounded-2xl border p-3.5 ${
                  isMe
                    ? "border-[var(--accent)] bg-[var(--accent)]/5"
                    : "border-[var(--border)] bg-[var(--surface)]"
                }`}
              >
                <span className="w-8 shrink-0 text-center text-lg font-bold tabular-nums">
                  {RANK_MEDAL[i] ?? i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-sm font-semibold">
                      {entry.displayName}
                    </span>
                    {isMe && (
                      <span className="shrink-0 rounded bg-[var(--accent)] px-1.5 py-0.5 text-[10px] font-semibold text-white">
                        나
                      </span>
                    )}
                  </div>
                  {entry.showcase.length > 0 && (
                    <div className="mt-0.5 text-sm leading-none">
                      {entry.showcase.join(" ")}
                      {entry.luxuryCount > entry.showcase.length && (
                        <span className="ml-1 text-[10px] text-[var(--muted)]">
                          +{entry.luxuryCount - entry.showcase.length}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-semibold tabular-nums">
                    {formatPrice(entry.netWorth)}
                  </p>
                  <p className={`text-xs tabular-nums ${upDownClass(entry.returnRate)}`}>
                    {formatPercent(entry.returnRate)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

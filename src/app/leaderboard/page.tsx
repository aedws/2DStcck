"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice, formatPercent } from "@/lib/market/engine";
import {
  LEADERBOARD_REFRESH_MS,
  fetchLeaderboard,
  fetchRegisteredAccountCount,
  getCurrentUserId,
  type LeaderboardEntry,
} from "@/lib/supabase/cloudSave";
import { upDownClass } from "@/lib/ui/marketColors";

const RANK_MEDAL = ["🥇", "🥈", "🥉"];

export default function LeaderboardPage() {
  const [mode, setMode] = useState<"prestige" | "netWorth" | "weekly">("prestige");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [myId, setMyId] = useState<string | null>(null);
  const [accountCount, setAccountCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastLoadedAt, setLastLoadedAt] = useState(0);
  const [now, setNow] = useState(Date.now());

  const load = useCallback(async () => {
    setLoading(true);
    const [rows, id, registeredCount] = await Promise.all([
      fetchLeaderboard(100, mode),
      getCurrentUserId(),
      fetchRegisteredAccountCount(),
    ]);
    setEntries(rows);
    setMyId(id);
    setAccountCount(registeredCount);
    setLoading(false);
    setLastLoadedAt(Date.now());
  }, [mode]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const refresh = window.setInterval(() => void load(), LEADERBOARD_REFRESH_MS);
    const clock = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(refresh);
      window.clearInterval(clock);
    };
  }, [load]);

  const secondsUntilRefresh = lastLoadedAt
    ? Math.max(0, Math.ceil((lastLoadedAt + LEADERBOARD_REFRESH_MS - now) / 1_000))
    : 0;

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">🏆 랭킹</h1>
        <div className="text-right">
          <button
            type="button"
            onClick={load}
            className="rounded-lg bg-[var(--surface)] px-3 py-1.5 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            지금 새로고침
          </button>
          <p className="mt-1 text-[10px] text-[var(--muted)]">
            10분 자동 갱신 · {Math.floor(secondsUntilRefresh / 60)}:{String(secondsUntilRefresh % 60).padStart(2, "0")}
          </p>
        </div>
      </div>
      <p className="mb-5 text-sm text-[var(--muted)]">
        모두가 같은 시장에서 경쟁합니다. 대표 순위는 <b>프레스티지</b>(캐릭터
        호감도·업적·시즌 티어·숙련도·과시의 종합)이며, 순자산·주간 수익률은 부가
        지표입니다. 자산은 프레스티지를 쌓는 연료입니다.
      </p>

      <div className="mb-5 grid grid-cols-3 rounded-xl bg-[var(--surface)] p-1">
        <button
          type="button"
          onClick={() => setMode("prestige")}
          className={`min-h-10 rounded-lg text-sm font-semibold ${mode === "prestige" ? "bg-[var(--background)] text-[var(--foreground)]" : "text-[var(--muted)]"}`}
        >
          ✨ 프레스티지
        </button>
        <button
          type="button"
          onClick={() => setMode("netWorth")}
          className={`min-h-10 rounded-lg text-sm font-semibold ${mode === "netWorth" ? "bg-[var(--background)] text-[var(--foreground)]" : "text-[var(--muted)]"}`}
        >
          총 순자산
        </button>
        <button
          type="button"
          onClick={() => setMode("weekly")}
          className={`min-h-10 rounded-lg text-sm font-semibold ${mode === "weekly" ? "bg-[var(--background)] text-[var(--foreground)]" : "text-[var(--muted)]"}`}
        >
          주간 수익률
        </button>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--muted)]">등록 계정</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {accountCount === null ? "—" : `${accountCount.toLocaleString()}명`}
          </p>
        </div>
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <p className="text-xs text-[var(--muted)]">현재 표시된 랭커</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">
            {loading ? "—" : `${entries.length.toLocaleString()}명`}
          </p>
        </div>
      </div>

      {loading ? (
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
                  {entry.title && (
                    <p className="mt-0.5 truncate text-[11px] font-semibold text-[var(--accent)]">
                      {entry.title}
                    </p>
                  )}
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
                    {mode === "prestige"
                      ? `✨ ${entry.prestige.toLocaleString()}`
                      : mode === "weekly"
                        ? `${entry.weeklyReturn >= 0 ? "+" : ""}${entry.weeklyReturn.toFixed(2)}%`
                        : formatPrice(entry.netWorth)}
                  </p>
                  <p className={`text-xs tabular-nums ${mode === "prestige" ? "text-[var(--muted)]" : upDownClass(mode === "weekly" ? entry.weeklyReturn : entry.returnRate)}`}>
                    {mode === "prestige"
                      ? `${formatPrice(entry.netWorth)} · ${entry.tradeCount}체결`
                      : mode === "weekly"
                        ? `${formatPrice(entry.netWorth)} · 승률 ${entry.winRate.toFixed(0)}%`
                        : `${formatPercent(entry.returnRate)} · ${entry.tradeCount}체결`}
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

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { getCharacterMessages } from "@/lib/market/characterMessages";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { formatTradeTime } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";

const KIND_LABEL = {
  clue: "비공개 단서",
  earnings: "실적 힌트",
  mission: "의뢰 답장",
  relationship: "관계 알림",
} as const;

export default function CharacterMessagesPage() {
  useMarketStore((state) => state.tick);
  const progress = useMarketStore((state) => state.characterProgress);
  const missionHistory = useMarketStore((state) => state.missionHistory);
  const readIds = useMarketStore((state) => state.readCharacterMessageIds);
  const markRead = useMarketStore((state) => state.markCharacterMessageRead);
  const markAllRead = useMarketStore((state) => state.markAllCharacterMessagesRead);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
  const messages = useMemo(
    () => getCharacterMessages({ progress, missionHistory, currentSession }),
    [progress, missionHistory, currentSession],
  );
  const readSet = useMemo(() => new Set(readIds), [readIds]);
  const unread = messages.filter((message) => !readSet.has(message.id));
  const visible = unreadOnly ? unread : messages;

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">💬 캐릭터 메시지</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            비공개 사건 단서, 실적 힌트와 의뢰 답장을 확인합니다.
          </p>
        </div>
        {unread.length > 0 && (
          <button
            onClick={() => markAllRead(messages.map((message) => message.id))}
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-semibold hover:border-[var(--accent)]"
          >
            모두 읽음
          </button>
        )}
      </div>

      <div className="mb-4 flex gap-2">
        <button
          onClick={() => setUnreadOnly(false)}
          className={`rounded-full px-3 py-1.5 text-xs ${!unreadOnly ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--muted)]"}`}
        >
          전체 {messages.length}
        </button>
        <button
          onClick={() => setUnreadOnly(true)}
          className={`rounded-full px-3 py-1.5 text-xs ${unreadOnly ? "bg-[var(--accent)] text-white" : "bg-[var(--surface)] text-[var(--muted)]"}`}
        >
          안 읽음 {unread.length}
        </button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl bg-[var(--surface)] px-5 py-16 text-center">
          <p className="text-3xl">📭</p>
          <p className="mt-3 text-sm font-semibold">
            {unreadOnly ? "새 메시지가 없습니다" : "아직 도착한 메시지가 없습니다"}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            캐릭터 호감도 30을 달성하거나 투자 의뢰를 완료하면 메시지가 도착합니다.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((message) => {
            const isUnread = !readSet.has(message.id);
            return (
              <li key={message.id}>
                <Link
                  href={message.href}
                  onClick={() => markRead(message.id)}
                  className={`block rounded-2xl border p-4 transition hover:border-[var(--accent)] ${isUnread ? "border-[var(--accent)]/40 bg-[var(--accent)]/5" : "border-[var(--border)] bg-[var(--surface)]"}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--background)] text-2xl">
                      {message.emoji}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold">{message.sender}</span>
                        <span className="rounded-full bg-[var(--background)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                          {KIND_LABEL[message.kind]}
                        </span>
                        {isUnread && <span className="h-2 w-2 rounded-full bg-[var(--accent)]" aria-label="안 읽음" />}
                        <span className="ml-auto text-[10px] text-[var(--muted)]">
                          {formatTradeTime(message.timestamp)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm font-semibold">{message.title}</p>
                      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{message.body}</p>
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

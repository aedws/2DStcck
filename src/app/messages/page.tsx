"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useVisiblePolling } from "@/lib/ui/useVisiblePolling";
import {
  getCharacterMessages,
  type CharacterMessage,
} from "@/lib/market/characterMessages";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { formatTradeTime } from "@/lib/market/engine";
import {
  listMyShareholderLetters,
  markAllShareholderLettersRead,
  markShareholderLetterRead,
  type ShareholderLetter,
} from "@/lib/supabase/shareholderLetters";
import { useMarketStore } from "@/store/marketStore";
import { useToastStore } from "@/store/toastStore";

const KIND_LABEL = {
  clue: "비공개 단서",
  earnings: "실적 힌트",
  mission: "의뢰 답장",
  relationship: "관계 알림",
  shareholder_letter: "CEO 주주서한",
  system: "게임 알림",
} as const;

interface InboxMessage extends CharacterMessage {
  isRead: boolean;
  shareholderLetterId?: string;
  notificationId?: string;
}

export default function CharacterMessagesPage() {
  useMarketStore((state) => state.tick);
  const progress = useMarketStore((state) => state.characterProgress);
  const missionHistory = useMarketStore((state) => state.missionHistory);
  const userId = useMarketStore((state) => state.userId);
  const cloudSyncReady = useMarketStore((state) => state.cloudSyncReady);
  const readIds = useMarketStore((state) => state.readCharacterMessageIds);
  const markRead = useMarketStore((state) => state.markCharacterMessageRead);
  const markAllRead = useMarketStore((state) => state.markAllCharacterMessagesRead);
  const notifications = useToastStore((state) => state.notifications);
  const markNotificationRead = useToastStore(
    (state) => state.markNotificationRead,
  );
  const markAllNotificationsRead = useToastStore(
    (state) => state.markAllNotificationsRead,
  );
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [shareholderLetters, setShareholderLetters] = useState<ShareholderLetter[]>([]);
  const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
  const characterMessages = useMemo(
    () => getCharacterMessages({ progress, missionHistory, currentSession }),
    [progress, missionHistory, currentSession],
  );
  const readSet = useMemo(() => new Set(readIds), [readIds]);

  useEffect(() => {
    if (!userId || !cloudSyncReady) setShareholderLetters([]);
  }, [userId, cloudSyncReady]);
  // 탭이 보일 때만 60초 주기로 갱신(배경 폴링 중단 → 전송량 절감).
  useVisiblePolling(
    () => {
      if (!userId || !cloudSyncReady) return;
      void listMyShareholderLetters().then(setShareholderLetters);
    },
    60_000,
    [userId, cloudSyncReady],
  );

  const messages = useMemo<InboxMessage[]>(() => {
    const characterInbox = characterMessages.map((message) => ({
      ...message,
      isRead: readSet.has(message.id),
    }));
    const shareholderInbox = shareholderLetters.map((letter) => {
      const createdAt = new Date(letter.createdAt).getTime();
      return {
        id: `shareholder-letter-${letter.id}`,
        characterId: "",
        companyId: letter.stockId,
        sender: `${letter.companyName} CEO`,
        emoji: "🏢",
        kind: "shareholder_letter" as const,
        title: letter.title,
        body: letter.body,
        timestamp: Number.isFinite(createdAt)
          ? createdAt
          : letter.sentSession * SESSION_DURATION_MS,
        href: `/stock/${letter.stockId}`,
        isRead: Boolean(letter.readAt),
        shareholderLetterId: letter.id,
      };
    });
    const notificationInbox = notifications.map((notification) => ({
      id: `notification-${notification.id}`,
      characterId: "",
      companyId: "",
      sender: "2DStock",
      emoji:
        notification.tone === "success"
          ? "✅"
          : notification.tone === "error"
            ? "⚠️"
            : "🔔",
      kind: "system" as const,
      title:
        notification.tone === "success"
          ? "처리 완료"
          : notification.tone === "error"
            ? "확인 필요"
            : "게임 알림",
      body: notification.message,
      timestamp: notification.timestamp,
      href: "/messages",
      isRead: notification.isRead,
      notificationId: notification.id,
    }));
    return [...characterInbox, ...shareholderInbox, ...notificationInbox]
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, 200);
  }, [characterMessages, notifications, readSet, shareholderLetters]);

  const unread = messages.filter((message) => !message.isRead);
  const visible = unreadOnly ? unread : messages;

  const handleMessageRead = (message: InboxMessage) => {
    if (message.notificationId) {
      markNotificationRead(message.notificationId);
      return;
    }
    if (!message.shareholderLetterId) {
      markRead(message.id);
      return;
    }
    const letterId = message.shareholderLetterId;
    setShareholderLetters((letters) =>
      letters.map((letter) =>
        letter.id === letterId
          ? { ...letter, readAt: letter.readAt ?? new Date().toISOString() }
          : letter,
      ),
    );
    void markShareholderLetterRead(letterId);
  };

  const handleAllRead = () => {
    markAllRead(characterMessages.map((message) => message.id));
    markAllNotificationsRead();
    setShareholderLetters((letters) =>
      letters.map((letter) => ({
        ...letter,
        readAt: letter.readAt ?? new Date().toISOString(),
      })),
    );
    void markAllShareholderLettersRead();
  };

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">💬 메시지</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            지나간 게임 알림, 캐릭터 메시지와 보유 회사 CEO의 주주서한을
            다시 확인합니다.
          </p>
        </div>
        {unread.length > 0 && (
          <button
            onClick={handleAllRead}
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
            의뢰 완료·액면조정·지급 같은 게임 사건과 캐릭터 메시지가 이곳에
            보관됩니다.
          </p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {visible.map((message) => {
            const isUnread = !message.isRead;
            return (
              <li key={message.id}>
                <Link
                  href={message.href}
                  onClick={() => handleMessageRead(message)}
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
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--muted)]">{message.body}</p>
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

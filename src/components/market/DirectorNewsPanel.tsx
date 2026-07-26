"use client";

import { useEffect, useState } from "react";
import { useToastStore } from "@/store/toastStore";
import {
  submitFeedback,
  serializeCharacterDialogueDescription,
  listDirectorNews,
  DIRECTOR_NEWS_CATEGORY,
  type DirectorNewsItem,
} from "@/lib/supabase/feedback";

/**
 * 이사 전용 뉴스 패널 — 채택된 이사 뉴스를 모두에게 보여주고, 이 캐릭터의 이사인
 * 플레이어에게는 뉴스 작성(요청) 폼을 준다. 뉴스는 플레이버라 시세에 영향이 없으며,
 * 운영자 채택 시 즉시 도감에 노출된다.
 */
export function DirectorNewsPanel({
  characterId,
  characterName,
  isDirector,
}: {
  characterId: string;
  characterName: string;
  isDirector: boolean;
}) {
  const push = useToastStore((s) => s.push);
  const [news, setNews] = useState<DirectorNewsItem[]>([]);
  const [headline, setHeadline] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let alive = true;
    void listDirectorNews(characterId).then((items) => {
      if (alive) setNews(items);
    });
    return () => {
      alive = false;
    };
  }, [characterId]);

  async function submit() {
    const trimmed = headline.trim();
    if (trimmed.length < 2) {
      push("헤드라인을 2자 이상 입력해 주세요.", "info");
      return;
    }
    setSubmitting(true);
    const res = await submitFeedback({
      title: trimmed,
      category: DIRECTOR_NEWS_CATEGORY,
      description: serializeCharacterDialogueDescription(characterId, body),
    });
    setSubmitting(false);
    if (!res.success) {
      push(res.message, "error");
      return;
    }
    push("📰 이사 뉴스 요청 접수 · 채택되면 도감에 노출됩니다!", "success");
    setHeadline("");
    setBody("");
  }

  if (!isDirector && news.length === 0) return null;

  return (
    <section className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
      <p className="text-xs font-bold text-amber-300">📰 이사 뉴스</p>
      <p className="mt-0.5 text-[10px] leading-relaxed text-[var(--muted)]">
        이사가 전하는 회사 소식입니다. 플레이버 뉴스라 시세에는 영향이 없습니다.
      </p>
      {news.length > 0 && (
        <ul className="mt-2 space-y-2">
          {news.map((item) => (
            <li
              key={item.id}
              className="rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-2.5"
            >
              <p className="text-xs font-semibold">📰 {item.headline}</p>
              {item.body && (
                <p className="mt-1 whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--muted)]">
                  {item.body}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
      {isDirector && (
        <div className="mt-3 border-t border-[var(--border)] pt-3">
          <p className="text-[11px] font-semibold text-amber-300">
            💼 {characterName} 이사 — 뉴스 작성
          </p>
          <input
            value={headline}
            onChange={(e) => setHeadline(e.target.value)}
            maxLength={60}
            placeholder="헤드라인"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={280}
            rows={2}
            placeholder="본문(선택)"
            className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="mt-2 w-full rounded-xl bg-amber-500/90 py-2 text-sm font-bold text-white transition hover:bg-amber-500 disabled:opacity-40"
          >
            {submitting ? "접수 중…" : "이사 뉴스 요청"}
          </button>
        </div>
      )}
    </section>
  );
}

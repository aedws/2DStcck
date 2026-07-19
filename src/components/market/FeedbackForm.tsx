"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToastStore } from "@/store/toastStore";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";
import { submitFeedback } from "@/lib/supabase/feedback";

const CATEGORIES = ["종목·캐릭터", "기능 추가", "밸런스", "UI·편의", "기타"];

/**
 * 피드백·요청 사항 폼 — 원하는 기능·개선을 무료로 제안한다. 로그인 필수.
 * 제출 내역은 관리자(dorothy)만 열람한다.
 */
export function FeedbackForm() {
  const push = useToastStore((s) => s.push);
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    getCurrentAuth().then((a) => setLoggedIn(Boolean(a)));
  }, []);

  if (!mounted) return null;

  async function handleSubmit() {
    if (submitting) return;
    const trimmed = title.trim();
    if (trimmed.length < 1) {
      push("어떤 제안인지 제목을 적어주세요.", "info");
      return;
    }
    setSubmitting(true);
    const res = await submitFeedback({
      title: trimmed,
      category: category || undefined,
      description: description || undefined,
    });
    if (!res.success) {
      push(res.message, "error");
      setSubmitting(false);
      return;
    }
    push("💡 피드백 접수 · 고마워요!", "success");
    setTitle("");
    setCategory("");
    setDescription("");
    setOpen(false);
    setSubmitting(false);
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="min-w-0">
        <h2 className="text-sm font-bold">💡 피드백·요청 사항</h2>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          원하는 기능·종목·개선을 제안해 주세요. 무료이고, 검토 후 반영될 수
          있어요.
        </p>
      </div>

      {loggedIn === false ? (
        <div className="mt-3 rounded-xl bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
          제안을 저장하려면 로그인이 필요합니다.{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)]">
            로그인하기 →
          </Link>
        </div>
      ) : !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-3 w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
        >
          제안 남기기
        </button>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder="어떤 제안인가요? (필수 · 한 줄 요약)"
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <div className="flex flex-wrap gap-1.5">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(category === c ? "" : c)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition ${
                  category === c
                    ? "bg-[var(--accent)] text-white"
                    : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {c}
              </button>
            ))}
          </div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
            placeholder="자세한 내용 (선택 · 왜 필요한지, 어떻게 됐으면 하는지)"
            rows={4}
            className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--muted)]"
            >
              취소
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              className="flex-1 rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
            >
              {submitting ? "제출 중…" : "제출"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

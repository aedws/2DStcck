"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToastStore } from "@/store/toastStore";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";
import {
  submitFeedback,
  CHARACTER_DIALOGUE_CATEGORY,
  MARKET_PHASE_CATEGORY,
  FEEDBACK_REWARD_CENTS,
  MARKET_PHASE_REQUEST_COST_CENTS,
} from "@/lib/supabase/feedback";
import { formatPrice } from "@/lib/market/engine";

type RequestTab = "dialogue" | "phase";

const TABS: Array<{
  key: RequestTab;
  label: string;
  category: string;
  title: string;
  intro: string;
  reward: string;
  rewardTone: "emerald" | "rose";
  titlePlaceholder: string;
  bodyPlaceholder: string;
}> = [
  {
    key: "dialogue",
    label: "🗨️ 캐릭터 대사",
    category: CHARACTER_DIALOGUE_CATEGORY,
    title: "캐릭터 대사 요청",
    intro:
      "캐릭터가 뉴스·이벤트에서 할 만한 대사를 제안해 주세요. 어떤 캐릭터가 어떤 상황에서 무슨 말을 하면 좋을지 적어주면 좋아요.",
    reward: `🎁 채택(반영 완료) 시 보상 ${formatPrice(FEEDBACK_REWARD_CENTS)} 지급`,
    rewardTone: "emerald",
    titlePlaceholder: "어떤 캐릭터의 대사인가요? (필수 · 예: 도로시 — 급등장)",
    bodyPlaceholder:
      "제안하는 대사와 상황을 적어주세요. (예: 시장이 급등할 때 “이건 좀 과열 아닌가요?”)",
  },
  {
    key: "phase",
    label: "🌐 새 국면",
    category: MARKET_PHASE_CATEGORY,
    title: "새 시장 국면 추가 요청",
    intro:
      "새로운 시장 국면(예: 특정 섹터 랠리, 유동성 위기 등)을 제안해 주세요. 국면의 성격과 종목에 미치는 영향을 적어주면 좋아요.",
    reward: `⚠️ 승인(반영 완료) 시 신청 비용 ${formatPrice(MARKET_PHASE_REQUEST_COST_CENTS)} 소모`,
    rewardTone: "rose",
    titlePlaceholder: "어떤 국면인가요? (필수 · 한 줄 요약)",
    bodyPlaceholder:
      "국면의 성격, 지속 기간, 종목·섹터에 미치는 영향을 적어주세요.",
  },
];

/**
 * 유저가 캐릭터 대사·새 시장 국면을 요청하는 폼(탭 2개).
 * 제출은 무료이며 지갑 효과는 운영자 채택·승인 시 적용된다.
 * - 캐릭터 대사 채택: +$50,000 보상
 * - 국면 추가 승인: $100,000 소모(차감)
 */
export function ContentRequestForms() {
  const push = useToastStore((s) => s.push);
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [tab, setTab] = useState<RequestTab>("dialogue");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setMounted(true);
    getCurrentAuth().then((a) => setLoggedIn(Boolean(a)));
  }, []);

  if (!mounted) return null;

  const active = TABS.find((t) => t.key === tab)!;

  async function handleSubmit() {
    if (submitting) return;
    const trimmed = title.trim();
    if (trimmed.length < 1) {
      push("어떤 요청인지 제목을 적어주세요.", "info");
      return;
    }
    setSubmitting(true);
    const res = await submitFeedback({
      title: trimmed,
      category: active.category,
      description: description || undefined,
    });
    if (!res.success) {
      push(res.message, "error");
      setSubmitting(false);
      return;
    }
    push(
      tab === "dialogue"
        ? "🗨️ 캐릭터 대사 요청 접수 · 고마워요!"
        : "🌐 새 국면 요청 접수 · 검토할게요!",
      "success",
    );
    setTitle("");
    setDescription("");
    setSubmitting(false);
  }

  return (
    <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <h2 className="text-sm font-bold">✍️ 콘텐츠 요청</h2>
      <div className="mt-3 flex gap-1.5">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => {
              setTab(t.key);
              setTitle("");
              setDescription("");
            }}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
              tab === t.key
                ? "bg-[var(--accent)] text-white"
                : "border border-[var(--border)] text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
        {active.intro}
      </p>
      <p
        className={`mt-1.5 inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-semibold ${
          active.rewardTone === "emerald"
            ? "bg-emerald-500/10 text-emerald-400"
            : "bg-rose-500/10 text-rose-300"
        }`}
      >
        {active.reward}
      </p>

      {loggedIn === false ? (
        <div className="mt-3 rounded-xl bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
          요청을 저장하려면 로그인이 필요합니다.{" "}
          <Link href="/login" className="font-semibold text-[var(--accent)]">
            로그인하기 →
          </Link>
        </div>
      ) : (
        <div className="mt-3 space-y-2">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value.slice(0, 80))}
            placeholder={active.titlePlaceholder}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value.slice(0, 2000))}
            placeholder={active.bodyPlaceholder}
            rows={4}
            className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
          />
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full rounded-xl bg-[var(--accent)] py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
          >
            {submitting ? "제출 중…" : "요청 제출"}
          </button>
        </div>
      )}
    </section>
  );
}

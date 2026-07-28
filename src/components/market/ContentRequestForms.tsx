"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useToastStore } from "@/store/toastStore";
import { useMarketStore } from "@/store/marketStore";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";
import {
  submitFeedback,
  serializeCharacterDialogueDescription,
  CHARACTER_DIALOGUE_CATEGORY,
  DEX_REFLECTION_CATEGORY,
  FEEDBACK_REWARD_CENTS,
  MARKET_PHASE_REWARD_CENTS,
} from "@/lib/supabase/feedback";
import { formatPrice } from "@/lib/market/engine";
import { getCompanyDefinitions } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";

/** 대사를 붙일 수 있는 캐릭터(회사 CEO) 목록 — 도감 한마디 탭에 연결된다. */
const CHARACTER_OPTIONS = getCompanyDefinitions()
  .map((company) => {
    const character = getCharacterById(company.ceoId);
    return character
      ? { id: character.id, label: `${character.name} · ${company.name}` }
      : null;
  })
  .filter((option): option is { id: string; label: string } => option !== null)
  .sort((a, b) => a.label.localeCompare(b.label, "ko"));

type RequestTab = "dialogue" | "phase" | "dex";

const TABS: Array<{
  key: RequestTab;
  label: string;
  needsCharacter: boolean;
  intro: string;
  reward: string;
  rewardTone: "emerald" | "rose" | "sky";
  titlePlaceholder: string;
  bodyPlaceholder: string;
}> = [
  {
    key: "dialogue",
    label: "🗨️ 캐릭터 대사",
    needsCharacter: true,
    intro:
      "캐릭터가 뉴스·이벤트에서 할 만한 대사를 제안해 주세요. 어떤 캐릭터가 어떤 상황에서 무슨 말을 하면 좋을지 적어주면 좋아요.",
    reward: `🎁 채택(반영 완료) 시 보상 ${formatPrice(FEEDBACK_REWARD_CENTS)} 지급`,
    rewardTone: "emerald",
    titlePlaceholder: "제안하는 대사 (필수 · 한 줄 · 예: 이건 좀 과열 아닌가요?)",
    bodyPlaceholder:
      "상황 설명 (선택 · 언제/어떤 뉴스에서 이 대사를 하면 좋을지)",
  },
  {
    key: "phase",
    label: "🌐 새 국면",
    needsCharacter: false,
    intro:
      "새로운 시장 국면(예: 특정 섹터 랠리, 유동성 위기 등)을 제안해 주세요. 국면의 성격과 종목에 미치는 영향을 적어주면 좋아요.",
    reward: `🎁 반영 완료 시 보상 ${formatPrice(MARKET_PHASE_REWARD_CENTS)} 지급 · 신청 무료`,
    rewardTone: "emerald",
    titlePlaceholder: "어떤 국면인가요? (필수 · 한 줄 요약)",
    bodyPlaceholder:
      "국면의 성격, 지속 기간, 종목·섹터에 미치는 영향을 적어주세요.",
  },
  {
    key: "dex",
    label: "🏛️ 도감 반영",
    needsCharacter: true,
    intro:
      "캐릭터 이름을 달고 설립한 유저 회사를 도감에 등재해 주세요. 채택되면 해당 캐릭터 도감에 ‘운영 중인 커뮤니티 기업’으로 표시됩니다.",
    reward: "🏛️ 채택 시 해당 캐릭터 도감에 등재 · 지갑 변동 없음",
    rewardTone: "sky",
    titlePlaceholder: "회사 이름 (필수 · 예: 도로시 상사)",
    bodyPlaceholder:
      "회사 소개 (선택 · 티커·업종·어떤 컨셉으로 운영하는지)",
  },
];

/**
 * 유저가 캐릭터 대사·새 시장 국면을 요청하는 폼(탭 2개).
 * 제출은 무료이며 지갑 효과는 운영자 채택·승인 시 적용된다.
 * - 캐릭터 대사 채택: +$50,000 보상
 * - 국면 추가 반영 완료: +$1,000,000 보상
 */
export function ContentRequestForms() {
  const push = useToastStore((s) => s.push);
  const submitMarketPhaseRequest = useMarketStore(
    (s) => s.submitMarketPhaseRequest,
  );
  const [mounted, setMounted] = useState(false);
  const [loggedIn, setLoggedIn] = useState<boolean | null>(null);
  const [tab, setTab] = useState<RequestTab>("dialogue");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [characterId, setCharacterId] = useState("");
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
      push(
        tab === "dialogue"
          ? "제안하는 대사를 적어주세요."
          : tab === "dex"
            ? "회사 이름을 적어주세요."
            : "국면 요약을 적어주세요.",
        "info",
      );
      return;
    }
    if (active.needsCharacter && !characterId) {
      push(
        tab === "dialogue"
          ? "어떤 캐릭터의 대사인지 선택해 주세요."
          : "어떤 캐릭터의 이름을 단 회사인지 선택해 주세요.",
        "info",
      );
      return;
    }
    setSubmitting(true);
    const res =
      tab === "phase"
        ? await submitMarketPhaseRequest({
            title: trimmed,
            description: description || undefined,
          })
        : await submitFeedback({
            title: trimmed,
            category:
              tab === "dex"
                ? DEX_REFLECTION_CATEGORY
                : CHARACTER_DIALOGUE_CATEGORY,
            description: serializeCharacterDialogueDescription(
              characterId,
              description,
            ),
          });
    if (!res.success) {
      push(res.message, "error");
      setSubmitting(false);
      return;
    }
    push(
      tab === "dialogue"
        ? "🗨️ 캐릭터 대사 요청 접수 · 고마워요!"
        : tab === "dex"
          ? "🏛️ 도감 반영 요청 접수 · 검토할게요!"
          : res.message,
      "success",
    );
    setTitle("");
    setDescription("");
    setCharacterId("");
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
              setCharacterId("");
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
            : active.rewardTone === "sky"
              ? "bg-sky-500/10 text-sky-300"
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
          {active.needsCharacter && (
            <select
              value={characterId}
              onChange={(e) => setCharacterId(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]"
            >
              <option value="">
                {tab === "dex"
                  ? "어떤 캐릭터 이름의 회사인가요? (필수)"
                  : "어떤 캐릭터의 대사인가요? (필수)"}
              </option>
              {CHARACTER_OPTIONS.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          )}
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

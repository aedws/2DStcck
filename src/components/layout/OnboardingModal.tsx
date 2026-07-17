"use client";

import { useEffect, useState } from "react";
import { useSettingsStore } from "@/store/settingsStore";

interface Step {
  emoji: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    emoji: "🎭",
    title: "2DStock에 오신 걸 환영해요",
    body: "39명의 캐릭터 경영진이 이끄는 회사들이 상장된 세계입니다. 이 게임의 진짜 목표는 돈이 아니라 캐릭터를 모으고 관계를 쌓는 것 — 돈은 그걸 위한 ‘연료’예요. 모두가 같은 시장을 보고, 그 성취를 프레스티지 랭킹으로 겨룹니다.",
  },
  {
    emoji: "💵",
    title: "돈은 연료: 매매하는 법",
    body: "종목을 눌러 시장가·현재가·지정가로 사고팔며 자금을 불립니다. 지수·선물은 직접 못 사고 이를 추종하는 ETF·레버리지 상품으로 투자해요. 번 돈은 결국 캐릭터를 모으는 데 씁니다.",
  },
  {
    emoji: "📰",
    title: "뉴스와 캐릭터가 살아 있어요",
    body: "실적·수주·스캔들 뉴스가 뜨면 관련 종목이 오르내리고, 그 회사 경영진이 자기 성격대로 한마디를 남깁니다. 선물은 시장 방향을 약 90초 먼저 보여주는 선행지표예요.",
  },
  {
    emoji: "🛟",
    title: "안전망: 고정급",
    body: "20거래일마다 고정급 $10,000이 들어오고 배당·분배금도 있어요. 크게 잃어도 다시 일어설 수 있으니, 마음 편히 캐릭터에 투자하세요.",
  },
  {
    emoji: "🤍",
    title: "목표: 모으고, 겨루기",
    body: "텐도 아리스·타카나시 호시노 같은 캐릭터의 주식을 오래 보유하면 관계가 면식→신뢰→동맹→최애로 깊어지고, 동맹이 되면 그 기업이 고배당 우선주를 선물합니다. 도감을 채우고 프레스티지 랭킹 1위에 도전해 보세요!",
  },
];

export function OnboardingModal() {
  const onboarded = useSettingsStore((s) => s.onboarded);
  const setOnboarded = useSettingsStore((s) => s.setOnboarded);
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => setMounted(true), []);

  if (!mounted || onboarded) return null;

  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function finish() {
    setOnboarded(true);
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-2xl">
        <div className="flex justify-between">
          <span className="text-4xl" aria-hidden>
            {current.emoji}
          </span>
          <button
            onClick={finish}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            건너뛰기
          </button>
        </div>

        <h2 className="mt-4 text-lg font-bold">{current.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          {current.body}
        </p>

        <div className="mt-5 flex items-center justify-center gap-1.5">
          {STEPS.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? "w-5 bg-[var(--accent)]"
                  : "w-1.5 bg-[var(--border)]"
              }`}
            />
          ))}
        </div>

        <div className="mt-5 flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--muted)]"
            >
              이전
            </button>
          )}
          <button
            onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
            className="flex-1 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {isLast ? "시작하기" : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}

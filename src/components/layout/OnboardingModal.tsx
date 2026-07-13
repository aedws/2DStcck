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
    emoji: "📈",
    title: "2DStock에 오신 걸 환영해요",
    body: "가상 캐릭터 회사들이 상장된 모의투자 게임입니다. 모든 플레이어가 같은 시장을 보고, 순자산으로 순위를 겨룹니다. 실제 돈은 쓰지 않아요.",
  },
  {
    emoji: "💵",
    title: "매매하는 법",
    body: "종목을 눌러 시장가·현재가·지정가로 사고팔 수 있어요. 지수와 선물은 직접 거래할 수 없고, 대신 이를 추종하는 ETF·레버리지·인버스 상품으로 투자합니다.",
  },
  {
    emoji: "📰",
    title: "뉴스가 시장을 움직여요",
    body: "실적·수주·스캔들 같은 뉴스가 뜨면 관련 종목이 실제로 오르내립니다. 선물은 시장 방향을 약 90초 먼저 보여주는 선행지표예요.",
  },
  {
    emoji: "🛟",
    title: "안전망: 고정급",
    body: "20거래일마다 고정급 $10,000이 현금으로 들어옵니다. 배당·분배금도 있어요. 크게 잃어도 다시 일어설 수 있게 설계되어 있습니다.",
  },
  {
    emoji: "🏆",
    title: "목표: 순자산을 키워 과시하기",
    body: "번 돈으로 상점에서 시계·차·집·요트를 사면 그 가치가 순자산에 그대로 더해져 랭킹에 과시 뱃지로 노출됩니다. 랭킹 1위에 도전해 보세요!",
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

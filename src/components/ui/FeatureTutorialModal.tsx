"use client";

import { useState } from "react";

export interface FeatureTutorialStep {
  emoji: string;
  title: string;
  body: string;
}

export function FeatureTutorialModal({
  steps,
  onFinish,
}: {
  steps: FeatureTutorialStep[];
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0);
  const current = steps[step] ?? steps[0];
  if (!current) return null;
  const isLast = step === steps.length - 1;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feature-tutorial-title"
        className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--background)] p-6 shadow-2xl"
      >
        <div className="flex justify-between">
          <span className="text-4xl" aria-hidden>{current.emoji}</span>
          <button
            onClick={onFinish}
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            건너뛰기
          </button>
        </div>
        <h2 id="feature-tutorial-title" className="mt-4 text-lg font-bold">
          {current.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          {current.body}
        </p>
        <div className="mt-5 flex items-center justify-center gap-1.5">
          {steps.map((_, index) => (
            <span
              key={index}
              className={`h-1.5 rounded-full transition-all ${
                index === step
                  ? "w-5 bg-[var(--accent)]"
                  : "w-1.5 bg-[var(--border)]"
              }`}
            />
          ))}
        </div>
        <div className="mt-5 flex gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep((value) => value - 1)}
              className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--muted)]"
            >
              이전
            </button>
          )}
          <button
            onClick={() => (isLast ? onFinish() : setStep((value) => value + 1))}
            className="flex-1 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90"
          >
            {isLast ? "확인했어요" : "다음"}
          </button>
        </div>
      </div>
    </div>
  );
}

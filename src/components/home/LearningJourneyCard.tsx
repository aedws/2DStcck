"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import { useLearningSignals } from "@/components/layout/useLearningSignals";
import { LEARNING_LAYERS } from "@/data/learningJourney";
import {
  isJourneyComplete,
  isLayerGoalMet,
  reachedLearningLayer,
} from "@/lib/player/learningProgress";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * 홈 학습 여정 카드 — 6개 레이어 진척을 체크포인트로 보여주고, 현재 초점 목표와
 * 실습 링크를 안내한다. 지난 레이어를 누르면 그 교육을 다시 볼 수 있다.
 */
export function LearningJourneyCard() {
  const onboarded = useSettingsStore((s) => s.onboarded);
  const dismissed = useSettingsStore((s) => s.learningJourneyDismissed);
  const setDismissed = useSettingsStore((s) => s.setLearningJourneyDismissed);

  const signals = useLearningSignals();
  const [mounted, setMounted] = useState(false);
  const [replayId, setReplayId] = useState<number | null>(null);
  useEffect(() => setMounted(true), []);

  if (!mounted || !onboarded || dismissed) return null;

  const reached = reachedLearningLayer(signals);
  const complete = isJourneyComplete(signals);
  const completedCount = LEARNING_LAYERS.filter((l) =>
    isLayerGoalMet(l.id, signals),
  ).length;
  const focus = LEARNING_LAYERS[Math.min(reached, 6) - 1];
  const replayLayer =
    replayId !== null ? LEARNING_LAYERS[replayId - 1] : undefined;

  return (
    <div className="px-4 pt-3 md:px-5">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg" aria-hidden>
              🎓
            </span>
            <h2 className="text-sm font-bold">학습 여정</h2>
            <span className="text-xs text-[var(--muted)]">
              {completedCount}/6
            </span>
          </div>
          {complete && (
            <button
              type="button"
              onClick={() => setDismissed(true)}
              className="rounded-lg px-2 py-1 text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              닫기
            </button>
          )}
        </div>

        {/* 6개 체크포인트 */}
        <div className="mt-3 flex items-stretch gap-1">
          {LEARNING_LAYERS.map((layer) => {
            const done = isLayerGoalMet(layer.id, signals);
            const current = !complete && layer.id === reached;
            const locked = layer.id > reached;
            return (
              <button
                type="button"
                key={layer.id}
                disabled={locked}
                onClick={() => !locked && setReplayId(layer.id)}
                title={layer.title}
                className={`flex flex-1 flex-col items-center gap-1 rounded-xl border px-1 py-2 transition ${
                  done
                    ? "border-[var(--accent)]/40 bg-[var(--accent)]/10"
                    : current
                      ? "border-[var(--accent)] bg-[var(--background)] ring-1 ring-[var(--accent)]"
                      : "border-[var(--border)] bg-[var(--background)]"
                } ${locked ? "opacity-40" : "hover:border-[var(--accent)]/60"}`}
              >
                <span className="text-base" aria-hidden>
                  {locked ? "🔒" : layer.emoji}
                </span>
                <span className="text-[9px] leading-tight text-[var(--muted)]">
                  {layer.title}
                </span>
                {done && (
                  <span className="text-[9px] font-bold text-[var(--accent)]">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* 현재 초점 / 완주 */}
        {complete ? (
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            🎉 6개 레이어를 모두 익혔어요. 이제 도감을 채우고 프레스티지 랭킹
            정상에 도전하세요!
          </p>
        ) : (
          focus && (
            <div className="mt-3 flex flex-col gap-2 rounded-xl bg-[var(--background)] p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="text-xs font-semibold">
                  {focus.emoji} {focus.title} · {focus.tagline}
                </p>
                <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">
                  다음 목표: {focus.goal}
                </p>
              </div>
              {focus.cta && (
                <Link
                  href={focus.cta.href}
                  className="shrink-0 rounded-lg bg-[var(--accent)] px-3 py-2 text-center text-xs font-semibold text-white transition hover:opacity-90"
                >
                  {focus.cta.label}
                </Link>
              )}
            </div>
          )
        )}
      </div>

      {replayLayer && (
        <FeatureTutorialModal
          key={`replay-${replayLayer.id}`}
          steps={replayLayer.steps}
          onFinish={() => setReplayId(null)}
        />
      )}
    </div>
  );
}

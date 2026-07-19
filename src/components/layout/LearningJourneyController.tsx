"use client";

import { useEffect, useRef, useState } from "react";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import { LEARNING_LAYERS } from "@/data/learningJourney";
import { reachedLearningLayer } from "@/lib/player/learningProgress";
import { useLearningSignals } from "@/components/layout/useLearningSignals";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * 학습 여정 진행 컨트롤러 — 진척이 새 레이어를 열면 그 레이어의 교육 모달을
 * 한 번에 하나씩 띄운다. 이미 진행 중이던 유저(기능 도입 전부터 앞서 있던 유저)는
 * 소급 안내가 쏟아지지 않도록 최초 1회 현재 도달 레이어까지 '확인함'으로 시딩한다.
 */
export function LearningJourneyController() {
  const onboarded = useSettingsStore((s) => s.onboarded);
  const seen = useSettingsStore((s) => s.learningLayerSeen);
  const setSeen = useSettingsStore((s) => s.setLearningLayerSeen);
  const firstTradeCelebrated = useSettingsStore((s) => s.firstTradeCelebrated);

  const signals = useLearningSignals();
  const reached = reachedLearningLayer(signals);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // 기존 진행 유저 시딩: seen이 기본값(1)인데 이미 앞서 있으면 소급 모달을 막는다.
  const seededRef = useRef(false);
  useEffect(() => {
    if (!mounted || !onboarded || seededRef.current) return;
    seededRef.current = true;
    if (seen === 1 && reached > 1) setSeen(reached);
  }, [mounted, onboarded, seen, reached, setSeen]);

  if (!mounted || !onboarded) return null;
  if (seen >= reached) return null;

  const nextLayerId = Math.min(reached, seen + 1);
  const layer = LEARNING_LAYERS[nextLayerId - 1];
  if (!layer) return null;
  // 첫 거래 직후엔 축하 연출이 먼저 나가도록, 그게 끝나기 전 레이어2 안내는 미룬다.
  if (nextLayerId === 2 && !firstTradeCelebrated) return null;

  return (
    <FeatureTutorialModal
      key={nextLayerId}
      steps={layer.steps}
      onFinish={() => setSeen(nextLayerId)}
    />
  );
}

"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface PriceAlert {
  id: string;
  stockId: string;
  direction: "above" | "below";
  targetPrice: number;
  createdAt: number;
  triggeredAt?: number;
}

interface SettingsState {
  groupDerivatives: boolean;
  setGroupDerivatives: (value: boolean) => void;
  /** 온보딩(첫 안내)을 마쳤는지 여부 */
  onboarded: boolean;
  setOnboarded: (value: boolean) => void;
  /** 학습 여정에서 교육 모달을 확인한 최고 레이어(1~6). 기본 1(첫 안내가 담당). */
  learningLayerSeen: number;
  setLearningLayerSeen: (value: number) => void;
  /** 여정 완주 카드를 접었는지 여부 */
  learningJourneyDismissed: boolean;
  setLearningJourneyDismissed: (value: boolean) => void;
  missionTutorialSeen: boolean;
  setMissionTutorialSeen: (value: boolean) => void;
  missionTutorialVersion: number;
  setMissionTutorialVersion: (value: number) => void;
  optionsTutorialSeen: boolean;
  setOptionsTutorialSeen: (value: boolean) => void;
  zeroDteTutorialSeen: boolean;
  setZeroDteTutorialSeen: (value: boolean) => void;
  minigameTutorialSeen: boolean;
  setMinigameTutorialSeen: (value: boolean) => void;
  strategyTutorialSeen: boolean;
  setStrategyTutorialSeen: (value: boolean) => void;
  marketEraTutorialSeen: boolean;
  setMarketEraTutorialSeen: (value: boolean) => void;
  pumpTutorialSeen: boolean;
  setPumpTutorialSeen: (value: boolean) => void;
  stressTestTutorialSeen: boolean;
  setStressTestTutorialSeen: (value: boolean) => void;
  seasonTutorialSeen: boolean;
  setSeasonTutorialSeen: (value: boolean) => void;
  seasonTutorialVersion: number;
  setSeasonTutorialVersion: (value: number) => void;
  /** 체결·현금 효과음 사용 여부 */
  soundEnabled: boolean;
  setSoundEnabled: (value: boolean) => void;
  /** 관심종목 (종목 id 목록) */
  watchlist: string[];
  toggleWatch: (id: string) => void;
  priceAlerts: PriceAlert[];
  addPriceAlert: (
    stockId: string,
    direction: PriceAlert["direction"],
    targetPrice: number,
  ) => void;
  removePriceAlert: (id: string) => void;
  rearmPriceAlert: (id: string) => void;
  triggerPriceAlert: (id: string, triggeredAt: number) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      groupDerivatives: true,
      setGroupDerivatives: (groupDerivatives) => set({ groupDerivatives }),
      onboarded: false,
      setOnboarded: (onboarded) => set({ onboarded }),
      learningLayerSeen: 1,
      setLearningLayerSeen: (learningLayerSeen) => set({ learningLayerSeen }),
      learningJourneyDismissed: false,
      setLearningJourneyDismissed: (learningJourneyDismissed) =>
        set({ learningJourneyDismissed }),
      missionTutorialSeen: false,
      setMissionTutorialSeen: (missionTutorialSeen) =>
        set({ missionTutorialSeen }),
      missionTutorialVersion: 0,
      setMissionTutorialVersion: (missionTutorialVersion) =>
        set({ missionTutorialVersion }),
      optionsTutorialSeen: false,
      setOptionsTutorialSeen: (optionsTutorialSeen) =>
        set({ optionsTutorialSeen }),
      zeroDteTutorialSeen: false,
      setZeroDteTutorialSeen: (zeroDteTutorialSeen) =>
        set({ zeroDteTutorialSeen }),
      minigameTutorialSeen: false,
      setMinigameTutorialSeen: (minigameTutorialSeen) =>
        set({ minigameTutorialSeen }),
      strategyTutorialSeen: false,
      setStrategyTutorialSeen: (strategyTutorialSeen) =>
        set({ strategyTutorialSeen }),
      marketEraTutorialSeen: false,
      setMarketEraTutorialSeen: (marketEraTutorialSeen) =>
        set({ marketEraTutorialSeen }),
      pumpTutorialSeen: false,
      setPumpTutorialSeen: (pumpTutorialSeen) => set({ pumpTutorialSeen }),
      stressTestTutorialSeen: false,
      setStressTestTutorialSeen: (stressTestTutorialSeen) =>
        set({ stressTestTutorialSeen }),
      seasonTutorialSeen: false,
      setSeasonTutorialSeen: (seasonTutorialSeen) =>
        set({ seasonTutorialSeen }),
      seasonTutorialVersion: 0,
      setSeasonTutorialVersion: (seasonTutorialVersion) =>
        set({ seasonTutorialVersion }),
      soundEnabled: true,
      setSoundEnabled: (soundEnabled) => set({ soundEnabled }),
      watchlist: [],
      toggleWatch: (id) =>
        set((s) => ({
          watchlist: s.watchlist.includes(id)
            ? s.watchlist.filter((w) => w !== id)
            : [...s.watchlist, id],
        })),
      priceAlerts: [],
      addPriceAlert: (stockId, direction, targetPrice) =>
        set((state) => ({
          priceAlerts: [
            {
              id: `price-alert-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
              stockId,
              direction,
              targetPrice: Math.max(1, Math.round(targetPrice)),
              createdAt: Date.now(),
            },
            ...state.priceAlerts,
          ].slice(0, 30),
        })),
      removePriceAlert: (id) =>
        set((state) => ({
          priceAlerts: state.priceAlerts.filter((alert) => alert.id !== id),
        })),
      rearmPriceAlert: (id) =>
        set((state) => ({
          priceAlerts: state.priceAlerts.map((alert) =>
            alert.id === id ? { ...alert, triggeredAt: undefined } : alert,
          ),
        })),
      triggerPriceAlert: (id, triggeredAt) =>
        set((state) => ({
          priceAlerts: state.priceAlerts.map((alert) =>
            alert.id === id && alert.triggeredAt === undefined
              ? { ...alert, triggeredAt }
              : alert,
          ),
        })),
    }),
    { name: "2dstock-settings" },
  ),
);

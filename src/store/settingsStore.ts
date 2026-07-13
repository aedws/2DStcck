"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  groupDerivatives: boolean;
  setGroupDerivatives: (value: boolean) => void;
  /** 온보딩(첫 안내)을 마쳤는지 여부 */
  onboarded: boolean;
  setOnboarded: (value: boolean) => void;
  missionTutorialSeen: boolean;
  setMissionTutorialSeen: (value: boolean) => void;
  missionTutorialVersion: number;
  setMissionTutorialVersion: (value: number) => void;
  optionsTutorialSeen: boolean;
  setOptionsTutorialSeen: (value: boolean) => void;
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
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      groupDerivatives: true,
      setGroupDerivatives: (groupDerivatives) => set({ groupDerivatives }),
      onboarded: false,
      setOnboarded: (onboarded) => set({ onboarded }),
      missionTutorialSeen: false,
      setMissionTutorialSeen: (missionTutorialSeen) =>
        set({ missionTutorialSeen }),
      missionTutorialVersion: 0,
      setMissionTutorialVersion: (missionTutorialVersion) =>
        set({ missionTutorialVersion }),
      optionsTutorialSeen: false,
      setOptionsTutorialSeen: (optionsTutorialSeen) =>
        set({ optionsTutorialSeen }),
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
    }),
    { name: "2dstock-settings" },
  ),
);

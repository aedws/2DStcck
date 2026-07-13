"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  groupDerivatives: boolean;
  setGroupDerivatives: (value: boolean) => void;
  /** 온보딩(첫 안내)을 마쳤는지 여부 */
  onboarded: boolean;
  setOnboarded: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      groupDerivatives: true,
      setGroupDerivatives: (groupDerivatives) => set({ groupDerivatives }),
      onboarded: false,
      setOnboarded: (onboarded) => set({ onboarded }),
    }),
    { name: "2dstock-settings" },
  ),
);

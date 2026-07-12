"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  groupDerivatives: boolean;
  setGroupDerivatives: (value: boolean) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      groupDerivatives: true,
      setGroupDerivatives: (groupDerivatives) => set({ groupDerivatives }),
    }),
    { name: "2dstock-settings" },
  ),
);

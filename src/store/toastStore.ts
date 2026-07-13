"use client";

import { create } from "zustand";

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface ToastStore {
  toasts: Toast[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useToastStore = create<ToastStore>((set) => ({
  toasts: [],
  push: (message, tone = "info") => {
    const id = ++counter;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }].slice(-3) }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 2400);
  },
  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));

/** 결과 메시지를 토스트로 띄우고 톤에 맞는 사운드를 재생하는 헬퍼 */
export function toastResult(result: { success: boolean; message: string }) {
  useToastStore.getState().push(result.message, result.success ? "success" : "error");
}

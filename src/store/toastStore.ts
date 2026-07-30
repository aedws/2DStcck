"use client";

import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

export interface ToastNotification {
  id: string;
  message: string;
  tone: ToastTone;
  timestamp: number;
  isRead: boolean;
}

interface ToastStore {
  toasts: Toast[];
  notifications: ToastNotification[];
  push: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
}

let counter = 0;

export const useToastStore = create<ToastStore>()(
  persist(
    (set) => ({
      toasts: [],
      notifications: [],
      push: (message, tone = "info") => {
        const id = ++counter;
        const timestamp = Date.now();
        const notification: ToastNotification = {
          id: `${timestamp}-${id}`,
          message,
          tone,
          timestamp,
          isRead: false,
        };
        set((state) => ({
          toasts: [...state.toasts, { id, message, tone }].slice(-3),
          notifications: [
            notification,
            ...state.notifications.filter(
              (item) =>
                item.message !== message ||
                timestamp - item.timestamp > 60_000,
            ),
          ].slice(0, 200),
        }));
        setTimeout(() => {
          set((state) => ({
            toasts: state.toasts.filter((toast) => toast.id !== id),
          }));
        }, 4_500);
      },
      dismiss: (id) =>
        set((state) => ({
          toasts: state.toasts.filter((toast) => toast.id !== id),
        })),
      markNotificationRead: (id) =>
        set((state) => ({
          notifications: state.notifications.map((notification) =>
            notification.id === id
              ? { ...notification, isRead: true }
              : notification,
          ),
        })),
      markAllNotificationsRead: () =>
        set((state) => ({
          notifications: state.notifications.map((notification) => ({
            ...notification,
            isRead: true,
          })),
        })),
    }),
    {
      name: "2dstock-notification-inbox",
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({ notifications: state.notifications }),
    },
  ),
);

/** 결과 메시지를 토스트로 띄우고 톤에 맞는 사운드를 재생하는 헬퍼 */
export function toastResult(result: { success: boolean; message: string }) {
  useToastStore.getState().push(result.message, result.success ? "success" : "error");
}

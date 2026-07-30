"use client";

import { useToastStore } from "@/store/toastStore";

const TONE_STYLE: Record<string, string> = {
  success: "bg-[var(--up)] text-white",
  error: "bg-[var(--down)] text-white",
  info: "bg-[var(--foreground)] text-[var(--background)]",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[120] flex flex-col items-center gap-2 px-4 md:bottom-8">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in pointer-events-auto flex max-w-sm items-center gap-2 rounded-2xl px-4 py-2.5 text-left text-sm font-medium shadow-lg ${
            TONE_STYLE[t.tone] ?? TONE_STYLE.info
          }`}
        >
          <span>{t.message}</span>
          <button
            type="button"
            onClick={() => dismiss(t.id)}
            aria-label="알림 닫기"
            className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/15 text-base"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

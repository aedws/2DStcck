"use client";

import { useToastStore } from "@/store/toastStore";

const TONE_STYLE: Record<string, string> = {
  success: "bg-[var(--up)] text-white",
  error: "bg-[var(--down)] text-white",
  info: "bg-[var(--foreground)] text-[var(--background)]",
};

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  if (toasts.length === 0) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[120] flex flex-col items-center gap-2 px-4 md:bottom-8">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`toast-in pointer-events-auto max-w-sm rounded-full px-4 py-2.5 text-center text-sm font-medium shadow-lg ${
            TONE_STYLE[t.tone] ?? TONE_STYLE.info
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

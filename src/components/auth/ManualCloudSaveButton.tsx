"use client";

import { useEffect, useMemo, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import { useToastStore } from "@/store/toastStore";

const MANUAL_SAVE_COOLDOWN_MS = 60_000;

function cooldownStorageKey(userId: string): string {
  return `2dstock-manual-save:${userId}`;
}

export function ManualCloudSaveButton() {
  const userId = useMarketStore((state) => state.userId);
  const cloudSyncReady = useMarketStore((state) => state.cloudSyncReady);
  const saveCloud = useMarketStore((state) => state.saveCloud);
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lastSavedAt, setLastSavedAt] = useState(0);

  useEffect(() => {
    if (!userId) {
      setLastSavedAt(0);
      return;
    }
    const stored = Number(
      window.localStorage.getItem(cooldownStorageKey(userId)),
    );
    setLastSavedAt(Number.isFinite(stored) ? stored : 0);
  }, [userId]);

  const remainingSeconds = useMemo(
    () =>
      Math.max(
        0,
        Math.ceil(
          (lastSavedAt + MANUAL_SAVE_COOLDOWN_MS - now) / 1_000,
        ),
      ),
    [lastSavedAt, now],
  );

  useEffect(() => {
    if (remainingSeconds <= 0) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, [remainingSeconds]);

  const disabled =
    !userId || !cloudSyncReady || saving || remainingSeconds > 0;

  async function handleSave() {
    if (disabled || !userId) return;
    const persisted = Number(
      window.localStorage.getItem(cooldownStorageKey(userId)),
    );
    if (
      Number.isFinite(persisted) &&
      Date.now() - persisted < MANUAL_SAVE_COOLDOWN_MS
    ) {
      setLastSavedAt(persisted);
      setNow(Date.now());
      return;
    }
    setSaving(true);
    const saved = await saveCloud();
    setSaving(false);
    if (!saved) {
      useToastStore
        .getState()
        .push("클라우드 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.", "error");
      return;
    }
    const savedAt = Date.now();
    window.localStorage.setItem(
      cooldownStorageKey(userId),
      String(savedAt),
    );
    setLastSavedAt(savedAt);
    setNow(savedAt);
    useToastStore.getState().push("계좌를 클라우드에 저장했습니다.", "success");
  }

  const label = saving
    ? "저장 중"
    : remainingSeconds > 0
      ? `${remainingSeconds}초`
      : "저장";

  return (
    <button
      type="button"
      onClick={() => void handleSave()}
      disabled={disabled}
      title={
        !userId
          ? "로그인 후 수동 저장할 수 있습니다"
          : remainingSeconds > 0
            ? `${remainingSeconds}초 후 다시 저장할 수 있습니다`
            : "현재 계좌를 Supabase에 수동 저장"
      }
      aria-label={`수동 저장${remainingSeconds > 0 ? `, ${remainingSeconds}초 후 사용 가능` : ""}`}
      className="inline-flex min-h-10 min-w-14 touch-manipulation items-center justify-center gap-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-semibold transition hover:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-50 sm:min-w-20 sm:px-3"
    >
      <span aria-hidden>💾</span>
      <span>{label}</span>
    </button>
  );
}

import type { StateStorage } from "zustand/middleware";

/** 이전 persist 키 — 용량만 차지하고 더 이상 읽지 않는다. */
const LEGACY_MARKET_KEYS = [
  "2dstock-market-local",
  "2dstock-market-local-v2",
  "2dstock-market-local-v3",
];

const MARKET_STORAGE_PREFIX = "2dstock-market-local-v4";

/** 지갑 캐시가 다른 로그인 계정·게스트와 섞이지 않도록 사용자별 키를 만든다. */
export function marketStorageKey(userId: string | null): string {
  return `${MARKET_STORAGE_PREFIX}:${userId ?? "guest"}`;
}

let legacyCleared = false;
const pendingWrites = new Map<string, string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushListenersInstalled = false;

/** 구 LocalStorage 키를 한 번 지워 quota 를 확보한다. */
export function clearLegacyMarketStorage(): void {
  if (typeof window === "undefined" || legacyCleared) return;
  legacyCleared = true;
  try {
    for (const key of LEGACY_MARKET_KEYS) {
      window.localStorage.removeItem(key);
    }
  } catch {
    // private mode 등 — 무시
  }
}

function isQuotaError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const err = error as { name?: string; code?: number; message?: string };
  return (
    err.name === "QuotaExceededError" ||
    err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    err.code === 22 ||
    err.code === 1014 ||
    /quota/i.test(err.message ?? "")
  );
}

function writeNow(name: string, value: string): void {
  try {
    window.localStorage.setItem(name, value);
    return;
  } catch (error) {
    if (!isQuotaError(error)) throw error;
  }
  try {
    for (const key of LEGACY_MARKET_KEYS) {
      window.localStorage.removeItem(key);
    }
    window.localStorage.removeItem(name);
    window.localStorage.setItem(name, value);
  } catch {
    console.warn(
      "[2dstock] localStorage quota exceeded; skipping local persist",
    );
  }
}

function flushPendingWrites(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  for (const [name, value] of pendingWrites) {
    writeNow(name, value);
  }
  pendingWrites.clear();
}

function scheduleFlush(): void {
  if (!flushTimer) {
    flushTimer = setTimeout(flushPendingWrites, 10_000);
  }
  if (flushListenersInstalled || typeof window === "undefined") return;
  flushListenersInstalled = true;
  window.addEventListener("pagehide", flushPendingWrites);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushPendingWrites();
  });
}

/**
 * zustand persist 용 LocalStorage.
 * - 구 키 정리
 * - QuotaExceeded 시 레거시·대형 키를 비우고 한 번 재시도
 * - 그래도 실패하면 조용히 포기 (앱 크래시 방지; 지갑은 클라우드에 있음)
 */
export const safeMarketStorage: StateStorage = {
  getItem: (name) => {
    clearLegacyMarketStorage();
    if (pendingWrites.has(name)) return pendingWrites.get(name) ?? null;
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    clearLegacyMarketStorage();
    pendingWrites.set(name, value);
    scheduleFlush();
  },
  removeItem: (name) => {
    pendingWrites.delete(name);
    try {
      window.localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

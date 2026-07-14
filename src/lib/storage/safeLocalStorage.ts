import type { StateStorage } from "zustand/middleware";

/** 이전 persist 키 — 용량만 차지하고 더 이상 읽지 않는다. */
const LEGACY_MARKET_KEYS = [
  "2dstock-market-local",
  "2dstock-market-local-v2",
];

let legacyCleared = false;

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

/**
 * zustand persist 용 LocalStorage.
 * - 구 키 정리
 * - QuotaExceeded 시 레거시·대형 키를 비우고 한 번 재시도
 * - 그래도 실패하면 조용히 포기 (앱 크래시 방지; 지갑은 클라우드에 있음)
 */
export const safeMarketStorage: StateStorage = {
  getItem: (name) => {
    clearLegacyMarketStorage();
    try {
      return window.localStorage.getItem(name);
    } catch {
      return null;
    }
  },
  setItem: (name, value) => {
    clearLegacyMarketStorage();
    try {
      window.localStorage.setItem(name, value);
      return;
    } catch (error) {
      if (!isQuotaError(error)) throw error;
    }
    // 1차 실패: 레거시·다른 대형 키를 더 공격적으로 비운다
    try {
      for (const key of LEGACY_MARKET_KEYS) {
        window.localStorage.removeItem(key);
      }
      // 자기 자신 옛 값도 지우고 다시 쓴다
      window.localStorage.removeItem(name);
      window.localStorage.setItem(name, value);
      return;
    } catch {
      // 2차도 실패하면 persist 를 포기 — tickMarket 이 죽지 않게 한다
      console.warn(
        "[2dstock] localStorage quota exceeded; skipping local persist",
      );
    }
  },
  removeItem: (name) => {
    try {
      window.localStorage.removeItem(name);
    } catch {
      // ignore
    }
  },
};

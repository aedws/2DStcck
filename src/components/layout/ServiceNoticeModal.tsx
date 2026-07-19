"use client";

import { useEffect, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";
import { TARGETED_ACCOUNT_ACTIONS } from "@/data/serviceNotice";
import { formatPrice } from "@/lib/market/engine";

/**
 * 계정 정상화 안내 모달 — 대상 계정(TARGETED_ACCOUNT_ACTIONS)에게만 1회 뜬다.
 * 지갑 초기화·보상 지급은 로그인 시 applyTargetedAccountReset이 이미 원자적으로
 * 처리했고, 이 모달은 그 사실을 알리는 용도다.
 */
export function ServiceNoticeModal() {
  const userId = useMarketStore((s) => s.userId);
  const seenVersion = useSettingsStore((s) => s.serviceNoticeSeenVersion);
  const setSeenVersion = useSettingsStore((s) => s.setServiceNoticeSeenVersion);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const action = userId ? TARGETED_ACCOUNT_ACTIONS[userId] : undefined;
  if (!mounted || !action || seenVersion >= action.resetVersion) return null;

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <div className="text-center text-4xl">{action.emoji}</div>
        <h2 className="mt-3 text-center text-xl font-black">{action.title}</h2>
        <div className="mt-4 space-y-2.5">
          {action.body.map((paragraph, i) => (
            <p
              key={i}
              className="text-sm leading-relaxed text-[var(--foreground)]"
            >
              {paragraph}
            </p>
          ))}
        </div>
        {action.compensationAmount > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--up)]/30 bg-[var(--up)]/10 px-4 py-3">
            <span className="text-sm font-semibold">🎁 보상 지급 완료</span>
            <span className="text-lg font-black tabular-nums text-[var(--up)]">
              +{formatPrice(action.compensationAmount)}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={() => setSeenVersion(action.resetVersion)}
          className="mt-5 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white transition hover:opacity-90"
        >
          확인
        </button>
      </div>
    </div>
  );
}

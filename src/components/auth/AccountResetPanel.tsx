"use client";

import { useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import { toastResult } from "@/store/toastStore";

const CONFIRM_WORD = "초기화";

export function AccountResetPanel() {
  const userId = useMarketStore((state) => state.userId);
  const cloudSyncReady = useMarketStore((state) => state.cloudSyncReady);
  const resetAccount = useMarketStore((state) => state.resetAccount);
  const [expanded, setExpanded] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (
      resetting ||
      confirmation.trim() !== CONFIRM_WORD ||
      !userId ||
      !cloudSyncReady
    ) {
      return;
    }
    setResetting(true);
    const result = await resetAccount();
    setResetting(false);
    toastResult(result);
    if (result.success) {
      setExpanded(false);
      setConfirmation("");
    }
  }

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => setExpanded(true)}
        disabled={!userId || !cloudSyncReady}
        className="flex min-h-16 w-full touch-manipulation items-center justify-between border-t border-[var(--border)] px-4 py-3 text-left disabled:cursor-not-allowed disabled:opacity-50"
      >
        <span>
          <span className="block text-sm font-medium text-red-300">
            게임 계좌 전체 초기화
          </span>
          <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">
            로그인은 유지하고 현금·보유 종목·진행도·회사·운용사를 처음 상태로 되돌립니다.
          </span>
        </span>
        <span className="ml-3 shrink-0 text-[var(--muted)]">›</span>
      </button>
    );
  }

  return (
    <div className="border-t border-red-400/25 bg-red-500/5 px-4 py-4">
      <p className="text-sm font-semibold text-red-300">
        삭제한 게임 데이터는 복구할 수 없습니다
      </p>
      <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
        보유 중인 유저 ETF는 현재 NAV로 서버 원장에서 정리한 뒤, 지급액을 포함한
        기존 계좌 전체를 폐기합니다. 계속하려면 아래에 “초기화”를 입력하세요.
      </p>
      <input
        type="text"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        placeholder={CONFIRM_WORD}
        autoComplete="off"
        className="mt-3 min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 text-sm outline-none focus:border-red-400/60"
      />
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            if (resetting) return;
            setExpanded(false);
            setConfirmation("");
          }}
          disabled={resetting}
          className="min-h-11 rounded-xl border border-[var(--border)] text-sm font-semibold disabled:opacity-50"
        >
          취소
        </button>
        <button
          type="button"
          onClick={() => void handleReset()}
          disabled={
            resetting ||
            confirmation.trim() !== CONFIRM_WORD ||
            !userId ||
            !cloudSyncReady
          }
          className="min-h-11 rounded-xl bg-red-500/90 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
        >
          {resetting ? "초기화 중…" : "계좌 초기화"}
        </button>
      </div>
    </div>
  );
}

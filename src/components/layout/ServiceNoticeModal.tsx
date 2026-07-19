"use client";

import { useEffect, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";
import { CURRENT_SERVICE_NOTICE } from "@/data/serviceNotice";
import { formatPrice } from "@/lib/market/engine";

/**
 * 운영 공지 & 보상 모달 — 새 공지 버전을 아직 확인 안 한 플레이어에게 1회 뜬다.
 * '받기'를 누르면 보상 현금을 지급(지갑 멱등)하고 확인 버전을 기록한다. 보상은
 * 시즌·랭킹에서 제외되는 외생 소득이라 경쟁의 본질을 흔들지 않는다.
 */
export function ServiceNoticeModal() {
  const notice = CURRENT_SERVICE_NOTICE;
  const onboarded = useSettingsStore((s) => s.onboarded);
  const seenVersion = useSettingsStore((s) => s.serviceNoticeSeenVersion);
  const setSeenVersion = useSettingsStore((s) => s.setServiceNoticeSeenVersion);
  const claim = useMarketStore((s) => s.claimServiceCompensation);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !onboarded || seenVersion >= notice.version) return null;

  const acknowledge = () => {
    if (notice.compensationAmount > 0) {
      claim(notice.version, notice.compensationAmount);
    }
    setSeenVersion(notice.version);
  };

  return (
    <div className="fixed inset-0 z-[125] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-6 shadow-2xl">
        <div className="text-center text-4xl">{notice.emoji}</div>
        <h2 className="mt-3 text-center text-xl font-black">{notice.title}</h2>
        <div className="mt-4 space-y-2.5">
          {notice.body.map((paragraph, i) => (
            <p
              key={i}
              className="text-sm leading-relaxed text-[var(--foreground)]"
            >
              {paragraph}
            </p>
          ))}
        </div>
        {notice.compensationAmount > 0 && (
          <div className="mt-4 flex items-center justify-between rounded-xl border border-[var(--up)]/30 bg-[var(--up)]/10 px-4 py-3">
            <span className="text-sm font-semibold">🎁 보상 지급</span>
            <span className="text-lg font-black tabular-nums text-[var(--up)]">
              +{formatPrice(notice.compensationAmount)}
            </span>
          </div>
        )}
        <button
          type="button"
          onClick={acknowledge}
          className="mt-5 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white transition hover:opacity-90"
        >
          {notice.compensationAmount > 0 ? "보상 받기" : "확인"}
        </button>
      </div>
    </div>
  );
}

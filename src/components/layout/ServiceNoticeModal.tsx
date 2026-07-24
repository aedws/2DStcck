"use client";

import { useEffect, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";
import {
  GLOBAL_SERVICE_NOTICE,
  TARGETED_ACCOUNT_ACTIONS,
} from "@/data/serviceNotice";
import { MODAL_PRIORITY, useModalSlot } from "@/components/layout/ModalQueue";

/**
 * 운영 공지 모달 — 전체 공지(GLOBAL_SERVICE_NOTICE)를 모든 플레이어에게, 또는
 * 대상 계정 공지(TARGETED_ACCOUNT_ACTIONS)를 해당 계정에만 1회 띄운다. 확인하면
 * serviceNoticeSeenVersion 을 갱신해 다시 뜨지 않게 한다.
 */
export function ServiceNoticeModal() {
  const userId = useMarketStore((s) => s.userId);
  const seenVersion = useSettingsStore((s) => s.serviceNoticeSeenVersion);
  const setSeenVersion = useSettingsStore((s) => s.setServiceNoticeSeenVersion);

  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const targeted = userId ? TARGETED_ACCOUNT_ACTIONS[userId] : undefined;
  // 전체 공지와 대상 공지 중 아직 안 본 것 하나를 고른다(높은 버전 우선).
  const globalNotice =
    GLOBAL_SERVICE_NOTICE && seenVersion < GLOBAL_SERVICE_NOTICE.version
      ? GLOBAL_SERVICE_NOTICE
      : null;
  const targetedNotice =
    targeted && seenVersion < targeted.resetVersion ? targeted : null;
  const notice =
    globalNotice && targetedNotice
      ? globalNotice.version >= targetedNotice.resetVersion
        ? globalNotice
        : targetedNotice
      : (globalNotice ?? targetedNotice);

  const show = useModalSlot(
    "service-notice",
    MODAL_PRIORITY.serviceNotice,
    mounted && notice != null,
  );
  if (!show || !mounted || !notice) return null;

  const version =
    "version" in notice ? notice.version : notice.resetVersion;

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
        <button
          type="button"
          onClick={() => setSeenVersion(version)}
          className="mt-5 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-bold text-white transition hover:opacity-90"
        >
          확인
        </button>
      </div>
    </div>
  );
}

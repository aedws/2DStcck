"use client";

import { useEffect, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import {
  attendanceReward,
  claimAttendanceState,
  koreaDateKey,
} from "@/lib/player/playerProfile";
import { formatPrice } from "@/lib/market/engine";

/**
 * 홈 상단 출석 훅. 오늘 보상을 아직 안 받았으면 연속일·보상 미리보기와 함께
 * 바로 받기 버튼을 띄운다. 이미 받았으면 조용한 연속일 표시로 축소한다.
 * (복귀 훅이 프로필 안에 숨어 있던 문제를 홈 진입점에서 해결)
 */
export function AttendanceBanner() {
  const [mounted, setMounted] = useState(false);
  useMarketStore((s) => s.tick);
  const attendance = useMarketStore((s) => s.attendance);
  const claim = useMarketStore((s) => s.claimDailyAttendance);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const claimedToday = attendance.lastClaimDate === koreaDateKey();
  // 받으면 스트릭이 오르므로 다음 보상은 claimAttendanceState 로 정확히 미리본다
  const preview = claimAttendanceState(attendance);
  const nextReward = preview?.reward ?? attendanceReward(attendance.streak);

  if (claimedToday) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2.5 text-sm">
        <span className="text-[var(--muted)]">
          📅 출석 완료 · {attendance.streak}일 연속 (누적 {attendance.totalDays}일)
        </span>
        <span className="shrink-0 text-xs text-[var(--muted)]">내일 또 만나요</span>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/10 px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-bold text-emerald-300">
          🔥 {attendance.streak > 0 ? `${attendance.streak}일 연속 출석 중!` : "오늘의 출석 보상"}
        </p>
        <p className="mt-0.5 text-xs text-[var(--muted)]">
          오늘 받기 · {formatPrice(nextReward)} · 연속일수록 보상이 커집니다
        </p>
      </div>
      <button
        type="button"
        onClick={() => claim()}
        className="shrink-0 rounded-xl bg-emerald-400 px-4 py-2 text-sm font-black text-black transition hover:opacity-90"
      >
        출석 보상 받기
      </button>
    </div>
  );
}

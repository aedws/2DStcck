import { SESSION_DURATION_MS } from "@/lib/market/constants";

/**
 * 거래일(세션)은 실제 시간과 1:1로 흐른다(1거래일 = SESSION_DURATION_MS = 1시간).
 * 남은 거래일 수를 실제 시각(ms)·카운트다운 문자열로 환산해 "N거래일" 표기 옆에
 * 실제 시간 타이머를 함께 보여주기 위한 유틸.
 */

/** 남은 거래일 수 → 그 이벤트가 도래하는 실제 시각(ms). */
export function sessionsRemainingToMs(
  sessionsRemaining: number,
  now = Date.now(),
): number {
  const currentSession = Math.floor(now / SESSION_DURATION_MS);
  const target = currentSession + Math.max(0, Math.ceil(sessionsRemaining));
  return target * SESSION_DURATION_MS;
}

/** 남은 시간(ms) → "2시간 34분 후" / "34분 후" / "곧" 형태. */
export function formatCountdown(targetMs: number, now = Date.now()): string {
  const diff = targetMs - now;
  if (diff <= 0) return "곧";
  const totalMinutes = Math.ceil(diff / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}일 ${hours % 24}시간 후`;
  }
  if (hours > 0) return `${hours}시간 ${minutes}분 후`;
  return `${minutes}분 후`;
}

/** 절대 시각을 "7/26 15:00" 형태로. */
export function formatEtaClock(targetMs: number): string {
  return new Date(targetMs).toLocaleString("ko-KR", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 남은 거래일 수 → { 카운트다운, 절대시각 } 한 번에. */
export function sessionEta(
  sessionsRemaining: number,
  now = Date.now(),
): { countdown: string; clock: string } {
  const targetMs = sessionsRemainingToMs(sessionsRemaining, now);
  return { countdown: formatCountdown(targetMs, now), clock: formatEtaClock(targetMs) };
}

/** 지수 커버드콜은 20일, 단일 종목형은 5일, 일반 배당은 60일 주기다. */
export const COVERED_CALL_INTERVAL_DAYS = 20;
export const SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS = 5;
export const QUARTERLY_DIVIDEND_INTERVAL_DAYS = 60;
export const TRADING_SESSIONS_PER_YEAR = 240;

export interface DistributionScheduleSettlement {
  dueSessions: number[];
  lastSession: number;
}

function normalizeSession(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.floor(value) : Math.floor(fallback);
}

/**
 * 마지막 처리 지점부터 현재까지 도래한 모든 지급 회차를 반환한다.
 * 체크포인트는 완성된 주기만큼만 전진하므로 장기 미접속 뒤의 잔여 일수가 보존된다.
 */
export function settleDistributionSchedule(
  lastSession: number,
  currentSession: number,
  intervalDays: number,
): DistributionScheduleSettlement {
  const current = normalizeSession(currentSession, 0);
  const last = Math.min(normalizeSession(lastSession, current), current);
  const interval = Math.max(1, Math.floor(intervalDays));
  const periods = Math.floor(Math.max(0, current - last) / interval);
  const dueSessions = Array.from(
    { length: periods },
    (_, index) => last + interval * (index + 1),
  );

  return {
    dueSessions,
    lastSession: last + periods * interval,
  };
}

export function getDistributionDaysRemaining(
  lastSession: number,
  currentSession: number,
  intervalDays: number,
): number {
  const current = normalizeSession(currentSession, 0);
  const last = Math.min(normalizeSession(lastSession, current), current);
  const interval = Math.max(1, Math.floor(intervalDays));
  return Math.max(0, interval - Math.max(0, current - last));
}

/** 문자열과 지급 회차로 0 이상 1 미만의 재현 가능한 값을 만든다. */
function deterministicUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

/**
 * SPYI처럼 월 분배금이 고정되지 않도록 목표 월 수익의 85~115% 범위에서 변동시킨다.
 * 같은 종목·회차는 언제 다시 계산해도 같은 금액이어서 서버 재시도에도 안전하다.
 */
export function calculateCoveredCallDistribution(
  basePrice: number,
  annualYieldPercent: number,
  stockId: string,
  dueSession: number,
  intervalDays = COVERED_CALL_INTERVAL_DAYS,
): number {
  if (basePrice <= 0 || annualYieldPercent <= 0) return 0;
  const variation = 0.85 + deterministicUnit(`${stockId}:${dueSession}`) * 0.3;
  const periodRate =
    (annualYieldPercent / 100) *
    (Math.max(1, intervalDays) / TRADING_SESSIONS_PER_YEAR);
  return Math.max(1, Math.round(basePrice * periodRate * variation));
}

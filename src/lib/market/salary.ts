/** 고정급 설정: 내부 금액 단위는 센트 ($10,000). */
export const SALARY_AMOUNT = 1_000_000;
export const SALARY_INTERVAL_DAYS = 20;

export interface SalarySettlement {
  amount: number;
  periods: number;
  lastSalarySession: number;
}

function normalizeSession(value: number, fallback: number): number {
  return Number.isFinite(value) ? Math.floor(value) : Math.floor(fallback);
}

/**
 * 마지막 지급 기준 거래일 이후 밀린 월급을 한 번에 정산한다.
 * 앱을 오래 닫아 여러 주기가 지나도 각 20거래일 주기를 정확히 한 번만 반영한다.
 */
export function settleSalary(
  lastSalarySession: number,
  currentSession: number,
): SalarySettlement {
  const current = normalizeSession(currentSession, 0);
  const last = normalizeSession(lastSalarySession, current);
  const elapsed = Math.max(0, current - last);
  const periods = Math.floor(elapsed / SALARY_INTERVAL_DAYS);

  return {
    amount: periods * SALARY_AMOUNT,
    periods,
    lastSalarySession: last + periods * SALARY_INTERVAL_DAYS,
  };
}

/** 다음 고정급까지 남은 거래일. 지급 시점이면 0을 반환한다. */
export function getSalaryDaysRemaining(
  lastSalarySession: number,
  currentSession: number,
): number {
  const current = normalizeSession(currentSession, 0);
  const last = normalizeSession(lastSalarySession, current);
  return Math.max(0, SALARY_INTERVAL_DAYS - Math.max(0, current - last));
}

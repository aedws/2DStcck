/** 고정급 설정: 내부 금액 단위는 센트 ($10,000). */
export const SALARY_AMOUNT = 1_000_000;
export const SALARY_INTERVAL_DAYS = 20;
/** 한 번에 소급 지급할 최대 월급 주기. 체크포인트 회귀 시 현금 폭주를 막는다. */
export const MAX_SALARY_CATCHUP_PERIODS = 3;

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
 * 비정상적으로 많은 미지급분이 쌓이면 최근 {@link MAX_SALARY_CATCHUP_PERIODS} 주기만
 * 지급하고 체크포인트는 전체 미지급분까지 전진시킨다.
 */
export function settleSalary(
  lastSalarySession: number,
  currentSession: number,
): SalarySettlement {
  const current = normalizeSession(currentSession, 0);
  const last = Math.min(normalizeSession(lastSalarySession, current), current);
  const elapsed = Math.max(0, current - last);
  const allPeriods = Math.floor(elapsed / SALARY_INTERVAL_DAYS);
  const periods = Math.min(allPeriods, MAX_SALARY_CATCHUP_PERIODS);

  return {
    amount: periods * SALARY_AMOUNT,
    periods,
    lastSalarySession: last + allPeriods * SALARY_INTERVAL_DAYS,
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

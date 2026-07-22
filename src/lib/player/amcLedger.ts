export interface AmcLedgerCashReconciliation {
  cash: number;
  appliedBalance: number;
  delta: number;
}

/**
 * 서버 ETF 현금원장은 누적값이다. 로컬 지갑에는 마지막 적용 누적값과의 차이만
 * 반영하므로 동일 응답 재시도와 다중 기기 재접속이 모두 멱등이다.
 */
export function reconcileAmcLedgerCash(
  cash: number,
  appliedBalance: number,
  serverBalance: number,
): AmcLedgerCashReconciliation | null {
  if (
    !Number.isFinite(cash) ||
    !Number.isFinite(appliedBalance) ||
    !Number.isFinite(serverBalance)
  ) {
    return null;
  }
  const normalizedApplied = Math.round(appliedBalance);
  const normalizedServer = Math.round(serverBalance);
  const delta = normalizedServer - normalizedApplied;
  const nextCash = cash + delta;
  if (!Number.isFinite(nextCash)) return null;
  return {
    cash: nextCash,
    appliedBalance: normalizedServer,
    delta,
  };
}

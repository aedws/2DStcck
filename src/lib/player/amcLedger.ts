import {
  exactAdd,
  exactSubtract,
  exactToNumber,
  normalizeExactAmount,
} from "@/lib/market/exactAmount";

export interface AmcLedgerCashReconciliation {
  cash: number;
  appliedBalance: number;
  delta: number;
  cashExact: string;
  appliedBalanceExact: string;
  deltaExact: string;
}

/**
 * 서버 ETF 현금원장은 누적값이다. 로컬 지갑에는 마지막 적용 누적값과의 차이만
 * 반영하므로 동일 응답 재시도와 다중 기기 재접속이 모두 멱등이다.
 */
export function reconcileAmcLedgerCash(
  cash: number,
  appliedBalance: number,
  serverBalance: number,
  cashExact?: string,
  appliedBalanceExact?: string,
  serverBalanceExact?: string,
): AmcLedgerCashReconciliation | null {
  if (
    !Number.isFinite(cash) ||
    !Number.isFinite(appliedBalance) ||
    !Number.isFinite(serverBalance)
  ) {
    return null;
  }
  const normalizedAppliedExact = normalizeExactAmount(
    appliedBalanceExact,
    normalizeExactAmount(appliedBalance),
  );
  const normalizedServerExact = normalizeExactAmount(
    serverBalanceExact,
    normalizeExactAmount(serverBalance),
  );
  const deltaExact = exactSubtract(
    normalizedServerExact,
    normalizedAppliedExact,
  );
  const nextCashExact = exactAdd(
    normalizeExactAmount(cashExact, normalizeExactAmount(cash)),
    deltaExact,
  );
  const normalizedServer = exactToNumber(normalizedServerExact);
  const delta = exactToNumber(deltaExact);
  const nextCash = exactToNumber(nextCashExact);
  if (!Number.isFinite(nextCash)) return null;
  return {
    cash: nextCash,
    appliedBalance: normalizedServer,
    delta,
    cashExact: nextCashExact,
    appliedBalanceExact: normalizedServerExact,
    deltaExact,
  };
}

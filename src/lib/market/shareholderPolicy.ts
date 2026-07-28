import { SESSION_DURATION_MS } from "@/lib/market/constants";
import type { StockState } from "@/lib/types/market";

/** 현재 시세에서 실제 지급할 분기 주당 배당금(센트). */
export function effectiveQuarterlyDividend(stock: StockState): number {
  const configured = Math.max(0, Math.round(stock.quarterlyDividend ?? 0));
  if (
    configured > 0 &&
    stock.suspendDividendBelowInitialPrice &&
    stock.currentPrice < stock.initialPrice
  ) {
    return 0;
  }
  return configured;
}

/**
 * 배당 중지 재원을 자사주 매입으로 돌리는 회사의 결정론적 하방 지지 수익률.
 * 공모가 대비 10% 이상 하락하면 설정한 거래일 지지율 전체가 적용된다.
 */
export function belowInitialPriceBuybackReturn(
  stock: StockState,
  dtSeconds: number,
): number {
  if (
    !stock.suspendDividendBelowInitialPrice ||
    stock.currentPrice >= stock.initialPrice
  ) {
    return 0;
  }

  const supportPerSession = Math.min(
    0.2,
    Math.max(0, stock.belowInitialPriceBuybackSupportPerSession ?? 0),
  );
  if (supportPerSession <= 0) return 0;

  const gapRatio = Math.min(
    1,
    Math.max(0, (stock.initialPrice - stock.currentPrice) / stock.initialPrice),
  );
  const activation = Math.min(1, gapRatio / 0.1);
  const sessionSeconds = SESSION_DURATION_MS / 1_000;
  return supportPerSession * activation * (Math.max(0, dtSeconds) / sessionSeconds);
}

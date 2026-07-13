import type { Holding, MarginLeverage, ShortPosition } from "@/lib/types/market";
import {
  SESSIONS_PER_YEAR,
  SHORT_BORROW_ANNUAL_PERCENT,
} from "@/lib/market/interestRate";

export const DEFAULT_MARGIN_LEVERAGE: MarginLeverage = 2;
export const MARGIN_LEVERAGE_OPTIONS: MarginLeverage[] = [2, 3, 4, 5];

export function normalizeMarginLeverage(value: number | undefined): MarginLeverage {
  return MARGIN_LEVERAGE_OPTIONS.includes(value as MarginLeverage)
    ? (value as MarginLeverage)
    : DEFAULT_MARGIN_LEVERAGE;
}

/** 선택 배율에서 진입 직후에도 완충 구간이 남도록 정한 유지증거금. */
export function maintenanceMarginForLeverage(leverage: number): number {
  if (leverage >= 5) return 0.16;
  if (leverage >= 4) return 0.2;
  if (leverage >= 3) return 0.25;
  return 0.3;
}

export function longValue(
  holdings: Holding[],
  prices: Record<string, number>,
): number {
  return holdings.reduce(
    (sum, h) => sum + h.quantity * (prices[h.stockId] ?? 0),
    0,
  );
}

/** 공매도 상환 부채 (되사는 데 드는 현재 평가액) */
export function shortLiability(
  shorts: ShortPosition[],
  prices: Record<string, number>,
): number {
  return shorts.reduce(
    (sum, s) => sum + s.quantity * (prices[s.stockId] ?? 0),
    0,
  );
}

/** 자기자본(순자산) = 현금(마진 차입 시 음수) + 롱 평가 + 사치재 − 공매도 부채 */
export function computeEquity(
  cash: number,
  holdings: Holding[],
  shorts: ShortPosition[],
  prices: Record<string, number>,
  luxuryValue: number,
): number {
  return (
    cash +
    longValue(holdings, prices) +
    luxuryValue -
    shortLiability(shorts, prices)
  );
}

/** 총노출 = 롱 평가 + 공매도 평가 (레버리지·유지증거금의 분모) */
export function grossExposure(
  holdings: Holding[],
  shorts: ShortPosition[],
  prices: Record<string, number>,
): number {
  return longValue(holdings, prices) + shortLiability(shorts, prices);
}

/** 추가로 열 수 있는 노출(현금 환산). 새 롱/공매도 모두 이 한도를 쓴다. */
export function computeBuyingPower(
  cash: number,
  holdings: Holding[],
  shorts: ShortPosition[],
  prices: Record<string, number>,
  luxuryValue: number,
  leverage = 1,
): number {
  const equity = computeEquity(cash, holdings, shorts, prices, luxuryValue);
  const exposure = grossExposure(holdings, shorts, prices);
  return Math.max(0, Math.max(1, leverage) * equity - exposure);
}

/** 마진 차입(음수 현금)액 */
export function marginDebit(cash: number): number {
  return Math.max(0, -cash);
}

/** 유지증거금 미달 → 강제 청산 필요 여부 */
export function needsLiquidation(
  cash: number,
  holdings: Holding[],
  shorts: ShortPosition[],
  prices: Record<string, number>,
  luxuryValue: number,
  maintenanceMargin = 0.3,
): boolean {
  const exposure = grossExposure(holdings, shorts, prices);
  if (exposure <= 0) return false;
  const equity = computeEquity(cash, holdings, shorts, prices, luxuryValue);
  return equity < maintenanceMargin * exposure;
}

/**
 * 거래일 경과분만큼 마진 이자 + 공매도 대여수수료를 계산한다.
 * 이자 = 차입액 × 연이율/240 × 경과일, 수수료 = 공매도평가 × 연2%/240 × 경과일.
 */
export function accrueBorrowCost(
  debit: number,
  shortVal: number,
  annualRatePercent: number,
  sessionsElapsed: number,
): number {
  if (sessionsElapsed <= 0) return 0;
  const interest =
    debit * (annualRatePercent / 100 / SESSIONS_PER_YEAR) * sessionsElapsed;
  const borrowFee =
    shortVal *
    (SHORT_BORROW_ANNUAL_PERCENT / 100 / SESSIONS_PER_YEAR) *
    sessionsElapsed;
  return Math.round(interest + borrowFee);
}

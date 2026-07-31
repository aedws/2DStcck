import type { OrderResult, ShortPosition, Trade } from "@/lib/types/market";
import {
  exactAdd,
  exactPositionValue,
  exactQuantityAdd,
  exactSubtract,
  exactToNumber,
  normalizeExactAmount,
  normalizeExactQuantity,
} from "@/lib/market/exactAmount";

export interface ShortResult {
  cash: number;
  cashExact: string;
  shorts: ShortPosition[];
  trade: Trade;
}

/**
 * 버튼을 누른 뒤 시장 리플레이 결과가 교체되며 호가가 크게 바뀐 경우에는
 * 사용자가 화면에서 확인하지 않은 가격으로 공매도 주문을 체결하지 않는다.
 */
export const MAX_SHORT_QUOTE_DEVIATION = 0.15;

export function isShortQuoteStale(
  displayedPrice: number | undefined,
  executionPrice: number,
): boolean {
  if (displayedPrice === undefined) return false;
  if (!(displayedPrice > 0) || !(executionPrice > 0)) return true;
  return (
    Math.abs(executionPrice / displayedPrice - 1) >
    MAX_SHORT_QUOTE_DEVIATION
  );
}

function makeTrade(
  stockId: string,
  ticker: string,
  type: "short" | "cover",
  quantity: number,
  price: number,
  timestamp: number,
  shareMultiplier: number,
): Trade {
  const quantityExact = normalizeExactQuantity(quantity);
  const totalExact = exactPositionValue(price, quantityExact);
  return {
    id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stockId,
    ticker,
    type,
    quantity,
    quantityExact,
    price,
    total: exactToNumber(totalExact),
    totalExact,
    timestamp,
    shareMultiplier,
  };
}

/** 공매도 개시: 주식을 빌려 팔아 현금이 유입되고 상환 부채(공매도 수량)가 생긴다. */
export function openShort(
  cash: number,
  shorts: ShortPosition[],
  stockId: string,
  ticker: string,
  price: number,
  quantity: number,
  timestamp: number,
  cashExact?: string,
  shareMultiplier = 1,
): ShortResult | OrderResult {
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, message: "수량은 1 이상의 정수여야 합니다." };
  }
  const existing = shorts.find((s) => s.stockId === stockId);
  let next: ShortPosition[];
  if (existing) {
    const newQty = existing.quantity + quantity;
    const newQuantityExact = exactQuantityAdd(
      existing.quantityExact ?? existing.quantity,
      quantity,
    );
    const newAvg =
      (existing.averagePrice * existing.quantity + price * quantity) / newQty;
    next = shorts.map((s) =>
      s.stockId === stockId
        ? {
            ...s,
            quantity: newQty,
            quantityExact: newQuantityExact,
            averagePrice: newAvg,
          }
        : s,
    );
  } else {
    next = [
      ...shorts,
      {
        stockId,
        quantity,
        quantityExact: normalizeExactQuantity(quantity),
        averagePrice: price,
      },
    ];
  }
  const proceedsExact = exactPositionValue(price, quantity);
  const nextCashExact = cashExact
    ? exactAdd(cashExact, proceedsExact)
    : normalizeExactAmount(cash + price * quantity);
  return {
    cash: exactToNumber(nextCashExact),
    cashExact: nextCashExact,
    shorts: next,
    trade: makeTrade(
      stockId,
      ticker,
      "short",
      quantity,
      price,
      timestamp,
      shareMultiplier,
    ),
  };
}

/** 공매도 청산(cover): 되사서 상환. 현금이 나가고 부채가 줄어든다. */
export function coverShort(
  cash: number,
  shorts: ShortPosition[],
  stockId: string,
  ticker: string,
  price: number,
  quantity: number,
  timestamp: number,
  cashExact?: string,
  shareMultiplier = 1,
): ShortResult | OrderResult {
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, message: "수량은 1 이상의 정수여야 합니다." };
  }
  const existing = shorts.find((s) => s.stockId === stockId);
  if (!existing || existing.quantity < quantity) {
    return { success: false, message: "청산할 공매도 수량이 부족합니다." };
  }
  const remaining = existing.quantity - quantity;
  const remainingExact = exactQuantityAdd(
    existing.quantityExact ?? existing.quantity,
    `-${normalizeExactQuantity(quantity)}`,
  );
  const next =
    remaining === 0
      ? shorts.filter((s) => s.stockId !== stockId)
      : shorts.map((s) =>
          s.stockId === stockId
            ? { ...s, quantity: remaining, quantityExact: remainingExact }
            : s,
        );
  const costExact = exactPositionValue(price, quantity);
  const nextCashExact = cashExact
    ? exactSubtract(cashExact, costExact)
    : normalizeExactAmount(cash - price * quantity);
  return {
    cash: exactToNumber(nextCashExact),
    cashExact: nextCashExact,
    shorts: next,
    trade: makeTrade(
      stockId,
      ticker,
      "cover",
      quantity,
      price,
      timestamp,
      shareMultiplier,
    ),
  };
}

export function isShortSuccess(
  result: ShortResult | OrderResult,
): result is ShortResult {
  return "trade" in result;
}

/** 공매도 실현손익 (진입가 − 청산가) × 수량 */
export function shortRealizedPnl(
  averagePrice: number,
  coverPrice: number,
  quantity: number,
): number {
  return (averagePrice - coverPrice) * quantity;
}

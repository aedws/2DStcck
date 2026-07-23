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

function makeTrade(
  stockId: string,
  ticker: string,
  type: "short" | "cover",
  quantity: number,
  price: number,
  timestamp: number,
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
    trade: makeTrade(stockId, ticker, "short", quantity, price, timestamp),
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
    trade: makeTrade(stockId, ticker, "cover", quantity, price, timestamp),
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

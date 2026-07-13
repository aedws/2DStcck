import type { Holding, OrderResult, Trade } from "@/lib/types/market";

export const MIN_SHARE_QUANTITY = 0.001;
export const SHARE_QUANTITY_DECIMALS = 6;

export function normalizeShareQuantity(quantity: number): number {
  const factor = 10 ** SHARE_QUANTITY_DECIMALS;
  return Math.round(quantity * factor) / factor;
}

export function isValidShareQuantity(quantity: number): boolean {
  if (!Number.isFinite(quantity)) return false;
  const normalized = normalizeShareQuantity(quantity);
  return normalized >= MIN_SHARE_QUANTITY && Math.abs(normalized - quantity) < 1e-9;
}

export function shareOrderTotal(price: number, quantity: number): number {
  return Math.round(price * normalizeShareQuantity(quantity));
}

export function calculatePortfolioValue(
  holdings: Holding[],
  prices: Record<string, number>,
): number {
  return holdings.reduce(
    (sum, h) => sum + h.quantity * (prices[h.stockId] ?? 0),
    0,
  );
}

export function executeBuy(
  cash: number,
  holdings: Holding[],
  stockId: string,
  ticker: string,
  price: number,
  quantity: number,
  timestamp: number,
): { cash: number; holdings: Holding[]; trade: Trade } | OrderResult {
  if (!isValidShareQuantity(quantity)) {
    return { success: false, message: "수량은 0.001주 이상, 소수점 6자리까지 입력해 주세요." };
  }

  const normalizedQuantity = normalizeShareQuantity(quantity);
  const total = shareOrderTotal(price, normalizedQuantity);
  if (total < 1) {
    return { success: false, message: "주문 금액은 최소 $0.01이어야 합니다." };
  }
  if (total > cash) {
    return { success: false, message: "보유 현금이 부족합니다." };
  }

  const existing = holdings.find((h) => h.stockId === stockId);
  let newHoldings: Holding[];

  if (existing) {
    const newQty = normalizeShareQuantity(existing.quantity + normalizedQuantity);
    const newAvg =
      (existing.averagePrice * existing.quantity + price * normalizedQuantity) / newQty;
    newHoldings = holdings.map((h) =>
      h.stockId === stockId
        ? { ...h, quantity: newQty, averagePrice: newAvg }
        : h,
    );
  } else {
    newHoldings = [
      ...holdings,
      { stockId, quantity: normalizedQuantity, averagePrice: price },
    ];
  }

  const trade: Trade = {
    id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stockId,
    ticker,
    type: "buy",
    quantity: normalizedQuantity,
    price,
    total,
    timestamp,
  };

  return {
    cash: cash - total,
    holdings: newHoldings,
    trade,
  };
}

export function executeSell(
  cash: number,
  holdings: Holding[],
  stockId: string,
  ticker: string,
  price: number,
  quantity: number,
  timestamp: number,
): { cash: number; holdings: Holding[]; trade: Trade } | OrderResult {
  if (!isValidShareQuantity(quantity)) {
    return { success: false, message: "수량은 0.001주 이상, 소수점 6자리까지 입력해 주세요." };
  }

  const normalizedQuantity = normalizeShareQuantity(quantity);

  const existing = holdings.find((h) => h.stockId === stockId);
  if (!existing || existing.quantity + 1e-9 < normalizedQuantity) {
    return { success: false, message: "보유 수량이 부족합니다." };
  }

  const total = shareOrderTotal(price, normalizedQuantity);
  if (total < 1) {
    return { success: false, message: "주문 금액은 최소 $0.01이어야 합니다." };
  }
  const newQty = normalizeShareQuantity(existing.quantity - normalizedQuantity);

  let newHoldings: Holding[];
  if (newQty < MIN_SHARE_QUANTITY) {
    newHoldings = holdings.filter((h) => h.stockId !== stockId);
  } else {
    newHoldings = holdings.map((h) =>
      h.stockId === stockId ? { ...h, quantity: newQty } : h,
    );
  }

  const trade: Trade = {
    id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stockId,
    ticker,
    type: "sell",
    quantity: normalizedQuantity,
    price,
    total,
    timestamp,
  };

  return {
    cash: cash + total,
    holdings: newHoldings,
    trade,
  };
}

export function isOrderSuccess(
  result: ReturnType<typeof executeBuy>,
): result is { cash: number; holdings: Holding[]; trade: Trade } {
  return "trade" in result;
}

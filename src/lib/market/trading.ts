import type { Holding, OrderResult, Trade } from "@/lib/types/market";

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
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, message: "수량은 1 이상의 정수여야 합니다." };
  }

  const total = price * quantity;
  if (total > cash) {
    return { success: false, message: "보유 현금이 부족합니다." };
  }

  const existing = holdings.find((h) => h.stockId === stockId);
  let newHoldings: Holding[];

  if (existing) {
    const newQty = existing.quantity + quantity;
    const newAvg =
      (existing.averagePrice * existing.quantity + price * quantity) / newQty;
    newHoldings = holdings.map((h) =>
      h.stockId === stockId
        ? { ...h, quantity: newQty, averagePrice: newAvg }
        : h,
    );
  } else {
    newHoldings = [
      ...holdings,
      { stockId, quantity, averagePrice: price },
    ];
  }

  const trade: Trade = {
    id: `trade-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stockId,
    ticker,
    type: "buy",
    quantity,
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
  if (quantity <= 0 || !Number.isInteger(quantity)) {
    return { success: false, message: "수량은 1 이상의 정수여야 합니다." };
  }

  const existing = holdings.find((h) => h.stockId === stockId);
  if (!existing || existing.quantity < quantity) {
    return { success: false, message: "보유 수량이 부족합니다." };
  }

  const total = price * quantity;
  const newQty = existing.quantity - quantity;

  let newHoldings: Holding[];
  if (newQty === 0) {
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
    quantity,
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

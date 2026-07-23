import { leverageMultiplierFor } from "@/lib/market/engine";
import type { StockState } from "@/lib/types/market";
import {
  exactQuantityMultiply,
  normalizeExactQuantity,
} from "@/lib/market/exactAmount";
import { normalizeShareQuantity } from "@/lib/market/trading";

export interface SplitAdjustedPosition {
  stockId: string;
  quantity: number;
  quantityExact?: string;
  averagePrice: number;
  splitMultiplier?: number;
}

export interface LeverageSplitEvent {
  ticker: string;
  ratio: number;
}

export interface SplitAdjustedOrder {
  stockId: string;
  price: number;
  quantity: number;
  splitMultiplier?: number;
}

export function currentPositionSplitMultiplier(
  stock: StockState,
  stocks: StockState[],
): number {
  if (stock.leverage !== undefined && stock.leverageUnderlyingId) {
    if (stock.shareMultiplier !== undefined) {
      return Math.max(stock.shareMultiplier, 1e-12);
    }
    const underlying = stocks.find(
      (item) => item.id === stock.leverageUnderlyingId,
    );
    return underlying ? leverageMultiplierFor(stock, underlying) : 1;
  }
  return stock.shareMultiplier ?? 1;
}

/** 보유·공매 포지션의 레버리지 액면 변동을 가치 중립적으로 반영한다. */
export function reconcileLeveragePositionSplits<
  T extends SplitAdjustedPosition,
>(
  positions: T[],
  stocks: StockState[],
): { positions: T[]; changed: boolean; events: LeverageSplitEvent[] } {
  const byId = new Map(stocks.map((stock) => [stock.id, stock]));
  const targetById = new Map<string, number>();
  for (const stock of stocks) {
    if (stock.leverage !== undefined && stock.leverageUnderlyingId) {
      const underlying = byId.get(stock.leverageUnderlyingId);
      if (!underlying) continue;
      targetById.set(
        stock.id,
        currentPositionSplitMultiplier(stock, stocks),
      );
    } else {
      targetById.set(stock.id, stock.shareMultiplier ?? 1);
    }
  }

  let changed = false;
  const events: LeverageSplitEvent[] = [];
  const next = positions.map((position) => {
    const target = targetById.get(position.stockId);
    if (target === undefined) return position;
    const applied = position.splitMultiplier ?? 1;
    if (!(target > 0) || !(applied > 0) || target === applied) {
      return position.splitMultiplier === target
        ? position
        : ({ ...position, splitMultiplier: target } as T);
    }
    const ratio = target / applied;
    changed = true;
    events.push({
      ticker: byId.get(position.stockId)?.ticker ?? position.stockId,
      ratio,
    });
    return {
      ...position,
      quantity: position.quantity * ratio,
      quantityExact: exactQuantityMultiply(
        normalizeExactQuantity(
          position.quantityExact,
          normalizeExactQuantity(position.quantity),
        ),
        ratio,
      ),
      averagePrice: position.averagePrice / ratio,
      splitMultiplier: target,
    } as T;
  });
  return { positions: changed ? next : positions, changed, events };
}

/** 새 포지션은 현재 액면가로 체결됐으므로 현재 배수를 각인한다. */
export function stampLeveragePositionMultiplier<
  T extends SplitAdjustedPosition,
>(positions: T[], stockId: string, stocks: StockState[]): T[] {
  const stock = stocks.find((item) => item.id === stockId);
  if (!stock) return positions;
  const multiplier = currentPositionSplitMultiplier(stock, stocks);
  return positions.map((position) =>
    position.stockId === stockId
      ? ({ ...position, splitMultiplier: multiplier } as T)
      : position,
  );
}

/** 지정가 주문도 액면 변동에 맞춰 가격÷배수·수량×배수로 함께 조정한다. */
export function reconcileSplitAdjustedOrders<T extends SplitAdjustedOrder>(
  orders: T[],
  stocks: StockState[],
): T[] {
  const byId = new Map(stocks.map((stock) => [stock.id, stock]));
  let changed = false;
  const next = orders.map((order) => {
    const stock = byId.get(order.stockId);
    if (!stock) return order;
    const target = currentPositionSplitMultiplier(stock, stocks);
    const applied = order.splitMultiplier ?? 1;
    if (!(target > 0) || !(applied > 0) || target === applied) {
      if (order.splitMultiplier === target) return order;
      changed = true;
      return { ...order, splitMultiplier: target } as T;
    }
    const ratio = target / applied;
    changed = true;
    return {
      ...order,
      price: Math.max(1, Math.round(order.price / ratio)),
      quantity: normalizeShareQuantity(order.quantity * ratio),
      splitMultiplier: target,
    } as T;
  });
  return changed ? next : orders;
}

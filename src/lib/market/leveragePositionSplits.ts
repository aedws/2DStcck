import { leverageMultiplierFor } from "@/lib/market/engine";
import type { StockState } from "@/lib/types/market";
import {
  exactQuantityMultiply,
  normalizeExactQuantity,
} from "@/lib/market/exactAmount";

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
    if (stock.leverage === undefined || !stock.leverageUnderlyingId) continue;
    const underlying = byId.get(stock.leverageUnderlyingId);
    if (!underlying) continue;
    targetById.set(stock.id, leverageMultiplierFor(stock, underlying));
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
  if (!stock || stock.leverage === undefined || !stock.leverageUnderlyingId) {
    return positions;
  }
  const underlying = stocks.find((item) => item.id === stock.leverageUnderlyingId);
  if (!underlying) return positions;
  const multiplier = leverageMultiplierFor(stock, underlying);
  return positions.map((position) =>
    position.stockId === stockId
      ? ({ ...position, splitMultiplier: multiplier } as T)
      : position,
  );
}

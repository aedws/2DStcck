import {
  computeCoveredCallTick,
  computeLeveragedSnapshot,
  leverageAdjustedCandles,
  leverageAdjustedHistory,
} from "@/lib/market/engine";
import { generateOrderBook } from "@/lib/market/orderBook";
import {
  applyDuePlayerCompanyMarketActions,
  type PlayerCompanyMarketAction,
} from "@/lib/market/playerCompanyMarketActions";
import {
  MARKET_EPOCH_MS,
  SESSION_DURATION_MS,
  SIM_TICK_MS,
} from "@/lib/market/constants";
import type { Candle, StockState } from "@/lib/types/market";

function scaleCandleAfter(
  candle: Candle,
  factor: number,
  actionAt: number,
  intervalMs: number,
): Candle {
  const bucket = Math.floor(actionAt / intervalMs) * intervalMs;
  if (candle.timestamp < bucket) return candle;
  if (candle.timestamp > bucket) {
    return {
      ...candle,
      open: candle.open * factor,
      high: candle.high * factor,
      low: candle.low * factor,
      close: candle.close * factor,
    };
  }
  const close = candle.close * factor;
  return {
    ...candle,
    high: Math.max(candle.high, close),
    low: Math.min(candle.low, close),
    close,
  };
}

function applyUnderlyingActionToCoveredCall(
  coveredCall: StockState,
  action: PlayerCompanyMarketAction,
): StockState {
  const result = computeCoveredCallTick(
    coveredCall,
    action.priceFactor - 1,
    0,
  );
  const factor = result.price / Math.max(coveredCall.currentPrice, 1);
  const actionAt = MARKET_EPOCH_MS + action.effectiveTick * SIM_TICK_MS;
  const actionSession = Math.floor(actionAt / SESSION_DURATION_MS);
  const actionBeforeCurrentSession =
    coveredCall.daySessionId !== undefined &&
    actionSession < coveredCall.daySessionId;

  return {
    ...coveredCall,
    currentPrice: result.price,
    prevDayClose: actionBeforeCurrentSession
      ? Math.max(1, Math.round(coveredCall.prevDayClose * factor))
      : coveredCall.prevDayClose,
    dayOpen: actionBeforeCurrentSession
      ? Math.max(1, Math.round(coveredCall.dayOpen * factor))
      : coveredCall.dayOpen,
    priceHistory: coveredCall.priceHistory.map((point) =>
      point.timestamp >= actionAt
        ? { ...point, price: point.price * factor }
        : point,
    ),
    candles: coveredCall.candles.map((candle) =>
      scaleCandleAfter(candle, factor, actionAt, 30_000),
    ),
    dailyCandles: coveredCall.dailyCandles.map((candle) =>
      scaleCandleAfter(candle, factor, actionAt, SESSION_DURATION_MS),
    ),
    coveredCallPremiumReserve: result.premiumReserve,
    orderBook: generateOrderBook(result.price, coveredCall.orderBook),
  };
}

/**
 * 늦게 도착한 플레이어 회사 기업행동을 본주와 파생상품에 원자적으로 반영한다.
 * 본주의 action cursor를 기준으로 새 기업행동만 골라 커버드콜에 순서대로 적용하므로,
 * 같은 서버 원장을 반복 수신해도 파생상품 가격이 중복 조정되지 않는다.
 */
export function reconcilePlayerCompanyMarketActionPrices(
  stocks: StockState[],
  actions: PlayerCompanyMarketAction[],
  targetTick: number,
): StockState[] {
  const beforeById = new Map(stocks.map((stock) => [stock.id, stock]));
  const dueActionsByStock = new Map<string, PlayerCompanyMarketAction[]>();

  for (const action of actions) {
    const cursor =
      beforeById.get(action.stockId)?.lastPlayerCompanyActionSequence ?? 0;
    if (action.sequence <= cursor || action.effectiveTick > targetTick) continue;
    const due = dueActionsByStock.get(action.stockId) ?? [];
    due.push(action);
    dueActionsByStock.set(action.stockId, due);
  }
  for (const due of dueActionsByStock.values()) {
    due.sort(
      (a, b) => a.effectiveTick - b.effectiveTick || a.sequence - b.sequence,
    );
  }

  const withUnderlyingActions = stocks.map((stock) =>
    applyDuePlayerCompanyMarketActions(stock, targetTick),
  );
  if (dueActionsByStock.size === 0) return withUnderlyingActions;

  const afterById = new Map(
    withUnderlyingActions.map((stock) => [stock.id, stock]),
  );
  return withUnderlyingActions.map((stock) => {
    const underlyingId =
      stock.leverageUnderlyingId ?? stock.coveredCallUnderlyingId;
    if (!underlyingId || !dueActionsByStock.has(underlyingId)) return stock;
    const underlying = afterById.get(underlyingId);
    if (!underlying) return stock;

    if (stock.leverage !== undefined) {
      const snapshot = computeLeveragedSnapshot(stock, underlying);
      const candles = leverageAdjustedCandles(
        stock,
        underlying,
        underlying.candles ?? [],
      );
      const priceHistory = leverageAdjustedHistory(
        stock,
        underlying,
        underlying.priceHistory ?? [],
      );
      const dailyCandles = leverageAdjustedCandles(
        stock,
        underlying,
        underlying.dailyCandles ?? [],
      );
      return {
        ...stock,
        shareMultiplier: snapshot.splitMultiplier,
        lastShareAdjustmentSession: snapshot.lastShareAdjustmentSession,
        currentPrice: snapshot.currentPrice,
        prevDayClose: snapshot.prevDayClose,
        dayOpen: snapshot.dayOpen,
        daySessionId: underlying.daySessionId,
        candles: candles.length > 0 ? candles : stock.candles,
        priceHistory:
          priceHistory.length > 0 ? priceHistory : stock.priceHistory,
        dailyCandles:
          dailyCandles.length > 0 ? dailyCandles : stock.dailyCandles,
        orderBook: generateOrderBook(snapshot.currentPrice, stock.orderBook),
      };
    }

    return (dueActionsByStock.get(underlyingId) ?? []).reduce(
      applyUnderlyingActionToCoveredCall,
      stock,
    );
  });
}

import type { Trade } from "@/lib/types/market";

export interface ClosedTradeResult {
  tradeId: string;
  ticker: string;
  timestamp: number;
  pnl: number;
}

interface ReplayPosition {
  qty: number;
  avg: number;
  hasExplicitShareScale: boolean;
}

function stockExecution(trade: Trade): {
  qty: number;
  price: number;
  hasExplicitShareScale: boolean;
} {
  const hasExplicitShareScale =
    trade.shareMultiplier !== undefined &&
    Number.isFinite(trade.shareMultiplier) &&
    trade.shareMultiplier > 0;
  const multiplier = hasExplicitShareScale ? trade.shareMultiplier! : 1;
  return {
    // 모든 체결을 액면분할 전 경제 좌수·가격으로 환산한다.
    qty: trade.quantity / multiplier,
    price: trade.price * multiplier,
    hasExplicitShareScale,
  };
}

/**
 * 구버전 체결에는 액면배수가 없다. 청산 좌수가 기록된 진입 좌수보다 많으면
 * 그 사이에 발생한 액면분할을 뜻하므로, 기존 포지션의 좌수·평단을 가치 중립으로
 * 청산 시점 단위에 맞춘다. 신규 체결은 명시적 shareMultiplier 경로를 사용한다.
 */
function reconcileLegacyCloseScale(
  position: ReplayPosition,
  closeQuantity: number,
  closeHasExplicitShareScale: boolean,
): void {
  if (
    closeHasExplicitShareScale ||
    position.hasExplicitShareScale ||
    position.qty <= 0 ||
    closeQuantity <= position.qty + 1e-9
  ) {
    return;
  }
  const ratio = closeQuantity / position.qty;
  position.qty *= ratio;
  position.avg /= ratio;
}

/** 체결 내역을 오래된 순으로 재생해 각 청산 거래의 실현손익을 계산한다. */
export function replayClosedTrades(trades: Trade[]): ClosedTradeResult[] {
  const longs = new Map<string, ReplayPosition>();
  const shorts = new Map<string, ReplayPosition>();
  const options = new Map<
    string,
    { qty: number; avg: number; side: "long" | "short" }
  >();
  const closed: ClosedTradeResult[] = [];

  for (let index = trades.length - 1; index >= 0; index--) {
    const trade = trades[index];
    let pnl: number | null = null;

    if (trade.type === "buy" || trade.type === "short") {
      const positions = trade.type === "buy" ? longs : shorts;
      const execution = stockExecution(trade);
      const position = positions.get(trade.stockId) ?? {
        qty: 0,
        avg: 0,
        hasExplicitShareScale: execution.hasExplicitShareScale,
      };
      const nextQuantity = position.qty + execution.qty;
      position.avg =
        nextQuantity > 0
          ? (position.avg * position.qty + execution.price * execution.qty) /
            nextQuantity
          : 0;
      position.qty = nextQuantity;
      position.hasExplicitShareScale =
        position.hasExplicitShareScale || execution.hasExplicitShareScale;
      positions.set(trade.stockId, position);
    } else if (trade.type === "sell" || trade.type === "cover") {
      const positions = trade.type === "sell" ? longs : shorts;
      const execution = stockExecution(trade);
      const position = positions.get(trade.stockId) ?? {
        qty: 0,
        avg: 0,
        hasExplicitShareScale: execution.hasExplicitShareScale,
      };
      reconcileLegacyCloseScale(
        position,
        execution.qty,
        execution.hasExplicitShareScale,
      );
      const quantity = Math.min(execution.qty, position.qty);
      if (quantity > 0) {
        pnl =
          (trade.type === "sell"
            ? execution.price - position.avg
            : position.avg - execution.price) * quantity;
      }
      position.qty -= quantity;
      if (position.qty <= 1e-9) {
        position.qty = 0;
        position.avg = 0;
      }
      positions.set(trade.stockId, position);
    } else if (trade.type === "option_buy" || trade.type === "option_write") {
      if (!trade.optionId) continue;
      const side = trade.type === "option_buy" ? "long" : "short";
      const position = options.get(trade.optionId) ?? { qty: 0, avg: 0, side };
      const nextQuantity = position.qty + trade.quantity;
      position.avg =
        nextQuantity > 0
          ? (position.avg * position.qty + trade.price * trade.quantity) /
            nextQuantity
          : 0;
      position.qty = nextQuantity;
      position.side = side;
      options.set(trade.optionId, position);
    } else if (trade.type === "option_close" || trade.type === "option_expire") {
      if (!trade.optionId) continue;
      const position = options.get(trade.optionId);
      if (!position) continue;
      const quantity = Math.min(trade.quantity, position.qty);
      if (quantity > 0) {
        pnl =
          (position.side === "long"
            ? trade.price - position.avg
            : position.avg - trade.price) * quantity;
      }
      position.qty -= quantity;
      if (position.qty <= 0) options.delete(trade.optionId);
      else options.set(trade.optionId, position);
    }

    if (pnl !== null) {
      closed.push({
        tradeId: trade.id,
        ticker: trade.ticker,
        timestamp: trade.timestamp,
        pnl: Math.round(pnl),
      });
    }
  }

  return closed;
}

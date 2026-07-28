import { positionMark } from "@/lib/market/options";
import { replayClosedTrades } from "@/lib/market/tradeReplay";
import type {
  Holding,
  OptionPosition,
  ShortPosition,
  StockState,
  Trade,
} from "@/lib/types/market";

/**
 * 체결 내역을 오래된 순으로 재생해 종목별 이동평균 원가로 실현손익을 계산한다.
 * trades 배열은 최신순으로 저장되므로 뒤집어 처리한다.
 */
export function computeRealizedPnl(trades: Trade[]): number {
  return Math.round(
    replayClosedTrades(trades).reduce((sum, trade) => sum + trade.pnl, 0),
  );
}

export function computeShortUnrealizedPnl(
  shorts: ShortPosition[],
  priceById: Record<string, number>,
): number {
  return shorts.reduce((sum, position) => {
    const price = priceById[position.stockId];
    if (price === undefined) return sum;
    return sum + (position.averagePrice - price) * position.quantity;
  }, 0);
}

export function computeOptionUnrealizedPnl(
  options: OptionPosition[],
  stocks: StockState[],
  currentSession: number,
  rateAnnualDecimal: number,
): number {
  return options.reduce((sum, position) => {
    const stock = stocks.find((candidate) => candidate.id === position.stockId);
    if (!stock) return sum;
    const mark = positionMark(position, stock, currentSession, rateAnnualDecimal, stocks);
    const perContract =
      position.side === "long"
        ? mark - position.openPremium
        : position.openPremium - mark;
    return sum + perContract * position.quantity;
  }, 0);
}

/** 보유 종목의 미실현 손익 (현재가 - 평단) × 수량 합. */
export function computeUnrealizedPnl(
  holdings: Holding[],
  priceById: Record<string, number>,
): number {
  return holdings.reduce((sum, h) => {
    const price = priceById[h.stockId];
    if (price === undefined) return sum;
    return sum + (price - h.averagePrice) * h.quantity;
  }, 0);
}

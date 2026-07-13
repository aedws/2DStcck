import { positionMark } from "@/lib/market/options";
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
  const longs = new Map<string, { qty: number; avg: number }>();
  const shorts = new Map<string, { qty: number; avg: number }>();
  const options = new Map<
    string,
    { qty: number; avg: number; side: "long" | "short" }
  >();
  let realized = 0;

  for (let i = trades.length - 1; i >= 0; i--) {
    const t = trades[i];
    if (t.type === "buy") {
      const pos = longs.get(t.stockId) ?? { qty: 0, avg: 0 };
      const newQty = pos.qty + t.quantity;
      pos.avg =
        newQty > 0 ? (pos.avg * pos.qty + t.price * t.quantity) / newQty : 0;
      pos.qty = newQty;
      longs.set(t.stockId, pos);
    } else if (t.type === "sell") {
      const pos = longs.get(t.stockId) ?? { qty: 0, avg: 0 };
      const sellQty = Math.min(t.quantity, pos.qty);
      realized += (t.price - pos.avg) * sellQty;
      pos.qty -= sellQty;
      if (pos.qty <= 0) {
        pos.qty = 0;
        pos.avg = 0;
      }
      longs.set(t.stockId, pos);
    } else if (t.type === "short") {
      const pos = shorts.get(t.stockId) ?? { qty: 0, avg: 0 };
      const newQty = pos.qty + t.quantity;
      pos.avg =
        newQty > 0 ? (pos.avg * pos.qty + t.price * t.quantity) / newQty : 0;
      pos.qty = newQty;
      shorts.set(t.stockId, pos);
    } else if (t.type === "cover") {
      const pos = shorts.get(t.stockId) ?? { qty: 0, avg: 0 };
      const coverQty = Math.min(t.quantity, pos.qty);
      realized += (pos.avg - t.price) * coverQty;
      pos.qty -= coverQty;
      if (pos.qty <= 0) {
        pos.qty = 0;
        pos.avg = 0;
      }
      shorts.set(t.stockId, pos);
    } else if (t.type === "option_buy" || t.type === "option_write") {
      if (!t.optionId) continue;
      const side = t.type === "option_buy" ? "long" : "short";
      const pos = options.get(t.optionId) ?? { qty: 0, avg: 0, side };
      const newQty = pos.qty + t.quantity;
      pos.avg =
        newQty > 0 ? (pos.avg * pos.qty + t.price * t.quantity) / newQty : 0;
      pos.qty = newQty;
      pos.side = side;
      options.set(t.optionId, pos);
    } else if (t.type === "option_close" || t.type === "option_expire") {
      if (!t.optionId) continue;
      const pos = options.get(t.optionId);
      if (!pos) continue;
      const closeQty = Math.min(t.quantity, pos.qty);
      realized +=
        (pos.side === "long" ? t.price - pos.avg : pos.avg - t.price) *
        closeQty;
      pos.qty -= closeQty;
      if (pos.qty <= 0) options.delete(t.optionId);
      else options.set(t.optionId, pos);
    }
  }

  return Math.round(realized);
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
    const mark = positionMark(position, stock, currentSession, rateAnnualDecimal);
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

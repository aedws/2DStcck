import type { Holding, Trade } from "@/lib/types/market";

/**
 * 체결 내역을 오래된 순으로 재생해 종목별 이동평균 원가로 실현손익을 계산한다.
 * trades 배열은 최신순으로 저장되므로 뒤집어 처리한다.
 */
export function computeRealizedPnl(trades: Trade[]): number {
  const position = new Map<string, { qty: number; avg: number }>();
  let realized = 0;

  for (let i = trades.length - 1; i >= 0; i--) {
    const t = trades[i];
    const pos = position.get(t.stockId) ?? { qty: 0, avg: 0 };

    if (t.type === "buy") {
      const newQty = pos.qty + t.quantity;
      pos.avg =
        newQty > 0 ? (pos.avg * pos.qty + t.price * t.quantity) / newQty : 0;
      pos.qty = newQty;
    } else {
      const sellQty = Math.min(t.quantity, pos.qty);
      realized += (t.price - pos.avg) * sellQty;
      pos.qty -= sellQty;
      if (pos.qty <= 0) {
        pos.qty = 0;
        pos.avg = 0;
      }
    }
    position.set(t.stockId, pos);
  }

  return Math.round(realized);
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

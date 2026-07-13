import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "@/lib/market/constants";
import type { Trade } from "@/lib/types/market";

export type ScorecardGrade = "S" | "A" | "B" | "C" | "D" | "F";

export interface ClosedTradeResult {
  tradeId: string;
  ticker: string;
  timestamp: number;
  pnl: number;
}

export interface DailyScorecard {
  session: number;
  marketDay: number;
  grade: ScorecardGrade;
  score: number;
  realizedPnl: number;
  tradeCount: number;
  closeCount: number;
  winRate: number | null;
  turnover: number;
  turnoverRate: number;
  bestTrade: ClosedTradeResult | null;
  worstTrade: ClosedTradeResult | null;
  marginCalled: boolean;
  feedback: string;
}

function replayClosedTrades(trades: Trade[]): ClosedTradeResult[] {
  const longs = new Map<string, { qty: number; avg: number }>();
  const shorts = new Map<string, { qty: number; avg: number }>();
  const options = new Map<string, { qty: number; avg: number; side: "long" | "short" }>();
  const closed: ClosedTradeResult[] = [];

  for (let index = trades.length - 1; index >= 0; index--) {
    const trade = trades[index];
    let pnl: number | null = null;

    if (trade.type === "buy") {
      const position = longs.get(trade.stockId) ?? { qty: 0, avg: 0 };
      const nextQuantity = position.qty + trade.quantity;
      position.avg = nextQuantity > 0
        ? (position.avg * position.qty + trade.price * trade.quantity) / nextQuantity
        : 0;
      position.qty = nextQuantity;
      longs.set(trade.stockId, position);
    } else if (trade.type === "sell") {
      const position = longs.get(trade.stockId) ?? { qty: 0, avg: 0 };
      const quantity = Math.min(trade.quantity, position.qty);
      if (quantity > 0) pnl = (trade.price - position.avg) * quantity;
      position.qty -= quantity;
      if (position.qty <= 0) {
        position.qty = 0;
        position.avg = 0;
      }
      longs.set(trade.stockId, position);
    } else if (trade.type === "short") {
      const position = shorts.get(trade.stockId) ?? { qty: 0, avg: 0 };
      const nextQuantity = position.qty + trade.quantity;
      position.avg = nextQuantity > 0
        ? (position.avg * position.qty + trade.price * trade.quantity) / nextQuantity
        : 0;
      position.qty = nextQuantity;
      shorts.set(trade.stockId, position);
    } else if (trade.type === "cover") {
      const position = shorts.get(trade.stockId) ?? { qty: 0, avg: 0 };
      const quantity = Math.min(trade.quantity, position.qty);
      if (quantity > 0) pnl = (position.avg - trade.price) * quantity;
      position.qty -= quantity;
      if (position.qty <= 0) {
        position.qty = 0;
        position.avg = 0;
      }
      shorts.set(trade.stockId, position);
    } else if (trade.type === "option_buy" || trade.type === "option_write") {
      if (!trade.optionId) continue;
      const side = trade.type === "option_buy" ? "long" : "short";
      const position = options.get(trade.optionId) ?? { qty: 0, avg: 0, side };
      const nextQuantity = position.qty + trade.quantity;
      position.avg = nextQuantity > 0
        ? (position.avg * position.qty + trade.price * trade.quantity) / nextQuantity
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
        pnl = (position.side === "long"
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

function gradeFor(score: number): ScorecardGrade {
  if (score >= 90) return "S";
  if (score >= 80) return "A";
  if (score >= 70) return "B";
  if (score >= 60) return "C";
  if (score >= 45) return "D";
  return "F";
}

function feedbackFor(scorecard: Omit<DailyScorecard, "feedback">): string {
  if (scorecard.marginCalled) {
    return "마진콜이 발생했습니다. 다음 거래일에는 총노출부터 줄여보세요.";
  }
  if (scorecard.tradeCount === 0) {
    return "관망도 전략입니다. 다음 단서가 선명할 때 자금을 투입하세요.";
  }
  if (scorecard.turnoverRate > 6) {
    return "회전율이 너무 높습니다. 확신 있는 거래만 남겨 과매매를 줄여보세요.";
  }
  if (scorecard.realizedPnl > 0 && scorecard.tradeCount <= 8) {
    return "선별한 거래에서 이익을 확정했습니다. 좋은 리듬을 유지하세요.";
  }
  if (scorecard.realizedPnl < 0) {
    return "손실 청산이 이어졌습니다. 진입 근거와 손절 기준을 다시 확인하세요.";
  }
  return scorecard.closeCount === 0
    ? "진입만 있고 청산은 없었습니다. 포지션의 종료 조건을 미리 정해두세요."
    : "손익은 보합권입니다. 거래 횟수보다 기대값이 높은 한 번에 집중하세요.";
}

/** 가장 최근에 종료된 거래 세션의 청산 성과를 계산한다. */
export function buildDailyScorecard(
  trades: Trade[],
  session: number,
  initialCash: number,
  marginCallAt: number | null,
): DailyScorecard {
  const start = session * SESSION_DURATION_MS;
  const end = start + SESSION_DURATION_MS;
  const sessionTrades = trades.filter(
    (trade) => trade.timestamp >= start && trade.timestamp < end,
  );
  const sessionClosed = replayClosedTrades(trades).filter(
    (trade) => trade.timestamp >= start && trade.timestamp < end,
  );
  const realizedPnl = Math.round(
    sessionClosed.reduce((sum, trade) => sum + trade.pnl, 0),
  );
  const turnover = Math.round(
    sessionTrades.reduce((sum, trade) => sum + Math.abs(trade.total), 0),
  );
  const safeInitialCash = Math.max(1, initialCash);
  const turnoverRate = turnover / safeInitialCash;
  const wins = sessionClosed.filter((trade) => trade.pnl > 0).length;
  const winRate = sessionClosed.length > 0 ? wins / sessionClosed.length : null;
  const marginCalled = marginCallAt !== null && marginCallAt >= start && marginCallAt < end;

  let score = 60;
  score += Math.max(-30, Math.min(30, (realizedPnl / safeInitialCash) * 500));
  if (winRate !== null) score += (winRate - 0.5) * 20;
  if (sessionTrades.length > 25) score -= 15;
  else if (sessionTrades.length > 15) score -= 5;
  else if (sessionTrades.length > 0 && sessionTrades.length <= 8) score += 8;
  if (turnoverRate > 6) score -= 20;
  else if (turnoverRate > 3) score -= 10;
  if (marginCalled) score -= 35;
  score = Math.round(Math.max(0, Math.min(100, score)));

  const sorted = [...sessionClosed].sort((a, b) => b.pnl - a.pnl);
  const base = {
    session,
    marketDay: session - Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS) + 1,
    grade: gradeFor(score),
    score,
    realizedPnl,
    tradeCount: sessionTrades.length,
    closeCount: sessionClosed.length,
    winRate,
    turnover,
    turnoverRate,
    bestTrade: sorted[0] ?? null,
    worstTrade: sorted[sorted.length - 1] ?? null,
    marginCalled,
  };

  return { ...base, feedback: feedbackFor(base) };
}

import type {
  Holding,
  RecurringInvestment,
  StockState,
  Trade,
} from "@/lib/types/market";
import { getMarketBuyPrice } from "@/lib/market/engine";
import {
  executeBuy,
  isOrderSuccess,
  normalizeShareQuantity,
  shareOrderTotal,
} from "@/lib/market/trading";

export const RECURRING_INTERVALS = [1, 5, 20] as const;
export const MIN_RECURRING_AMOUNT = 100;

export interface RecurringInvestmentOutcome {
  cash: number;
  holdings: Holding[];
  trades: Trade[];
  plans: RecurringInvestment[];
  filledPlans: RecurringInvestment[];
  failedPlans: RecurringInvestment[];
}

export function normalizeRecurringInvestments(
  value: RecurringInvestment[] | null | undefined,
): RecurringInvestment[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (plan) =>
        plan &&
        typeof plan.id === "string" &&
        typeof plan.stockId === "string" &&
        Number.isFinite(plan.amount) &&
        plan.amount >= MIN_RECURRING_AMOUNT &&
        RECURRING_INTERVALS.includes(plan.intervalSessions) &&
        Number.isSafeInteger(plan.nextSession),
    )
    .map((plan) => ({
      ...plan,
      amount: Math.round(plan.amount),
      enabled: plan.enabled !== false,
    }))
    .slice(0, 30);
}

function nextDueSession(plan: RecurringInvestment, currentSession: number): number {
  if (plan.nextSession > currentSession) return plan.nextSession;
  const elapsed = currentSession - plan.nextSession;
  return plan.nextSession +
    (Math.floor(elapsed / plan.intervalSessions) + 1) * plan.intervalSessions;
}

/**
 * 도래한 계획을 한 번만 체결하고 다음 회차로 넘긴다. 장기간 미접속했더라도
 * 밀린 회차를 한꺼번에 사지 않으며, 현금이 부족하면 미수 없이 건너뛴다.
 */
export function processRecurringInvestments(
  inputPlans: RecurringInvestment[],
  inputCash: number,
  inputHoldings: Holding[],
  inputTrades: Trade[],
  stocks: StockState[],
  currentSession: number,
  now: number,
): RecurringInvestmentOutcome {
  let cash = inputCash;
  let holdings = inputHoldings;
  let trades = inputTrades;
  const filledPlans: RecurringInvestment[] = [];
  const failedPlans: RecurringInvestment[] = [];
  const byId = new Map(stocks.map((stock) => [stock.id, stock]));

  const plans = normalizeRecurringInvestments(inputPlans).map((plan) => {
    if (!plan.enabled || currentSession < plan.nextSession) return plan;

    const nextSession = nextDueSession(plan, currentSession);
    const stock = byId.get(plan.stockId);
    if (!stock || stock.sector === "지수" || stock.sector === "선물") {
      const updated = {
        ...plan,
        nextSession,
        lastExecutedSession: currentSession,
        lastStatus: "unavailable" as const,
      };
      failedPlans.push(updated);
      return updated;
    }

    const price = getMarketBuyPrice(stock.currentPrice);
    const quantity = normalizeShareQuantity(
      Math.floor((plan.amount / price) * 1_000_000) / 1_000_000,
    );
    const total = shareOrderTotal(price, quantity);
    if (quantity < 0.001 || total <= 0 || total > cash) {
      const updated = {
        ...plan,
        nextSession,
        lastExecutedSession: currentSession,
        lastStatus: "insufficient_cash" as const,
      };
      failedPlans.push(updated);
      return updated;
    }

    const result = executeBuy(
      cash,
      holdings,
      stock.id,
      stock.ticker,
      price,
      quantity,
      now,
    );
    if (!isOrderSuccess(result)) {
      const updated = {
        ...plan,
        nextSession,
        lastExecutedSession: currentSession,
        lastStatus: "insufficient_cash" as const,
      };
      failedPlans.push(updated);
      return updated;
    }

    cash = result.cash;
    holdings = result.holdings;
    trades = [result.trade, ...trades];
    const updated = {
      ...plan,
      nextSession,
      lastExecutedSession: currentSession,
      lastStatus: "filled" as const,
    };
    filledPlans.push(updated);
    return updated;
  });

  return { cash, holdings, trades, plans, filledPlans, failedPlans };
}

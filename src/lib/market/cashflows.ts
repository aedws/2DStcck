import type { CashPayment, Holding, StockState } from "@/lib/types/market";
import { applyCashDistributionToStock } from "@/lib/market/engine";
import {
  calculateCoveredCallDistribution,
  COVERED_CALL_INTERVAL_DAYS,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  settleDistributionSchedule,
} from "@/lib/market/distributions";
import {
  SALARY_AMOUNT,
  SALARY_INTERVAL_DAYS,
  settleSalary,
} from "@/lib/market/salary";

const MAX_CASH_PAYMENTS = 50;

export interface LocalCashflowInput {
  cash: number;
  lastSalarySession: number;
  lastMonthlyDistributionSession: number;
  lastQuarterlyDividendSession: number;
  holdings: Holding[];
  stocks: StockState[];
  cashPayments: CashPayment[];
}

export interface LocalCashflowSettlement {
  changed: boolean;
  cash: number;
  lastSalarySession: number;
  lastMonthlyDistributionSession: number;
  lastQuarterlyDividendSession: number;
  stocks: StockState[];
  cashPayments: CashPayment[];
  creditedAmount: number;
}

/**
 * 로컬 게임의 급여와 투자 현금흐름을 한 번에 정산한다.
 * 보유 수량이 0이어도 지급 회차를 소진해 이후 매수로 과거 지급분을 받을 수 없게 한다.
 */
export function settleLocalCashflows(
  input: LocalCashflowInput,
  currentSession: number,
  now: number,
): LocalCashflowSettlement {
  const salary = settleSalary(input.lastSalarySession, currentSession);
  const monthly = settleDistributionSchedule(
    input.lastMonthlyDistributionSession,
    currentSession,
    COVERED_CALL_INTERVAL_DAYS,
  );
  const quarterly = settleDistributionSchedule(
    input.lastQuarterlyDividendSession,
    currentSession,
    QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  );
  const changed =
    salary.periods > 0 ||
    monthly.dueSessions.length > 0 ||
    quarterly.dueSessions.length > 0;

  if (!changed) {
    return {
      changed: false,
      cash: input.cash,
      lastSalarySession: input.lastSalarySession,
      lastMonthlyDistributionSession: input.lastMonthlyDistributionSession,
      lastQuarterlyDividendSession: input.lastQuarterlyDividendSession,
      stocks: input.stocks,
      cashPayments: input.cashPayments,
      creditedAmount: 0,
    };
  }

  let creditedAmount = 0;
  let stocks = input.stocks;
  const issued: CashPayment[] = [];
  const quantityByStockId = new Map(
    input.holdings.map((holding) => [holding.stockId, holding.quantity]),
  );

  for (let index = 0; index < salary.periods; index++) {
    const dueSession =
      input.lastSalarySession + SALARY_INTERVAL_DAYS * (index + 1);
    creditedAmount += SALARY_AMOUNT;
    issued.push({
      id: `local-salary-${dueSession}`,
      kind: "salary",
      sourceId: "fixed_salary",
      dueSession,
      amount: SALARY_AMOUNT,
      timestamp: now,
    });
  }

  for (const dueSession of monthly.dueSessions) {
    const coveredCallStocks = stocks.filter(
      (candidate) => (candidate.coveredCallAnnualYield ?? 0) > 0,
    );
    for (const stock of coveredCallStocks) {
      const basePrice = Math.max(
        stock.daySessionId === currentSession
          ? stock.prevDayClose
          : stock.currentPrice,
        100,
      );
      const amountPerShare = calculateCoveredCallDistribution(
        basePrice,
        stock.coveredCallAnnualYield ?? 0,
        stock.id,
        dueSession,
      );
      if (amountPerShare <= 0) continue;

      const quantity = quantityByStockId.get(stock.id) ?? 0;
      const amount = quantity * amountPerShare;
      if (amount > 0) {
        creditedAmount += amount;
        issued.push({
          id: `local-covered-call-${stock.id}-${dueSession}`,
          kind: "covered_call",
          sourceId: stock.id,
          ticker: stock.ticker,
          dueSession,
          quantity,
          amountPerShare,
          amount,
          timestamp: now,
        });
      }
      stocks = stocks.map((candidate) =>
        candidate.id === stock.id
          ? applyCashDistributionToStock(candidate, amountPerShare, now)
          : candidate,
      );
    }
  }

  for (const dueSession of quarterly.dueSessions) {
    const dividendStocks = stocks.filter(
      (candidate) => (candidate.quarterlyDividend ?? 0) > 0,
    );
    for (const stock of dividendStocks) {
      const amountPerShare = Math.round(stock.quarterlyDividend ?? 0);
      if (amountPerShare <= 0) continue;

      const quantity = quantityByStockId.get(stock.id) ?? 0;
      const amount = quantity * amountPerShare;
      if (amount > 0) {
        creditedAmount += amount;
        issued.push({
          id: `local-dividend-${stock.id}-${dueSession}`,
          kind: "dividend",
          sourceId: stock.id,
          ticker: stock.ticker,
          dueSession,
          quantity,
          amountPerShare,
          amount,
          timestamp: now,
        });
      }
      stocks = stocks.map((candidate) =>
        candidate.id === stock.id
          ? applyCashDistributionToStock(candidate, amountPerShare, now)
          : candidate,
      );
    }
  }

  return {
    changed: true,
    cash: input.cash + creditedAmount,
    lastSalarySession: salary.lastSalarySession,
    lastMonthlyDistributionSession: monthly.lastSession,
    lastQuarterlyDividendSession: quarterly.lastSession,
    stocks,
    cashPayments: [...issued.reverse(), ...input.cashPayments].slice(
      0,
      MAX_CASH_PAYMENTS,
    ),
    creditedAmount,
  };
}

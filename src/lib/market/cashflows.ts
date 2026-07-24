import type {
  CashPayment,
  CharacterProgressMap,
  Holding,
  PreferredShare,
  StockState,
} from "@/lib/types/market";
import {
  getCharacterProgress,
  shareholderRightFactor,
} from "@/lib/market/characterProgress";
import { applyCashDistributionToStock } from "@/lib/market/engine";
import {
  calculateCoveredCallDistribution,
  COVERED_CALL_INTERVAL_DAYS,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
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
  lastSingleCoveredCallDistributionSession: number;
  lastQuarterlyDividendSession: number;
  holdings: Holding[];
  stocks: StockState[];
  cashPayments: CashPayment[];
  preferredShares?: PreferredShare[];
  characterProgress?: CharacterProgressMap;
}

export interface LocalCashflowSettlement {
  changed: boolean;
  cash: number;
  lastSalarySession: number;
  lastMonthlyDistributionSession: number;
  lastSingleCoveredCallDistributionSession: number;
  lastQuarterlyDividendSession: number;
  stocks: StockState[];
  cashPayments: CashPayment[];
  creditedAmount: number;
}

function paymentKey(payment: Pick<CashPayment, "id">): string {
  return payment.id;
}

/**
 * 로컬 게임의 급여와 투자 현금흐름을 한 번에 정산한다.
 * 보유 수량이 0이어도 지급 회차를 소진해 이후 매수로 과거 지급분을 받을 수 없게 한다.
 * 동일 id 지급이 이미 있으면 현금을 다시 넣지 않는다(클라우드 체크포인트 회귀 방어).
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
  const singleCoveredCall = settleDistributionSchedule(
    input.lastSingleCoveredCallDistributionSession,
    currentSession,
    SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
  );
  const quarterly = settleDistributionSchedule(
    input.lastQuarterlyDividendSession,
    currentSession,
    QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  );
  const changed =
    salary.periods > 0 ||
    monthly.dueSessions.length > 0 ||
    singleCoveredCall.dueSessions.length > 0 ||
    quarterly.dueSessions.length > 0;

  if (!changed) {
    return {
      changed: false,
      cash: input.cash,
      lastSalarySession: input.lastSalarySession,
      lastMonthlyDistributionSession: input.lastMonthlyDistributionSession,
      lastSingleCoveredCallDistributionSession:
        input.lastSingleCoveredCallDistributionSession,
      lastQuarterlyDividendSession: input.lastQuarterlyDividendSession,
      stocks: input.stocks,
      cashPayments: input.cashPayments,
      creditedAmount: 0,
    };
  }

  let creditedAmount = 0;
  let stocks = input.stocks;
  const issued: CashPayment[] = [];
  const paidIds = new Set(input.cashPayments.map(paymentKey));
  const quantityByStockId = new Map(
    input.holdings.map((holding) => [holding.stockId, holding.quantity]),
  );

  const creditOnce = (payment: CashPayment) => {
    if (paidIds.has(payment.id)) return;
    paidIds.add(payment.id);
    creditedAmount += payment.amount;
    issued.push(payment);
  };

  for (let index = 0; index < salary.periods; index++) {
    // 소급 상한으로 last 가 앞으로 당겨졌을 수 있으므로 실제 지급 회차는
    // 정산 결과 체크포인트에서 역산한다.
    const dueSession =
      salary.lastSalarySession - SALARY_INTERVAL_DAYS * (salary.periods - 1 - index);
    creditOnce({
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
      (candidate) =>
        (candidate.coveredCallAnnualYield ?? 0) > 0 &&
        (candidate.coveredCallDistributionIntervalDays ??
          COVERED_CALL_INTERVAL_DAYS) === COVERED_CALL_INTERVAL_DAYS,
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
        COVERED_CALL_INTERVAL_DAYS,
      );
      if (amountPerShare <= 0) continue;

      const quantity = quantityByStockId.get(stock.id) ?? 0;
      const amount = quantity * amountPerShare;
      if (amount > 0) {
        creditOnce({
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

  for (const dueSession of singleCoveredCall.dueSessions) {
    const coveredCallStocks = stocks.filter(
      (candidate) =>
        (candidate.coveredCallAnnualYield ?? 0) > 0 &&
        candidate.coveredCallDistributionIntervalDays ===
          SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
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
        SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
      );
      if (amountPerShare <= 0) continue;

      const quantity = quantityByStockId.get(stock.id) ?? 0;
      const amount = quantity * amountPerShare;
      if (amount > 0) {
        creditOnce({
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

  // 관계 보상 우선주 배당 — 20거래일마다 현재 가치의 50%(dividendPerShare)를 지급한다.
  // 인버스·곱버스 보유로 호감이 음수(적대)면 주주권리 계수만큼 배당이 감소한다.
  const preferredShares = input.preferredShares ?? [];
  for (const dueSession of monthly.dueSessions) {
    for (const share of preferredShares) {
      const affinity = getCharacterProgress(
        input.characterProgress ?? {},
        share.characterId,
      ).affinity;
      const amount = Math.round(
        share.dividendPerShare * share.shares * shareholderRightFactor(affinity),
      );
      if (amount <= 0) continue;
      creditOnce({
        id: `preferred-dividend-${share.characterId}-${dueSession}`,
        kind: "preferred_dividend",
        sourceId: share.companyId,
        ticker: share.ticker,
        dueSession,
        quantity: share.shares,
        amountPerShare: share.dividendPerShare,
        amount,
        timestamp: now,
      });
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
        creditOnce({
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
    lastSingleCoveredCallDistributionSession:
      singleCoveredCall.lastSession,
    lastQuarterlyDividendSession: quarterly.lastSession,
    stocks,
    cashPayments: [...issued.reverse(), ...input.cashPayments].slice(
      0,
      MAX_CASH_PAYMENTS,
    ),
    creditedAmount,
  };
}

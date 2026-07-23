import {
  exactAdd,
  exactPositionValue,
  exactToNumber,
  normalizeExactAmount,
} from "@/lib/market/exactAmount";
import type { CashPayment, CashPaymentKind } from "@/lib/types/market";

export type MarketTaxKind =
  | "exchange_tax"
  | "capital_gains_tax"
  | "financial_investment_tax"
  | "corporate_tax";

/** $1T까지는 모든 신설 세금을 완전히 면제한다. 단위는 센트. */
export const TAX_FREE_NET_WORTH_EXACT = "100000000000000";

const TAX_RATES_BPS: Array<{
  threshold: bigint;
  rates: Record<MarketTaxKind, bigint>;
}> = [
  {
    threshold: 100_000_000_000_000_000_000n, // $1Qi
    rates: {
      exchange_tax: 30n,
      capital_gains_tax: 2_000n,
      financial_investment_tax: 2_200n,
      corporate_tax: 2_500n,
    },
  },
  {
    threshold: 1_000_000_000_000_000_000n, // $10Qa
    rates: {
      exchange_tax: 20n,
      capital_gains_tax: 1_500n,
      financial_investment_tax: 1_800n,
      corporate_tax: 2_000n,
    },
  },
  {
    threshold: 10_000_000_000_000_000n, // $100T
    rates: {
      exchange_tax: 10n,
      capital_gains_tax: 1_000n,
      financial_investment_tax: 1_200n,
      corporate_tax: 1_400n,
    },
  },
  {
    threshold: BigInt(TAX_FREE_NET_WORTH_EXACT), // $1T
    rates: {
      exchange_tax: 5n,
      capital_gains_tax: 500n,
      financial_investment_tax: 700n,
      corporate_tax: 800n,
    },
  },
];

/**
 * 세율은 현재 순자산 구간으로 정하되, $1T 초과분 비율만 과세한다.
 * 따라서 경계선을 1센트 넘었다고 거래 전체에 세금이 붙는 절벽이 없다.
 */
export function computeProgressiveTaxExact(
  baseAmount: unknown,
  netWorth: unknown,
  kind: MarketTaxKind,
): string {
  const base = BigInt(normalizeExactAmount(baseAmount));
  const wealth = BigInt(normalizeExactAmount(netWorth));
  const exempt = BigInt(TAX_FREE_NET_WORTH_EXACT);
  if (base <= 0n || wealth <= exempt) return "0";
  const band = TAX_RATES_BPS.find((candidate) => wealth > candidate.threshold);
  if (!band) return "0";
  const numerator = base * band.rates[kind] * (wealth - exempt);
  const denominator = 10_000n * wealth;
  return ((numerator + denominator / 2n) / denominator).toString();
}

export function combinedSecuritiesSaleTaxExact(input: {
  proceedsExact: unknown;
  realizedGainExact: unknown;
  netWorthExact: unknown;
}): string {
  return exactAdd(
    computeProgressiveTaxExact(
      input.proceedsExact,
      input.netWorthExact,
      "exchange_tax",
    ),
    computeProgressiveTaxExact(
      input.realizedGainExact,
      input.netWorthExact,
      "capital_gains_tax",
    ),
  );
}

export function derivativeProfitTaxExact(input: {
  realizedGainExact: unknown;
  netWorthExact: unknown;
}): string {
  return computeProgressiveTaxExact(
    input.realizedGainExact,
    input.netWorthExact,
    "financial_investment_tax",
  );
}

export function corporateIncomeTaxExact(input: {
  incomeExact: unknown;
  netWorthExact: unknown;
}): string {
  return computeProgressiveTaxExact(
    input.incomeExact,
    input.netWorthExact,
    "corporate_tax",
  );
}

export function taxableGainExact(
  exitPrice: number,
  entryPrice: number,
  quantity: unknown,
): string {
  if (!(exitPrice > entryPrice)) return "0";
  return exactPositionValue(exitPrice - entryPrice, quantity);
}

export function makeTaxPayment(input: {
  id: string;
  kind: MarketTaxKind;
  amountExact: unknown;
  sourceId: string;
  ticker?: string;
  dueSession: number;
  timestamp: number;
}): CashPayment | null {
  const amountExact = normalizeExactAmount(input.amountExact);
  if (BigInt(amountExact) <= 0n) return null;
  return {
    id: input.id,
    kind: input.kind as CashPaymentKind,
    sourceId: input.sourceId,
    ticker: input.ticker,
    dueSession: input.dueSession,
    amount: -exactToNumber(amountExact),
    amountExact: `-${amountExact}`,
    timestamp: input.timestamp,
  };
}

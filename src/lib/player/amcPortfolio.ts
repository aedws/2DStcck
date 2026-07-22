import type { Holding, StockState } from "@/lib/types/market";
import {
  computeAmcFundNavPerShare,
  parseAmcFundId,
  type AmcFundState,
} from "@/lib/player/assetManager";

export interface AmcPortfolioPosition {
  holding: Holding;
  fund: AmcFundState;
  navPerShare: number;
  evaluation: number;
}

type AmcPriceStock = Pick<
  StockState,
  "id" | "currentPrice" | "initialPrice"
>;

/** Merge local and server fund records. Later sources are authoritative. */
export function mergeAmcPortfolioFunds(
  ...sources: ReadonlyArray<readonly AmcFundState[]>
): AmcFundState[] {
  const byId = new Map<string, AmcFundState>();
  for (const funds of sources) {
    for (const fund of funds) byId.set(fund.id, fund);
  }
  return [...byId.values()];
}

/** Build user-ETF positions, which are absent from the regular stock map. */
export function getAmcPortfolioPositions(
  holdings: readonly Holding[],
  funds: readonly AmcFundState[],
  stocks: readonly AmcPriceStock[],
): AmcPortfolioPosition[] {
  if (!holdings.length || !funds.length) return [];

  const fundById = new Map(funds.map((fund) => [fund.id, fund]));
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
  const priceOf = (stockId: string) =>
    stockById.get(stockId)?.currentPrice ?? 0;
  const initialPriceOf = (stockId: string) =>
    stockById.get(stockId)?.initialPrice ?? 0;

  return holdings.flatMap((holding) => {
    const fundId = parseAmcFundId(holding.stockId);
    const fund = fundId ? fundById.get(fundId) : undefined;
    if (!fund || fund.status === "delisted" || !(holding.quantity > 0)) {
      return [];
    }
    const navPerShare = computeAmcFundNavPerShare(
      fund,
      priceOf,
      initialPriceOf,
    );
    if (!(navPerShare > 0)) return [];
    return [{
      holding,
      fund,
      navPerShare,
      evaluation: holding.quantity * navPerShare,
    }];
  });
}

export function getAmcPortfolioValue(
  holdings: readonly Holding[],
  funds: readonly AmcFundState[],
  stocks: readonly AmcPriceStock[],
): number {
  return getAmcPortfolioPositions(holdings, funds, stocks).reduce(
    (sum, position) => sum + position.evaluation,
    0,
  );
}

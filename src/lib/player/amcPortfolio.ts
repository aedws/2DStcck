import type { Holding, PricePoint, StockState } from "@/lib/types/market";
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

type AmcHistoryStock = Pick<
  StockState,
  "id" | "initialPrice" | "priceHistory"
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

/** 구성 종목의 저장 시세를 같은 시각끼리 합성해 유저 ETF NAV 차트를 만든다. */
export function getAmcFundPriceHistory(
  fund: AmcFundState,
  stocks: readonly AmcHistoryStock[],
): PricePoint[] {
  if (!(fund.totalShares > 0) || fund.status === "delisted") return [];
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
  const rows = fund.holdings.flatMap((holding) => {
    const stock = stockById.get(holding.stockId);
    return stock ? [{ holding, stock }] : [];
  });
  if (!rows.length) {
    return fund.navHistory.map((point) => ({ timestamp: point.t, price: point.nav }));
  }

  const changes = new Map<number, Array<{ stockId: string; price: number }>>();
  for (const { stock } of rows) {
    for (const point of stock.priceHistory) {
      if (!(point.price > 0) || !Number.isFinite(point.timestamp)) continue;
      const updates = changes.get(point.timestamp) ?? [];
      updates.push({ stockId: stock.id, price: point.price });
      changes.set(point.timestamp, updates);
    }
  }

  const lastPrice = new Map<string, number>();
  const baseFactor =
    Number.isFinite(fund.basketPriceFactor) && (fund.basketPriceFactor ?? 0) > 0
      ? fund.basketPriceFactor!
      : 1;
  const bookPerShare = fund.seedNavValue / fund.totalShares;
  const history: PricePoint[] = [];
  for (const timestamp of [...changes.keys()].sort((a, b) => a - b)) {
    for (const update of changes.get(timestamp) ?? []) {
      lastPrice.set(update.stockId, update.price);
    }
    if (timestamp < fund.createdAt) continue;
    let factor = 0;
    let complete = true;
    for (const { holding, stock } of rows) {
      const price = lastPrice.get(stock.id);
      if (!(price && stock.initialPrice > 0)) {
        complete = false;
        break;
      }
      factor += holding.weight * (price / stock.initialPrice);
    }
    if (!complete || !(factor > 0)) continue;
    history.push({
      timestamp,
      price: Math.max(1, Math.round(bookPerShare * (factor / baseFactor))),
    });
  }

  const recorded = fund.navHistory.map((point) => ({
    timestamp: point.t,
    price: point.nav,
  }));
  const merged = new Map<number, PricePoint>();
  for (const point of [...history, ...recorded]) {
    if (point.price > 0 && Number.isFinite(point.timestamp)) {
      merged.set(point.timestamp, point);
    }
  }
  return [...merged.values()].sort((a, b) => a.timestamp - b.timestamp).slice(-2880);
}

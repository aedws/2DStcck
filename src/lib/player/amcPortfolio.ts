import { SESSION_DURATION_MS } from "@/lib/market/constants";
import type {
  Candle,
  Holding,
  PricePoint,
  StockState,
} from "@/lib/types/market";
import {
  computeAmcFundNavPerShare,
  parseAmcFundId,
  type AmcFundState,
} from "@/lib/player/assetManager";
import {
  computeLeveragedRawPrice,
  leverageSplitMultiplier,
} from "@/lib/market/engine";

export interface AmcPortfolioPosition {
  holding: Holding;
  fund: AmcFundState;
  navPerShare: number;
  evaluation: number;
}

export interface AmcCharacterLinkedHolding {
  value: number;
  holdings: { stockId: string; weight: number }[];
}

type AmcPriceStock = Pick<
  StockState,
  "id" | "currentPrice" | "initialPrice"
> & Partial<Pick<
  StockState,
  | "leverage"
  | "leverageUnderlyingId"
  | "leveragePathSessionBase"
  | "leveragePathFactors"
>>;

type AmcHistoryStock = Pick<
  StockState,
  "id" | "initialPrice" | "priceHistory"
> & Partial<AmcPriceStock>;

type AmcChartStock = Pick<
  StockState,
  "id" | "initialPrice" | "priceHistory" | "candles" | "dailyCandles"
> & Partial<AmcPriceStock>;

function economicPriceFromMap(
  stockId: string,
  stockById: ReadonlyMap<string, AmcPriceStock>,
): number {
  const stock = stockById.get(stockId);
  if (!stock) return 0;
  const currentPrice = Number(stock.currentPrice) || 0;
  if (stock.leverage == null || !stock.leverageUnderlyingId) {
    return currentPrice;
  }
  const underlying = stockById.get(stock.leverageUnderlyingId);
  if (!underlying) return currentPrice;
  const closedFactor =
    underlying.leveragePathFactors?.[String(stock.leverage)] ?? 1;
  const sessionStartRawPrice = Math.max(stock.initialPrice * closedFactor, 1e-12);
  return computeLeveragedRawPrice(
    sessionStartRawPrice,
    Number(underlying.currentPrice) || 0,
    underlying.leveragePathSessionBase ?? underlying.initialPrice,
    stock.leverage,
  );
}

/** 액면분할·병합에 흔들리지 않는 유저 ETF 구성 종목 경제가 resolver. */
export function createAmcValuationPriceResolver(
  stocks: readonly AmcPriceStock[],
): (stockId: string) => number {
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
  return (stockId) => economicPriceFromMap(stockId, stockById);
}

function economicSeriesMultiplier(
  stock: AmcHistoryStock,
  stocks: readonly AmcHistoryStock[],
): number {
  if (stock.leverage == null || !stock.leverageUnderlyingId) return 1;
  const stockById = new Map(
    (stocks as readonly AmcPriceStock[]).map((item) => [item.id, item]),
  );
  const rawPrice = economicPriceFromMap(stock.id, stockById);
  return rawPrice > 0 ? leverageSplitMultiplier(rawPrice) : 1;
}

export interface AmcFundChartSeries {
  candles: Candle[];
  dailyCandles: Candle[];
  history: PricePoint[];
  previousSessionClose: number;
}

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
  const valuationPriceOf = createAmcValuationPriceResolver(stocks);

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
      valuationPriceOf,
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

/** 캐릭터 관계·의뢰 계산에서 사용할 유저 ETF NAV와 구성 비중. */
export function getAmcCharacterLinkedHoldings(
  holdings: readonly Holding[],
  funds: readonly AmcFundState[],
  stocks: readonly AmcPriceStock[],
): AmcCharacterLinkedHolding[] {
  return getAmcPortfolioPositions(holdings, funds, stocks).map((position) => ({
    value: position.evaluation,
    holdings: position.fund.holdings,
  }));
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
  for (const { holding, stock } of rows) {
    for (const point of stock.priceHistory) {
      if (!(point.price > 0) || !Number.isFinite(point.timestamp)) continue;
      const updates = changes.get(point.timestamp) ?? [];
      updates.push({
        stockId: stock.id,
        price:
          point.price *
          (holding.basePrice
            ? economicSeriesMultiplier(stock, stocks)
            : 1),
      });
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
      const base = holding.basePrice ?? stock.initialPrice;
      if (!(price && base > 0)) {
        complete = false;
        break;
      }
      factor += holding.weight * (price / base);
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

function amcFactorToNav(fund: AmcFundState, factor: number): number {
  const baseFactor =
    Number.isFinite(fund.basketPriceFactor) && (fund.basketPriceFactor ?? 0) > 0
      ? fund.basketPriceFactor!
      : 1;
  const bookPerShare = fund.seedNavValue / fund.totalShares;
  return Math.max(1, Math.round(bookPerShare * (factor / baseFactor)));
}

/**
 * 구성 종목의 고정 OHLC를 목표 비중으로 합성한다. 최근 가격점 배열을 매 렌더마다
 * 다시 버킷팅하지 않으므로 새 틱이 들어와도 완성된 ETF 캔들은 움직이지 않는다.
 */
function synthesizeAmcFundCandles(
  fund: AmcFundState,
  stocks: readonly AmcChartStock[],
  source: "candles" | "dailyCandles",
): Candle[] {
  if (!(fund.totalShares > 0) || fund.status === "delisted") return [];
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
  const rows = fund.holdings.flatMap((holding) => {
    const stock = stockById.get(holding.stockId);
    return stock ? [{ holding, stock }] : [];
  });
  if (!rows.length) return [];

  const changes = new Map<number, Array<{ stockId: string; candle: Candle }>>();
  for (const { holding, stock } of rows) {
    const seriesMultiplier = holding.basePrice
      ? economicSeriesMultiplier(stock, stocks)
      : 1;
    for (const candle of stock[source]) {
      if (
        !Number.isFinite(candle.timestamp) ||
        !Number.isFinite(candle.open) ||
        !Number.isFinite(candle.high) ||
        !Number.isFinite(candle.low) ||
        !Number.isFinite(candle.close)
      ) {
        continue;
      }
      const updates = changes.get(candle.timestamp) ?? [];
      updates.push({
        stockId: stock.id,
        candle: seriesMultiplier === 1
          ? candle
          : {
              timestamp: candle.timestamp,
              open: candle.open * seriesMultiplier,
              high: candle.high * seriesMultiplier,
              low: candle.low * seriesMultiplier,
              close: candle.close * seriesMultiplier,
            },
      });
      changes.set(candle.timestamp, updates);
    }
  }

  const firstTimestamp = source === "dailyCandles"
    ? Math.floor(fund.createdAt / SESSION_DURATION_MS) * SESSION_DURATION_MS
    : fund.createdAt;
  const lastCandle = new Map<string, Candle>();
  const result: Candle[] = [];
  for (const timestamp of [...changes.keys()].sort((a, b) => a - b)) {
    for (const update of changes.get(timestamp) ?? []) {
      lastCandle.set(update.stockId, update.candle);
    }
    if (timestamp < firstTimestamp) continue;

    let openFactor = 0;
    let highFactor = 0;
    let lowFactor = 0;
    let closeFactor = 0;
    let complete = true;
    for (const { holding, stock } of rows) {
      const candle = lastCandle.get(stock.id);
      const base = holding.basePrice ?? stock.initialPrice;
      if (!candle || !(base > 0)) {
        complete = false;
        break;
      }
      openFactor += holding.weight * (candle.open / base);
      highFactor += holding.weight * (candle.high / base);
      lowFactor += holding.weight * (candle.low / base);
      closeFactor += holding.weight * (candle.close / base);
    }
    if (!complete || !(closeFactor > 0)) continue;

    const open = amcFactorToNav(fund, openFactor);
    const close = amcFactorToNav(fund, closeFactor);
    result.push({
      timestamp,
      open,
      high: Math.max(open, close, amcFactorToNav(fund, highFactor)),
      low: Math.min(open, close, amcFactorToNav(fund, lowFactor)),
      close,
    });
  }
  return result;
}

/** 일반 종목 차트와 같은 고정 30초봉·일봉·최근 틱 시계열. */
export function getAmcFundChartSeries(
  fund: AmcFundState,
  stocks: readonly AmcChartStock[],
): AmcFundChartSeries {
  const history = getAmcFundPriceHistory(fund, stocks);
  const candles = synthesizeAmcFundCandles(fund, stocks, "candles");
  const dailyCandles = synthesizeAmcFundCandles(
    fund,
    stocks,
    "dailyCandles",
  );
  const latestDaily = dailyCandles[dailyCandles.length - 1];
  const latestSession = latestDaily
    ? Math.floor(latestDaily.timestamp / SESSION_DURATION_MS)
    : null;
  const previousDaily = latestSession === null
    ? undefined
    : [...dailyCandles]
        .reverse()
        .find(
          (candle) =>
            Math.floor(candle.timestamp / SESSION_DURATION_MS) < latestSession,
        );
  const previousSessionClose =
    previousDaily?.close ??
    candles[0]?.open ??
    history[0]?.price ??
    Math.max(1, Math.round(fund.seedNavValue / fund.totalShares));

  return { candles, dailyCandles, history, previousSessionClose };
}

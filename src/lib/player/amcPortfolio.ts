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
  leverageAdjustedCandles,
  leverageAdjustedHistory,
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

export interface AmcPerformancePoint {
  timestamp: number;
  /** 배당락을 포함한 ETF 가격수익률(%, 비교 시작점=0). */
  fundPriceReturn: number;
  /** 지급된 분배·배당 인컴의 시작 NAV 대비 기여도(%p). */
  fundIncomeReturn: number;
  /** 가격수익률 + 인컴 수익률(%). */
  fundTotalReturn: number;
  /** 목표 주식 가격수익률(%). */
  comparisonReturn: number;
}

export type AmcFundReturnPoint = Omit<
  AmcPerformancePoint,
  "comparisonReturn"
>;

export interface AmcPerformanceComparison {
  points: AmcPerformancePoint[];
  fundPriceReturn: number;
  fundIncomeReturn: number;
  fundTotalReturn: number;
  comparisonReturn: number;
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
  | "shareMultiplier"
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
    return currentPrice * Math.max(stock.shareMultiplier ?? 1, 1e-12);
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
  if (stock.leverage == null || !stock.leverageUnderlyingId) {
    return Math.max(stock.shareMultiplier ?? 1, 1e-12);
  }
  if (
    Number.isFinite(stock.shareMultiplier) &&
    (stock.shareMultiplier ?? 0) > 0
  ) {
    return Math.max(stock.shareMultiplier!, 1e-12);
  }
  const stockById = new Map(
    (stocks as readonly AmcPriceStock[]).map((item) => [item.id, item]),
  );
  const rawPrice = economicPriceFromMap(stock.id, stockById);
  return rawPrice > 0 ? leverageSplitMultiplier(rawPrice) : 1;
}

function economicHistoryForHolding(
  stock: AmcHistoryStock,
  stocks: readonly AmcHistoryStock[],
): PricePoint[] {
  const multiplier = economicSeriesMultiplier(stock, stocks);
  if (stock.leverage == null || !stock.leverageUnderlyingId) {
    return stock.priceHistory.map((point) => ({
      ...point,
      price: point.price * multiplier,
    }));
  }
  const underlying = stocks.find(
    (item) => item.id === stock.leverageUnderlyingId,
  );
  if (!underlying) {
    return stock.priceHistory.map((point) => ({
      ...point,
      price: point.price * multiplier,
    }));
  }
  return leverageAdjustedHistory(
    stock as StockState,
    underlying as StockState,
    underlying.priceHistory,
  ).map((point) => ({
    ...point,
    price: point.price * multiplier,
  }));
}

function economicCandlesForHolding(
  stock: AmcChartStock,
  stocks: readonly AmcChartStock[],
  source: "candles" | "dailyCandles",
): Candle[] {
  const multiplier = economicSeriesMultiplier(stock, stocks);
  if (stock.leverage == null || !stock.leverageUnderlyingId) {
    return stock[source].map((candle) =>
      multiplier === 1
        ? candle
        : {
            ...candle,
            open: candle.open * multiplier,
            high: candle.high * multiplier,
            low: candle.low * multiplier,
            close: candle.close * multiplier,
          },
    );
  }
  const underlying = stocks.find(
    (item) => item.id === stock.leverageUnderlyingId,
  );
  if (!underlying) {
    return stock[source].map((candle) =>
      multiplier === 1
        ? candle
        : {
            ...candle,
            open: candle.open * multiplier,
            high: candle.high * multiplier,
            low: candle.low * multiplier,
            close: candle.close * multiplier,
          },
    );
  }
  return leverageAdjustedCandles(
    stock as StockState,
    underlying as StockState,
    underlying[source],
  ).map((candle) => ({
    ...candle,
    open: candle.open * multiplier,
    high: candle.high * multiplier,
    low: candle.low * multiplier,
    close: candle.close * multiplier,
  }));
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
    const currentMultiplier = Math.max(0.000001, fund.shareMultiplier ?? 1);
    return fund.navHistory
      .map((point) => {
        const pointMultiplier = Math.max(
          0.000001,
          point.shareMultiplier ?? currentMultiplier,
        );
        return {
          timestamp: point.t,
          price: Math.max(
            1,
            Math.round(point.nav * (pointMultiplier / currentMultiplier)),
          ),
        };
      })
      .filter(
        (point) => point.price > 0 && Number.isFinite(point.timestamp),
      )
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-2880);
  }

  const changes = new Map<number, Array<{ stockId: string; price: number }>>();
  for (const { holding, stock } of rows) {
    const series = holding.basePrice
      ? economicHistoryForHolding(stock, stocks)
      : stock.priceHistory;
    for (const point of series) {
      if (!(point.price > 0) || !Number.isFinite(point.timestamp)) continue;
      const updates = changes.get(point.timestamp) ?? [];
      updates.push({
        stockId: stock.id,
        price: point.price,
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

  // 구성종목 시계열은 액면조정과 외부 자금 유입에 흔들리지 않는 경제가다.
  // 절대 NAV 스냅샷을 여기에 섞으면 분할·병합 시점이 수익으로 오인되므로
  // 구성종목이 없는 레거시 펀드에서만 위의 보정된 기록을 폴백으로 사용한다.
  return history.slice(-2880);
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
    const series = holding.basePrice
      ? economicCandlesForHolding(stock, stocks, source)
      : stock[source];
    for (const candle of series) {
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
        candle,
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

/** 액면조정은 제외하고 실제 구성종목 가격 변화와 실제 지급 인컴만 합산한다. */
export function getAmcFundTotalReturnSeries(
  fund: AmcFundState,
  stocks: readonly AmcChartStock[],
): AmcFundReturnPoint[] {
  const fundDaily = synthesizeAmcFundCandles(fund, stocks, "dailyCandles")
    .filter(
      (candle) =>
        candle.timestamp >= fund.createdSession * SESSION_DURATION_MS &&
        Number.isFinite(candle.close) &&
        candle.close > 0,
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!fundDaily.length) return [];

  const fundBase = fundDaily[0]!.close;
  const startSession = Math.floor(
    fundDaily[0]!.timestamp / SESSION_DURATION_MS,
  );
  const currentMultiplier = Math.max(0.000001, fund.shareMultiplier ?? 1);
  const dividends = [...fund.dividendHistory]
    .filter((point) => point.session > startSession)
    .sort((a, b) => a.session - b.session);
  let dividendIndex = 0;
  let incomePerCurrentShare = 0;

  return fundDaily.map((candle) => {
    const session = Math.floor(candle.timestamp / SESSION_DURATION_MS);
    while (
      dividendIndex < dividends.length &&
      dividends[dividendIndex]!.session <= session
    ) {
      const dividend = dividends[dividendIndex]!;
      const eventMultiplier = Math.max(
        0.000001,
        dividend.shareMultiplier ?? currentMultiplier,
      );
      incomePerCurrentShare +=
        dividend.perShare * (eventMultiplier / currentMultiplier);
      dividendIndex += 1;
    }
    const fundPriceReturn = ((candle.close / fundBase) - 1) * 100;
    const fundIncomeReturn = (incomePerCurrentShare / fundBase) * 100;
    return {
      timestamp: candle.timestamp,
      fundPriceReturn,
      fundIncomeReturn,
      fundTotalReturn: fundPriceReturn + fundIncomeReturn,
    };
  });
}

/**
 * 유저 ETF와 목표 주식을 같은 시작점을 0%로 맞춘다.
 * ETF는 배당락 후 NAV 가격수익률에 실제 지급된 좌당 인컴을 더한 총수익률을 쓴다.
 */
export function getAmcFundPerformanceComparison(
  fund: AmcFundState,
  stocks: readonly AmcChartStock[],
): AmcPerformanceComparison | null {
  if (!fund.comparisonStockId) return null;
  const target = stocks.find((stock) => stock.id === fund.comparisonStockId);
  if (!target) return null;
  const fundReturns = getAmcFundTotalReturnSeries(fund, stocks);
  const targetDaily = [...target.dailyCandles]
    .filter(
      (candle) =>
        Number.isFinite(candle.timestamp) &&
        Number.isFinite(candle.close) &&
        candle.close > 0,
    )
    .sort((a, b) => a.timestamp - b.timestamp);
  if (!fundReturns.length || !targetDaily.length) return null;

  let targetIndex = 0;
  const aligned: Array<{
    fund: AmcFundReturnPoint;
    targetClose: number;
  }> = [];
  for (const point of fundReturns) {
    while (
      targetIndex + 1 < targetDaily.length &&
      targetDaily[targetIndex + 1]!.timestamp <= point.timestamp
    ) {
      targetIndex += 1;
    }
    const targetCandle = targetDaily[targetIndex];
    if (!targetCandle || targetCandle.timestamp > point.timestamp) continue;
    aligned.push({ fund: point, targetClose: targetCandle.close });
  }
  if (!aligned.length) return null;

  const first = aligned[0]!;
  const targetBase = first.targetClose;
  if (!(targetBase > 0)) return null;
  const points = aligned.map(({ fund: point, targetClose }) => {
    return {
      ...point,
      comparisonReturn: ((targetClose / targetBase) - 1) * 100,
    };
  });
  const latest = points[points.length - 1]!;
  return {
    points,
    fundPriceReturn: latest.fundPriceReturn,
    fundIncomeReturn: latest.fundIncomeReturn,
    fundTotalReturn: latest.fundTotalReturn,
    comparisonReturn: latest.comparisonReturn,
  };
}

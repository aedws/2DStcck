import bundledCheckpoint from "@/data/market-checkpoint.json";
import {
  MARKET_EPOCH_MS,
  MARKET_SIM_VERSION,
  PERSISTED_DAILY_CANDLES,
} from "@/lib/market/constants";
import { applyDefinitionOverlay } from "@/lib/market/definitionOverlay";
import {
  computeLeveragedSnapshot,
  leverageAdjustedCandles,
  leverageAdjustedHistory,
} from "@/lib/market/engine";
import { createGenesisStocks } from "@/lib/market/localSim";
import { generateOrderBook } from "@/lib/market/orderBook";
import { isPumpStock } from "@/lib/market/pumpStocks";
import type {
  Candle,
  MarketEvent,
  PricePoint,
  StockState,
} from "@/lib/types/market";

export interface CompactStockCheckpoint {
  id: string;
  currentPrice: number;
  prevDayClose: number;
  dayOpen: number;
  daySessionId?: number;
  leveragePathSessionId?: number;
  leveragePathSessionBase?: number;
  leveragePathFactors?: Record<string, number>;
  priceHistory: PricePoint[];
  candles: Candle[];
  dailyCandles: Candle[];
  coveredCallPremiumReserve?: number;
  navDistributionAdjustment?: number;
  shareMultiplier?: number;
  lastShareAdjustmentSession?: number;
}

export interface MarketCheckpoint {
  marketVersion: number;
  marketEpochMs: number;
  tick: number;
  stocks: CompactStockCheckpoint[];
  events: MarketEvent[];
}

const BUNDLED_MARKET_CHECKPOINT = bundledCheckpoint as MarketCheckpoint;

export function isCompatibleMarketCheckpoint(
  checkpoint: MarketCheckpoint,
): boolean {
  return (
    checkpoint.marketVersion === MARKET_SIM_VERSION &&
    checkpoint.marketEpochMs === MARKET_EPOCH_MS &&
    Number.isSafeInteger(checkpoint.tick) &&
    checkpoint.tick >= 0 &&
    Array.isArray(checkpoint.stocks) &&
    Array.isArray(checkpoint.events)
  );
}

/** 번들 체크포인트. 형식이 맞지 않으면 제네시스로 안전하게 폴백한다. */
export function getBundledMarketCheckpoint(): MarketCheckpoint {
  return isCompatibleMarketCheckpoint(BUNDLED_MARKET_CHECKPOINT)
    ? BUNDLED_MARKET_CHECKPOINT
    : {
        marketVersion: MARKET_SIM_VERSION,
        marketEpochMs: MARKET_EPOCH_MS,
        tick: 0,
        stocks: [],
        events: [],
      };
}

/** 자동 생성 레버리지·인버스 ETF를 기초자산 시계열에서 즉시 복원한다. */
export function reconstructDerivativeSeries(
  etf: StockState,
  underlying: StockState,
): StockState {
  const underlyingCandles = underlying.candles ?? [];
  const snapshot = computeLeveragedSnapshot(etf, underlying);
  if (underlyingCandles.length === 0) {
    return {
      ...etf,
      currentPrice: snapshot.currentPrice,
      prevDayClose: snapshot.prevDayClose,
      dayOpen: snapshot.dayOpen,
      daySessionId: underlying.daySessionId,
    };
  }

  const candles = leverageAdjustedCandles(
    etf,
    underlying,
    underlyingCandles,
  );
  const priceHistory = leverageAdjustedHistory(
    etf,
    underlying,
    underlying.priceHistory ?? [],
  );
  const dailyCandles = leverageAdjustedCandles(
    etf,
    underlying,
    underlying.dailyCandles ?? [],
  );

  return {
    ...etf,
    currentPrice: snapshot.currentPrice,
    prevDayClose: snapshot.prevDayClose,
    dayOpen: snapshot.dayOpen,
    daySessionId: underlying.daySessionId,
    candles,
    priceHistory: priceHistory.length > 0 ? priceHistory : etf.priceHistory,
    dailyCandles:
      dailyCandles.length > 0 ? dailyCandles : etf.dailyCandles,
  };
}

/** 압축 체크포인트를 현재 종목 정의가 입혀진 실행 상태로 확장한다. */
export function hydrateMarketCheckpoint(checkpoint: MarketCheckpoint): {
  tick: number;
  stocks: StockState[];
  events: MarketEvent[];
} {
  const source = isCompatibleMarketCheckpoint(checkpoint)
    ? checkpoint
    : getBundledMarketCheckpoint();
  const savedById = new Map(source.stocks.map((stock) => [stock.id, stock]));
  const genesis = createGenesisStocks();
  const restored = genesis.map((stock) => {
    const saved = savedById.get(stock.id);
    if (!saved) return stock;
    const firstSavedDaily =
      saved.dailyCandles[0]?.timestamp ?? Number.POSITIVE_INFINITY;
    const syntheticDaily = stock.dailyCandles.filter(
      (candle) => candle.timestamp < firstSavedDaily,
    );
    return applyDefinitionOverlay({
      ...stock,
      ...saved,
      dailyCandles: [...syntheticDaily, ...saved.dailyCandles].slice(-1_250),
      orderBook: generateOrderBook(saved.currentPrice),
    });
  });
  const byId = new Map(restored.map((stock) => [stock.id, stock]));
  const stocks = restored.map((stock) => {
    if (
      !stock.universalDerivative ||
      stock.coveredCallUnderlyingId ||
      stock.leverage === undefined
    ) {
      return stock;
    }
    const underlying = byId.get(stock.leverageUnderlyingId ?? "vnasdaq");
    return underlying
      ? reconstructDerivativeSeries(stock, underlying)
      : stock;
  });

  return {
    tick: source.tick,
    stocks,
    events: source.events,
  };
}

/** 실행 상태를 전송·번들 저장에 적합한 경량 체크포인트로 압축한다. */
export function compactMarketCheckpoint(
  stocks: StockState[],
  events: MarketEvent[],
  tick: number,
  dailyCandleLimit = PERSISTED_DAILY_CANDLES,
): MarketCheckpoint {
  return {
    marketVersion: MARKET_SIM_VERSION,
    marketEpochMs: MARKET_EPOCH_MS,
    tick,
    stocks: stocks
      .filter(
        (stock) =>
          (!stock.universalDerivative ||
            Boolean(stock.coveredCallUnderlyingId)) &&
          !isPumpStock(stock),
      )
      .map((stock) => ({
        id: stock.id,
        currentPrice: stock.currentPrice,
        prevDayClose: stock.prevDayClose,
        dayOpen: stock.dayOpen,
        daySessionId: stock.daySessionId,
        leveragePathSessionId: stock.leveragePathSessionId,
        leveragePathSessionBase: stock.leveragePathSessionBase,
        leveragePathFactors: stock.leveragePathFactors,
        priceHistory: stock.priceHistory.slice(-20),
        candles: stock.candles.slice(-30),
        dailyCandles: stock.dailyCandles
          .filter((candle) => candle.timestamp >= MARKET_EPOCH_MS)
          .slice(-dailyCandleLimit),
        coveredCallPremiumReserve: stock.coveredCallPremiumReserve,
        navDistributionAdjustment: stock.navDistributionAdjustment,
        shareMultiplier: stock.shareMultiplier,
        lastShareAdjustmentSession: stock.lastShareAdjustmentSession,
      })),
    events: events.slice(-50),
  };
}

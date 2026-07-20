import bundledCheckpoint from "@/data/market-checkpoint.json";
import { STOCK_DEFINITIONS } from "@/data/stocks";
import {
  MARKET_EPOCH_MS,
  MARKET_SIM_VERSION,
} from "@/lib/market/constants";
import { applyDefinitionOverlay } from "@/lib/market/definitionOverlay";
import {
  computeLeveragedPrice,
  computeLeveragedRawPrice,
  leverageDisplayPrice,
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
  priceHistory: PricePoint[];
  candles: Candle[];
  dailyCandles: Candle[];
  coveredCallPremiumReserve?: number;
  navDistributionAdjustment?: number;
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
  const leverage = etf.leverage ?? 1;
  const etfInitial = etf.initialPrice ?? etf.prevDayClose;
  const underlyingInitial =
    underlying.initialPrice ||
    STOCK_DEFINITIONS.find((definition) => definition.id === underlying.id)
      ?.initialPrice ||
    0;
  const underlyingCandles = underlying.candles ?? [];
  if (underlyingInitial <= 0 || underlyingCandles.length === 0) {
    return {
      ...etf,
      currentPrice: computeLeveragedPrice(etf, underlying),
    };
  }

  const mapPrice = (price: number) =>
    leverageDisplayPrice(
      computeLeveragedRawPrice(
        etfInitial,
        price,
        underlyingInitial,
        leverage,
      ),
    );
  const candles = underlyingCandles.map((candle) => {
    const open = mapPrice(candle.open);
    const close = mapPrice(candle.close);
    const high = mapPrice(candle.high);
    const low = mapPrice(candle.low);
    return {
      timestamp: candle.timestamp,
      open,
      close,
      high: Math.max(open, close, high, low),
      low: Math.min(open, close, high, low),
    };
  });
  const priceHistory = (underlying.priceHistory ?? []).map((point) => ({
    timestamp: point.timestamp,
    price: mapPrice(point.price),
  }));
  const dailyCandles = (underlying.dailyCandles ?? []).map((candle) => {
    const open = mapPrice(candle.open);
    const close = mapPrice(candle.close);
    const high = mapPrice(candle.high);
    const low = mapPrice(candle.low);
    return {
      timestamp: candle.timestamp,
      open,
      close,
      high: Math.max(open, close, high, low),
      low: Math.min(open, close, high, low),
    };
  });

  return {
    ...etf,
    currentPrice: computeLeveragedPrice(etf, underlying),
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
        priceHistory: stock.priceHistory.slice(-20),
        candles: stock.candles.slice(-30),
        dailyCandles: stock.dailyCandles
          .filter((candle) => candle.timestamp >= MARKET_EPOCH_MS)
          .slice(-40),
        coveredCallPremiumReserve: stock.coveredCallPremiumReserve,
        navDistributionAdjustment: stock.navDistributionAdjustment,
      })),
    events: events.slice(-50),
  };
}

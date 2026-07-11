import { STOCK_DEFINITIONS } from "@/data/stocks";
import {
  SERVER_TICK_SECONDS,
  SESSION_DURATION_MS,
} from "@/lib/market/constants";
import {
  createInitialStockState,
  maybeGenerateEvent,
  tickAllStocks,
} from "@/lib/market/engine";
import type { MarketEvent, StockState } from "@/lib/types/market";

export interface ServerMarketState {
  tick: number;
  marketStartedAt: number;
  lastMonthlyDistributionSession: number;
  lastQuarterlyDividendSession: number;
  stocks: StockState[];
  events: MarketEvent[];
}

export function createInitialMarketState(): ServerMarketState {
  const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
  return {
    tick: 0,
    marketStartedAt: Date.now(),
    lastMonthlyDistributionSession: currentSession,
    lastQuarterlyDividendSession: currentSession,
    stocks: STOCK_DEFINITIONS.map(createInitialStockState),
    events: [],
  };
}

/** 저장된 상태 위에 최신 정의(이름·설정·베타 등 정적 콘텐츠)를 덮어쓴다.
 * 동적 상태(가격·캔들·호가)는 유지 — 콘텐츠 수정이 배포만으로 반영되게. */
export function applyDefinitionOverlay(stock: StockState): StockState {
  const def = STOCK_DEFINITIONS.find((d) => d.id === stock.id);
  if (!def) return stock;
  return {
    ...def,
    currentPrice: stock.currentPrice,
    coveredCallPremiumReserve: stock.coveredCallPremiumReserve,
    navDistributionAdjustment: stock.navDistributionAdjustment,
    prevDayClose: stock.prevDayClose,
    dayOpen: stock.dayOpen,
    daySessionId: stock.daySessionId,
    priceHistory: stock.priceHistory,
    candles: stock.candles,
    orderBook: stock.orderBook,
  };
}

/** 정의에 새로 추가된 종목 편입 + 최신 정의 오버레이 + 삭제된 종목 정리 */
export function ensureDefinedStocks(
  state: ServerMarketState,
): ServerMarketState {
  const definedIds = new Set(STOCK_DEFINITIONS.map((d) => d.id));
  const kept = state.stocks.filter((s) => definedIds.has(s.id));
  const have = new Set(kept.map((s) => s.id));
  const missing = STOCK_DEFINITIONS.filter((d) => !have.has(d.id));
  return {
    ...state,
    stocks: [
      ...kept.map(applyDefinitionOverlay),
      ...missing.map(createInitialStockState),
    ],
  };
}

export function advanceMarket(
  state: ServerMarketState,
  tickCount = 1,
): ServerMarketState {
  let { tick, stocks, events } = ensureDefinedStocks(state);
  const {
    marketStartedAt,
    lastMonthlyDistributionSession,
    lastQuarterlyDividendSession,
  } = state;

  for (let i = 0; i < tickCount; i++) {
    const now = Date.now();
    const nextTick = tick + 1;
    const newEvent = maybeGenerateEvent(nextTick, now, events);
    const allEvents = newEvent
      ? [...events, newEvent].slice(-50)
      : events;
    stocks = tickAllStocks(stocks, allEvents, now, nextTick, SERVER_TICK_SECONDS);
    tick = nextTick;
    events = allEvents;
  }

  return {
    tick,
    marketStartedAt,
    lastMonthlyDistributionSession,
    lastQuarterlyDividendSession,
    stocks,
    events,
  };
}

export function parseMarketRow(row: {
  tick: number;
  market_started_at: number;
  stocks: unknown;
  events: unknown;
  last_monthly_distribution_session?: number | string | null;
  last_quarterly_dividend_session?: number | string | null;
}): ServerMarketState {
  const stocks = row.stocks as StockState[];
  const fallbackSession =
    stocks[0]?.daySessionId ?? Math.floor(Date.now() / SESSION_DURATION_MS);
  const monthly =
    row.last_monthly_distribution_session === null ||
    row.last_monthly_distribution_session === undefined
      ? Number.NaN
      : Number(row.last_monthly_distribution_session);
  const quarterly =
    row.last_quarterly_dividend_session === null ||
    row.last_quarterly_dividend_session === undefined
      ? Number.NaN
      : Number(row.last_quarterly_dividend_session);
  return {
    tick: row.tick,
    marketStartedAt: row.market_started_at,
    lastMonthlyDistributionSession: Number.isSafeInteger(monthly)
      ? monthly
      : fallbackSession,
    lastQuarterlyDividendSession: Number.isSafeInteger(quarterly)
      ? quarterly
      : fallbackSession,
    stocks,
    events: row.events as MarketEvent[],
  };
}

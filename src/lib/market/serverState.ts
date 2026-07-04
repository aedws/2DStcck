import { STOCK_DEFINITIONS } from "@/data/stocks";
import {
  createInitialStockState,
  maybeGenerateEvent,
  tickAllStocks,
} from "@/lib/market/engine";
import type { MarketEvent, StockState } from "@/lib/types/market";

export interface ServerMarketState {
  tick: number;
  marketStartedAt: number;
  stocks: StockState[];
  events: MarketEvent[];
}

export function createInitialMarketState(): ServerMarketState {
  return {
    tick: 0,
    marketStartedAt: Date.now(),
    stocks: STOCK_DEFINITIONS.map(createInitialStockState),
    events: [],
  };
}

export function advanceMarket(
  state: ServerMarketState,
  tickCount = 1,
): ServerMarketState {
  let { tick, stocks, events } = state;
  const { marketStartedAt } = state;

  for (let i = 0; i < tickCount; i++) {
    const now = Date.now();
    const nextTick = tick + 1;
    const newEvent = maybeGenerateEvent(nextTick, now);
    const allEvents = newEvent ? [...events, newEvent] : events;
    stocks = tickAllStocks(stocks, allEvents, now, nextTick);
    tick = nextTick;
    events = allEvents;
  }

  return { tick, marketStartedAt, stocks, events };
}

export function parseMarketRow(row: {
  tick: number;
  market_started_at: number;
  stocks: unknown;
  events: unknown;
}): ServerMarketState {
  return {
    tick: row.tick,
    marketStartedAt: row.market_started_at,
    stocks: row.stocks as StockState[],
    events: row.events as MarketEvent[],
  };
}

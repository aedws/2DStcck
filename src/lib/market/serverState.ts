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

/** 저장된 상태 위에 최신 정의(이름·설정·베타 등 정적 콘텐츠)를 덮어쓴다.
 * 동적 상태(가격·캔들·호가)는 유지 — 콘텐츠 수정이 배포만으로 반영되게. */
export function applyDefinitionOverlay(stock: StockState): StockState {
  const def = STOCK_DEFINITIONS.find((d) => d.id === stock.id);
  if (!def) return stock;
  return { ...stock, ...def };
}

/** 정의에 새로 추가된 종목 편입 + 기존 종목에 최신 정의 오버레이 */
export function ensureDefinedStocks(
  state: ServerMarketState,
): ServerMarketState {
  const have = new Set(state.stocks.map((s) => s.id));
  const missing = STOCK_DEFINITIONS.filter((d) => !have.has(d.id));
  return {
    ...state,
    stocks: [
      ...state.stocks.map(applyDefinitionOverlay),
      ...missing.map(createInitialStockState),
    ],
  };
}

export function advanceMarket(
  state: ServerMarketState,
  tickCount = 1,
): ServerMarketState {
  let { tick, stocks, events } = ensureDefinedStocks(state);
  const { marketStartedAt } = state;

  for (let i = 0; i < tickCount; i++) {
    const now = Date.now();
    const nextTick = tick + 1;
    const newEvent = maybeGenerateEvent(nextTick, now, events);
    const allEvents = newEvent
      ? [...events, newEvent].slice(-50)
      : events;
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

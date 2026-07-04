import { create } from "zustand";
import { persist } from "zustand/middleware";
import { INITIAL_CASH, STOCK_DEFINITIONS } from "@/data/stocks";
import {
  createInitialStockState,
  maybeGenerateEvent,
  tickAllStocks,
} from "@/lib/market/engine";
import { getBestAsk, getBestBid } from "@/lib/market/orderBook";
import type { ServerMarketState } from "@/lib/market/serverState";
import {
  calculatePortfolioValue,
  executeBuy,
  executeSell,
  isOrderSuccess,
} from "@/lib/market/trading";
import type {
  Holding,
  MarketEvent,
  MarketSnapshot,
  OrderResult,
  OrderType,
  StockState,
  Trade,
} from "@/lib/types/market";
import { generateOrderBook } from "@/lib/market/orderBook";
import { createClient } from "@/lib/supabase/client";
import { fetchPortfolio } from "@/lib/supabase/queries";

export const IS_SERVER_MODE = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

interface MarketStore extends MarketSnapshot {
  userId: string | null;
  isReady: boolean;
  setReady: (ready: boolean) => void;
  setUserId: (id: string | null) => void;
  syncMarketFromServer: (state: ServerMarketState) => void;
  syncUserFromServer: (data: {
    cash: number;
    initialCash: number;
    holdings: Holding[];
    trades: Trade[];
  }) => void;
  placeOrder: (
    stockId: string,
    quantity: number,
    orderType: OrderType,
  ) => Promise<OrderResult>;
  tickMarket: () => void;
  buyMarket: (stockId: string, quantity: number) => OrderResult;
  sellMarket: (stockId: string, quantity: number) => OrderResult;
  buyCurrent: (stockId: string, quantity: number) => OrderResult;
  sellCurrent: (stockId: string, quantity: number) => OrderResult;
  reset: () => void;
  getTotalAssets: () => number;
  getStockById: (id: string) => StockState | undefined;
}

function createInitialState(): MarketSnapshot & { userId: string | null; isReady: boolean } {
  const now = Date.now();
  return {
    tick: 0,
    marketStartedAt: now,
    cash: INITIAL_CASH,
    initialCash: INITIAL_CASH,
    holdings: [],
    trades: [],
    stocks: STOCK_DEFINITIONS.map(createInitialStockState),
    events: [],
    userId: null,
    isReady: false,
  };
}

function migrateStock(stock: StockState & { previousClose?: number }): StockState {
  const withBook = stock.orderBook?.bids?.length
    ? stock
    : { ...stock, orderBook: generateOrderBook(stock.currentPrice) };

  return {
    ...withBook,
    prevDayClose:
      withBook.prevDayClose ??
      withBook.previousClose ??
      withBook.currentPrice,
    dayOpen: withBook.dayOpen ?? withBook.currentPrice,
  };
}

function applyLocalBuySell(
  set: (partial: Partial<MarketStore>) => void,
  get: () => MarketStore,
  mode: "buyMarket" | "sellMarket" | "buyCurrent" | "sellCurrent",
  stockId: string,
  quantity: number,
): OrderResult {
  const state = get();
  const stock = state.stocks.find((s) => s.id === stockId);
  if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };

  let price: number;
  let label: string;

  switch (mode) {
    case "buyMarket":
      price = getBestAsk(stock.orderBook);
      label = "시장가 매수";
      break;
    case "sellMarket":
      price = getBestBid(stock.orderBook);
      label = "시장가 매도";
      break;
    case "buyCurrent":
      price = stock.currentPrice;
      label = "현재가 매수";
      break;
    case "sellCurrent":
      price = stock.currentPrice;
      label = "현재가 판매";
      break;
  }

  if (price <= 0) return { success: false, message: "체결 가능한 호가가 없습니다." };

  const result =
    mode.startsWith("buy")
      ? executeBuy(
          state.cash,
          state.holdings,
          stockId,
          stock.ticker,
          price,
          quantity,
          Date.now(),
        )
      : executeSell(
          state.cash,
          state.holdings,
          stockId,
          stock.ticker,
          price,
          quantity,
          Date.now(),
        );

  if (!isOrderSuccess(result)) return result;

  set({
    cash: result.cash,
    holdings: result.holdings,
    trades: [result.trade, ...state.trades],
  });

  return {
    success: true,
    message: `${label} (${price.toLocaleString()}원)`,
  };
}

export const useMarketStore = create<MarketStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      setReady: (ready) => set({ isReady: ready }),
      setUserId: (userId) => set({ userId }),

      syncMarketFromServer: (state) => {
        set({
          tick: state.tick,
          marketStartedAt: state.marketStartedAt,
          stocks: state.stocks.map(migrateStock),
          events: state.events as MarketEvent[],
        });
      },

      syncUserFromServer: (data) => {
        set({
          cash: data.cash,
          initialCash: data.initialCash,
          holdings: data.holdings,
          trades: data.trades,
        });
      },

      placeOrder: async (stockId, quantity, orderType) => {
        if (!IS_SERVER_MODE) {
          switch (orderType) {
            case "buy_market":
              return get().buyMarket(stockId, quantity);
            case "sell_market":
              return get().sellMarket(stockId, quantity);
            case "buy_current":
              return get().buyCurrent(stockId, quantity);
            case "sell_current":
              return get().sellCurrent(stockId, quantity);
          }
        }

        const supabase = createClient();
        const { data, error } = await supabase.functions.invoke("trade", {
          body: { stockId, quantity, orderType },
        });

        if (error) {
          // Edge Function이 4xx/5xx로 응답하면 본문에서 메시지를 꺼낸다
          let message = "주문 실패";
          try {
            const ctx = (error as { context?: Response }).context;
            if (ctx) {
              const body = await ctx.json();
              message = body.error ?? body.message ?? message;
            }
          } catch {
            // ignore
          }
          return { success: false, message };
        }

        if (data?.success) {
          const portfolio = await fetchPortfolio();
          if (portfolio) get().syncUserFromServer(portfolio);
        }

        return {
          success: Boolean(data?.success),
          message: data?.message ?? data?.error ?? "주문 실패",
        };
      },

      tickMarket: () => {
        if (IS_SERVER_MODE) return;
        const { tick, stocks, events } = get();
        const now = Date.now();
        const nextTick = tick + 1;
        const newEvent = maybeGenerateEvent(nextTick, now);
        const allEvents = newEvent ? [...events, newEvent] : events;
        const updatedStocks = tickAllStocks(stocks, allEvents, now, nextTick);
        set({ tick: nextTick, stocks: updatedStocks, events: allEvents });
      },

      buyMarket: (stockId, quantity) =>
        applyLocalBuySell(set, get, "buyMarket", stockId, quantity),
      sellMarket: (stockId, quantity) =>
        applyLocalBuySell(set, get, "sellMarket", stockId, quantity),
      buyCurrent: (stockId, quantity) =>
        applyLocalBuySell(set, get, "buyCurrent", stockId, quantity),
      sellCurrent: (stockId, quantity) =>
        applyLocalBuySell(set, get, "sellCurrent", stockId, quantity),

      reset: () => set(createInitialState()),

      getTotalAssets: () => {
        const { cash, holdings, stocks } = get();
        const prices = Object.fromEntries(stocks.map((s) => [s.id, s.currentPrice]));
        return cash + calculatePortfolioValue(holdings, prices);
      },

      getStockById: (id) => get().stocks.find((s) => s.id === id),
    }),
    {
      name: IS_SERVER_MODE ? "2dstock-server-cache" : "2dstock-market-local",
      partialize: (state) =>
        IS_SERVER_MODE
          ? {}
          : {
              tick: state.tick,
              marketStartedAt: state.marketStartedAt,
              cash: state.cash,
              initialCash: state.initialCash,
              holdings: state.holdings,
              trades: state.trades,
              stocks: state.stocks,
              events: state.events,
            },
      merge: (persisted, current) => {
        if (IS_SERVER_MODE) return current;
        const merged = { ...current, ...(persisted as Partial<MarketSnapshot>) };
        return {
          ...merged,
          stocks: (merged.stocks ?? current.stocks).map(migrateStock),
          userId: null,
          isReady: false,
        };
      },
    },
  ),
);

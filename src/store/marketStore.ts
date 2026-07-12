import { create } from "zustand";
import { persist } from "zustand/middleware";
import { INITIAL_CASH, STOCK_DEFINITIONS } from "@/data/stocks";
import {
  createInitialStockState,
  formatPrice,
  getMarketBuyPrice,
  getMarketSellPrice,
  microTickStock,
} from "@/lib/market/engine";
import {
  applyDefinitionOverlay,
  type ServerMarketState,
} from "@/lib/market/serverState";
import {
  calculatePortfolioValue,
  executeBuy,
  executeSell,
  isOrderSuccess,
} from "@/lib/market/trading";
import type {
  CashPayment,
  Holding,
  MarketEvent,
  MarketSnapshot,
  OpenOrder,
  OrderResult,
  OrderType,
  StockState,
  Trade,
} from "@/lib/types/market";
import { generateOrderBook } from "@/lib/market/orderBook";
import {
  MARKET_EPOCH_MS,
  SESSION_DURATION_MS,
} from "@/lib/market/constants";
import { settleLocalCashflows } from "@/lib/market/cashflows";
import {
  alignSessionToGrid,
  createGenesisStocks,
  currentSimTick,
  replayMarket,
  simTickTime,
} from "@/lib/market/localSim";
import {
  COVERED_CALL_INTERVAL_DAYS,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
} from "@/lib/market/distributions";
import { createClient } from "@/lib/supabase/client";
import {
  cancelOpenOrder,
  fetchOpenOrders,
  fetchPortfolio,
} from "@/lib/supabase/queries";

export const IS_SERVER_MODE = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
);

interface MarketStore extends MarketSnapshot {
  userId: string | null;
  isReady: boolean;
  /** 서버 확정가 (미세틱 평균회귀 기준점) */
  serverPrices: Record<string, number>;
  /** 미체결 지정가 주문 */
  openOrders: OpenOrder[];
  refreshOpenOrders: () => Promise<void>;
  placeLimitOrder: (
    stockId: string,
    price: number,
    quantity: number,
    side: "buy" | "sell",
  ) => Promise<OrderResult>;
  cancelOrder: (orderId: string) => Promise<void>;
  setReady: (ready: boolean) => void;
  setUserId: (id: string | null) => void;
  syncMarketFromServer: (state: ServerMarketState) => void;
  syncUserFromServer: (data: {
    cash: number;
    initialCash: number;
    lastSalarySession: number;
    holdings: Holding[];
    trades: Trade[];
    cashPayments: CashPayment[];
  }) => void;
  placeOrder: (
    stockId: string,
    quantity: number,
    orderType: OrderType,
  ) => Promise<OrderResult>;
  tickMarket: () => void;
  /** 주문 전·복원 직후 밀린 급여와 투자 분배금을 정산 */
  settleCashflows: () => void;
  /** 서버 모드 표시용 미세 틱 */
  microTick: () => void;
  buyMarket: (stockId: string, quantity: number) => OrderResult;
  sellMarket: (stockId: string, quantity: number) => OrderResult;
  buyCurrent: (stockId: string, quantity: number) => OrderResult;
  sellCurrent: (stockId: string, quantity: number) => OrderResult;
  reset: () => void;
  getTotalAssets: () => number;
  getStockById: (id: string) => StockState | undefined;
}

function createInitialState(): MarketSnapshot & {
  userId: string | null;
  isReady: boolean;
  serverPrices: Record<string, number>;
  openOrders: OpenOrder[];
} {
  const now = Date.now();
  return {
    tick: 0,
    // 로컬 모드는 고정 기원점 기반 결정론 시장 — 모든 클라이언트가 동일한 시장을 본다
    marketStartedAt: IS_SERVER_MODE ? now : MARKET_EPOCH_MS,
    cash: INITIAL_CASH,
    initialCash: INITIAL_CASH,
    lastSalarySession: Math.floor(now / SESSION_DURATION_MS),
    // 분배·배당 회차는 기원점 절대 그리드에 정렬 (배당락 시점과 일치)
    lastMonthlyDistributionSession: alignSessionToGrid(
      Math.floor(now / SESSION_DURATION_MS),
      COVERED_CALL_INTERVAL_DAYS,
    ),
    lastQuarterlyDividendSession: alignSessionToGrid(
      Math.floor(now / SESSION_DURATION_MS),
      QUARTERLY_DIVIDEND_INTERVAL_DAYS,
    ),
    holdings: [],
    trades: [],
    cashPayments: [],
    stocks: IS_SERVER_MODE
      ? STOCK_DEFINITIONS.map((d) => createInitialStockState(d))
      : createGenesisStocks(),
    events: [],
    userId: null,
    isReady: false,
    serverPrices: {},
    openOrders: [],
  };
}

function migrateStock(stock: StockState & { previousClose?: number }): StockState {
  const withBook = stock.orderBook?.bids?.length
    ? stock
    : { ...stock, orderBook: generateOrderBook(stock.currentPrice) };

  return applyDefinitionOverlay({
    ...withBook,
    prevDayClose:
      withBook.prevDayClose ??
      withBook.previousClose ??
      withBook.currentPrice,
    dayOpen: withBook.dayOpen ?? withBook.currentPrice,
    candles: withBook.candles ?? [],
    dailyCandles: withBook.dailyCandles ?? [],
  });
}

function applyLocalBuySell(
  set: (partial: Partial<MarketStore>) => void,
  get: () => MarketStore,
  mode: "buyMarket" | "sellMarket" | "buyCurrent" | "sellCurrent",
  stockId: string,
  quantity: number,
): OrderResult {
  // 지급 경계 뒤 첫 매매라면 기존 보유 수량으로 먼저 정산한다.
  get().settleCashflows();
  const state = get();
  const stock = state.stocks.find((s) => s.id === stockId);
  if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
  if (stock.sector === "선물" || stock.sector === "지수") {
    return {
      success: false,
      message: "지수·선물은 직접 거래할 수 없습니다. ETF를 이용해 주세요.",
    };
  }

  let price: number;
  let label: string;

  switch (mode) {
    case "buyMarket":
      price = getMarketBuyPrice(stock.currentPrice);
      label = "시장가 매수";
      break;
    case "sellMarket":
      price = getMarketSellPrice(stock.currentPrice);
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
    message: `${label} (${formatPrice(price)})`,
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
          lastMonthlyDistributionSession:
            state.lastMonthlyDistributionSession,
          lastQuarterlyDividendSession:
            state.lastQuarterlyDividendSession,
          serverPrices: Object.fromEntries(
            state.stocks.map((s) => [s.id, s.currentPrice]),
          ),
        });
      },

      syncUserFromServer: (data) => {
        set({
          cash: data.cash,
          initialCash: data.initialCash,
          lastSalarySession: data.lastSalarySession,
          holdings: data.holdings,
          trades: data.trades,
          cashPayments: data.cashPayments,
        });
      },

      placeOrder: async (stockId, quantity, orderType) => {
        const sector = get().getStockById(stockId)?.sector;
        if (sector === "선물" || sector === "지수") {
          return {
            success: false,
            message: "지수·선물은 직접 거래할 수 없습니다. ETF를 이용해 주세요.",
          };
        }
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

      refreshOpenOrders: async () => {
        if (!IS_SERVER_MODE) return;
        const orders = await fetchOpenOrders();
        if (orders) set({ openOrders: orders });
      },

      placeLimitOrder: async (stockId, price, quantity, side) => {
        const limitSector = get().getStockById(stockId)?.sector;
        if (limitSector === "선물" || limitSector === "지수") {
          return {
            success: false,
            message: "지수·선물은 직접 거래할 수 없습니다. ETF를 이용해 주세요.",
          };
        }

        // 로컬 모드: 대기 주문을 로컬에 저장, tickMarket이 가격 도달 시 체결
        if (!IS_SERVER_MODE) {
          const state = get();
          const stock = state.stocks.find((s) => s.id === stockId);
          if (!stock) {
            return { success: false, message: "종목을 찾을 수 없습니다." };
          }
          if (quantity <= 0 || !Number.isInteger(quantity)) {
            return { success: false, message: "수량은 1 이상의 정수여야 합니다." };
          }
          if (side === "buy" && price * quantity > state.cash) {
            return { success: false, message: "보유 현금이 부족합니다." };
          }
          if (side === "sell") {
            const held = state.holdings.find((h) => h.stockId === stockId);
            if (!held || held.quantity < quantity) {
              return { success: false, message: "보유 수량이 부족합니다." };
            }
          }
          const order: OpenOrder = {
            id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            stockId,
            ticker: stock.ticker,
            side,
            price,
            quantity,
            createdAt: Date.now(),
          };
          set({ openOrders: [order, ...state.openOrders] });
          return {
            success: true,
            message: `지정가 ${side === "buy" ? "매수" : "매도"} 대기 (${formatPrice(price)} × ${quantity}주)`,
          };
        }

        if (!get().userId) {
          return { success: false, message: "로그인 후 사용할 수 있습니다." };
        }
        const supabase = createClient();
        const { data, error } = await supabase.functions.invoke("trade", {
          body: {
            stockId,
            quantity,
            orderType: side === "buy" ? "buy_limit" : "sell_limit",
            limitPrice: price,
          },
        });
        if (error) {
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
        await get().refreshOpenOrders();
        return {
          success: Boolean(data?.success),
          message: data?.message ?? data?.error ?? "주문 실패",
        };
      },

      cancelOrder: async (orderId) => {
        if (!IS_SERVER_MODE) {
          set({ openOrders: get().openOrders.filter((o) => o.id !== orderId) });
          return;
        }
        await cancelOpenOrder(orderId);
        await get().refreshOpenOrders();
      },

      microTick: () => {
        if (!IS_SERVER_MODE) return;
        const { stocks, serverPrices } = get();
        const now = Date.now();
        set({
          stocks: stocks.map((s) =>
            microTickStock(s, now, serverPrices[s.id]),
          ),
        });
      },

      tickMarket: () => {
        if (IS_SERVER_MODE) return;
        const state = get();
        const { tick, stocks, events, openOrders } = state;
        const now = Date.now();
        // 결정론 공통 시장: 벽시계 기준 목표 틱까지 리플레이.
        // 오래 접속하지 않았어도 같은 시각이면 모든 클라이언트가 같은 상태에 도달한다.
        const targetTick = currentSimTick(now);
        if (targetTick <= tick) return;
        const replayed = replayMarket(stocks, events, tick, targetTick);
        const nextTick = targetTick;
        const allEvents = replayed.events;
        const updatedStocks = replayed.stocks;

        // 로컬 지정가 대기 주문: 가격 도달 시 체결 (잔고 부족 시 자동 취소)
        let cash = state.cash;
        let holdings = state.holdings;
        let trades = state.trades;
        let remainingOrders = openOrders;
        if (openOrders.length > 0) {
          remainingOrders = [];
          for (const order of openOrders) {
            const stock = updatedStocks.find((s) => s.id === order.stockId);
            const crossed =
              stock !== undefined &&
              (order.side === "buy"
                ? stock.currentPrice <= order.price
                : stock.currentPrice >= order.price);
            if (!stock) continue; // 상장폐지된 종목의 주문은 폐기
            if (!crossed) {
              remainingOrders.push(order);
              continue;
            }
            const result =
              order.side === "buy"
                ? executeBuy(cash, holdings, order.stockId, order.ticker, stock.currentPrice, order.quantity, now)
                : executeSell(cash, holdings, order.stockId, order.ticker, stock.currentPrice, order.quantity, now);
            if (isOrderSuccess(result)) {
              cash = result.cash;
              holdings = result.holdings;
              trades = [result.trade, ...trades];
            }
            // 실패(잔고·수량 부족)한 주문은 서버 모드와 동일하게 자동 취소
          }
        }

        const currentSession = Math.floor(now / SESSION_DURATION_MS);
        const settled = settleLocalCashflows(
          { ...state, stocks: updatedStocks, cash, holdings },
          currentSession,
          now,
        );

        set({
          tick: nextTick,
          events: allEvents,
          cash: settled.cash,
          // 주가 조정(배당락)은 리플레이가 절대 그리드로 이미 반영 —
          // settle의 주가 변형은 버리고 현금·회차 카운터만 반영한다 (시장 일원화)
          stocks: updatedStocks,
          holdings,
          trades,
          openOrders: remainingOrders,
          lastSalarySession: settled.lastSalarySession,
          lastMonthlyDistributionSession:
            settled.lastMonthlyDistributionSession,
          lastQuarterlyDividendSession:
            settled.lastQuarterlyDividendSession,
          cashPayments: settled.cashPayments,
        });
      },

      settleCashflows: () => {
        if (IS_SERVER_MODE) return;
        const state = get();
        const now = Date.now();
        const settled = settleLocalCashflows(
          state,
          Math.floor(now / SESSION_DURATION_MS),
          now,
        );
        if (!settled.changed) return;
        set({
          cash: settled.cash,
          // 주가 조정은 결정론 리플레이 담당 — 현금·카운터만 반영
          lastSalarySession: settled.lastSalarySession,
          lastMonthlyDistributionSession:
            settled.lastMonthlyDistributionSession,
          lastQuarterlyDividendSession:
            settled.lastQuarterlyDividendSession,
          cashPayments: settled.cashPayments,
        });
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
              lastSalarySession: state.lastSalarySession,
              lastMonthlyDistributionSession:
                state.lastMonthlyDistributionSession,
              lastQuarterlyDividendSession:
                state.lastQuarterlyDividendSession,
              holdings: state.holdings,
              trades: state.trades,
              cashPayments: state.cashPayments,
              stocks: state.stocks,
              events: state.events,
            },
      merge: (persisted, current) => {
        if (IS_SERVER_MODE) return current;
        const merged = { ...current, ...(persisted as Partial<MarketSnapshot>) };
        const nowSession = Math.floor(Date.now() / SESSION_DURATION_MS);

        // 저장분은 결정론 시장의 체크포인트로만 유효하다.
        // 기원점·종목 구성이 다르거나 틱이 미래면 제네시스에서 다시 리플레이한다
        // (포트폴리오는 유지 — 시장만 공통 상태로 재계산).
        const persistedStocks = Array.isArray(merged.stocks) ? merged.stocks : [];
        const definedIds = new Set(STOCK_DEFINITIONS.map((d) => d.id));
        const compatibleUniverse =
          persistedStocks.length > 0 &&
          persistedStocks.every(
            (s) => definedIds.has(s.id) && Array.isArray(s.dailyCandles),
          );
        const marketValid =
          merged.marketStartedAt === MARKET_EPOCH_MS &&
          Number.isSafeInteger(merged.tick) &&
          merged.tick >= 0 &&
          merged.tick <= currentSimTick() + 60 &&
          compatibleUniverse;
        const persistedById = new Map(
          persistedStocks.map((stock) => [stock.id, stock]),
        );
        const restoredStocks = marketValid
          ? STOCK_DEFINITIONS.map((definition) => {
              const persistedStock = persistedById.get(definition.id);
              return persistedStock
                ? migrateStock(persistedStock)
                : createInitialStockState(
                    definition,
                    simTickTime(merged.tick),
                  );
            })
          : createGenesisStocks();

        return {
          ...merged,
          marketStartedAt: MARKET_EPOCH_MS,
          tick: marketValid ? merged.tick : 0,
          stocks: restoredStocks,
          events:
            marketValid && Array.isArray(merged.events) ? merged.events : [],
          lastSalarySession: Number.isSafeInteger(merged.lastSalarySession)
            ? merged.lastSalarySession
            : nowSession,
          lastMonthlyDistributionSession: alignSessionToGrid(
            Number.isSafeInteger(merged.lastMonthlyDistributionSession)
              ? merged.lastMonthlyDistributionSession
              : nowSession,
            COVERED_CALL_INTERVAL_DAYS,
          ),
          lastQuarterlyDividendSession: alignSessionToGrid(
            Number.isSafeInteger(merged.lastQuarterlyDividendSession)
              ? merged.lastQuarterlyDividendSession
              : nowSession,
            QUARTERLY_DIVIDEND_INTERVAL_DAYS,
          ),
          cashPayments: Array.isArray(merged.cashPayments)
            ? merged.cashPayments
            : [],
          userId: null,
          isReady: false,
        };
      },
    },
  ),
);

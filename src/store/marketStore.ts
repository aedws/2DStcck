import { create } from "zustand";
import { persist } from "zustand/middleware";
import { INITIAL_CASH, STOCK_DEFINITIONS } from "@/data/stocks";
import {
  createInitialStockState,
  formatPrice,
  getMarketBuyPrice,
  getMarketSellPrice,
} from "@/lib/market/engine";
import { applyDefinitionOverlay } from "@/lib/market/definitionOverlay";
import {
  calculatePortfolioValue,
  executeBuy,
  executeSell,
  isOrderSuccess,
} from "@/lib/market/trading";
import type {
  MarketSnapshot,
  NetWorthPoint,
  OpenOrder,
  OrderResult,
  OrderType,
  StockState,
} from "@/lib/types/market";
import type { OwnedLuxury } from "@/lib/types/luxury";
import { LUXURY_BY_ID } from "@/data/luxuries";
import {
  getLuxuryValue,
  getLuxuryShowcase,
  getTopLuxuryTier,
} from "@/lib/market/luxury";
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
import {
  loadGameSave,
  saveGameSave,
  syncLeaderboard,
} from "@/lib/supabase/cloudSave";

// 시장은 항상 로컬 결정론으로 계산된다. Supabase는 로그인·지갑 저장·랭킹
// (계정 레이어) 전용이며 별도 "서버 모드"는 없다.

interface MarketStore extends MarketSnapshot {
  userId: string | null;
  isReady: boolean;
  /** 미체결 지정가 주문 */
  openOrders: OpenOrder[];
  /** 보유 사치재 (재화 sink) — 가치는 순자산에 합산되어 랭킹에 반영 */
  ownedLuxuries: OwnedLuxury[];
  /** 순자산 추이 기록 (에쿼티 커브·랭킹 스냅샷) */
  netWorthHistory: NetWorthPoint[];
  /** 사치재 구매: 현금 차감 후 보유 목록에 추가 (아이템당 1개) */
  purchaseLuxury: (itemId: string) => OrderResult;
  /** 보유 사치재 총 가치(센트) */
  getLuxuryValue: () => number;
  placeLimitOrder: (
    stockId: string,
    price: number,
    quantity: number,
    side: "buy" | "sell",
  ) => Promise<OrderResult>;
  cancelOrder: (orderId: string) => Promise<void>;
  setReady: (ready: boolean) => void;
  setUserId: (id: string | null) => void;
  /** 로그인 시 클라우드 저장분(지갑)을 불러와 반영 */
  loadCloudSave: () => Promise<void>;
  /** 현재 지갑을 클라우드에 저장 (로그인 시에만) */
  saveCloud: () => Promise<void>;
  placeOrder: (
    stockId: string,
    quantity: number,
    orderType: OrderType,
  ) => Promise<OrderResult>;
  tickMarket: () => void;
  /** 주문 전·복원 직후 밀린 급여와 투자 분배금을 정산 */
  settleCashflows: () => void;
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
  openOrders: OpenOrder[];
  ownedLuxuries: OwnedLuxury[];
  netWorthHistory: NetWorthPoint[];
} {
  const now = Date.now();
  return {
    tick: 0,
    // 시장은 항상 고정 기원점 기반 결정론 — 모든 클라이언트가 동일한 시장을 본다
    marketStartedAt: MARKET_EPOCH_MS,
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
    stocks: createGenesisStocks(),
    events: [],
    userId: null,
    isReady: false,
    openOrders: [],
    ownedLuxuries: [],
    netWorthHistory: [],
  };
}

/** 순자산 기록 최소 간격(ms) — 과도한 기록으로 저장소가 비대해지는 것을 막는다. */
const NET_WORTH_SAMPLE_MS = 30 * 60 * 1000;
const MAX_NET_WORTH_POINTS = 240;

/** 마지막 기록 이후 충분히 지났으면 순자산 스냅샷을 한 점 덧붙인다. */
function appendNetWorthPoint(
  history: NetWorthPoint[],
  value: number,
  now: number,
): NetWorthPoint[] {
  const last = history[history.length - 1];
  if (last && now - last.t < NET_WORTH_SAMPLE_MS) return history;
  return [...history, { t: now, value }].slice(-MAX_NET_WORTH_POINTS);
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

      loadCloudSave: async () => {
        if (!get().userId) return;
        const wallet = await loadGameSave();
        if (!wallet) {
          // 첫 로그인: 현재 로컬 지갑을 그대로 클라우드에 올려 시작점으로 삼는다
          await get().saveCloud();
          return;
        }
        // 클라우드 지갑을 로컬 계산 시장 위에 얹고, 그동안 밀린 급여·배당을 정산
        set({
          cash: wallet.cash,
          initialCash: wallet.initialCash,
          holdings: wallet.holdings ?? [],
          trades: wallet.trades ?? [],
          openOrders: wallet.openOrders ?? [],
          cashPayments: wallet.cashPayments ?? [],
          lastSalarySession: wallet.lastSalarySession,
          lastMonthlyDistributionSession:
            wallet.lastMonthlyDistributionSession,
          lastQuarterlyDividendSession: wallet.lastQuarterlyDividendSession,
          ownedLuxuries: wallet.ownedLuxuries ?? [],
        });
        get().settleCashflows();
      },

      saveCloud: async () => {
        if (!get().userId) return;
        const s = get();
        await saveGameSave({
          cash: s.cash,
          initialCash: s.initialCash,
          holdings: s.holdings,
          trades: s.trades.slice(0, 200),
          openOrders: s.openOrders,
          cashPayments: s.cashPayments.slice(0, 50),
          lastSalarySession: s.lastSalarySession,
          lastMonthlyDistributionSession: s.lastMonthlyDistributionSession,
          lastQuarterlyDividendSession: s.lastQuarterlyDividendSession,
          ownedLuxuries: s.ownedLuxuries,
        });

        // 공유 리더보드 갱신: 순자산·수익률·과시 요약을 본인 행에 반영
        const netWorth = s.getTotalAssets();
        await syncLeaderboard({
          netWorth,
          returnRate:
            s.initialCash > 0
              ? ((netWorth - s.initialCash) / s.initialCash) * 100
              : 0,
          topTier: getTopLuxuryTier(s.ownedLuxuries),
          luxuryCount: s.ownedLuxuries.length,
          showcase: getLuxuryShowcase(s.ownedLuxuries),
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
      },

      placeLimitOrder: async (stockId, price, quantity, side) => {
        const limitSector = get().getStockById(stockId)?.sector;
        if (limitSector === "선물" || limitSector === "지수") {
          return {
            success: false,
            message: "지수·선물은 직접 거래할 수 없습니다. ETF를 이용해 주세요.",
          };
        }

        // 대기 주문을 로컬에 저장 → tickMarket이 가격 도달 시 체결
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
      },

      cancelOrder: async (orderId) => {
        set({ openOrders: get().openOrders.filter((o) => o.id !== orderId) });
      },

      tickMarket: () => {
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

        const priceById = Object.fromEntries(
          updatedStocks.map((s) => [s.id, s.currentPrice]),
        );
        const netWorth =
          settled.cash +
          calculatePortfolioValue(holdings, priceById) +
          getLuxuryValue(state.ownedLuxuries);
        const netWorthHistory = appendNetWorthPoint(
          state.netWorthHistory,
          netWorth,
          now,
        );

        set({
          tick: nextTick,
          events: allEvents,
          cash: settled.cash,
          netWorthHistory,
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

      purchaseLuxury: (itemId) => {
        const item = LUXURY_BY_ID.get(itemId);
        if (!item) return { success: false, message: "존재하지 않는 상품입니다." };
        const state = get();
        if (state.ownedLuxuries.some((o) => o.id === itemId)) {
          return { success: false, message: "이미 보유한 상품입니다." };
        }
        if (item.price > state.cash) {
          return { success: false, message: "보유 현금이 부족합니다." };
        }
        const owned: OwnedLuxury = {
          id: item.id,
          purchasedAt: Date.now(),
          paidPrice: item.price,
        };
        set({
          cash: state.cash - item.price,
          ownedLuxuries: [...state.ownedLuxuries, owned],
        });
        return {
          success: true,
          message: `${item.emoji} ${item.name} 구매 완료`,
        };
      },

      getLuxuryValue: () => getLuxuryValue(get().ownedLuxuries),

      reset: () => set(createInitialState()),

      getTotalAssets: () => {
        const { cash, holdings, stocks, ownedLuxuries } = get();
        const prices = Object.fromEntries(stocks.map((s) => [s.id, s.currentPrice]));
        return (
          cash +
          calculatePortfolioValue(holdings, prices) +
          getLuxuryValue(ownedLuxuries)
        );
      },

      getStockById: (id) => get().stocks.find((s) => s.id === id),
    }),
    {
      name: "2dstock-market-local",
      partialize: (state) => ({
        tick: state.tick,
        marketStartedAt: state.marketStartedAt,
        cash: state.cash,
        initialCash: state.initialCash,
        lastSalarySession: state.lastSalarySession,
        lastMonthlyDistributionSession: state.lastMonthlyDistributionSession,
        lastQuarterlyDividendSession: state.lastQuarterlyDividendSession,
        holdings: state.holdings,
        trades: state.trades,
        openOrders: state.openOrders,
        cashPayments: state.cashPayments,
        ownedLuxuries: state.ownedLuxuries,
        netWorthHistory: state.netWorthHistory,
        // 자동 파생상품은 기초종목 당일 수익률에서 즉시 재구성되므로
        // 로컬 저장소에는 보관하지 않아 브라우저 용량 초과를 방지한다.
        stocks: state.stocks.filter((stock) => !stock.universalDerivative),
        events: state.events,
      }),
      merge: (persisted, current) => {
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
          ownedLuxuries: Array.isArray(
            (merged as Partial<MarketStore>).ownedLuxuries,
          )
            ? (merged as Partial<MarketStore>).ownedLuxuries!
            : [],
          netWorthHistory: Array.isArray(
            (merged as Partial<MarketStore>).netWorthHistory,
          )
            ? (merged as Partial<MarketStore>).netWorthHistory!
            : [],
          userId: null,
          isReady: false,
        };
      },
    },
  ),
);

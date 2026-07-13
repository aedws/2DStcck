import { create } from "zustand";
import { persist } from "zustand/middleware";
import { INITIAL_CASH, STOCK_DEFINITIONS } from "@/data/stocks";
import {
  createInitialStockState,
  formatPrice,
  getMarketBuyPrice,
  getMarketSellPrice,
  seededRand,
} from "@/lib/market/engine";
import { withCharacterQuote } from "@/data/eventQuotes";
import { applyDefinitionOverlay } from "@/lib/market/definitionOverlay";
import {
  executeBuy,
  executeSell,
  isOrderSuccess,
} from "@/lib/market/trading";
import type {
  CashPayment,
  CharacterProgressMap,
  Holding,
  MarketSnapshot,
  NetWorthPoint,
  InvestmentMission,
  InvestmentMissionHistory,
  InvestmentMissionKind,
  MarketEvent,
  OpenOrder,
  OrderResult,
  OrderType,
  StoryDecision,
  StoryDecisionKind,
  StockState,
  Trade,
} from "@/lib/types/market";
import type { OwnedLuxury } from "@/lib/types/luxury";
import { LUXURY_BY_ID } from "@/data/luxuries";
import {
  getLuxuryValue,
  getLuxuryShowcase,
  getTopLuxuryTier,
} from "@/lib/market/luxury";
import {
  computeEquity,
  grossExposure,
  shortLiability,
  marginDebit,
  accrueBorrowCost,
  MAX_LEVERAGE,
  MAINTENANCE_MARGIN,
} from "@/lib/market/margin";
import {
  coverShort,
  isShortSuccess,
  openShort,
} from "@/lib/market/shorting";
import {
  getBenchmark,
  getRateLevel,
  getPrevRateLevel,
  getAnnualRatePercent,
  buildRateChangeEvent,
} from "@/lib/market/interestRate";
import {
  getActivePumpStocks,
  getPumpSpawnEvent,
  delistedPumpFinalPrice,
  isPumpStock,
} from "@/lib/market/pumpStocks";
import type {
  ShortPosition,
  RateLevel,
  OptionPosition,
  OptionKind,
} from "@/lib/types/market";
import {
  optionPremium,
  positionMark,
  intrinsic,
  optionsEquityDelta,
  optionsGrossExposure,
  shortMarginPerContract,
} from "@/lib/market/options";
import { generateOrderBook } from "@/lib/market/orderBook";
import {
  MARKET_EPOCH_MS,
  MARKET_SIM_VERSION,
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
  SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
} from "@/lib/market/distributions";
import {
  loadGameSave,
  saveGameSave,
  syncLeaderboard,
} from "@/lib/supabase/cloudSave";
import { ACHIEVEMENTS } from "@/data/achievements";
import { useToastStore } from "@/store/toastStore";
import { playSound } from "@/lib/ui/sound";
import {
  drawLotteryPrize,
  LOTTERY_INTERVAL_DAYS,
  LOTTERY_MAX_PER_WINDOW,
  LOTTERY_TICKET_PRICE,
  type LotteryResult,
} from "@/lib/market/lottery";
import {
  createInvestmentMission,
  updateInvestmentMission,
} from "@/lib/market/missions";
import {
  createStoryDecision,
  getStoryArcAtSession,
  getStoryArcForWindow,
  getStoryDecisionOffer,
  resolveStoryDecision,
} from "@/lib/market/storyArcs";
import {
  accrueLongHoldingAffinity,
  addStorySupportAffinity,
  canUseBondChoice,
  getCharacterProgress,
  normalizeCharacterProgressMap,
  settleMissionRelationship,
} from "@/lib/market/characterProgress";
import {
  createInitialMastery,
  normalizeInvestmentMastery,
  updateInvestmentMastery,
  type InvestmentMasteryState,
} from "@/lib/market/investmentMastery";

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
  /** 마지막 강제청산(마진콜) 시각 — 배너 표시용 (없으면 null) */
  marginCallAt: number | null;
  /** 사치재 구매: 현금 차감 후 보유 목록에 추가 (아이템당 1개) */
  purchaseLuxury: (itemId: string) => OrderResult;
  /** 보유 사치재 총 가치(센트) */
  getLuxuryValue: () => number;
  /** 공매도 개시 (시장가) */
  openShortPosition: (stockId: string, quantity: number) => OrderResult;
  /** 공매도 청산(cover, 시장가) */
  coverShortPosition: (stockId: string, quantity: number) => OrderResult;
  /** 추가 매수·공매도 여력 (현금 환산, 마진 포함) */
  getBuyingPower: () => number;
  /** 자기자본(순자산) = 현금 + 롱 + 사치재 − 공매도 부채 */
  getEquity: () => number;
  /** 현재 금리 단계 (1완화·2중립·3긴축) */
  getRateLevel: () => RateLevel;
  /** 달성한 업적 id 목록 */
  achievements: string[];
  /** 현재 상태 기준으로 새 업적을 판정·해금 (토스트) */
  checkAchievements: () => void;
  /** 현재 복권 회차 시작 거래일 */
  lotteryWindowStart: number;
  /** 현재 회차에 구매한 복권 장수 */
  lotteryTicketsBought: number;
  /** 잭팟 당첨 이력 (업적용) */
  wonJackpot: boolean;
  /** 5거래일 투자 의뢰·평판 진행 상태 */
  investmentMission: InvestmentMission | null;
  missionHistory: InvestmentMissionHistory[];
  reputation: number;
  /** 캐릭터별 업무 신뢰도·개인 호감도. */
  characterProgress: CharacterProgressMap;
  readCharacterMessageIds: string[];
  investmentMastery: InvestmentMasteryState;
  markCharacterMessageRead: (messageId: string) => void;
  markAllCharacterMessagesRead: (messageIds: string[]) => void;
  acceptInvestmentMission: (kind: InvestmentMissionKind) => OrderResult;
  /** 현재 연속 사건에 내린 판단과 최근 정산 기록. */
  storyDecision: StoryDecision | null;
  storyDecisionHistory: StoryDecision[];
  chooseStoryDecision: (kind: StoryDecisionKind) => OrderResult;
  /** 즉석 복권 1장 구매 (현금 전용). 결과 즉시 반환 */
  buyLottery: () => LotteryResult;
  /** 이번 회차 남은 복권 장수 */
  getLotteryTicketsLeft: () => number;
  /** 옵션 매수 (프리미엄 지불) */
  buyOption: (
    stockId: string,
    kind: OptionKind,
    strike: number,
    expirySession: number,
    quantity: number,
  ) => OrderResult;
  /** 옵션 발행/매도 (프리미엄 수취·증거금) */
  writeOption: (
    stockId: string,
    kind: OptionKind,
    strike: number,
    expirySession: number,
    quantity: number,
  ) => OrderResult;
  /** 옵션 포지션 청산 (long은 되팔기, short은 되사기) */
  closeOption: (optionId: string, quantity: number) => OrderResult;
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
  marginCallAt: number | null;
  achievements: string[];
  lotteryWindowStart: number;
  lotteryTicketsBought: number;
  wonJackpot: boolean;
  investmentMission: InvestmentMission | null;
  missionHistory: InvestmentMissionHistory[];
  reputation: number;
  characterProgress: CharacterProgressMap;
  readCharacterMessageIds: string[];
  investmentMastery: InvestmentMasteryState;
  storyDecision: StoryDecision | null;
  storyDecisionHistory: StoryDecision[];
} {
  const now = Date.now();
  return {
    marketVersion: MARKET_SIM_VERSION,
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
    lastSingleCoveredCallDistributionSession: alignSessionToGrid(
      Math.floor(now / SESSION_DURATION_MS),
      SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
    ),
    lastQuarterlyDividendSession: alignSessionToGrid(
      Math.floor(now / SESSION_DURATION_MS),
      QUARTERLY_DIVIDEND_INTERVAL_DAYS,
    ),
    holdings: [],
    shorts: [],
    options: [],
    lastInterestSession: Math.floor(now / SESSION_DURATION_MS),
    trades: [],
    cashPayments: [],
    stocks: createGenesisStocks(),
    events: [],
    userId: null,
    isReady: false,
    openOrders: [],
    ownedLuxuries: [],
    netWorthHistory: [],
    marginCallAt: null,
    achievements: [],
    lotteryWindowStart: alignSessionToGrid(
      Math.floor(now / SESSION_DURATION_MS),
      LOTTERY_INTERVAL_DAYS,
    ),
    lotteryTicketsBought: 0,
    wonJackpot: false,
    investmentMission: null,
    missionHistory: [],
    reputation: 0,
    characterProgress: {},
    readCharacterMessageIds: [],
    investmentMastery: createInitialMastery(),
    storyDecision: null,
    storyDecisionHistory: [],
  };
}

function ensureEventDialogue(event: MarketEvent): MarketEvent {
  return withCharacterQuote(
    event,
    seededRand(event.timestamp, `event-dialogue:${event.id}`),
  );
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

/** 현재 기준금리(연 소수) */
function currentRateDecimal(stocks: StockState[]): number {
  return getAnnualRatePercent(getRateLevel(getBenchmark(stocks))) / 100;
}

interface MarginContext {
  prices: Record<string, number>;
  equity: number;
  exposure: number;
}

/** 옵션까지 포함한 자기자본·총노출 (마진·청산 판단의 단일 진실) */
function marginContext(s: {
  cash: number;
  holdings: Holding[];
  shorts: ShortPosition[];
  options: OptionPosition[];
  stocks: StockState[];
  ownedLuxuries: OwnedLuxury[];
}): MarginContext {
  const prices = Object.fromEntries(s.stocks.map((x) => [x.id, x.currentPrice]));
  const luxuryVal = getLuxuryValue(s.ownedLuxuries);
  const session = Math.floor(Date.now() / SESSION_DURATION_MS);
  const rate = currentRateDecimal(s.stocks);
  const stockEquity = computeEquity(
    s.cash,
    s.holdings,
    s.shorts,
    prices,
    luxuryVal,
  );
  const optDelta = optionsEquityDelta(s.options, s.stocks, session, rate);
  const exposure =
    grossExposure(s.holdings, s.shorts, prices) +
    optionsGrossExposure(s.options, s.stocks, session, rate);
  return { prices, equity: stockEquity + optDelta, exposure };
}

function fullBuyingPower(s: Parameters<typeof marginContext>[0]): number {
  const { equity, exposure } = marginContext(s);
  return Math.max(0, MAX_LEVERAGE * equity - exposure);
}

function fullEquityOf(s: Parameters<typeof marginContext>[0]): number {
  return marginContext(s).equity;
}

function fullNeedsLiquidation(s: Parameters<typeof marginContext>[0]): boolean {
  const { equity, exposure } = marginContext(s);
  return exposure > 0 && equity < MAINTENANCE_MARGIN * exposure;
}

interface InterestOutcome {
  cash?: number;
  cashPayments?: CashPayment[];
  lastInterestSession: number;
}

/** 경과 거래일만큼 마진 이자·공매도 대여수수료를 현금에서 차감한다. */
function settleInterest(
  state: Pick<
    MarketStore,
    "cash" | "shorts" | "stocks" | "cashPayments" | "lastInterestSession"
  >,
  currentSession: number,
  now: number,
): InterestOutcome | null {
  const elapsed = currentSession - (state.lastInterestSession ?? currentSession);
  if (elapsed <= 0) return null;
  const prices = Object.fromEntries(
    state.stocks.map((s) => [s.id, s.currentPrice]),
  );
  const debit = marginDebit(state.cash);
  const shortVal = shortLiability(state.shorts, prices);
  const level = getRateLevel(getBenchmark(state.stocks));
  const cost = accrueBorrowCost(
    debit,
    shortVal,
    getAnnualRatePercent(level),
    elapsed,
  );
  if (cost <= 0) return { lastInterestSession: currentSession };
  const payment: CashPayment = {
    id: `interest-${currentSession}`,
    kind: "interest",
    sourceId: "margin",
    dueSession: currentSession,
    amount: -cost,
    timestamp: now,
  };
  return {
    cash: state.cash - cost,
    cashPayments: [payment, ...state.cashPayments].slice(0, 200),
    lastInterestSession: currentSession,
  };
}

/** 만기 도달 옵션을 내재가치로 현금정산하고 제거한다. */
function settleExpiredOptions(
  cash: number,
  options: OptionPosition[],
  stocks: StockState[],
  currentSession: number,
  now: number,
): { cash: number; options: OptionPosition[]; trades: Trade[] } {
  let nextCash = cash;
  const remaining: OptionPosition[] = [];
  const trades: Trade[] = [];
  for (const pos of options) {
    if (pos.expirySession > currentSession) {
      remaining.push(pos);
      continue;
    }
    const stock = stocks.find((s) => s.id === pos.stockId);
    const iv = stock ? intrinsic(pos.kind, stock.currentPrice, pos.strike) : 0;
    nextCash += (pos.side === "long" ? iv : -iv) * pos.quantity;
    trades.push({
      id: `option-expire-${now}-${pos.id}`,
      stockId: pos.stockId,
      ticker: stock?.ticker ?? pos.stockId.toUpperCase(),
      type: "option_expire",
      quantity: pos.quantity,
      price: iv,
      total: iv * pos.quantity,
      timestamp: now,
      optionId: pos.id,
      optionKind: pos.kind,
      optionSide: pos.side,
      strike: pos.strike,
      expirySession: pos.expirySession,
    });
  }
  return { cash: nextCash, options: remaining, trades };
}

/** 유지증거금 미달 시 롱·공매도·옵션 전 포지션을 현재가/마크로 강제 청산한다. */
function liquidatePositions(
  cash: number,
  holdings: Holding[],
  shorts: ShortPosition[],
  options: OptionPosition[],
  stocks: StockState[],
  trades: Trade[],
  now: number,
): {
  cash: number;
  holdings: Holding[];
  shorts: ShortPosition[];
  options: OptionPosition[];
  trades: Trade[];
} {
  const priceOf = (id: string) =>
    stocks.find((s) => s.id === id)?.currentPrice ?? 0;
  let nextCash = cash;
  let nextTrades = trades;
  const mk = (
    stockId: string,
    ticker: string,
    type: "sell" | "cover",
    quantity: number,
    price: number,
  ): Trade => ({
    id: `liq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stockId,
    ticker,
    type,
    quantity,
    price,
    total: price * quantity,
    timestamp: now,
  });
  for (const h of holdings) {
    const price = getMarketSellPrice(priceOf(h.stockId));
    nextCash += price * h.quantity;
    const ticker = stocks.find((s) => s.id === h.stockId)?.ticker ?? h.stockId;
    nextTrades = [mk(h.stockId, ticker, "sell", h.quantity, price), ...nextTrades];
  }
  for (const sh of shorts) {
    const price = getMarketBuyPrice(priceOf(sh.stockId));
    nextCash -= price * sh.quantity;
    const ticker = stocks.find((s) => s.id === sh.stockId)?.ticker ?? sh.stockId;
    nextTrades = [mk(sh.stockId, ticker, "cover", sh.quantity, price), ...nextTrades];
  }
  // 옵션은 현재 마크로 청산 (long=수취, short=지불)
  const session = Math.floor(now / SESSION_DURATION_MS);
  const rate = currentRateDecimal(stocks);
  for (const pos of options) {
    const stock = stocks.find((s) => s.id === pos.stockId);
    if (!stock) continue;
    const mark = positionMark(pos, stock, session, rate);
    nextCash += (pos.side === "long" ? mark : -mark) * pos.quantity;
    nextTrades = [
      {
        id: `liq-option-${now}-${pos.id}`,
        stockId: pos.stockId,
        ticker: stock.ticker,
        type: "option_close",
        quantity: pos.quantity,
        price: mark,
        total: mark * pos.quantity,
        timestamp: now,
        optionId: pos.id,
        optionKind: pos.kind,
        optionSide: pos.side,
        strike: pos.strike,
        expirySession: pos.expirySession,
      },
      ...nextTrades,
    ];
  }
  return {
    cash: nextCash,
    holdings: [],
    shorts: [],
    options: [],
    trades: nextTrades,
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

  if (mode.startsWith("buy")) {
    // 마진 매수: 현금이 아니라 매수여력(자기자본 2배 − 노출) 한도로 판단.
    const buyingPower = fullBuyingPower(state);
    const total = price * quantity;
    if (total > buyingPower) {
      return { success: false, message: "매수여력이 부족합니다." };
    }
    const merged = executeBuy(
      Number.MAX_SAFE_INTEGER,
      state.holdings,
      stockId,
      stock.ticker,
      price,
      quantity,
      Date.now(),
    );
    if (!isOrderSuccess(merged)) return merged;
    set({
      cash: state.cash - total,
      holdings: merged.holdings,
      trades: [merged.trade, ...state.trades],
    });
    get().checkAchievements();
    return {
      success: true,
      message:
        state.cash - total < 0
          ? `${label} · 마진 사용 (${formatPrice(price)})`
          : `${label} (${formatPrice(price)})`,
    };
  }

  const result = executeSell(
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
  get().checkAchievements();
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
      markCharacterMessageRead: (messageId) =>
        set((state) => ({
          readCharacterMessageIds: state.readCharacterMessageIds.includes(messageId)
            ? state.readCharacterMessageIds
            : [messageId, ...state.readCharacterMessageIds].slice(0, 300),
        })),
      markAllCharacterMessagesRead: (messageIds) =>
        set((state) => ({
          readCharacterMessageIds: [
            ...new Set([...messageIds, ...state.readCharacterMessageIds]),
          ].slice(0, 300),
        })),

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
          lastSingleCoveredCallDistributionSession:
            wallet.lastSingleCoveredCallDistributionSession ??
            alignSessionToGrid(
              Math.floor(Date.now() / SESSION_DURATION_MS),
              SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
            ),
          lastQuarterlyDividendSession: wallet.lastQuarterlyDividendSession,
          ownedLuxuries: wallet.ownedLuxuries ?? [],
          shorts: wallet.shorts ?? [],
          options: wallet.options ?? [],
          achievements: wallet.achievements ?? [],
          lotteryWindowStart:
            wallet.lotteryWindowStart ??
            alignSessionToGrid(
              Math.floor(Date.now() / SESSION_DURATION_MS),
              LOTTERY_INTERVAL_DAYS,
            ),
          lotteryTicketsBought: wallet.lotteryTicketsBought ?? 0,
          wonJackpot: wallet.wonJackpot ?? false,
          investmentMission: wallet.investmentMission ?? null,
          missionHistory: wallet.missionHistory ?? [],
          reputation: wallet.reputation ?? 0,
          characterProgress: normalizeCharacterProgressMap(
            wallet.characterProgress,
          ),
          readCharacterMessageIds: wallet.readCharacterMessageIds ?? [],
          investmentMastery: normalizeInvestmentMastery(
            wallet.investmentMastery,
          ),
          storyDecision: wallet.storyDecision ?? null,
          storyDecisionHistory: wallet.storyDecisionHistory ?? [],
          lastInterestSession:
            wallet.lastInterestSession ??
            Math.floor(Date.now() / SESSION_DURATION_MS),
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
          lastSingleCoveredCallDistributionSession:
            s.lastSingleCoveredCallDistributionSession,
          lastQuarterlyDividendSession: s.lastQuarterlyDividendSession,
          ownedLuxuries: s.ownedLuxuries,
          shorts: s.shorts,
          options: s.options,
          achievements: s.achievements,
          lotteryWindowStart: s.lotteryWindowStart,
          lotteryTicketsBought: s.lotteryTicketsBought,
          wonJackpot: s.wonJackpot,
          investmentMission: s.investmentMission,
          missionHistory: s.missionHistory,
          reputation: s.reputation,
          characterProgress: s.characterProgress,
          readCharacterMessageIds: s.readCharacterMessageIds,
          investmentMastery: s.investmentMastery,
          storyDecision: s.storyDecision,
          storyDecisionHistory: s.storyDecisionHistory,
          lastInterestSession: s.lastInterestSession,
        });

        // 공유 리더보드 갱신: 순자산·수익률·과시 요약을 본인 행에 반영
        const netWorth = s.getTotalAssets();
        await syncLeaderboard({
          netWorth,
          returnRate:
            s.initialCash > 0
              ? ((netWorth - s.initialCash) / s.initialCash) * 100
              : 0,
          initialCash: s.initialCash,
          marketSession: Math.floor(Date.now() / SESSION_DURATION_MS),
          topTier: getTopLuxuryTier(s.ownedLuxuries),
          luxuryCount: s.ownedLuxuries.length,
          showcase: getLuxuryShowcase(s.ownedLuxuries),
          reputation: s.reputation,
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
        // 결정론 급등주(2거래일 내 상장폐지)를 고정 시장에 얹는다
        const activePumps = getActivePumpStocks(now);
        const combinedStocks = activePumps.length
          ? [...replayed.stocks, ...activePumps]
          : replayed.stocks;

        // 로컬 지정가 대기 주문: 가격 도달 시 체결 (잔고 부족 시 자동 취소)
        let cash = state.cash;
        let holdings = state.holdings;
        let trades = state.trades;
        let remainingOrders = openOrders;
        if (openOrders.length > 0) {
          remainingOrders = [];
          for (const order of openOrders) {
            const stock = combinedStocks.find((s) => s.id === order.stockId);
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

        // 급등주 상장폐지 정산: 폐지된 급등주 보유분을 최종가로 강제 매도
        holdings = holdings.filter((h) => {
          const finalPrice = delistedPumpFinalPrice(h.stockId, currentSession);
          if (finalPrice === null) return true;
          cash += finalPrice * h.quantity;
          trades = [
            {
              id: `delist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              stockId: h.stockId,
              ticker: h.stockId.toUpperCase(),
              type: "sell",
              quantity: h.quantity,
              price: finalPrice,
              total: finalPrice * h.quantity,
              timestamp: now,
            },
            ...trades,
          ];
          return false;
        });

        const settled = settleLocalCashflows(
          { ...state, stocks: combinedStocks, cash, holdings },
          currentSession,
          now,
        );
        cash = settled.cash;
        let cashPayments = settled.cashPayments;
        let shorts = state.shorts;

        // 만기 도달 옵션 현금정산
        const expired = settleExpiredOptions(
          cash,
          state.options,
          combinedStocks,
          currentSession,
          now,
        );
        cash = expired.cash;
        let options = expired.options;
        if (expired.trades.length > 0) {
          trades = [...expired.trades, ...trades];
        }

        // 마진 이자·공매도 대여수수료 (경과 거래일만큼)
        const interest = settleInterest(
          { ...state, cash, shorts, stocks: combinedStocks, cashPayments },
          currentSession,
          now,
        );
        if (interest?.cash !== undefined) cash = interest.cash;
        if (interest?.cashPayments) cashPayments = interest.cashPayments;
        const lastInterestSession =
          interest?.lastInterestSession ?? state.lastInterestSession;

        // 금리 단계 변경 뉴스 (결정론 — 세션당 1회, 전 클라이언트 동일)
        let nextEvents = allEvents;
        const bench = getBenchmark(combinedStocks);
        if (bench) {
          const level = getRateLevel(bench);
          const prevLevel = getPrevRateLevel(bench);
          if (
            level !== prevLevel &&
            !nextEvents.some((e) => e.id === `rate-${currentSession}`)
          ) {
            nextEvents = [
              ...nextEvents,
              buildRateChangeEvent(currentSession, prevLevel, level, now),
            ].slice(-50);
          }
        }

        // 급등주 상장 뉴스 (결정론 — 세션당 1회)
        const pumpEvent = getPumpSpawnEvent(currentSession, now);
        if (pumpEvent && !nextEvents.some((e) => e.id === pumpEvent.id)) {
          nextEvents = [...nextEvents, pumpEvent].slice(-50);
        }

        // 강제청산(마진콜): 유지증거금 미달이면 전 포지션을 현재가/마크로 청산
        let marginCallAt = state.marginCallAt;
        const liveState = {
          cash,
          holdings,
          shorts,
          options,
          stocks: combinedStocks,
          ownedLuxuries: state.ownedLuxuries,
        };
        if (fullNeedsLiquidation(liveState)) {
          const liq = liquidatePositions(
            cash,
            holdings,
            shorts,
            options,
            combinedStocks,
            trades,
            now,
          );
          cash = liq.cash;
          holdings = liq.holdings;
          shorts = liq.shorts;
          options = liq.options;
          trades = liq.trades;
          marginCallAt = now;
        }

        const netWorth = fullEquityOf({
          cash,
          holdings,
          shorts,
          options,
          stocks: combinedStocks,
          ownedLuxuries: state.ownedLuxuries,
        });
        let investmentMission = state.investmentMission;
        let missionHistory = state.missionHistory;
        let reputation = state.reputation;
        let characterProgress = accrueLongHoldingAffinity(
          state.characterProgress,
          holdings,
          combinedStocks,
          netWorth,
          currentSession,
        );
        if (investmentMission?.status === "active") {
          const benchmarkPrice = getBenchmark(combinedStocks)?.currentPrice ?? 0;
          const updatedMission = updateInvestmentMission(
            investmentMission,
            currentSession,
            netWorth,
            benchmarkPrice,
            now,
          );
          investmentMission = updatedMission;
          if (
            updatedMission.status !== "active" &&
            !missionHistory.some((item) => item.id === updatedMission.id)
          ) {
            const succeeded = updatedMission.status === "completed";
            const legacyIssuer = updatedMission.issuerCharacterId
              ? undefined
              : getStoryArcAtSession(updatedMission.windowStart);
            const issuerCharacterId =
              updatedMission.issuerCharacterId ?? legacyIssuer?.character?.id;
            const issuerCompanyId =
              updatedMission.issuerCompanyId ?? legacyIssuer?.company.id;
            const historyItem: InvestmentMissionHistory = {
              id: updatedMission.id,
              kind: updatedMission.kind,
              windowStart: updatedMission.windowStart,
              status: updatedMission.status,
              reward: succeeded ? updatedMission.reward : 0,
              completedAt: updatedMission.completedAt ?? now,
              playerReturn: updatedMission.playerReturn ?? 0,
              benchmarkReturn: updatedMission.benchmarkReturn ?? 0,
              issuerCharacterId,
              issuerCompanyId,
            };
            missionHistory = [historyItem, ...missionHistory].slice(0, 30);
            if (succeeded) reputation += updatedMission.reward;
            characterProgress = settleMissionRelationship(
              characterProgress,
              issuerCharacterId,
              succeeded,
              currentSession,
              updatedMission.kind === "character",
            );
            useToastStore.getState().push(
              succeeded
                ? updatedMission.kind === "character"
                  ? `💌 전용 의뢰 성공 · 평판 +${updatedMission.reward} · 신뢰 +8 · 호감 +6`
                  : `📋 의뢰 성공 · 평판 +${updatedMission.reward} · 신뢰 +5 · 호감 +4`
                : "📋 의뢰 완료 · 호감 +1 · 다음 회차에 다시 도전하세요",
              succeeded ? "success" : "info",
            );
            playSound(succeeded ? "cash" : "error");
          }
        }
        let storyDecision = state.storyDecision;
        let storyDecisionHistory = state.storyDecisionHistory;
        if (
          storyDecision?.status === "active" &&
          currentSession >= storyDecision.resolveSession
        ) {
          const storyArc = getStoryArcForWindow(storyDecision.windowStart);
          const resolvedDecision = resolveStoryDecision(
            storyDecision,
            storyArc,
            now,
          );
          storyDecision = resolvedDecision;
          if (!storyDecisionHistory.some((item) => item.id === resolvedDecision.id)) {
            storyDecisionHistory = [resolvedDecision, ...storyDecisionHistory].slice(0, 30);
            const delta = resolvedDecision.reputationDelta ?? 0;
            reputation = Math.max(0, reputation + delta);
            const offer = getStoryDecisionOffer(resolvedDecision.kind);
            useToastStore.getState().push(
              delta > 0
                ? `${offer.emoji} 사건 판단 보상 · 평판 +${delta}`
                : delta < 0
                  ? `${offer.emoji} 사건 판단 실패 · 평판 ${delta}`
                  : `${offer.emoji} 관망 종료 · 평판 변동 없음`,
              delta > 0 ? "success" : delta < 0 ? "error" : "info",
            );
            if (delta !== 0) playSound(delta > 0 ? "cash" : "error");
          }
        }
        const netWorthHistory = appendNetWorthPoint(
          state.netWorthHistory,
          netWorth,
          now,
        );
        const investmentMastery = updateInvestmentMastery(
          state.investmentMastery,
          {
            trades,
            cashPayments,
            missionHistory,
            holdings,
            stocks: combinedStocks,
            equity: netWorth,
            initialCash: state.initialCash,
            marginCallAt,
            currentSession,
          },
        );
        nextEvents = nextEvents.map(ensureEventDialogue);

        set({
          tick: nextTick,
          events: nextEvents,
          cash,
          netWorthHistory,
          // 주가 조정(배당락)은 리플레이가 절대 그리드로 이미 반영 —
          // settle의 주가 변형은 버리고 현금·회차 카운터만 반영한다 (시장 일원화)
          stocks: combinedStocks,
          holdings,
          shorts,
          options,
          marginCallAt,
          investmentMission,
          missionHistory,
          reputation,
          characterProgress,
          investmentMastery,
          storyDecision,
          storyDecisionHistory,
          trades,
          openOrders: remainingOrders,
          lastSalarySession: settled.lastSalarySession,
          lastMonthlyDistributionSession:
            settled.lastMonthlyDistributionSession,
          lastSingleCoveredCallDistributionSession:
            settled.lastSingleCoveredCallDistributionSession,
          lastQuarterlyDividendSession:
            settled.lastQuarterlyDividendSession,
          lastInterestSession,
          cashPayments,
        });

        get().checkAchievements();
      },

      settleCashflows: () => {
        const state = get();
        const now = Date.now();
        const currentSession = Math.floor(now / SESSION_DURATION_MS);
        const settled = settleLocalCashflows(state, currentSession, now);
        const baseCash = settled.changed ? settled.cash : state.cash;
        const baseCashPayments = settled.changed
          ? settled.cashPayments
          : state.cashPayments;
        const interest = settleInterest(
          { ...state, cash: baseCash, cashPayments: baseCashPayments },
          currentSession,
          now,
        );
        if (!settled.changed && !interest) return;
        set({
          cash: interest?.cash ?? baseCash,
          // 주가 조정은 결정론 리플레이 담당 — 현금·카운터만 반영
          lastSalarySession: settled.lastSalarySession,
          lastMonthlyDistributionSession:
            settled.lastMonthlyDistributionSession,
          lastSingleCoveredCallDistributionSession:
            settled.lastSingleCoveredCallDistributionSession,
          lastQuarterlyDividendSession:
            settled.lastQuarterlyDividendSession,
          cashPayments: interest?.cashPayments ?? baseCashPayments,
          lastInterestSession:
            interest?.lastInterestSession ?? state.lastInterestSession,
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

      acceptInvestmentMission: (kind) => {
        const state = get();
        const now = Date.now();
        const session = Math.floor(now / SESSION_DURATION_MS);
        if (state.investmentMission?.status === "active") {
          return { success: false, message: "이미 진행 중인 투자 의뢰가 있습니다." };
        }
        const equity = fullEquityOf(state);
        if (!Number.isFinite(equity) || equity <= 0) {
          return { success: false, message: "순자산이 0보다 커야 의뢰를 시작할 수 있습니다." };
        }
        const benchmark = getBenchmark(state.stocks);
        if (!benchmark) {
          return { success: false, message: "벤치마크 정보를 불러오지 못했습니다." };
        }
        const arc = getStoryArcAtSession(session);
        const relationship = getCharacterProgress(
          state.characterProgress,
          arc.character?.id,
        );
        if (kind === "character" && relationship.affinity < 50) {
          return {
            success: false,
            message: "이 캐릭터의 전용 의뢰는 호감도 50부터 열립니다.",
          };
        }
        set({
          investmentMission: createInvestmentMission(
            kind,
            session,
            equity,
            benchmark.currentPrice,
            now,
            {
              characterId: arc.character?.id,
              companyId: arc.company.id,
            },
          ),
        });
        return { success: true, message: "5거래일 투자 의뢰를 시작했습니다." };
      },

      chooseStoryDecision: (kind) => {
        const state = get();
        const now = Date.now();
        const session = Math.floor(now / SESSION_DURATION_MS);
        const arc = getStoryArcAtSession(session);
        if (session < arc.clueSession) {
          return { success: false, message: "단서가 공개된 뒤 판단할 수 있습니다." };
        }
        if (session >= arc.resolveSession) {
          return { success: false, message: "이미 결말이 공개된 사건입니다." };
        }
        if (state.storyDecision?.storyId === arc.id) {
          return { success: false, message: "이번 사건의 판단은 이미 확정했습니다." };
        }
        if (state.storyDecision?.status === "active") {
          return { success: false, message: "이전 사건 판단이 아직 정산되지 않았습니다." };
        }
        const progress = getCharacterProgress(
          state.characterProgress,
          arc.character?.id,
        );
        if (kind === "bond" && !canUseBondChoice(progress, arc.windowStart)) {
          return {
            success: false,
            message: "사건 시작 전부터 해당 캐릭터 호감도 100이 필요합니다.",
          };
        }
        const decision = createStoryDecision(arc, kind, now);
        const characterProgress =
          kind === "bullish"
            ? addStorySupportAffinity(
                state.characterProgress,
                arc.character?.id,
                session,
              )
            : state.characterProgress;
        set({ storyDecision: decision, characterProgress });
        const offer = getStoryDecisionOffer(kind);
        useToastStore
          .getState()
          .push(`${offer.emoji} 사건 판단 확정 · ${offer.title}`, "info");
        return { success: true, message: `${offer.title} 선택을 확정했습니다.` };
      },

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
        get().checkAchievements();
        return {
          success: true,
          message: `${item.emoji} ${item.name} 구매 완료`,
        };
      },

      getLuxuryValue: () => getLuxuryValue(get().ownedLuxuries),

      openShortPosition: (stockId, quantity) => {
        get().settleCashflows();
        const state = get();
        const stock = state.stocks.find((s) => s.id === stockId);
        if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
        if (
          stock.sector === "선물" ||
          stock.sector === "지수" ||
          isPumpStock(stock)
        ) {
          return {
            success: false,
            message: "지수·선물·급등주는 공매도할 수 없습니다.",
          };
        }
        const price = getMarketSellPrice(stock.currentPrice);
        if (price * quantity > fullBuyingPower(state)) {
          return { success: false, message: "증거금(매수여력)이 부족합니다." };
        }
        const result = openShort(
          state.cash,
          state.shorts,
          stockId,
          stock.ticker,
          price,
          quantity,
          Date.now(),
        );
        if (!isShortSuccess(result)) return result;
        set({
          cash: result.cash,
          shorts: result.shorts,
          trades: [result.trade, ...state.trades],
        });
        get().checkAchievements();
        return {
          success: true,
          message: `공매도 (${formatPrice(price)})`,
        };
      },

      coverShortPosition: (stockId, quantity) => {
        get().settleCashflows();
        const state = get();
        const stock = state.stocks.find((s) => s.id === stockId);
        if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
        const price = getMarketBuyPrice(stock.currentPrice);
        const result = coverShort(
          state.cash,
          state.shorts,
          stockId,
          stock.ticker,
          price,
          quantity,
          Date.now(),
        );
        if (!isShortSuccess(result)) return result;
        set({
          cash: result.cash,
          shorts: result.shorts,
          trades: [result.trade, ...state.trades],
        });
        return {
          success: true,
          message: `공매도 청산 (${formatPrice(price)})`,
        };
      },

      buyOption: (stockId, kind, strike, expirySession, quantity) => {
        get().settleCashflows();
        const state = get();
        const now = Date.now();
        if (quantity <= 0 || !Number.isInteger(quantity)) {
          return { success: false, message: "수량은 1 이상의 정수여야 합니다." };
        }
        const stock = state.stocks.find((s) => s.id === stockId);
        if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
        if (
          stock.sector === "선물" ||
          stock.sector === "지수" ||
          isPumpStock(stock)
        ) {
          return { success: false, message: "지수·선물·급등주는 옵션이 없습니다." };
        }
        const session = Math.floor(now / SESSION_DURATION_MS);
        if (expirySession <= session) {
          return { success: false, message: "이미 만기된 옵션입니다." };
        }
        const rate = currentRateDecimal(state.stocks);
        const premium = optionPremium(
          kind,
          strike,
          expirySession,
          stock,
          session,
          rate,
        );
        if (premium <= 0) {
          return { success: false, message: "프리미엄이 거의 없는 옵션입니다." };
        }
        const cost = premium * quantity;
        // 옵션 프리미엄은 현금으로만 결제한다. 평가자산과 프리미엄 지출이
        // 상쇄되는 구조에서 마진을 허용하면 롱 옵션을 무한히 살 수 있다.
        if (cost > Math.max(0, state.cash)) {
          return { success: false, message: "옵션 프리미엄을 낼 현금이 부족합니다." };
        }
        const id = `opt-${stockId}-${kind}-long-${strike}-${expirySession}`;
        const existing = state.options.find((o) => o.id === id);
        const options = existing
          ? state.options.map((o) =>
              o.id === id
                ? {
                    ...o,
                    quantity: o.quantity + quantity,
                    openPremium: Math.round(
                      (o.openPremium * o.quantity + premium * quantity) /
                        (o.quantity + quantity),
                    ),
                  }
                : o,
            )
          : [
              ...state.options,
              {
                id,
                stockId,
                kind,
                side: "long" as const,
                strike,
                expirySession,
                quantity,
                openPremium: premium,
                openedAt: now,
              },
            ];
        const trade: Trade = {
          id: `option-buy-${now}-${Math.random().toString(36).slice(2, 6)}`,
          stockId,
          ticker: stock.ticker,
          type: "option_buy",
          quantity,
          price: premium,
          total: cost,
          timestamp: now,
          optionId: id,
          optionKind: kind,
          optionSide: "long",
          strike,
          expirySession,
        };
        set({ cash: state.cash - cost, options, trades: [trade, ...state.trades] });
        get().checkAchievements();
        return {
          success: true,
          message: `${kind === "call" ? "콜" : "풋"} 매수 (${formatPrice(premium)})`,
        };
      },

      writeOption: (stockId, kind, strike, expirySession, quantity) => {
        get().settleCashflows();
        const state = get();
        const now = Date.now();
        if (quantity <= 0 || !Number.isInteger(quantity)) {
          return { success: false, message: "수량은 1 이상의 정수여야 합니다." };
        }
        const stock = state.stocks.find((s) => s.id === stockId);
        if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
        if (
          stock.sector === "선물" ||
          stock.sector === "지수" ||
          isPumpStock(stock)
        ) {
          return { success: false, message: "지수·선물·급등주는 옵션이 없습니다." };
        }
        const session = Math.floor(now / SESSION_DURATION_MS);
        if (expirySession <= session) {
          return { success: false, message: "이미 만기된 옵션입니다." };
        }
        const rate = currentRateDecimal(state.stocks);
        const premium = optionPremium(
          kind,
          strike,
          expirySession,
          stock,
          session,
          rate,
        );
        const id = `opt-${stockId}-${kind}-short-${strike}-${expirySession}`;
        const draft: OptionPosition = {
          id,
          stockId,
          kind,
          side: "short",
          strike,
          expirySession,
          quantity,
          openPremium: premium,
          openedAt: now,
        };
        const margin = shortMarginPerContract(draft, stock) * quantity;
        if (margin > fullBuyingPower(state)) {
          return { success: false, message: "증거금(매수여력)이 부족합니다." };
        }
        const existing = state.options.find((o) => o.id === id);
        const options = existing
          ? state.options.map((o) =>
              o.id === id
                ? {
                    ...o,
                    quantity: o.quantity + quantity,
                    openPremium: Math.round(
                      (o.openPremium * o.quantity + premium * quantity) /
                        (o.quantity + quantity),
                    ),
                  }
                : o,
            )
          : [...state.options, draft];
        const trade: Trade = {
          id: `option-write-${now}-${Math.random().toString(36).slice(2, 6)}`,
          stockId,
          ticker: stock.ticker,
          type: "option_write",
          quantity,
          price: premium,
          total: premium * quantity,
          timestamp: now,
          optionId: id,
          optionKind: kind,
          optionSide: "short",
          strike,
          expirySession,
        };
        set({
          cash: state.cash + premium * quantity,
          options,
          trades: [trade, ...state.trades],
        });
        get().checkAchievements();
        return {
          success: true,
          message: `${kind === "call" ? "콜" : "풋"} 발행 (+${formatPrice(premium)})`,
        };
      },

      closeOption: (optionId, quantity) => {
        get().settleCashflows();
        const state = get();
        const now = Date.now();
        const pos = state.options.find((o) => o.id === optionId);
        if (!pos) return { success: false, message: "옵션 포지션이 없습니다." };
        if (quantity <= 0 || quantity > pos.quantity) {
          return { success: false, message: "청산 수량이 올바르지 않습니다." };
        }
        const stock = state.stocks.find((s) => s.id === pos.stockId);
        if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
        const session = Math.floor(now / SESSION_DURATION_MS);
        const mark = positionMark(
          pos,
          stock,
          session,
          currentRateDecimal(state.stocks),
        );
        const remaining = pos.quantity - quantity;
        const options =
          remaining === 0
            ? state.options.filter((o) => o.id !== optionId)
            : state.options.map((o) =>
                o.id === optionId ? { ...o, quantity: remaining } : o,
              );
        // long 청산 = 되팔아 현금 유입, short 청산 = 되사서 현금 유출
        const delta =
          pos.side === "long" ? mark * quantity : -mark * quantity;
        const trade: Trade = {
          id: `option-close-${now}-${Math.random().toString(36).slice(2, 6)}`,
          stockId: pos.stockId,
          ticker: stock.ticker,
          type: "option_close",
          quantity,
          price: mark,
          total: mark * quantity,
          timestamp: now,
          optionId: pos.id,
          optionKind: pos.kind,
          optionSide: pos.side,
          strike: pos.strike,
          expirySession: pos.expirySession,
        };
        set({
          cash: state.cash + delta,
          options,
          trades: [trade, ...state.trades],
        });
        return {
          success: true,
          message: `옵션 청산 (${formatPrice(mark)})`,
        };
      },

      getBuyingPower: () => fullBuyingPower(get()),

      getEquity: () => fullEquityOf(get()),

      getRateLevel: () => getRateLevel(getBenchmark(get().stocks)),

      checkAchievements: () => {
        const s = get();
        const unlocked = new Set(s.achievements);
        const ctx = {
          netWorth: fullEquityOf(s),
          initialCash: s.initialCash,
          tradeCount: s.trades.length,
          hasShorted: s.trades.some((t) => t.type === "short"),
          hasOption: s.options.length > 0,
          hasPumpTraded: s.trades.some((t) => t.stockId.startsWith("pump-")),
          usedMargin: s.cash < 0,
          marginCalled: s.marginCallAt !== null,
          luxuryCount: s.ownedLuxuries.length,
          wonJackpot: s.wonJackpot,
        };
        const newly = ACHIEVEMENTS.filter(
          (a) => !unlocked.has(a.id) && a.check(ctx),
        );
        if (newly.length === 0) return;
        set({ achievements: [...s.achievements, ...newly.map((a) => a.id)] });
        for (const a of newly) {
          useToastStore
            .getState()
            .push(`🏆 업적 달성 · ${a.emoji} ${a.title}`, "success");
        }
        playSound("cash");
      },

      getLotteryTicketsLeft: () => {
        const s = get();
        const window = alignSessionToGrid(
          Math.floor(Date.now() / SESSION_DURATION_MS),
          LOTTERY_INTERVAL_DAYS,
        );
        const bought =
          s.lotteryWindowStart === window ? s.lotteryTicketsBought : 0;
        return Math.max(0, LOTTERY_MAX_PER_WINDOW - bought);
      },

      buyLottery: () => {
        const state = get();
        const now = Date.now();
        const window = alignSessionToGrid(
          Math.floor(now / SESSION_DURATION_MS),
          LOTTERY_INTERVAL_DAYS,
        );
        const bought =
          state.lotteryWindowStart === window ? state.lotteryTicketsBought : 0;
        if (bought >= LOTTERY_MAX_PER_WINDOW) {
          return {
            success: false,
            message: "이번 회차 복권을 모두 구매했습니다.",
          };
        }
        if (state.cash < LOTTERY_TICKET_PRICE) {
          return { success: false, message: "보유 현금이 부족합니다." };
        }
        const prize = drawLotteryPrize();
        const net = prize.amount - LOTTERY_TICKET_PRICE;
        const payment: CashPayment = {
          id: `lottery-${now}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "lottery",
          sourceId: "lottery",
          dueSession: Math.floor(now / SESSION_DURATION_MS),
          amount: net,
          timestamp: now,
        };
        set({
          cash: state.cash + net,
          lotteryWindowStart: window,
          lotteryTicketsBought: bought + 1,
          wonJackpot: state.wonJackpot || prize.tier === "jackpot",
          cashPayments: [payment, ...state.cashPayments].slice(0, 200),
        });
        useToastStore
          .getState()
          .push(
            prize.tier === "lose"
              ? "복권 꽝… 다음 기회에!"
              : `🎉 복권 당첨 · ${prize.label}`,
            prize.tier === "lose" ? "info" : "success",
          );
        playSound(prize.tier === "lose" ? "error" : "cash");
        get().checkAchievements();
        return { success: true, message: prize.label, prize };
      },

      reset: () => set(createInitialState()),

      getTotalAssets: () => fullEquityOf(get()),

      getStockById: (id) => get().stocks.find((s) => s.id === id),
    }),
    {
      name: "2dstock-market-local",
      partialize: (state) => ({
        tick: state.tick,
        marketVersion: state.marketVersion,
        marketStartedAt: state.marketStartedAt,
        cash: state.cash,
        initialCash: state.initialCash,
        lastSalarySession: state.lastSalarySession,
        lastMonthlyDistributionSession: state.lastMonthlyDistributionSession,
        lastSingleCoveredCallDistributionSession:
          state.lastSingleCoveredCallDistributionSession,
        lastQuarterlyDividendSession: state.lastQuarterlyDividendSession,
        holdings: state.holdings,
        shorts: state.shorts,
        options: state.options,
        lastInterestSession: state.lastInterestSession,
        trades: state.trades,
        openOrders: state.openOrders,
        cashPayments: state.cashPayments,
        ownedLuxuries: state.ownedLuxuries,
        netWorthHistory: state.netWorthHistory,
        achievements: state.achievements,
        lotteryWindowStart: state.lotteryWindowStart,
        lotteryTicketsBought: state.lotteryTicketsBought,
        wonJackpot: state.wonJackpot,
        investmentMission: state.investmentMission,
        missionHistory: state.missionHistory,
        reputation: state.reputation,
        characterProgress: state.characterProgress,
        readCharacterMessageIds: state.readCharacterMessageIds,
        investmentMastery: state.investmentMastery,
        storyDecision: state.storyDecision,
        storyDecisionHistory: state.storyDecisionHistory,
        // 자동 레버리지 상품은 기초종목에서 즉시 재구성한다. 커버드콜은 누적
        // 프리미엄이 있으므로 경량 차트와 함께 체크포인트를 보존한다.
        stocks: state.stocks
          .filter(
            (stock) =>
              (!stock.universalDerivative ||
                Boolean(stock.coveredCallUnderlyingId)) &&
              !isPumpStock(stock),
          )
          .map((stock) =>
            stock.universalDerivative && stock.coveredCallUnderlyingId
              ? {
                  ...stock,
                  priceHistory: stock.priceHistory.slice(-60),
                  candles: stock.candles.slice(-60),
                  dailyCandles: stock.dailyCandles.slice(-60),
                }
              : stock,
          ),
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
          merged.marketVersion === MARKET_SIM_VERSION &&
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
          marketVersion: MARKET_SIM_VERSION,
          marketStartedAt: MARKET_EPOCH_MS,
          tick: marketValid ? merged.tick : 0,
          stocks: restoredStocks,
          events:
            marketValid && Array.isArray(merged.events)
              ? merged.events.map(ensureEventDialogue)
              : [],
          lastSalarySession: Number.isSafeInteger(merged.lastSalarySession)
            ? merged.lastSalarySession
            : nowSession,
          lastMonthlyDistributionSession: alignSessionToGrid(
            Number.isSafeInteger(merged.lastMonthlyDistributionSession)
              ? merged.lastMonthlyDistributionSession
              : nowSession,
            COVERED_CALL_INTERVAL_DAYS,
          ),
          lastSingleCoveredCallDistributionSession: alignSessionToGrid(
            Number.isSafeInteger(
              merged.lastSingleCoveredCallDistributionSession,
            )
              ? merged.lastSingleCoveredCallDistributionSession
              : nowSession,
            SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
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
          shorts: Array.isArray((merged as Partial<MarketStore>).shorts)
            ? (merged as Partial<MarketStore>).shorts!
            : [],
          options: Array.isArray((merged as Partial<MarketStore>).options)
            ? (merged as Partial<MarketStore>).options!
            : [],
          lastInterestSession: Number.isSafeInteger(
            (merged as Partial<MarketStore>).lastInterestSession,
          )
            ? (merged as Partial<MarketStore>).lastInterestSession!
            : nowSession,
          marginCallAt: null,
          achievements: Array.isArray(
            (merged as Partial<MarketStore>).achievements,
          )
            ? (merged as Partial<MarketStore>).achievements!
            : [],
          lotteryWindowStart: Number.isSafeInteger(
            (merged as Partial<MarketStore>).lotteryWindowStart,
          )
            ? (merged as Partial<MarketStore>).lotteryWindowStart!
            : alignSessionToGrid(nowSession, LOTTERY_INTERVAL_DAYS),
          lotteryTicketsBought: Number.isSafeInteger(
            (merged as Partial<MarketStore>).lotteryTicketsBought,
          )
            ? (merged as Partial<MarketStore>).lotteryTicketsBought!
            : 0,
          wonJackpot: Boolean((merged as Partial<MarketStore>).wonJackpot),
          investmentMission:
            (merged as Partial<MarketStore>).investmentMission ?? null,
          missionHistory: Array.isArray(
            (merged as Partial<MarketStore>).missionHistory,
          )
            ? (merged as Partial<MarketStore>).missionHistory!
            : [],
          reputation: Number.isFinite(
            (merged as Partial<MarketStore>).reputation,
          )
            ? Math.max(0, (merged as Partial<MarketStore>).reputation ?? 0)
            : 0,
          characterProgress: normalizeCharacterProgressMap(
            (merged as Partial<MarketStore>).characterProgress,
          ),
          readCharacterMessageIds: Array.isArray(
            (merged as Partial<MarketStore>).readCharacterMessageIds,
          )
            ? (merged as Partial<MarketStore>).readCharacterMessageIds!.slice(0, 300)
            : [],
          investmentMastery: normalizeInvestmentMastery(
            (merged as Partial<MarketStore>).investmentMastery,
          ),
          storyDecision:
            (merged as Partial<MarketStore>).storyDecision ?? null,
          storyDecisionHistory: Array.isArray(
            (merged as Partial<MarketStore>).storyDecisionHistory,
          )
            ? (merged as Partial<MarketStore>).storyDecisionHistory!
            : [],
          userId: null,
          isReady: false,
        };
      },
    },
  ),
);

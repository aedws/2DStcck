import {
  MARKET_EPOCH_MS,
  SESSION_DURATION_MS,
  SIM_TICK_MS,
} from "@/lib/market/constants";
import { generateOrderBook } from "@/lib/market/orderBook";
import type { Candle, MarketEvent, StockState } from "@/lib/types/market";

export type PlayerCompanyMarketActionType =
  | "issue"
  | "buyback"
  | "retire"
  | "board"
  | "governance";

export interface PlayerCompanyMarketAction {
  id: string;
  sequence: number;
  stockId: string;
  ticker: string;
  actionType: PlayerCompanyMarketActionType;
  shares: number;
  totalSharesBefore: number;
  publicSharesBefore: number;
  totalSharesAfter: number;
  publicSharesAfter: number;
  priceFactor: number;
  priceCents: number;
  effectiveTick: number;
  createdAt: string;
  decisionType?: string;
  headline?: string;
  description?: string;
  reputationDelta?: number;
  earningsGrowthDelta?: number;
}

const MIN_ACTION_FACTOR = 0.85;
const MAX_ACTION_FACTOR = 1.15;

let marketActions: PlayerCompanyMarketAction[] = [];

function validAction(action: PlayerCompanyMarketAction): boolean {
  return (
    Boolean(action.id) &&
    Number.isSafeInteger(action.sequence) &&
    action.sequence > 0 &&
    Boolean(action.stockId) &&
    ["issue", "buyback", "retire", "board", "governance"].includes(
      action.actionType,
    ) &&
    Number.isFinite(action.priceFactor) &&
    action.priceFactor >= MIN_ACTION_FACTOR &&
    action.priceFactor <= MAX_ACTION_FACTOR &&
    Number.isSafeInteger(action.effectiveTick) &&
    action.effectiveTick >= 0
  );
}

/** 서버 원장을 결정론 재생 순서로 교체한다. */
export function setPlayerCompanyMarketActions(
  actions: PlayerCompanyMarketAction[],
): void {
  const bySequence = new Map<number, PlayerCompanyMarketAction>();
  for (const action of actions) {
    if (validAction(action)) bySequence.set(action.sequence, action);
  }
  marketActions = [...bySequence.values()].sort(
    (a, b) => a.effectiveTick - b.effectiveTick || a.sequence - b.sequence,
  );
}

export function getPlayerCompanyMarketActions(): PlayerCompanyMarketAction[] {
  return marketActions;
}

/** 서버 RPC와 같은 자본행동별 주가 계수. 한 번의 영향은 ±15%로 제한한다. */
export function playerCompanyMarketActionFactor(
  actionType: Extract<
    PlayerCompanyMarketActionType,
    "issue" | "buyback" | "retire"
  >,
  shares: number,
  totalSharesBefore: number,
): number {
  const count = Math.floor(shares);
  const total = Math.floor(totalSharesBefore);
  if (!(count > 0) || !(total > 0)) return 1;

  if (actionType === "issue") {
    return Math.max(MIN_ACTION_FACTOR, total / (total + count));
  }
  if (actionType === "buyback") {
    return Math.min(MAX_ACTION_FACTOR, 1 + count / total);
  }
  if (count >= total) return MAX_ACTION_FACTOR;
  return Math.min(MAX_ACTION_FACTOR, total / (total - count));
}

/** 이사회·주주총회 결과를 공통 뉴스 이벤트로 노출한다. */
export function getPlayerCompanyDecisionEventsForSession(
  session: number,
): MarketEvent[] {
  const sessionStartTick = Math.max(
    0,
    Math.floor(
      (session * SESSION_DURATION_MS - MARKET_EPOCH_MS) / SIM_TICK_MS,
    ),
  );
  const sessionEndTick =
    sessionStartTick + SESSION_DURATION_MS / SIM_TICK_MS;
  return marketActions
    .filter(
      (action) =>
        (action.actionType === "board" ||
          action.actionType === "governance") &&
        action.effectiveTick >= sessionStartTick &&
        action.effectiveTick < sessionEndTick,
    )
    .map((action) => ({
      id: `player-company-decision-${action.id}`,
      title:
        action.headline ??
        `${action.ticker} ${
          action.actionType === "board" ? "분기 경영 결과" : "주주총회 결과"
        }`,
      description:
        action.description ??
        "플레이어 회사의 공통 경영 결과가 실적과 시장가에 반영됐습니다.",
      affectedStockIds: [action.stockId],
      impact: action.priceFactor - 1,
      timestamp: MARKET_EPOCH_MS + action.effectiveTick * SIM_TICK_MS,
      category: "company",
      tag: action.actionType === "board" ? "분기 실적" : "주주총회",
    }));
}

function scaleCandleAfterAction(
  candle: Candle,
  factor: number,
  actionAt: number,
  intervalMs: number,
): Candle {
  const bucket = Math.floor(actionAt / intervalMs) * intervalMs;
  if (candle.timestamp < bucket) return candle;
  if (candle.timestamp > bucket) {
    return {
      ...candle,
      open: candle.open * factor,
      high: candle.high * factor,
      low: candle.low * factor,
      close: candle.close * factor,
    };
  }
  const close = candle.close * factor;
  return {
    ...candle,
    high: Math.max(candle.high, close),
    low: Math.min(candle.low, close),
    close,
  };
}

function applyAction(
  stock: StockState,
  action: PlayerCompanyMarketAction,
): StockState {
  const factor = action.priceFactor;
  const actionAt = MARKET_EPOCH_MS + action.effectiveTick * SIM_TICK_MS;
  const actionSession = Math.floor(actionAt / SESSION_DURATION_MS);
  const actionBeforeCurrentSession =
    stock.daySessionId !== undefined && actionSession < stock.daySessionId;
  const nextPrice = Math.max(100, Math.round(stock.currentPrice * factor));

  return {
    ...stock,
    currentPrice: nextPrice,
    prevDayClose: actionBeforeCurrentSession
      ? Math.max(100, Math.round(stock.prevDayClose * factor))
      : stock.prevDayClose,
    dayOpen: actionBeforeCurrentSession
      ? Math.max(100, Math.round(stock.dayOpen * factor))
      : stock.dayOpen,
    priceHistory: stock.priceHistory.map((point) =>
      point.timestamp >= actionAt
        ? { ...point, price: point.price * factor }
        : point,
    ),
    candles: stock.candles.map((candle) =>
      scaleCandleAfterAction(candle, factor, actionAt, 30_000),
    ),
    dailyCandles: stock.dailyCandles.map((candle) =>
      scaleCandleAfterAction(
        candle,
        factor,
        actionAt,
        SESSION_DURATION_MS,
      ),
    ),
    orderBook: generateOrderBook(nextPrice, stock.orderBook),
    lastPlayerCompanyActionSequence: action.sequence,
  };
}

/**
 * 목표 틱까지 도래한 미적용 기업행동을 순서대로 한 번씩 반영한다.
 * 체크포인트가 기업행동 이후에 생성됐더라도 sequence 커서가 없으면 서버 원장을
 * 기준으로 따라잡고, 이미 반영한 로컬/워커 상태에서는 중복 적용하지 않는다.
 */
export function applyDuePlayerCompanyMarketActions(
  stock: StockState,
  targetTick: number,
): StockState {
  let next = stock;
  let cursor = stock.lastPlayerCompanyActionSequence ?? 0;
  for (const action of marketActions) {
    if (action.sequence <= cursor) continue;
    if (action.effectiveTick > targetTick) break;
    if (action.stockId !== stock.id) continue;
    next = applyAction(next, action);
    cursor = action.sequence;
  }
  return next;
}

import assert from "node:assert/strict";
import { getLuxuryValue, LUXURY_ACCOUNTING_RATE } from "../src/lib/market/luxury";
import {
  createInvestmentMission,
  missionWindowStart,
  updateInvestmentMission,
} from "../src/lib/market/missions";
import {
  createStoryDecision,
  getStoryArcForWindow,
  getStoryEventForSession,
  resolveStoryDecision,
} from "../src/lib/market/storyArcs";
import {
  optionsGrossExposure,
  positionMark,
} from "../src/lib/market/options";
import { computeRealizedPnl } from "../src/lib/market/portfolioStats";
import type { OptionPosition, StockState, Trade } from "../src/lib/types/market";

const session = Math.floor(Date.now() / (3 * 60 * 60 * 1000));
const windowStart = missionWindowStart(session);

const arcA = getStoryArcForWindow(windowStart);
const arcB = getStoryArcForWindow(windowStart);
assert.deepEqual(arcA, arcB, "story arc must be deterministic");
assert.equal(getStoryEventForSession(windowStart)?.storyStage, "rumor");
assert.equal(getStoryEventForSession(windowStart + 2)?.storyStage, "clue");
assert.equal(getStoryEventForSession(windowStart + 4)?.storyStage, "resolution");
assert.equal(getStoryEventForSession(windowStart + 1), null);
assert.ok(arcA.confidence >= 48 && arcA.confidence <= 86);

const positiveArc = { ...arcA, positive: true, cluePositive: true };
const bullishDecision = createStoryDecision(positiveArc, "bullish", 1);
assert.equal(
  resolveStoryDecision(bullishDecision, positiveArc, 2).reputationDelta,
  80,
);
const bearishDecision = createStoryDecision(positiveArc, "bearish", 1);
assert.equal(
  resolveStoryDecision(bearishDecision, positiveArc, 2).reputationDelta,
  -25,
);
const misleadingArc = { ...arcA, positive: true, cluePositive: false };
const observeDecision = createStoryDecision(misleadingArc, "observe", 1);
assert.equal(
  resolveStoryDecision(observeDecision, misleadingArc, 2).reputationDelta,
  30,
  "observing a misleading clue should earn the discipline reward",
);

const growth = createInvestmentMission("growth", windowStart, 10_000_000, 100_000, 1);
assert.equal(
  updateInvestmentMission(growth, growth.endSession - 1, 10_400_000, 101_000, 2).status,
  "active",
);
assert.equal(
  updateInvestmentMission(growth, growth.endSession, 10_300_000, 101_000, 3).status,
  "completed",
);
const risk = createInvestmentMission("risk", windowStart, 10_000_000, 100_000, 1);
const dipped = updateInvestmentMission(risk, risk.endSession - 1, 9_400_000, 100_000, 2);
assert.equal(
  updateInvestmentMission(dipped, risk.endSession, 10_100_000, 100_000, 3).status,
  "failed",
  "risk mission must remember intra-window drawdown",
);

assert.equal(
  getLuxuryValue([{ id: "watch", purchasedAt: 1, paidPrice: 1_000_000 }]),
  Math.round(1_000_000 * LUXURY_ACCOUNTING_RATE),
);

const stock: StockState = {
  id: "test",
  ticker: "TEST",
  name: "Test",
  sector: "기술",
  initialPrice: 10_000,
  currentPrice: 10_000,
  volatility: 0.03,
  drift: 0,
  prevDayClose: 10_000,
  dayOpen: 10_000,
  priceHistory: [],
  candles: [],
  dailyCandles: [],
  orderBook: { bids: [], asks: [] },
};
const option: OptionPosition = {
  id: "opt-test-call-long-10000",
  stockId: "test",
  kind: "call",
  side: "long",
  strike: 10_000,
  expirySession: session + 10,
  quantity: 3,
  openPremium: 100,
  openedAt: 1,
};
const mark = positionMark(option, stock, session, 0.06);
assert.equal(optionsGrossExposure([option], [stock], session, 0.06), mark * 3);

const chronologicalTrades: Trade[] = [
  { id: "1", stockId: "a", ticker: "A", type: "buy", quantity: 1, price: 100, total: 100, timestamp: 1 },
  { id: "2", stockId: "a", ticker: "A", type: "sell", quantity: 1, price: 120, total: 120, timestamp: 2 },
  { id: "3", stockId: "b", ticker: "B", type: "short", quantity: 1, price: 200, total: 200, timestamp: 3 },
  { id: "4", stockId: "b", ticker: "B", type: "cover", quantity: 1, price: 150, total: 150, timestamp: 4 },
  { id: "5", stockId: "c", ticker: "C", type: "option_buy", quantity: 1, price: 10, total: 10, timestamp: 5, optionId: "long", optionSide: "long" },
  { id: "6", stockId: "c", ticker: "C", type: "option_close", quantity: 1, price: 30, total: 30, timestamp: 6, optionId: "long", optionSide: "long" },
  { id: "7", stockId: "d", ticker: "D", type: "option_write", quantity: 1, price: 40, total: 40, timestamp: 7, optionId: "short", optionSide: "short" },
  { id: "8", stockId: "d", ticker: "D", type: "option_expire", quantity: 1, price: 10, total: 10, timestamp: 8, optionId: "short", optionSide: "short" },
];
const trades: Trade[] = [...chronologicalTrades].reverse(); // 실제 저장 순서(최신순)
assert.equal(computeRealizedPnl(trades), 120);

console.log("gameplay balance and progression scenarios passed");

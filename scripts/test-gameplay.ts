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
import { buildDailyScorecard } from "../src/lib/market/dailyScorecard";
import { SESSION_DURATION_MS } from "../src/lib/market/constants";
import {
  getMarketRegimeAtSession,
  marketRegimeWindowStart,
  regimeReturnForStock,
} from "../src/lib/market/marketRegimes";
import { pickEventQuote } from "../src/data/eventQuotes";
import {
  computeCoveredCallTick,
  createInitialStockState,
  resolveEventTemplate,
  stockCategory,
} from "../src/lib/market/engine";
import { getCompanyDefinitions, STOCK_DEFINITIONS } from "../src/data/stocks";
import { getCharacterRelation } from "../src/lib/market/characterRelations";
import { settleLocalCashflows } from "../src/lib/market/cashflows";
import type { Character, EventTemplate, OptionPosition, StockState, Trade } from "../src/lib/types/market";

const session = Math.floor(Date.now() / SESSION_DURATION_MS);
const windowStart = missionWindowStart(session);

const singleCoveredCall = STOCK_DEFINITIONS.find(
  (stock) => stock.id === "baridc-covered-call",
);
assert.ok(singleCoveredCall, "single-stock covered call should be generated");
assert.equal(singleCoveredCall.coveredCallUnderlyingId, "baridc");
assert.equal(singleCoveredCall.coveredCallUpsideCapture, 0.7);
assert.equal(singleCoveredCall.coveredCallDistributionIntervalDays, 5);
assert.ok(
  (singleCoveredCall.coveredCallAnnualYield ?? 0) >= 30 &&
    (singleCoveredCall.coveredCallAnnualYield ?? 0) <= 45,
);
assert.equal(stockCategory(singleCoveredCall), "커버드콜");
const allSingleCoveredCalls = STOCK_DEFINITIONS.filter(
  (stock) => stock.coveredCallDistributionIntervalDays === 5,
);
assert.equal(allSingleCoveredCalls.length, getCompanyDefinitions().length);
assert.ok(
  allSingleCoveredCalls.every(
    (stock) =>
      (stock.coveredCallAnnualYield ?? 0) >= 30 &&
      (stock.coveredCallAnnualYield ?? 0) <= 45,
  ),
);

const coveredCallState: StockState = {
  ...singleCoveredCall,
  currentPrice: 10_000,
  prevDayClose: 10_000,
  dayOpen: 10_000,
  priceHistory: [],
  candles: [],
  dailyCandles: [],
  orderBook: { bids: [], asks: [] },
  coveredCallAnnualYield: 0,
};
assert.equal(computeCoveredCallTick(coveredCallState, 0.1, 1).price, 10_700);
assert.equal(computeCoveredCallTick(coveredCallState, -0.1, 1).price, 9_300);

const directHolding = [{ stockId: "baridc", quantity: 1, averagePrice: 100 }];
const coveredHolding = [{ stockId: "baridc-covered-call", quantity: 1, averagePrice: 100 }];
const hostileHolding = [{ stockId: "baridc-inverse", quantity: 1, averagePrice: 100 }];
const leveragedHolding = [{ stockId: "baridc-leverage-2x", quantity: 1, averagePrice: 100 }];
assert.equal(getCharacterRelation("baridc", directHolding).status, "direct");
assert.equal(getCharacterRelation("baridc", coveredHolding).status, "covered-call");
assert.equal(getCharacterRelation("baridc", hostileHolding).unlocked, false);
assert.equal(getCharacterRelation("baridc", hostileHolding).status, "hostile");
assert.equal(
  getCharacterRelation("baridc", [...hostileHolding, ...leveragedHolding]).status,
  "leverage",
  "leverage relationship should override hostile holdings",
);

const indexCoveredCall = STOCK_DEFINITIONS.find((stock) => stock.id === "vncc");
assert.ok(indexCoveredCall);
const cashflowSettlement = settleLocalCashflows(
  {
    cash: 0,
    lastSalarySession: 120,
    lastMonthlyDistributionSession: 100,
    lastSingleCoveredCallDistributionSession: 115,
    lastQuarterlyDividendSession: 120,
    holdings: [
      { stockId: indexCoveredCall.id, quantity: 1, averagePrice: 10_000 },
      { stockId: singleCoveredCall.id, quantity: 1, averagePrice: 10_000 },
    ],
    stocks: [
      createInitialStockState(indexCoveredCall, 120 * SESSION_DURATION_MS),
      createInitialStockState(singleCoveredCall, 120 * SESSION_DURATION_MS),
    ],
    cashPayments: [],
  },
  120,
  120 * SESSION_DURATION_MS,
);
assert.equal(cashflowSettlement.lastMonthlyDistributionSession, 120);
assert.equal(cashflowSettlement.lastSingleCoveredCallDistributionSession, 120);
assert.deepEqual(
  new Set(cashflowSettlement.cashPayments.map((payment) => payment.sourceId)),
  new Set(["vncc", "baridc-covered-call"]),
);

const quoteCharacter: Character = {
  id: "quote-test",
  name: "테스트 대표",
  title: "CEO",
  traits: [],
  bio: "",
  emoji: "🧪",
};
const positiveEarningsQuote = pickEventQuote("실적", quoteCharacter, () => 0, 0.055);
const negativeEarningsQuote = pickEventQuote("실적", quoteCharacter, () => 0, -0.06);
assert.match(positiveEarningsQuote.quote, /숫자/);
assert.match(negativeEarningsQuote.quote, /미치지 못했습니다/);
assert.notEqual(positiveEarningsQuote.quote, negativeEarningsQuote.quote);
const negativeEarningsTemplate: EventTemplate = {
  category: "company",
  tag: "실적",
  title: "{company} 실적 쇼크",
  description: "{company} 실적이 기대를 밑돌았습니다.",
  impact: -0.06,
  requiresCeo: true,
};
assert.match(
  resolveEventTemplate(negativeEarningsTemplate, 1, () => 0)?.quote ?? "",
  /미치지 못했습니다/,
);

const regimeWindow = marketRegimeWindowStart(session);
const regime = getMarketRegimeAtSession(regimeWindow);
assert.deepEqual(regime, getMarketRegimeAtSession(regimeWindow + 4));
assert.notEqual(regime.id, getMarketRegimeAtSession(regimeWindow + 5).id);
assert.equal(
  Math.sign(regimeReturnForStock(regime, "채권", 10)),
  -Math.sign(regimeReturnForStock(regime, "기술", 10)),
  "bonds should react opposite to directional market regimes",
);

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

const reportSession = 123;
const reportStart = reportSession * SESSION_DURATION_MS;
const scorecardTrades: Trade[] = [
  { id: "score-4", stockId: "b", ticker: "B", type: "cover", quantity: 1, price: 150, total: 150, timestamp: reportStart + 4 },
  { id: "score-3", stockId: "b", ticker: "B", type: "short", quantity: 1, price: 200, total: 200, timestamp: reportStart + 3 },
  { id: "score-2", stockId: "a", ticker: "A", type: "sell", quantity: 1, price: 130, total: 130, timestamp: reportStart + 2 },
  { id: "score-1", stockId: "a", ticker: "A", type: "buy", quantity: 1, price: 100, total: 100, timestamp: reportStart + 1 },
];
const scorecard = buildDailyScorecard(scorecardTrades, reportSession, 10_000, null);
assert.equal(scorecard.realizedPnl, 80);
assert.equal(scorecard.tradeCount, 4);
assert.equal(scorecard.closeCount, 2);
assert.equal(scorecard.winRate, 1);
assert.equal(scorecard.bestTrade?.ticker, "B");
assert.equal(scorecard.bestTrade?.pnl, 50);
assert.equal(scorecard.grade, "A");

const marginCallScorecard = buildDailyScorecard(
  scorecardTrades,
  reportSession,
  10_000,
  reportStart + 5,
);
assert.equal(marginCallScorecard.marginCalled, true);
assert.ok(marginCallScorecard.score < scorecard.score);

console.log("gameplay balance and progression scenarios passed");

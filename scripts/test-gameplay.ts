import assert from "node:assert/strict";
import { getLuxuryValue, LUXURY_ACCOUNTING_RATE } from "../src/lib/market/luxury";
import {
  INVESTMENT_MISSION_OFFERS,
  createInvestmentMission,
  getAvailableInvestmentMissionOffers,
  missionWindowStart,
  resolveMissionIssuer,
  updateInvestmentMission,
} from "../src/lib/market/missions";
import { computeCharacterConcentration } from "../src/lib/market/characterConcentration";
import {
  createDailyOperation,
  getDailyOperationOffers,
  updateDailyOperation,
} from "../src/lib/market/dailyOperations";
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
import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "../src/lib/market/constants";
import {
  computeBuyingPower,
  maintenanceMarginForLeverage,
  needsLiquidation,
} from "../src/lib/market/margin";
import {
  executeBuy,
  executeSell,
  isOrderSuccess,
} from "../src/lib/market/trading";
import { processRecurringInvestments } from "../src/lib/market/recurringInvestments";
import { buildSeasonMarketReview } from "../src/lib/market/seasonMarketReview";
import {
  getMarketRegimeAtSession,
  marketRegimeWindowStart,
  regimeReturnForStock,
} from "../src/lib/market/marketRegimes";
import { pickEventQuote, withCharacterQuote } from "../src/data/eventQuotes";
import {
  computeCoveredCallTick,
  calculateTickPrice,
  createInitialStockState,
  marketBetaForStock,
  randomNormal,
  resolveEventTemplate,
  seededRand,
  smoothedNormalAtTick,
  stockCategory,
} from "../src/lib/market/engine";
import {
  relativeStrengthIndex,
  simpleMovingAverage,
} from "../src/lib/market/chartIndicators";
import {
  attendanceReward,
  buildTradingStats,
  claimAttendanceState,
} from "../src/lib/player/playerProfile";
import { getCompanyDefinitions, STOCK_DEFINITIONS } from "../src/data/stocks";
import { getCharacterRelation } from "../src/lib/market/characterRelations";
import { createGenesisStocks } from "../src/lib/market/localSim";
import { settleLocalCashflows } from "../src/lib/market/cashflows";
import {
  expectedCycleReturn,
  getMarketCycleAtSession,
  MARKET_CYCLE_PHASES,
  MARKET_CYCLE_SESSIONS,
} from "../src/lib/market/marketCycles";
import {
  CRISIS_MAX_INTERVAL_SESSIONS,
  CRISIS_MIN_INTERVAL_SESSIONS,
  crisisIntervalSessions,
  crisisReturnForStock,
  getActiveMarketCrisis,
  getCrisisEventsForSession,
  getMarketCrisisWindow,
  getNextMarketCrisis,
  MARKET_CRISIS_DURATION_SESSIONS,
  MARKET_CRISIS_PHASES,
} from "../src/lib/market/marketCrises";
import {
  accrueLongHoldingAffinity,
  addCharacterProgress,
  addStorySupportAffinity,
  canUseBondChoice,
  getCharacterProgress,
  resolveEtfCharacterExposures,
  resolveEtfCharacterIds,
  resolveSingleCharacterLongEtfId,
  settleMissionRelationship,
} from "../src/lib/market/characterProgress";
import {
  buildEarningsEvent,
  EARNINGS_INTERVAL_SESSIONS,
  getEarningsCalendar,
  isEarningsSession,
} from "../src/lib/market/earningsCalendar";
import { getCharacterMessages } from "../src/lib/market/characterMessages";
import {
  corporateActionWindowStart,
  getCorporateActionArcForWindow,
  getCorporateActionEventForSession,
} from "../src/lib/market/corporateActions";
import {
  PUMP_LIFETIME_SESSIONS,
  PUMP_MIN_LIFETIME_SESSIONS,
  PUMP_PATTERN_IDS,
  delistedPumpFinalPrice,
  getActivePumpStocks,
  pumpDelistAt,
  pumpFinalPrice,
  pumpAdversarialMultiplierAt,
  pumpPatternMultiplierAt,
  pumpPriceAt,
  pumpSpawnAt,
  replaceActivePumpStocks,
} from "../src/lib/market/pumpStocks";
import {
  createInitialMastery,
  masteryLevel,
  updateInvestmentMastery,
} from "../src/lib/market/investmentMastery";
import {
  INVESTMENT_SEASON_SESSIONS,
  calculateSeasonGoalAllocation,
  calculateSeasonTraitScore,
  createInitialInvestmentSeasonState,
  getSeasonRivalPerformance,
  getSeasonTraitCandidates,
  markSeasonCeremonySeen,
  normalizeInvestmentSeasonState,
  selectSeasonGoal,
  selectSeasonTrait,
  seasonTierForAlpha,
  updateInvestmentSeason,
} from "../src/lib/market/investmentSeasons";
import { MARKET_ERA_START_SESSION } from "../src/lib/market/marketEras";
import type { Character, EventTemplate, OptionPosition, StockState, Trade } from "../src/lib/types/market";
import {
  PORTFOLIO_STRATEGIES,
  backtestPortfolioStrategy,
} from "../src/lib/market/portfolioStrategies";
import { runCrisisStressTest } from "../src/lib/market/stressTest";
import {
  mergeSeasonRewards,
  normalizeSelectedSeasonFrame,
} from "../src/lib/player/seasonRewards";

// 시즌은 국면 그리드 경계에서 시작해야 정식(무순위 아님) 시즌이 된다.
// 시나리오가 정식 시즌 완료를 검증하므로 세션을 그리드 경계로 정렬한다.
const rawSession = Math.floor(Date.now() / SESSION_DURATION_MS);
const session =
  rawSession -
  ((((rawSession - MARKET_ERA_START_SESSION) % INVESTMENT_SEASON_SESSIONS) +
    INVESTMENT_SEASON_SESSIONS) %
    INVESTMENT_SEASON_SESSIONS);
const windowStart = missionWindowStart(session);

const attendanceDayOne = Date.UTC(2026, 6, 13, 15, 30);
const firstAttendance = claimAttendanceState(
  { streak: 0, totalDays: 0 },
  attendanceDayOne,
)!;
assert.equal(firstAttendance.state.streak, 1);
assert.equal(firstAttendance.reward, attendanceReward(1));
assert.equal(
  claimAttendanceState(firstAttendance.state, attendanceDayOne + 60_000),
  null,
  "attendance can only be claimed once per Korea calendar day",
);
const secondAttendance = claimAttendanceState(
  firstAttendance.state,
  attendanceDayOne + 24 * 60 * 60 * 1_000,
)!;
assert.equal(secondAttendance.state.streak, 2);

const indicatorCandles = Array.from({ length: 20 }, (_, index) => ({
  timestamp: index * 30_000,
  open: 100 + index,
  high: 101 + index,
  low: 99 + index,
  close: 100 + index,
}));
assert.equal(simpleMovingAverage(indicatorCandles, 5).at(-1)?.value, 117);
assert.equal(relativeStrengthIndex(indicatorCandles, 14).at(-1)?.value, 100);
assert.equal(
  smoothedNormalAtTick(1234, "test"),
  smoothedNormalAtTick(1234, "test"),
  "smoothed market noise must remain deterministic",
);
assert.ok(Number.isFinite(smoothedNormalAtTick(1235, "test")));

const tradingStats = buildTradingStats([
  { id: "close", stockId: "test", ticker: "TEST", type: "sell", quantity: 1, price: 120, total: 120, timestamp: 2 },
  { id: "open", stockId: "test", ticker: "TEST", type: "buy", quantity: 1, price: 100, total: 100, timestamp: 1 },
]);
assert.equal(tradingStats.tradeCount, 2);
assert.equal(tradingStats.winRate, 100);
assert.equal(tradingStats.realizedPnl, 20);

let pumpSession = -1;
const pumpSpecs = [];
for (let candidate = 1; candidate < 2_000; candidate++) {
  assert.ok(
    getActivePumpStocks(candidate * SESSION_DURATION_MS + SESSION_DURATION_MS / 2).length <= 1,
    "only one pump stock may be active at any time",
  );
  const spec = pumpSpawnAt(candidate);
  if (spec) {
    pumpSpecs.push(spec);
    if (pumpSession < 0) pumpSession = candidate;
  }
}
assert.ok(pumpSession > 0, "deterministic pump schedule should contain a spawn");
assert.ok(pumpSpecs.length > 10, "pump schedule should contain enough samples");
assert.ok(
  pumpSpecs.every(
    (spec) =>
      spec.lifetimeSessions >= PUMP_MIN_LIFETIME_SESSIONS &&
      spec.lifetimeSessions <= PUMP_LIFETIME_SESSIONS,
  ),
  "every pump must delist inside the advertised two-session window",
);
assert.ok(
  new Set(pumpSpecs.map((spec) => spec.lifetimeSessions.toFixed(3))).size > 1,
  "pump delisting times must vary by listing",
);
assert.ok(
  pumpSpecs.some((spec) => spec.lifetimeSessions < 1) &&
    pumpSpecs.some((spec) => spec.lifetimeSessions >= 1),
  "pump schedule must include both first-day rug pulls and later delistings",
);
assert.deepEqual(
  new Set(pumpSpecs.map((spec) => spec.pattern)),
  new Set(PUMP_PATTERN_IDS),
  "deterministic pump schedule must use every trap pattern",
);
const rugRebirth = pumpSpecs.find((spec) => spec.pattern === "rug-rebirth")!;
const rugPeak = pumpPatternMultiplierAt(rugRebirth, 0.16);
const rugLow = pumpPatternMultiplierAt(rugRebirth, 0.172);
const rugRebound = pumpPatternMultiplierAt(rugRebirth, 0.23);
assert.ok(rugLow <= rugPeak * 0.011, "rug-rebirth must contain a roughly 99% crash");
assert.ok(
  rugRebound / rugLow >= 11,
  "rug-rebirth must rebound at least 1,000% from the crash low",
);
for (const pattern of PUMP_PATTERN_IDS) {
  const representative = pumpSpecs.find((spec) => spec.pattern === pattern)!;
  const path = Array.from({ length: 1001 }, (_, index) =>
    pumpPatternMultiplierAt(representative, index / 1000),
  );
  let runningHigh = path[0];
  let worstDrawdown = 0;
  for (const value of path) {
    runningHigh = Math.max(runningHigh, value);
    worstDrawdown = Math.max(worstDrawdown, 1 - value / runningHigh);
  }
  assert.ok(worstDrawdown >= 0.7, `${pattern} must contain a margin-threatening crash`);
}
const proceduralSignatures = new Map<string, Set<string>>();
let breakoutTrades = 0;
let breakoutWins = 0;
let plateauSamples = 0;
let plateauFollowedByHigherHigh = 0;
for (const spec of pumpSpecs) {
  const lifetimeProgress = spec.lifetimeSessions / PUMP_LIFETIME_SESSIONS;
  const path = Array.from({ length: 1201 }, (_, index) =>
    pumpAdversarialMultiplierAt(spec, (lifetimeProgress * index) / 1200),
  );
  const signatures = proceduralSignatures.get(spec.pattern) ?? new Set<string>();
  signatures.add(
    path
      .filter((_, index) => index % 100 === 0)
      .map((value) => value.toFixed(2))
      .join(":"),
  );
  proceduralSignatures.set(spec.pattern, signatures);

  let runningHigh = path[0];
  let breakoutEntry = -1;
  for (let index = 1; index < path.length; index++) {
    runningHigh = Math.max(runningHigh, path[index]);
    if (path[index] >= 2 && path[index] >= runningHigh * 0.995) {
      breakoutEntry = index;
      break;
    }
  }
  if (breakoutEntry > 0) {
    breakoutTrades += 1;
    let exit = path.at(-1)!;
    for (let index = breakoutEntry + 1; index < path.length; index++) {
      if (
        path[index] >= path[breakoutEntry] * 1.3 ||
        path[index] <= path[breakoutEntry] * 0.8
      ) {
        exit = path[index];
        break;
      }
    }
    if (exit > path[breakoutEntry]) breakoutWins += 1;
  }

  for (let index = 40; index < path.length; index++) {
    const window = path.slice(index - 10, index + 1);
    const average = window.reduce((sum, value) => sum + value, 0) / window.length;
    if (
      average > 1.2 &&
      (Math.max(...window) - Math.min(...window)) / average < 0.03
    ) {
      plateauSamples += 1;
      if (Math.max(...path.slice(index + 1)) > path[index] * 1.3) {
        plateauFollowedByHigherHigh += 1;
      }
      break;
    }
  }
}
assert.ok(
  [...proceduralSignatures.values()].every((signatures) => signatures.size >= 10),
  "each base pattern must produce many non-memorizable procedural variants",
);
assert.ok(breakoutTrades > 100, "difficulty simulation needs enough breakout trades");
assert.ok(
  breakoutWins / breakoutTrades < 0.5,
  "naive breakout chasing must lose more often than it wins",
);
assert.ok(plateauSamples > 100, "difficulty simulation needs enough plateau samples");
assert.ok(
  plateauFollowedByHigherHigh / plateauSamples >= 0.8,
  "the first consolidation must usually be a bait before another high",
);
const liquidationCascade = pumpSpecs.find(
  (spec) => spec.pattern === "liquidation-cascade",
)!;
const cascadeStart = liquidationCascade.spawnSession * SESSION_DURATION_MS;
const cascadeLife = PUMP_LIFETIME_SESSIONS * SESSION_DURATION_MS;
const cascadeHigh = pumpPriceAt(liquidationCascade, cascadeStart + cascadeLife * 0.1);
const cascadeLow = pumpPriceAt(liquidationCascade, cascadeStart + cascadeLife * 0.115);
const marginEquity = 1_000_000;
const marginExposure = marginEquity * 5;
const marginQuantity = marginExposure / cascadeHigh;
assert.ok(cascadeLow < cascadeHigh * 0.25, "liquidation cascade must plunge vertically");
assert.equal(
  needsLiquidation(
    marginEquity - marginExposure,
    [{
      stockId: liquidationCascade.id,
      quantity: marginQuantity,
      averagePrice: cascadeHigh,
    }],
    [],
    { [liquidationCascade.id]: cascadeLow },
    0,
    maintenanceMarginForLeverage(5),
  ),
  true,
  "a 500% margin pump position must be liquidated by the flash crash",
);
const pumpNow = pumpSession * SESSION_DURATION_MS + SESSION_DURATION_MS / 2;
const activePump = getActivePumpStocks(pumpNow);
assert.equal(activePump.length, 1);
assert.equal(
  replaceActivePumpStocks([...activePump, ...activePump], pumpNow).length,
  1,
  "replacing active pump stocks must remove duplicate persisted copies",
);
const firstPumpSpec = pumpSpecs[0];
const firstPumpDelistAt = pumpDelistAt(firstPumpSpec);
assert.ok(
  getActivePumpStocks(firstPumpDelistAt - 1).some((stock) => stock.id === firstPumpSpec.id),
  "pump must remain tradable until its hidden delisting time",
);
assert.ok(
  !getActivePumpStocks(firstPumpDelistAt).some((stock) => stock.id === firstPumpSpec.id),
  "pump must disappear exactly at its hidden delisting time",
);
assert.equal(
  delistedPumpFinalPrice(firstPumpSpec.id, firstPumpDelistAt - 1),
  null,
  "pump holdings must not settle before delisting",
);
assert.equal(
  delistedPumpFinalPrice(firstPumpSpec.id, firstPumpDelistAt),
  pumpFinalPrice(firstPumpSpec),
  "pump holdings must settle at the crash price when delisted",
);

assert.equal(seasonTierForAlpha(-0.051).id, "bronze");
assert.equal(seasonTierForAlpha(-0.05).id, "silver");
assert.equal(seasonTierForAlpha(-0.02).id, "gold");
assert.equal(seasonTierForAlpha(0).id, "platinum");
assert.equal(seasonTierForAlpha(0.02).id, "diamond");
assert.equal(seasonTierForAlpha(0.05).id, "master");
const seasonStarted = updateInvestmentSeason(
  createInitialInvestmentSeasonState(),
  { currentSession: session, equity: 1_000_000, benchmarkPrice: 10_000 },
);
assert.ok(seasonStarted.state.current);
assert.equal(seasonStarted.state.current?.number, 2);
const resetLegacySeason = normalizeInvestmentSeasonState({
  current: {
    ...seasonStarted.state.current!,
    number: 1,
    startEquity: 99_999_999,
  },
  history: [],
  seenCeremonyIds: [],
});
assert.equal(resetLegacySeason.current, null);
assert.equal(resetLegacySeason.history.length, 0);
const seasonTraitCandidates = getSeasonTraitCandidates(seasonStarted.state.current!);
const firstSeasonTrait = seasonTraitCandidates[0];
const traitSelected = selectSeasonTrait(
  seasonStarted.state,
  firstSeasonTrait.id,
  session,
);
assert.equal(traitSelected?.current?.traitId, firstSeasonTrait.id);
assert.equal(
  selectSeasonTrait(traitSelected!, seasonTraitCandidates[1].id, session),
  null,
  "a season trait can only be selected once",
);
const traitSeasonCompleted = updateInvestmentSeason(traitSelected!, {
  currentSession: session + INVESTMENT_SEASON_SESSIONS,
  equity: 1_030_000,
  benchmarkPrice: 10_000,
});
assert.ok(Number.isFinite(traitSeasonCompleted.completed?.traitScore));
assert.equal(
  calculateSeasonTraitScore(
    { ...seasonStarted.state.current!, traitId: "alpha_hunter" },
    { alpha: 0.03, maxDrawdown: 0.02 },
    0,
  ),
  8,
);
assert.equal(
  calculateSeasonTraitScore(
    {
      ...seasonStarted.state.current!,
      goalId: "defense",
      goalTargetWeight: 0.3,
      traitId: "mandate",
    },
    { alpha: 0, maxDrawdown: 0.02 },
    0.7,
  ),
  8,
  "the highest defense target should qualify for the concentration trait",
);

const corporateWindow = corporateActionWindowStart(session);
const corporateArc = getCorporateActionArcForWindow(corporateWindow);
assert.deepEqual(
  corporateArc,
  getCorporateActionArcForWindow(corporateWindow),
  "corporate action arcs should be deterministic",
);
const corporateProposal = getCorporateActionEventForSession(corporateWindow);
const corporateReview = getCorporateActionEventForSession(corporateWindow + 3);
const corporateResolution = getCorporateActionEventForSession(corporateWindow + 6);
assert.ok(corporateProposal?.storyStageLabel?.includes("1단계"));
assert.ok(corporateReview?.storyStageLabel?.includes("2단계"));
assert.ok(corporateResolution?.storyStageLabel?.includes("3단계"));
assert.equal(getCorporateActionEventForSession(corporateWindow + 1), null);
assert.equal(corporateResolution?.affectedStockIds[0], corporateArc.company.id);
assert.equal(Math.sign(corporateResolution?.impact ?? 0), corporateArc.positive ? 1 : -1);
assert.ok(corporateResolution?.quote && corporateResolution.quoteBy);
assert.equal(
  seasonStarted.state.current.endSession,
  session + INVESTMENT_SEASON_SESSIONS,
);
const seasonInProgress = updateInvestmentSeason(seasonStarted.state, {
  currentSession: session + 19,
  equity: 900_000,
  benchmarkPrice: 9_500,
});
assert.equal(seasonInProgress.completed, null);
assert.equal(seasonInProgress.state.current?.minimumEquity, 900_000);
const seasonCompleted = updateInvestmentSeason(seasonInProgress.state, {
  currentSession: session + 20,
  equity: 1_080_000,
  benchmarkPrice: 10_500,
  now: 123_456,
});
assert.equal(seasonCompleted.completed?.tierId, "diamond");
assert.ok(Math.abs((seasonCompleted.completed?.alpha ?? 0) - 0.03) < 1e-9);
assert.equal(seasonCompleted.state.history.length, 1);
assert.equal(seasonCompleted.state.current?.number, 3);
assert.equal(seasonCompleted.state.current?.startSession, session + 20);
const defensiveSeason = updateInvestmentSeason(
  updateInvestmentSeason(createInitialInvestmentSeasonState(), {
    currentSession: session,
    equity: 1_000_000,
    benchmarkPrice: 10_000,
  }).state,
  {
    currentSession: session + 20,
    equity: 950_000,
    benchmarkPrice: 9_000,
  },
);
assert.equal(defensiveSeason.completed?.tierId, "master");
assert.ok(
  (defensiveSeason.completed?.playerReturn ?? 0) < 0 &&
    (defensiveSeason.completed?.alpha ?? 0) >= 0.05 - 1e-9,
  "losing less than the benchmark should still earn a high defensive tier",
);
const salaryNeutralSeason = updateInvestmentSeason(
  updateInvestmentSeason(createInitialInvestmentSeasonState(), {
    currentSession: session,
    equity: 1_000_000,
    benchmarkPrice: 10_000,
    externalCashTotal: 0,
  }).state,
  {
    currentSession: session + 20,
    equity: 1_100_000,
    benchmarkPrice: 10_000,
    externalCashTotal: 100_000,
  },
);
assert.ok(Math.abs(salaryNeutralSeason.completed?.playerReturn ?? 1) < 1e-9);
assert.equal(salaryNeutralSeason.completed?.tierId, "platinum");
const goalSelected = selectSeasonGoal(
  seasonStarted.state,
  "growth",
  0.5,
  session,
);
assert.ok(goalSelected?.current?.goalId === "growth");
assert.equal(selectSeasonGoal(goalSelected!, "income", 0.2, session), null);
const goalMissedHalf = updateInvestmentSeason(goalSelected!, {
  currentSession: session + 10,
  equity: 1_000_000,
  benchmarkPrice: 10_000,
  goalAllocation: 0.49,
});
assert.equal(goalMissedHalf.state.current?.goalChecks, 10);
assert.equal(goalMissedHalf.state.current?.goalMisses, 10);
const goalSeasonCompleted = updateInvestmentSeason(goalMissedHalf.state, {
  currentSession: session + 20,
  equity: 1_000_000,
  benchmarkPrice: 10_000,
  goalAllocation: 0.5,
});
assert.equal(goalSeasonCompleted.completed?.goalComplianceRate, 0.5);
assert.equal(goalSeasonCompleted.completed?.goalBonus, 5);
assert.equal(goalSeasonCompleted.completed?.goalPenalty, 20);
assert.equal(goalSeasonCompleted.completed?.seasonScore, 35);
const rivalMid = getSeasonRivalPerformance(goalSelected!.current!, session + 10, 50);
assert.deepEqual(
  rivalMid,
  getSeasonRivalPerformance(goalSelected!.current!, session + 10, 50),
  "virtual rival path should be deterministic",
);
assert.ok(rivalMid.score >= 0 && rivalMid.score <= 100);
const ceremonyMarked = markSeasonCeremonySeen(
  goalSeasonCompleted.state,
  goalSeasonCompleted.completed!.id,
);
assert.ok(ceremonyMarked.seenCeremonyIds.includes(goalSeasonCompleted.completed!.id));
const growthDefinition = STOCK_DEFINITIONS.find((stock) => stock.sector === "기술")!;
const growthState = createInitialStockState(growthDefinition, MARKET_EPOCH_MS);
assert.equal(
  calculateSeasonGoalAllocation(
    "growth",
    [{ stockId: growthState.id, quantity: 10, averagePrice: growthState.currentPrice }],
    [growthState],
    growthState.currentPrice * 20,
  ),
  0.5,
);

const earnings = getEarningsCalendar(session, session + EARNINGS_INTERVAL_SESSIONS);
assert.ok(earnings.length > 0, "earnings calendar should expose upcoming reports");
const firstEarnings = earnings[0];
assert.equal(isEarningsSession(firstEarnings.company.id, firstEarnings.session), true);
assert.equal(
  isEarningsSession(
    firstEarnings.company.id,
    firstEarnings.session + EARNINGS_INTERVAL_SESSIONS,
  ),
  true,
);
const earningsEvent = buildEarningsEvent(firstEarnings);
assert.equal(earningsEvent.affectedStockIds[0], firstEarnings.company.id);
assert.ok(earningsEvent.quote && earningsEvent.quoteBy);
assert.equal(
  Math.sign(earningsEvent.impact),
  firstEarnings.surprisePoint >= 0 ? 1 : -1,
);

const cycleStartSession = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);
assert.equal(
  MARKET_CYCLE_PHASES.reduce((sum, phase) => sum + phase.duration, 0),
  MARKET_CYCLE_SESSIONS,
);
assert.ok(expectedCycleReturn() > 0.15, "200-session cycle should have positive structural drift");
assert.equal(getMarketCycleAtSession(cycleStartSession + 35).id, "breakout");
assert.equal(getMarketCycleAtSession(cycleStartSession + 105).id, "correction");
assert.equal(marketBetaForStock({ sector: "기술" }), 0.65);
assert.equal(marketBetaForStock({ sector: "채권" }), -0.15);
assert.equal(marketBetaForStock({ sector: "기술", beta: 1.2 }), 1.2);

const benchmarkDefinition = STOCK_DEFINITIONS.find((stock) => stock.id === "vnasdaq");
assert.ok(benchmarkDefinition);
let longCycleBenchmark = createInitialStockState(benchmarkDefinition, MARKET_EPOCH_MS);
const longCycleStepSeconds = 60;
const longCycleSteps =
  MARKET_CYCLE_SESSIONS *
  (SESSION_DURATION_MS / 1_000 / longCycleStepSeconds);
for (let step = 1; step <= longCycleSteps; step++) {
  const now = MARKET_EPOCH_MS + step * longCycleStepSeconds * 1_000;
  const nextPrice = calculateTickPrice(
    longCycleBenchmark,
    [],
    now,
    randomNormal(seededRand(step, "cycle-test-shock")),
    longCycleStepSeconds,
    seededRand(step, "cycle-test-vnasdaq"),
  );
  longCycleBenchmark = { ...longCycleBenchmark, currentPrice: nextPrice };
}
assert.ok(
  longCycleBenchmark.currentPrice > benchmarkDefinition.initialPrice,
  "deterministic benchmark should finish a 200-session cycle above its start",
);
assert.ok(
  longCycleBenchmark.currentPrice < benchmarkDefinition.initialPrice * 1.6,
  "200-session growth should not become a runaway price spiral",
);
assert.ok(
  MARKET_CYCLE_PHASES.find((phase) => phase.id === "breakout")!.baseReturnPerSession > 0.005,
);
assert.ok(
  MARKET_CYCLE_PHASES.find((phase) => phase.id === "correction")!.baseReturnPerSession < -0.005,
);

for (let crisisNumber = 1; crisisNumber <= 20; crisisNumber++) {
  const interval = crisisIntervalSessions(crisisNumber);
  assert.ok(interval >= CRISIS_MIN_INTERVAL_SESSIONS);
  assert.ok(interval <= CRISIS_MAX_INTERVAL_SESSIONS);
}
assert.equal(
  MARKET_CRISIS_PHASES.reduce((sum, phase) => sum + phase.duration, 0),
  MARKET_CRISIS_DURATION_SESSIONS,
);
assert.equal(MARKET_CRISIS_DURATION_SESSIONS, 20);
const firstCrisis = getMarketCrisisWindow(1);
assert.equal(getNextMarketCrisis(firstCrisis.startSession - 1).crisisNumber, 1);
assert.equal(getActiveMarketCrisis(firstCrisis.startSession)?.phase.id, "warning");
assert.equal(getActiveMarketCrisis(firstCrisis.startSession + 3)?.phase.id, "crash");
assert.equal(getActiveMarketCrisis(firstCrisis.startSession + 7)?.phase.id, "panic");
assert.equal(getActiveMarketCrisis(firstCrisis.startSession + 11)?.phase.id, "intervention");
assert.equal(getActiveMarketCrisis(firstCrisis.startSession + 15)?.phase.id, "recovery");
assert.equal(getActiveMarketCrisis(firstCrisis.endSession), null);
assert.equal(getNextMarketCrisis(firstCrisis.endSession).crisisNumber, 2);
const crashPhase = getActiveMarketCrisis(firstCrisis.startSession + 3)!;
const stockCrisisReturn = crisisReturnForStock(
  crashPhase,
  { sector: "기술", beta: 1 },
  SESSION_DURATION_MS / 1_000,
);
const bondCrisisReturn = crisisReturnForStock(
  crashPhase,
  { sector: "채권" },
  SESSION_DURATION_MS / 1_000,
);
assert.ok(stockCrisisReturn < 0, "risk assets should fall during the crash phase");
assert.ok(bondCrisisReturn > 0, "bonds should provide defensive crisis exposure");
const secondCrisis = getMarketCrisisWindow(2);
const techCrash = getActiveMarketCrisis(secondCrisis.startSession + 3)!;
assert.equal(techCrash.theme.id, "tech-bubble");
assert.ok(
  Math.abs(crisisReturnForStock(techCrash, { sector: "기술", beta: 1 }, SESSION_DURATION_MS / 1_000)) >
    Math.abs(crisisReturnForStock(techCrash, { sector: "금융", beta: 1 }, SESSION_DURATION_MS / 1_000)),
  "tech bubble crisis should hit technology harder than an unrelated sector",
);
const warningNews = getCrisisEventsForSession(firstCrisis.startSession);
assert.equal(warningNews.length, 1);
assert.equal(warningNews[0].tag, "위기");
assert.ok(warningNews[0].quote && warningNews[0].quoteBy);
assert.deepEqual(getCrisisEventsForSession(firstCrisis.startSession + 1), []);
assert.equal(getCrisisEventsForSession(firstCrisis.startSession + 3)[0].impact < 0, true);
assert.equal(getCrisisEventsForSession(firstCrisis.startSession + 11)[0].impact > 0, true);
assert.ok(
  MARKET_CRISIS_PHASES.reduce(
    (sum, phase) => sum + phase.marketReturnPerSession * phase.duration,
    0,
  ) < -0.08,
  "a full crisis should create a material drawdown before the ordinary cycle resumes",
);

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
// 실제 등장인물은 이제 태그·상황별 전용 대사를 가지므로 공용 풀 문구 대신
// CEO 대사가 비어 있지 않게 붙는지만 확인한다 (캐릭터 개성 반영).
assert.ok(
  (resolveEventTemplate(negativeEarningsTemplate, 1, () => 0)?.quote ?? "")
    .length > 0,
);
const sectorDialogue = resolveEventTemplate(
  {
    category: "sector",
    tag: "AI",
    title: "기술주 강세",
    description: "기술 업종에 매수세가 유입됩니다.",
    sector: "기술",
    impact: 0.05,
  },
  2,
  () => 0,
);
assert.ok(sectorDialogue?.quote, "sector news should include character dialogue");
assert.ok(sectorDialogue?.quoteBy, "sector news should identify its speaker");
const restoredMacroDialogue = withCharacterQuote(
  {
    id: "legacy-macro",
    title: "금리 인하 기대",
    description: "시장 전반에 완화 기대가 번집니다.",
    affectedStockIds: [],
    impact: 0.04,
    timestamp: 3,
    category: "macro",
    tag: "금리",
  },
  () => 0,
);
assert.ok(restoredMacroDialogue.quote, "legacy news should regain character dialogue");
assert.ok(restoredMacroDialogue.quoteBy, "legacy news should regain its speaker");

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

const bondDecision = resolveStoryDecision(
  createStoryDecision(positiveArc, "bond", 1),
  positiveArc,
  2,
);
assert.equal(bondDecision.reputationDelta, 120);
assert.equal(bondDecision.topGrade, true);

assert.ok(positiveArc.character);
const relationshipCharacter = positiveArc.character;
let relationshipProgress = settleMissionRelationship(
  {},
  relationshipCharacter.id,
  true,
  windowStart,
);
assert.deepEqual(
  {
    trust: getCharacterProgress(relationshipProgress, relationshipCharacter.id).trust,
    affinity: getCharacterProgress(relationshipProgress, relationshipCharacter.id).affinity,
  },
  { trust: 5, affinity: 4 },
);
const exclusiveProgress = settleMissionRelationship(
  {},
  relationshipCharacter.id,
  true,
  windowStart,
  true,
);
assert.deepEqual(
  {
    trust: getCharacterProgress(exclusiveProgress, relationshipCharacter.id).trust,
    affinity: getCharacterProgress(exclusiveProgress, relationshipCharacter.id).affinity,
  },
  { trust: 8, affinity: 6 },
);
relationshipProgress = addStorySupportAffinity(
  relationshipProgress,
  relationshipCharacter.id,
  windowStart,
);
assert.equal(
  getCharacterProgress(relationshipProgress, relationshipCharacter.id).affinity,
  7,
);
relationshipProgress = addCharacterProgress(
  relationshipProgress,
  relationshipCharacter.id,
  0,
  93,
  windowStart - 1,
);
const bonded = getCharacterProgress(relationshipProgress, relationshipCharacter.id);
assert.equal(bonded.affinity, 100);
assert.equal(canUseBondChoice(bonded, windowStart), true);
assert.equal(canUseBondChoice(bonded, windowStart - 1), false);

const relationshipStock = createInitialStockState(positiveArc.company, MARKET_EPOCH_MS);
const relationshipHolding = [{
  stockId: relationshipStock.id,
  quantity: 1,
  averagePrice: relationshipStock.currentPrice,
}];
let holdProgress = accrueLongHoldingAffinity(
  {},
  relationshipHolding,
  [relationshipStock],
  relationshipStock.currentPrice * 10,
  windowStart,
);
holdProgress = accrueLongHoldingAffinity(
  holdProgress,
  relationshipHolding,
  [relationshipStock],
  relationshipStock.currentPrice * 10,
  windowStart + 5,
);
assert.equal(
  getCharacterProgress(holdProgress, relationshipCharacter.id).affinity,
  2,
);

const secondCharacterStock = {
  ...relationshipStock,
  id: `${relationshipStock.id}-second-character`,
  ticker: "SECOND",
  ceoId: "second-character",
};
const singleCharacterDerivative = {
  ...relationshipStock,
  id: `${relationshipStock.id}-leveraged`,
  ticker: "REL2X",
  ceoId: undefined,
  leverage: 2,
  leverageUnderlyingId: relationshipStock.id,
};
const singleCharacterInverse = {
  ...relationshipStock,
  id: `${relationshipStock.id}-inverse-test`,
  ticker: "RELINV",
  ceoId: undefined,
  leverage: -1,
  leverageUnderlyingId: relationshipStock.id,
};
const neutralGoldEtf = {
  ...relationshipStock,
  id: "gldx",
  ticker: "GLDX",
  ceoId: "must-not-affect-affinity",
};
const neutralShortBondEtf = {
  ...relationshipStock,
  id: "sbnd",
  ticker: "SBND",
  ceoId: "must-not-affect-affinity",
};
assert.deepEqual(
  resolveEtfCharacterIds(
    [
      { stockId: relationshipStock.id },
      { stockId: singleCharacterDerivative.id },
      { stockId: neutralGoldEtf.id },
      { stockId: neutralShortBondEtf.id },
    ],
    [
      relationshipStock,
      singleCharacterDerivative,
      neutralGoldEtf,
      neutralShortBondEtf,
    ],
  ),
  [relationshipCharacter.id],
  "single-character ETF should ignore gold and short bonds",
);
assert.equal(
  resolveSingleCharacterLongEtfId(
    [
      { stockId: relationshipStock.id },
      { stockId: singleCharacterDerivative.id },
      { stockId: neutralGoldEtf.id },
    ],
    [relationshipStock, singleCharacterDerivative, neutralGoldEtf],
  ),
  relationshipCharacter.id,
);
assert.equal(
  resolveSingleCharacterLongEtfId(
    [{ stockId: singleCharacterInverse.id }],
    [relationshipStock, singleCharacterInverse],
  ),
  undefined,
  "an inverse-only theme must not receive the single-character issuance bonus",
);
assert.deepEqual(
  resolveEtfCharacterExposures(
    [{ stockId: singleCharacterInverse.id }],
    [relationshipStock, singleCharacterInverse],
  ).map(({ characterId, kind, affinityRate }) => ({ characterId, kind, affinityRate })),
  [{ characterId: relationshipCharacter.id, kind: "hostile", affinityRate: -2 }],
  "inverse holdings inside a user ETF should stay hostile",
);

const userEtfMissionConcentration = computeCharacterConcentration(
  [],
  [relationshipStock, singleCharacterDerivative],
  relationshipStock.currentPrice,
  [{
    value: relationshipStock.currentPrice,
    holdings: [{ stockId: singleCharacterDerivative.id, weight: 1 }],
  }],
);
assert.equal(
  userEtfMissionConcentration.ranked[0]?.characterId,
  relationshipCharacter.id,
  "a user ETF should count as underlying-character ownership for missions",
);
assert.equal(
  resolveMissionIssuer(
    [{ id: positiveArc.company.id, ceoId: relationshipCharacter.id }],
    userEtfMissionConcentration,
    relationshipCharacter.id,
    windowStart,
  )?.characterId,
  relationshipCharacter.id,
  "a mission issuer should be generated when only the user ETF is held",
);
const inverseOnlyMissionConcentration = computeCharacterConcentration(
  [],
  [relationshipStock, singleCharacterInverse],
  relationshipStock.currentPrice,
  [{
    value: relationshipStock.currentPrice,
    holdings: [{ stockId: singleCharacterInverse.id, weight: 1 }],
  }],
);
assert.equal(
  inverseOnlyMissionConcentration.heldCount,
  0,
  "inverse-only user ETFs must not create friendly character missions",
);
const mixedDirectionMissionConcentration = computeCharacterConcentration(
  [],
  [relationshipStock, singleCharacterInverse],
  relationshipStock.currentPrice,
  [{
    value: relationshipStock.currentPrice,
    holdings: [
      { stockId: relationshipStock.id, weight: 0.5 },
      { stockId: singleCharacterInverse.id, weight: 0.5 },
    ],
  }],
);
assert.equal(
  mixedDirectionMissionConcentration.topCharacterShare,
  0.5,
  "hostile ETF weight must not be reassigned to friendly character exposure",
);

const relationEtfHolding = [{
  stockId: "amc:relationship-test",
  quantity: 1,
  averagePrice: relationshipStock.currentPrice,
}];
assert.equal(
  getCharacterRelation(relationshipStock.id, relationEtfHolding, {
    stocks: [relationshipStock, singleCharacterDerivative],
    funds: [{
      id: "relationship-test",
      status: "active",
      holdings: [{ stockId: singleCharacterDerivative.id, weight: 1 }],
    }],
  }).status,
  "leverage",
  "a user ETF should unlock its underlying character collection entry",
);
assert.equal(
  getCharacterRelation(relationshipStock.id, relationEtfHolding, {
    stocks: [relationshipStock, singleCharacterInverse],
    funds: [{
      id: "relationship-test",
      status: "active",
      holdings: [{ stockId: singleCharacterInverse.id, weight: 1 }],
    }],
  }).unlocked,
  false,
  "an inverse-only user ETF should not unlock a character",
);
assert.equal(
  getCharacterRelation(relationshipStock.id, [], {
    stocks: [relationshipStock],
    permanentlyUnlocked: true,
  }).status,
  "bonded",
  "a character that reached 100 affinity should stay unlocked without assets",
);

let diversifiedEtfProgress = accrueLongHoldingAffinity(
  {},
  [],
  [relationshipStock, secondCharacterStock],
  relationshipStock.currentPrice * 10,
  windowStart,
  [],
  [{
    value: relationshipStock.currentPrice,
    holdings: [
      { stockId: relationshipStock.id, weight: 0.5 },
      { stockId: secondCharacterStock.id, weight: 0.5 },
    ],
  }],
);
diversifiedEtfProgress = accrueLongHoldingAffinity(
  diversifiedEtfProgress,
  [],
  [relationshipStock, secondCharacterStock],
  relationshipStock.currentPrice * 10,
  windowStart + 5,
  [],
  [{
    value: relationshipStock.currentPrice,
    holdings: [
      { stockId: relationshipStock.id, weight: 0.5 },
      { stockId: secondCharacterStock.id, weight: 0.5 },
    ],
  }],
);
assert.equal(
  getCharacterProgress(diversifiedEtfProgress, relationshipCharacter.id).affinity,
  2,
);
assert.equal(
  getCharacterProgress(diversifiedEtfProgress, "second-character").affinity,
  2,
  "all characters in a held user ETF should gain affinity",
);

let singleCharacterEtfProgress = accrueLongHoldingAffinity(
  {},
  [],
  [relationshipStock, singleCharacterDerivative],
  relationshipStock.currentPrice * 10,
  windowStart,
  [],
  [{
    value: relationshipStock.currentPrice,
    holdings: [
      { stockId: relationshipStock.id, weight: 0.5 },
      { stockId: singleCharacterDerivative.id, weight: 0.5 },
    ],
  }],
);
singleCharacterEtfProgress = accrueLongHoldingAffinity(
  singleCharacterEtfProgress,
  [],
  [relationshipStock, singleCharacterDerivative],
  relationshipStock.currentPrice * 10,
  windowStart + 5,
  [],
  [{
    value: relationshipStock.currentPrice,
    holdings: [
      { stockId: relationshipStock.id, weight: 0.5 },
      { stockId: singleCharacterDerivative.id, weight: 0.5 },
    ],
  }],
);
assert.equal(
  getCharacterProgress(singleCharacterEtfProgress, relationshipCharacter.id).affinity,
  5,
  "single-character ETF holdings should gain substantially more affinity",
);
assert.equal(
  getCharacterProgress(singleCharacterEtfProgress, relationshipCharacter.id).trust,
  2,
  "single-character ETF holdings should also gain trust",
);

let inverseEtfProgress = accrueLongHoldingAffinity(
  {},
  [],
  [relationshipStock, singleCharacterInverse],
  relationshipStock.currentPrice * 10,
  windowStart,
  [],
  [{
    value: relationshipStock.currentPrice,
    holdings: [{ stockId: singleCharacterInverse.id, weight: 1 }],
  }],
);
inverseEtfProgress = accrueLongHoldingAffinity(
  inverseEtfProgress,
  [],
  [relationshipStock, singleCharacterInverse],
  relationshipStock.currentPrice * 10,
  windowStart + 5,
  [],
  [{
    value: relationshipStock.currentPrice,
    holdings: [{ stockId: singleCharacterInverse.id, weight: 1 }],
  }],
);
assert.equal(
  getCharacterProgress(inverseEtfProgress, relationshipCharacter.id).affinity,
  -2,
  "inverse exposure inside a user ETF should reduce affinity",
);

const messageProgress = addCharacterProgress(
  {},
  relationshipCharacter.id,
  60,
  30,
  windowStart - 1,
);
const characterMessages = getCharacterMessages({
  progress: messageProgress,
  missionHistory: [
    {
      id: "message-test-mission",
      kind: "growth",
      windowStart,
      status: "completed",
      reward: 120,
      completedAt: (windowStart + 1) * SESSION_DURATION_MS,
      playerReturn: 0.04,
      benchmarkReturn: 0.01,
      issuerCharacterId: relationshipCharacter.id,
      issuerCompanyId: positiveArc.company.id,
    },
  ],
  currentSession: windowStart + 2,
});
assert.ok(characterMessages.some((message) => message.kind === "clue"));
assert.ok(characterMessages.some((message) => message.kind === "mission"));
assert.equal(
  new Set(characterMessages.map((message) => message.id)).size,
  characterMessages.length,
);

const masteryInput = {
  trades: [
    {
      id: "mastery-option",
      stockId: relationshipStock.id,
      ticker: relationshipStock.ticker,
      type: "option_buy" as const,
      quantity: 1,
      price: 60_000,
      total: 60_000,
      timestamp: windowStart * SESSION_DURATION_MS,
      optionId: "mastery-option-contract",
      optionKind: "call" as const,
      optionSide: "long" as const,
      strike: relationshipStock.currentPrice,
      expirySession: windowStart + 5,
    },
  ],
  cashPayments: [
    {
      id: "mastery-dividend",
      kind: "dividend" as const,
      sourceId: relationshipStock.id,
      dueSession: windowStart,
      amount: 1_000,
      timestamp: windowStart * SESSION_DURATION_MS,
    },
  ],
  missionHistory: [
    {
      id: "mastery-growth-mission",
      kind: "growth" as const,
      windowStart,
      status: "completed" as const,
      reward: 120,
      completedAt: windowStart * SESSION_DURATION_MS,
      playerReturn: 0.04,
      benchmarkReturn: 0.01,
    },
  ],
  holdings: [],
  stocks: [relationshipStock],
  equity: 10_000_000,
  initialCash: 10_000_000,
  marginCallAt: null,
  currentSession: windowStart + 1,
};
const mastery = updateInvestmentMastery(createInitialMastery(), masteryInput);
assert.equal(mastery.xp.growth, 40);
assert.equal(mastery.xp.income, 15);
assert.equal(mastery.xp.derivatives, 12);
assert.deepEqual(updateInvestmentMastery(mastery, masteryInput), mastery);
assert.equal(masteryLevel(150), 2);

const growth = createInvestmentMission("growth", windowStart, 10_000_000, 100_000, 1);
assert.equal(
  updateInvestmentMission(growth, growth.endSession - 1, 10_400_000, 101_000, 2).status,
  "active",
);
const characterMission = createInvestmentMission(
  "character",
  windowStart,
  10_000_000,
  100_000,
  1,
  { characterId: relationshipCharacter.id, companyId: positiveArc.company.id },
);
assert.equal(characterMission.issuerCharacterId, relationshipCharacter.id);
assert.equal(
  updateInvestmentMission(
    characterMission,
    characterMission.endSession,
    10_250_000,
    101_000,
    2,
  ).status,
  "completed",
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

// 미수는 호출자가 명시한 배율만 반영하고, 500%에서도 진입 완충 구간이 있다.
assert.equal(SESSION_DURATION_MS, 60 * 60 * 1000);
assert.equal(computeBuyingPower(10_000, [], [], {}, 0, 1), 10_000);
assert.equal(computeBuyingPower(10_000, [], [], {}, 0, 5), 50_000);
assert.equal(maintenanceMarginForLeverage(2), 0.3);
assert.ok(maintenanceMarginForLeverage(5) < 0.2);

// 현물 소수점 매수·매도는 0.001주부터 가능하고 잔량을 정확히 보존한다.
const fractionalBuy = executeBuy(10_000, [], "fractional", "FRAC", 2_000, 0.5, 1);
assert.ok(isOrderSuccess(fractionalBuy));
if (!isOrderSuccess(fractionalBuy)) throw new Error("fractional buy failed");
assert.equal(fractionalBuy.cash, 9_000);
assert.equal(fractionalBuy.holdings[0]?.quantity, 0.5);
const fractionalSell = executeSell(
  fractionalBuy.cash,
  fractionalBuy.holdings,
  "fractional",
  "FRAC",
  2_200,
  0.125,
  2,
);
assert.ok(isOrderSuccess(fractionalSell));
if (!isOrderSuccess(fractionalSell)) throw new Error("fractional sell failed");
assert.equal(fractionalSell.holdings[0]?.quantity, 0.375);

// 모으기는 미수 없이 현금만 사용하고 밀린 회차를 한 번만 체결한다.
const recurringStock = createInitialStockState(
  STOCK_DEFINITIONS.find((definition) => definition.sector !== "지수" && definition.sector !== "선물")!,
  reportStart,
);
const recurring = processRecurringInvestments(
  [{
    id: "plan",
    stockId: recurringStock.id,
    amount: 1_000,
    intervalSessions: 5,
    nextSession: 100,
    enabled: true,
    createdAt: 0,
  }],
  5_000,
  [],
  [],
  [recurringStock],
  120,
  reportStart,
);
assert.equal(recurring.filledPlans.length, 1);
assert.ok(recurring.cash >= 0 && recurring.cash < 5_000);
assert.equal(recurring.plans[0]?.nextSession, 125);
assert.equal(recurring.trades.length, 1);

// 1거래일 미니 목표는 회차별 3개 후보가 고정되고 수락 후 정확히 1시간을 평가한다.
const operationOffers = getDailyOperationOffers(reportSession);
assert.equal(operationOffers.length, 3);
assert.equal(new Set(operationOffers.map((offer) => offer.id)).size, 3);
assert.deepEqual(operationOffers, getDailyOperationOffers(reportSession));
const measuredOperation = createDailyOperation(
  "measured_trades",
  reportSession,
  10_000,
  10_000,
  reportStart,
);
const completedOperation = updateDailyOperation(measuredOperation, {
  now: reportStart + SESSION_DURATION_MS,
  equity: 10_100,
  benchmarkPrice: 10_050,
  cash: 10_100,
  holdings: [],
  stocks: [recurringStock],
  trades: [{
    id: "operation-trade",
    stockId: recurringStock.id,
    ticker: recurringStock.ticker,
    type: "buy",
    quantity: 1,
    price: 100,
    total: 100,
    timestamp: reportStart + 1,
  }],
  marginCallAt: null,
});
assert.equal(completedOperation.endAt - completedOperation.acceptedAt, SESSION_DURATION_MS);
assert.equal(completedOperation.status, "completed");

// 장기 의뢰는 4개 판정축을 유지하면서 12개 문구 변형을 회차별로 순환한다.
assert.equal(INVESTMENT_MISSION_OFFERS.length, 12);
assert.equal(getAvailableInvestmentMissionOffers(session).length, 4);
assert.equal(
  new Set(getAvailableInvestmentMissionOffers(session).map((offer) => offer.kind)).size,
  4,
);

// 시즌 특성은 6종 풀에서도 시즌마다 중복 없는 3장만 제시한다.
const traitCandidates = getSeasonTraitCandidates({ id: `season-test-${session}` });
assert.equal(traitCandidates.length, 3);
assert.equal(new Set(traitCandidates.map((trait) => trait.id)).size, 3);

// 포트폴리오 전략은 목표 비중이 100%이며 공통 일봉에서 성공률·파산율을 재현한다.
for (const strategy of PORTFOLIO_STRATEGIES) {
  assert.ok(
    Math.abs(strategy.buckets.reduce((sum, bucket) => sum + bucket.targetWeight, 0) - 1) < 1e-9,
  );
}
const strategyBacktest = backtestPortfolioStrategy(
  PORTFOLIO_STRATEGIES[0],
  createGenesisStocks(),
);
assert.ok(strategyBacktest.samples > 0);
assert.ok(strategyBacktest.successRate >= 0 && strategyBacktest.successRate <= 1);
assert.ok(strategyBacktest.bankruptcyRate >= 0 && strategyBacktest.bankruptcyRate <= 1);

// 독립 위기 세션은 같은 선택에 동일한 20일 결과를 내고 메인 상태를 입력받지 않는다.
const stressResult = runCrisisStressTest("leveraged_attack", "tech-bubble");
assert.deepEqual(
  stressResult,
  runCrisisStressTest("leveraged_attack", "tech-bubble"),
);
assert.equal(stressResult.points[0]?.equity, stressResult.startingEquity);
assert.ok(stressResult.points.length <= 21);
assert.ok(stressResult.maximumDrawdown >= 0 && stressResult.maximumDrawdown <= 1);

// 시즌 티어 보상은 하위 프레임까지 영구 누적되고 잠긴 프레임은 장착되지 않는다.
const masterRewards = mergeSeasonRewards([], "master");
assert.equal(masterRewards.length, 6);
assert.equal(
  normalizeSelectedSeasonFrame("season-frame-master", masterRewards),
  "season-frame-master",
);
assert.equal(normalizeSelectedSeasonFrame("season-frame-master", []), null);

// 시즌 시장 복기는 정확히 20일의 결정론 상태만 평가하고 종목 유불리를 분리한다.
const seasonReview = buildSeasonMarketReview(session, session + 20);
const repeatedSeasonReview = buildSeasonMarketReview(session, session + 20);
assert.deepEqual(seasonReview, repeatedSeasonReview);
assert.equal(seasonReview.sessions, 20);
assert.equal(
  seasonReview.dominantRegimes.reduce((sum, state) => sum + state.sessions, 0),
  20,
);
assert.equal(
  seasonReview.dominantCycles.reduce((sum, state) => sum + state.sessions, 0),
  20,
);
assert.equal(seasonReview.favorable.length, 3);
assert.equal(seasonReview.unfavorable.length, 3);
assert.ok(seasonReview.averageVolatilityMultiplier > 0);
assert.equal(
  seasonReview.favorable.some((winner) =>
    seasonReview.unfavorable.some((loser) => loser.stockId === winner.stockId),
  ),
  false,
);

console.log("gameplay balance and progression scenarios passed");

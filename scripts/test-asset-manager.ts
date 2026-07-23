import assert from "node:assert";
import {
  AMC_FOUNDING_BURN,
  AMC_MIN_NET_WORTH,
  amcDividendHistoryAfter,
  amcFundStockId,
  applyAmcShareCreationRedemption,
  classifyAmcFundExposure,
  collectHoldingDividendCadences,
  computeAmcFundBasketPriceFactor,
  computeAmcFundNavPerShare,
  computePassiveAmcAnnualDividendYield,
  createAmcFund,
  equalWeightHoldings,
  evaluateAmcCompliance,
  foundAssetManager,
  hasMixedDividendCadences,
  isAmcFundStockId,
  isAmcShareAdjustmentBandStable,
  isAmcShareAdjustmentCoolingDown,
  markAmcFundVoluntarilyDelisted,
  normalizeAmcDividendInterval,
  normalizeWeightsSafe,
  rebalanceAmcFund,
  settleAmcDividends,
  settleAmcManagementFees,
  splitAmcSeed,
  updateAmcShareAdjustmentSettings,
  updateAssetManagerProfile,
  updateAmcComparisonStock,
  upgradeAmcFundHoldingBases,
  validateAmcHoldingWeights,
} from "../src/lib/player/assetManager";
import {
  listedFundToAmcState,
  mergeListedAumIntoManager,
  rebuildAssetManagerFromOwnedListed,
  reconcileOwnedListedFundsIntoManager,
  type ListedAmcFund,
} from "../src/lib/supabase/amcListedFunds";
import {
  listingRequestToAmcState,
  reconcileOwnedListingRequestsIntoManager,
  type AmcEtfListingRequest,
} from "../src/lib/supabase/amcEtfListingRequests";
import { reconcileAmcLedgerCash } from "../src/lib/player/amcLedger";
import {
  getAmcCharacterLinkedHoldings,
  getAmcFundChartSeries,
  getAmcFundPerformanceComparison,
  getAmcFundPriceHistory,
  getAmcFundTotalReturnSeries,
  getAmcPortfolioPositions,
  getAmcPortfolioValue,
  mergeAmcPortfolioFunds,
} from "../src/lib/player/amcPortfolio";

assert.deepEqual(splitAmcSeed(100_000), { burned: 10_000, navValue: 90_000 });
const verifiedSbndPrice = 11_894;
const verifiedSbndBase = 11_940;
assert.ok(
  Math.abs(
    computeAmcFundBasketPriceFactor(
      [{ stockId: "sbnd", weight: 1, basePrice: verifiedSbndBase }],
      () => verifiedSbndPrice,
      () => 10_000,
    ) - verifiedSbndPrice / verifiedSbndBase,
  ) < 1e-12,
  "SBND in a user ETF must use its actual inclusion price, not listing price",
);
assert.ok(
  Math.abs(
    computePassiveAmcAnnualDividendYield(
      [{ stockId: "sbnd", weight: 1 }],
      () => verifiedSbndPrice,
      () => ({ quarterlyDividend: 90 }),
    ) - (90 * 4) / verifiedSbndPrice,
  ) < 1e-12,
  "SBND distribution yield must remain near 3%, not inflate the fund return",
);

// 누적 서버 현금원장은 재시도해도 한 번만 반영되고 이후 이벤트만 차액 적용.
assert.deepEqual(
  normalizeWeightsSafe([
    { stockId: "a", weight: 2, basePrice: 1_087.81 },
    { stockId: "b", weight: 1, basePrice: 53.79 },
    { stockId: "c", weight: 1, basePrice: 200 },
  ]),
  [
    { stockId: "a", weight: 0.5, basePrice: 1_087.81 },
    { stockId: "b", weight: 0.25, basePrice: 53.79 },
    { stockId: "c", weight: 0.25, basePrice: 200 },
  ],
  "server-loaded user ETF holdings must retain their inclusion prices",
);

const ledgerDebit = reconcileAmcLedgerCash(100_000, 0, -10_000)!;
assert.deepEqual(ledgerDebit, {
  cash: 90_000,
  cashExact: "90000",
  appliedBalance: -10_000,
  appliedBalanceExact: "-10000",
  delta: -10_000,
  deltaExact: "-10000",
});
assert.deepEqual(
  reconcileAmcLedgerCash(ledgerDebit.cash, ledgerDebit.appliedBalance, -10_000),
  {
    cash: 90_000,
    cashExact: "90000",
    appliedBalance: -10_000,
    appliedBalanceExact: "-10000",
    delta: 0,
    deltaExact: "0",
  },
);
assert.deepEqual(reconcileAmcLedgerCash(90_000, -10_000, -7_500), {
  cash: 92_500,
  cashExact: "92500",
  appliedBalance: -7_500,
  appliedBalanceExact: "-7500",
  delta: 2_500,
  deltaExact: "2500",
});

const prices: Record<string, number> = {
  a: 10_000,
  b: 20_000,
  c: 30_000,
  bench: 15_000,
};
const initials = { ...prices };
const priceOf = (id: string) => prices[id] ?? 0;
const initialOf = (id: string) => initials[id] ?? 0;

const incomeProfile = classifyAmcFundExposure(
  {
    holdings: [
      { stockId: "covered", weight: 0.45 },
      { stockId: "leveraged", weight: 0.2 },
      { stockId: "a", weight: 0.35 },
    ],
  },
  (id) =>
    id === "covered"
      ? { coveredCallUnderlyingId: "a", coveredCallAnnualYield: 18 }
      : id === "leveraged"
        ? { leverage: 2 }
        : {},
);
assert.equal(incomeProfile.profile, "income");
assert.equal(incomeProfile.label, "인컴형");
assert.ok(Math.abs(incomeProfile.incomeWeight - 0.45) < 1e-12);
assert.ok(Math.abs(incomeProfile.leverageWeight - 0.2) < 1e-12);

const leveragedProfile = classifyAmcFundExposure(
  {
    holdings: [
      { stockId: "covered", weight: 0.15 },
      { stockId: "inverse", weight: 0.5 },
      { stockId: "a", weight: 0.35 },
    ],
  },
  (id) =>
    id === "covered"
      ? { coveredCallUnderlyingId: "a" }
      : id === "inverse"
        ? { leverage: -1 }
        : {},
);
assert.equal(leveragedProfile.profile, "leveraged");
assert.equal(leveragedProfile.label, "레버리지형");
assert.ok(Math.abs(leveragedProfile.leverageWeight - 0.5) < 1e-12);

const mixedProfile = classifyAmcFundExposure(
  {
    holdings: [
      { stockId: "covered", weight: 0.3 },
      { stockId: "leveraged", weight: 0.3 },
      { stockId: "a", weight: 0.4 },
    ],
  },
  (id) =>
    id === "covered"
      ? { coveredCallUnderlyingId: "a" }
      : id === "leveraged"
        ? { leverage: 2 }
        : {},
);
assert.equal(mixedProfile.profile, "mixed");
assert.equal(mixedProfile.label, "파생 혼합형");

assert.deepEqual(validateAmcHoldingWeights([
  { stockId: "a", weight: 0.5 },
  { stockId: "b", weight: 0.49 },
  { stockId: "c", weight: 0.01 },
]), [
  { stockId: "a", weight: 0.5 },
  { stockId: "b", weight: 0.49 },
  { stockId: "c", weight: 0.01 },
]);
assert.equal(validateAmcHoldingWeights([
  { stockId: "a", weight: 0.51 },
  { stockId: "b", weight: 0.48 },
  { stockId: "c", weight: 0.01 },
]), null);
assert.equal(validateAmcHoldingWeights([
  { stockId: "a", weight: 0.5 },
  { stockId: "b", weight: 0.333 },
  { stockId: "c", weight: 0.333 },
]), null, "리밸런싱 합계가 100%가 아니면 자동 정규화하지 않아야 함");

// 편입 시점 가격을 구성별 기준으로 고정해 상장 이후 누적수익이 목표 비중을 왜곡하지 않는다.
{
  const holdings = [
    { stockId: "a", weight: 0.5, basePrice: 300 },
    { stockId: "b", weight: 0.25, basePrice: 100 },
    { stockId: "c", weight: 0.25, basePrice: 100 },
  ];
  const display = (id: string) => ({ a: 330, b: 100, c: 100 })[id] ?? 0;
  const initial = () => 100;
  assert.ok(
    Math.abs(
      computeAmcFundBasketPriceFactor(holdings, display, initial, display) - 1.05,
    ) < 1e-12,
    "50% 구성 종목만 10% 오르면 ETF는 5% 올라야 함",
  );

  const splitDisplay = (id: string) => id === "a" ? 20 : 100;
  const economic = () => 100;
  const splitHoldings = holdings.map((row) => ({ ...row, basePrice: 100 }));
  assert.equal(
    computeAmcFundBasketPriceFactor(
      splitHoldings,
      splitDisplay,
      initial,
      economic,
    ),
    1,
    "5:1 액면분할은 유저 ETF 경제가를 바꾸지 않아야 함",
  );
}

assert.equal(
  foundAssetManager(
    { name: "X", tagline: "한줄" },
    AMC_FOUNDING_BURN,
    AMC_MIN_NET_WORTH - 1,
    "req",
    100,
  ).success,
  false,
);

const founded = foundAssetManager(
  { name: "북방운용", tagline: "규칙을 지키는 바스켓", detail: "상세" },
  5_000_000,
  AMC_MIN_NET_WORTH,
  "req-1",
  100,
  1_700_000_000_000,
);
assert.equal(founded.success, true);
assert.ok(founded.manager);
assert.equal(founded.cash, 5_000_000 - AMC_FOUNDING_BURN);
const renamed = updateAssetManagerProfile(
  founded.manager!,
  {
    name: "북방자산운용",
    tagline: "수정된 한 줄 소개",
    detail: "수정된 상세 소개",
  },
  1_700_000_000_100,
);
assert.equal(renamed.success, true);
assert.equal(renamed.manager?.name, "북방자산운용");
assert.equal(renamed.manager?.tagline, "수정된 한 줄 소개");
assert.equal(renamed.manager?.detail, "수정된 상세 소개");
assert.equal(
  updateAssetManagerProfile(founded.manager!, {
    name: "X",
    tagline: "정상 소개",
  }).success,
  false,
);

const created = createAmcFund(
  founded.manager!,
  {
    name: "북방코어",
    ticker: "NRTH",
    style: "active",
    feeRate: 0.03,
    benchmarkStockId: "bench",
    comparisonStockId: "a",
    holdings: [
      { stockId: "a", weight: 0.4 },
      { stockId: "b", weight: 0.3 },
      { stockId: "c", weight: 0.3 },
    ],
    seedCash: 1_000_000,
    splitTriggerPrice: 500,
    splitRatio: 5,
    reverseSplitTriggerPrice: 5,
    reverseSplitRatio: 2,
  },
  founded.cash!,
  100,
  priceOf,
  initialOf,
);
assert.equal(created.success, true);
assert.ok(created.fund);
assert.equal(created.burned, 100_000);
assert.ok(isAmcFundStockId(amcFundStockId(created.fund!.id)));
assert.equal(created.fund!.splitTriggerPrice, 500);
assert.equal(created.fund!.comparisonStockId, "a");
const comparisonUpdated = updateAmcComparisonStock(
  created.manager!,
  created.fund!.id,
  { comparisonStockId: "b" },
  (stockId) => ["a", "b", "c"].includes(stockId),
);
assert.equal(comparisonUpdated.success, true);
assert.equal(comparisonUpdated.fund!.comparisonStockId, "b");
assert.equal(created.fund!.splitRatio, 5);
assert.equal(created.fund!.reverseSplitTriggerPrice, 5);
assert.equal(created.fund!.reverseSplitRatio, 2);
assert.equal(created.fund!.shareMultiplier, 1);
assert.ok(created.fund!.navHistory[0]!.nav < created.fund!.splitTriggerPrice!);

const updatedAdjustment = updateAmcShareAdjustmentSettings(
  created.manager!,
  created.fund!.id,
  {
    splitTriggerPrice: 1_000,
    splitRatio: 10,
    reverseSplitTriggerPrice: 50,
    reverseSplitRatio: 5,
  },
  1_700_000_100_000,
);
assert.equal(updatedAdjustment.success, true);
assert.equal(updatedAdjustment.fund!.splitTriggerPrice, 1_000);
assert.equal(updatedAdjustment.fund!.splitRatio, 10);
assert.equal(updatedAdjustment.fund!.reverseSplitTriggerPrice, 50);
assert.equal(updatedAdjustment.fund!.reverseSplitRatio, 5);

const clearedAdjustment = updateAmcShareAdjustmentSettings(
  updatedAdjustment.manager!,
  created.fund!.id,
  {},
);
assert.equal(clearedAdjustment.success, true);
assert.equal(clearedAdjustment.fund!.splitTriggerPrice, undefined);
assert.equal(clearedAdjustment.fund!.splitRatio, undefined);
assert.equal(clearedAdjustment.fund!.reverseSplitTriggerPrice, undefined);
assert.equal(clearedAdjustment.fund!.reverseSplitRatio, undefined);

const invalidUpdatedAdjustment = updateAmcShareAdjustmentSettings(
  created.manager!,
  created.fund!.id,
  { splitTriggerPrice: 100, reverseSplitTriggerPrice: 100 },
);
assert.equal(invalidUpdatedAdjustment.success, false);
assert.equal(
  isAmcShareAdjustmentBandStable({
    splitTriggerPrice: 1_000,
    splitRatio: 10,
    reverseSplitTriggerPrice: 100,
    reverseSplitRatio: 5,
  }),
  false,
);
assert.equal(isAmcShareAdjustmentCoolingDown(100, 104), true);
assert.equal(isAmcShareAdjustmentCoolingDown(100, 105), false);

const invalidAdjustmentBand = createAmcFund(
  founded.manager!,
  {
    name: "잘못된 액면조정",
    ticker: "BADB",
    style: "passive",
    feeRate: 0.005,
    holdings: [
      { stockId: "a", weight: 1 / 3 },
      { stockId: "b", weight: 1 / 3 },
      { stockId: "c", weight: 1 / 3 },
    ],
    seedCash: 100_000,
    splitTriggerPrice: 100,
    reverseSplitTriggerPrice: 100,
  },
  founded.cash!,
  100,
  priceOf,
  initialOf,
);
assert.equal(invalidAdjustmentBand.success, false);

const nav = computeAmcFundNavPerShare(created.fund!, priceOf, initialOf);
assert.ok(nav > 0);

// 생성 시점 이전의 시장 수익률을 소급 적용하지 않고, 리밸런싱 자체로 NAV가 튀지 않는다.
{
  const shiftedPrices: Record<string, number> = {
    a: 200,
    b: 300,
    c: 400,
    d: 100,
    e: 100,
    f: 100,
  };
  const shiftedInitials: Record<string, number> = {
    a: 100,
    b: 100,
    c: 100,
    d: 100,
    e: 100,
    f: 100,
  };
  const shiftedPriceOf = (id: string) => shiftedPrices[id] ?? 0;
  const shiftedInitialOf = (id: string) => shiftedInitials[id] ?? 0;
  const shifted = createAmcFund(
    founded.manager!,
    {
      name: "기준가테스트",
      ticker: "BASE",
      style: "passive",
      feeRate: 0.005,
      holdings: ["a", "b", "c"].map((stockId) => ({
        stockId,
        weight: 1 / 3,
      })),
      seedCash: 100_000,
    },
    100_000,
    100,
    shiftedPriceOf,
    shiftedInitialOf,
  );
  assert.ok(shifted.fund);
  const before = computeAmcFundNavPerShare(
    shifted.fund!,
    shiftedPriceOf,
    shiftedInitialOf,
  );
  assert.equal(before * shifted.fund!.totalShares, 90_000);
  const legacyHoldings = shifted.fund!.holdings.map(({ stockId, weight }) => ({
    stockId,
    weight,
  }));
  const legacyFund = {
    ...shifted.fund!,
    holdings: legacyHoldings,
    basketPriceFactor: computeAmcFundBasketPriceFactor(
      legacyHoldings,
      shiftedPriceOf,
      shiftedInitialOf,
    ),
  };
  const legacyNav = computeAmcFundNavPerShare(
    legacyFund,
    shiftedPriceOf,
    shiftedInitialOf,
  );
  const upgradedLegacy = upgradeAmcFundHoldingBases(
    legacyFund,
    shiftedPriceOf,
    shiftedInitialOf,
    shiftedPriceOf,
  );
  assert.equal(
    computeAmcFundNavPerShare(
      upgradedLegacy,
      shiftedPriceOf,
      shiftedInitialOf,
      shiftedPriceOf,
    ),
    legacyNav,
    "기존 ETF 기준가 전환 시 NAV가 유지되어야 함",
  );
  assert.ok(upgradedLegacy.holdings.every((row) => (row.basePrice ?? 0) > 0));
  const shiftedRebalanced = rebalanceAmcFund(
    shifted.manager!,
    shifted.fund!.id,
    ["d", "e", "f"].map((stockId) => ({ stockId, weight: 1 / 3 })),
    101,
    Date.now(),
    shiftedPriceOf,
    shiftedInitialOf,
  );
  assert.ok(shiftedRebalanced.fund);
  assert.equal(
    computeAmcFundNavPerShare(
      shiftedRebalanced.fund!,
      shiftedPriceOf,
      shiftedInitialOf,
    ),
    before,
  );
}

const voluntarilyDelisted = markAmcFundVoluntarilyDelisted(
  created.manager!,
  created.fund!.id,
  123,
  1_700_000_123_000,
);
assert.equal(voluntarilyDelisted.success, true);
assert.equal(voluntarilyDelisted.fund?.status, "delisted");
assert.equal(voluntarilyDelisted.fund?.delistedSession, 123);
assert.equal(voluntarilyDelisted.fund?.graceStartedSession, null);
assert.equal(
  markAmcFundVoluntarilyDelisted(
    voluntarilyDelisted.manager!,
    created.fund!.id,
    124,
  ).success,
  false,
);

// 신규 매수자는 매수 전에 확정된 배당 이력을 소급 수령하지 않는다.
assert.deepEqual(
  amcDividendHistoryAfter(
    [
      { session: 100, perShare: 3, total: 300 },
      { session: 120, perShare: 4, total: 400 },
    ],
    120,
  ),
  [],
);
assert.deepEqual(
  amcDividendHistoryAfter(
    [
      { session: 100, perShare: 3, total: 300 },
      { session: 120, perShare: 4, total: 400 },
    ],
    100,
  ).map((entry) => entry.session),
  [120],
);

const tinyRebalance = rebalanceAmcFund(
  created.manager!,
  created.fund!.id,
  [
    { stockId: "a", weight: 0.41 },
    { stockId: "b", weight: 0.3 },
    { stockId: "c", weight: 0.29 },
  ],
  100,
);
assert.equal(tinyRebalance.success, false);

const okRebalance = rebalanceAmcFund(
  created.manager!,
  created.fund!.id,
  [
    { stockId: "a", weight: 0.2 },
    { stockId: "b", weight: 0.4 },
    { stockId: "c", weight: 0.4 },
  ],
  100,
);
assert.equal(okRebalance.success, true);

let manager = okRebalance.manager!;
const idle = evaluateAmcCompliance(manager, 100 + 30, 1_700_000_000_100);
assert.equal(idle.manager.funds[0]?.status, "grace");
manager = idle.manager;
const delisted = evaluateAmcCompliance(manager, 100 + 30 + 10, 1_700_000_000_200);
assert.equal(delisted.newlyDelisted.length, 1);
assert.equal(delisted.manager.funds[0]?.status, "delisted");

manager = created.manager!;
const fees = settleAmcManagementFees(
  manager,
  manager.funds[0]!.lastFeeSession + 20,
  priceOf,
  initialOf,
);
assert.ok(fees.feePayments.length >= 1);
assert.ok(fees.feePayments[0]!.amount > 0);
assert.ok(
  fees.manager.funds[0]!.seedNavValue < manager.funds[0]!.seedNavValue,
);

// 공유 AUM 머지: 타 계정 매수로 늘어난 유통 좌수를 운용료에 반영
const listed: ListedAmcFund = {
  id: created.fund!.id,
  managerUserId: "u1",
  managerGameId: "g1",
  managerName: "북방운용",
  managerTagline: "규칙을 지키는 바스켓",
  name: created.fund!.name,
  ticker: created.fund!.ticker,
  style: "active",
  feeRate: 0.03,
  benchmarkStockId: "bench",
  holdings: created.fund!.holdings,
  totalShares: created.fund!.totalShares + 5_000,
  seedNavValue: created.fund!.seedNavValue + 5_000 * Math.max(
    1,
    Math.round(created.fund!.seedNavValue / created.fund!.totalShares),
  ),
  status: "active",
  lastFeeSession: created.fund!.lastFeeSession,
  lastRebalanceSession: created.fund!.lastRebalanceSession,
  graceStartedSession: null,
  createdSession: created.fund!.createdSession,
  cumulativeFeesPaid: 0,
  dividendIntervalDays: 60,
  dividendRate: 0,
  lastDividendSession: created.fund!.createdSession,
  cumulativeDividendsPaid: 0,
  dividendHistory: [],
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// User ETFs are not in the regular stock map, but the account must still
// resolve and display their current NAV.
const founderHolding = {
  stockId: amcFundStockId(created.fund!.id),
  quantity: created.fund!.totalShares,
  averagePrice: computeAmcFundNavPerShare(created.fund!, priceOf, initialOf),
};
const portfolioFunds = mergeAmcPortfolioFunds(
  [created.fund!],
  [listedFundToAmcState(listed)],
);
const portfolioStocks = Object.entries(prices).map(([id, currentPrice]) => ({
  id,
  currentPrice,
  initialPrice: initials[id] ?? currentPrice,
}));
const portfolioPositions = getAmcPortfolioPositions(
  [founderHolding],
  portfolioFunds,
  portfolioStocks,
);
assert.equal(portfolioPositions.length, 1);
assert.equal(portfolioPositions[0]!.fund.ticker, listed.ticker);
assert.equal(
  getAmcPortfolioValue([founderHolding], portfolioFunds, portfolioStocks),
  portfolioPositions[0]!.evaluation,
);
assert.deepEqual(
  getAmcCharacterLinkedHoldings(
    [founderHolding],
    portfolioFunds,
    portfolioStocks,
  ),
  [{
    value: portfolioPositions[0]!.evaluation,
    holdings: portfolioPositions[0]!.fund.holdings,
  }],
  "user ETF positions should be available to character missions",
);
const chartStocks = Object.entries(prices).map(([id, initialPrice]) => ({
  id,
  initialPrice,
  priceHistory: [
    { timestamp: created.fund!.createdAt, price: initialPrice },
    { timestamp: created.fund!.createdAt + 30_000, price: initialPrice * 2 },
  ],
}));
const fundChart = getAmcFundPriceHistory(created.fund!, chartStocks);
assert.equal(fundChart.length, 2);
assert.equal(
  fundChart[1]!.price,
  Math.round((created.fund!.seedNavValue / created.fund!.totalShares) * 2),
  "user ETF chart should synthesize NAV from constituent histories",
);
assert.deepEqual(
  getAmcFundPriceHistory(
    {
      ...created.fund!,
      navHistory: [
        { t: created.fund!.createdAt, nav: 1 },
        { t: created.fund!.createdAt + 30_000, nav: 1_000_000 },
      ],
    },
    chartStocks,
  ),
  fundChart,
  "nominal NAV snapshots must not overwrite actual constituent performance",
);
assert.deepEqual(
  getAmcFundPriceHistory(
    {
      ...created.fund!,
      holdings: [],
      shareMultiplier: 10,
      navHistory: [
        { t: 1, nav: 1_000, shareMultiplier: 1 },
        { t: 2, nav: 100, shareMultiplier: 10 },
      ],
    },
    [],
  ).map((point) => point.price),
  [100, 100],
  "legacy NAV fallback must preserve economic value across a split",
);

// 일반 종목과 같은 고정 OHLC를 사용 — 최근 틱 배열이 밀려도 완성 캔들과 전일선은 불변.
{
  const fund = created.fund!;
  const dayStart = Math.floor(fund.createdAt / 3_600_000) * 3_600_000;
  const fixedChartStocks = Object.entries(prices).map(([id, initialPrice]) => ({
    id,
    initialPrice,
    priceHistory: [
      { timestamp: fund.createdAt, price: initialPrice },
      { timestamp: fund.createdAt + 1_000, price: initialPrice * 2 },
    ],
    candles: [
      {
        timestamp: fund.createdAt + 30_000,
        open: initialPrice,
        high: initialPrice * 1.1,
        low: initialPrice * 0.9,
        close: initialPrice,
      },
      {
        timestamp: fund.createdAt + 60_000,
        open: initialPrice,
        high: initialPrice * 2.1,
        low: initialPrice,
        close: initialPrice * 2,
      },
    ],
    dailyCandles: [
      {
        timestamp: dayStart,
        open: initialPrice,
        high: initialPrice * 1.3,
        low: initialPrice * 0.9,
        close: initialPrice * 1.2,
      },
      {
        timestamp: dayStart + 3_600_000,
        open: initialPrice * 1.2,
        high: initialPrice * 2.1,
        low: initialPrice * 1.1,
        close: initialPrice * 2,
      },
    ],
  }));
  const series = getAmcFundChartSeries(fund, fixedChartStocks);
  assert.equal(series.candles.length, 2);
  assert.equal(series.dailyCandles.length, 2);
  assert.equal(
    series.previousSessionClose,
    Math.round((fund.seedNavValue / fund.totalShares) * 1.2),
  );

  const movedHistory = fixedChartStocks.map((stock) => ({
    ...stock,
    priceHistory: [
      ...stock.priceHistory.slice(1),
      {
        timestamp: fund.createdAt + 2_000,
        price: stock.initialPrice * 3,
      },
    ],
  }));
  assert.deepEqual(
    getAmcFundChartSeries(fund, movedHistory).candles,
    series.candles,
    "rolling recent ticks must not rewrite completed user ETF candles",
  );

  const dividendSession = Math.floor(
    (dayStart + 3_600_000) / 3_600_000,
  );
  const comparison = getAmcFundPerformanceComparison(
    {
      ...fund,
      comparisonStockId: "bench",
      dividendHistory: [
        {
          session: dividendSession,
          perShare: 10,
          total: 10 * fund.totalShares,
          shareMultiplier: 1,
        },
      ],
    },
    fixedChartStocks,
  );
  assert.ok(comparison);
  assert.ok(comparison!.fundIncomeReturn > 0);
  assert.ok(
    comparison!.fundTotalReturn > comparison!.fundPriceReturn,
    "covered-call distributions must be included in user ETF total return",
  );
  const totalReturn = getAmcFundTotalReturnSeries(
    {
      ...fund,
      dividendHistory: [
        {
          session: dividendSession,
          perShare: 10,
          total: 10 * fund.totalShares,
          shareMultiplier: 1,
        },
      ],
    },
    fixedChartStocks,
  );
  assert.equal(totalReturn[0]!.fundTotalReturn, 0);
  assert.ok(
    totalReturn.at(-1)!.fundTotalReturn >
      totalReturn.at(-1)!.fundPriceReturn,
    "manager-wide performance must use the same actual-income total return",
  );
}
const merged = mergeListedAumIntoManager(created.manager!, [listed]);
assert.equal(merged.funds[0]!.totalShares, created.fund!.totalShares + 5_000);
const splitMerged = mergeListedAumIntoManager(created.manager!, [
  {
    ...listed,
    totalShares: created.fund!.totalShares * 10,
    shareMultiplier: 10,
    lastShareAdjustmentSession: created.fund!.createdSession + 5,
    splitTriggerPrice: 100_000,
    splitRatio: 5,
    reverseSplitTriggerPrice: 1_000,
    reverseSplitRatio: 2,
  },
]);
assert.equal(splitMerged.funds[0]!.shareMultiplier, 10);
assert.equal(
  splitMerged.funds[0]!.navHistory[0]!.nav,
  Math.round(created.fund!.navHistory[0]!.nav / 10),
);
assert.equal(splitMerged.funds[0]!.navHistory[0]!.shareMultiplier, 10);
assert.equal(
  splitMerged.funds[0]!.lastShareAdjustmentSession,
  created.fund!.createdSession + 5,
);
const asState = listedFundToAmcState(listed);
assert.equal(asState.totalShares, listed.totalShares);
const feesOnSharedAum = settleAmcManagementFees(
  merged,
  merged.funds[0]!.lastFeeSession + 20,
  priceOf,
  initialOf,
);
assert.ok(
  feesOnSharedAum.feePayments[0]!.amount > fees.feePayments[0]!.amount,
);

const annual = computePassiveAmcAnnualDividendYield(
  [
    { stockId: "a", weight: 0.5 },
    { stockId: "b", weight: 0.5 },
  ],
  priceOf,
  (id) =>
    id === "a"
      ? { quarterlyDividend: 100 }
      : { quarterlyDividend: 200 },
);
assert.ok(annual > 0);

assert.deepEqual(
  collectHoldingDividendCadences(
    [
      { stockId: "a", weight: 0.5 },
      { stockId: "b", weight: 0.5 },
    ],
    (id) =>
      id === "a"
        ? { quarterlyDividend: 100 }
        : {
            coveredCallAnnualYield: 12,
            coveredCallDistributionIntervalDays: 5,
          },
  ),
  [5, 60],
);
assert.equal(
  hasMixedDividendCadences(
    [
      { stockId: "a", weight: 0.5 },
      { stockId: "b", weight: 0.5 },
    ],
    (id) =>
      id === "a"
        ? { quarterlyDividend: 100 }
        : {
            coveredCallAnnualYield: 12,
            coveredCallDistributionIntervalDays: 5,
          },
  ),
  true,
);
assert.equal(normalizeAmcDividendInterval(37), 37);
assert.equal(normalizeAmcDividendInterval(1), 1);
assert.equal(normalizeAmcDividendInterval(240), 240);
assert.equal(normalizeAmcDividendInterval(0), 60);
assert.equal(normalizeAmcDividendInterval(241), 60);

// 액티브: 회차율 설정 → NAV 차감 (좌당 1¢ 이상 되도록 충분한 요율)
const withDiv = {
  ...created.fund!,
  dividendIntervalDays: 60 as const,
  dividendRate: 0.05,
  lastDividendSession: 100,
  cumulativeDividendsPaid: 0,
  dividendHistory: [],
};
const divs = settleAmcDividends(
  [withDiv],
  160,
  priceOf,
  initialOf,
  () => ({ quarterlyDividend: 0 }),
);
assert.ok(divs.dividendPayments.length >= 1);
assert.ok(divs.funds[0]!.seedNavValue < withDiv.seedNavValue);
assert.ok(divs.funds[0]!.dividendHistory.length >= 1);
assert.ok(divs.dividendPayments[0]!.perShare >= 1);

// 패시브: 구성 평균 연율 → 주기 환산 배당
const passiveCreated = createAmcFund(
  founded.manager!,
  {
    name: "북방패시브",
    ticker: "NPAS",
    style: "passive",
    feeRate: 0.005,
    holdings: [
      { stockId: "a", weight: 1 / 3 },
      { stockId: "b", weight: 1 / 3 },
      { stockId: "c", weight: 1 / 3 },
    ],
    seedCash: 5_000_000,
    dividendIntervalDays: 5,
  },
  10_000_000,
  100,
  priceOf,
  initialOf,
);
assert.equal(passiveCreated.success, true);
const passiveDivs = settleAmcDividends(
  [
    {
      ...passiveCreated.fund!,
      lastDividendSession: 100,
      dividendHistory: [],
    },
  ],
  105,
  priceOf,
  initialOf,
  (id) =>
    id === "a"
      ? { quarterlyDividend: 500 }
      : id === "b"
        ? {
            coveredCallAnnualYield: 24,
            coveredCallDistributionIntervalDays: 5,
          }
        : { quarterlyDividend: 300 },
);
assert.ok(passiveDivs.dividendPayments.length >= 1);
assert.ok(
  Math.abs(
    computePassiveAmcAnnualDividendYield(
      passiveCreated.fund!.holdings,
      priceOf,
      (id) =>
        id === "a"
          ? { quarterlyDividend: 500 }
          : id === "b"
            ? { coveredCallAnnualYield: 24 }
            : { quarterlyDividend: 300 },
    ) - 0.16,
  ) < 1e-12,
  "mixed covered-call income must be weighted into passive ETF yield",
);
assert.ok(
  passiveDivs.funds[0]!.seedNavValue < passiveCreated.fund!.seedNavValue,
);
assert.equal(passiveDivs.funds[0]!.dividendHistory[0]!.shareMultiplier, 1);

const passiveRebalance = rebalanceAmcFund(
  passiveCreated.manager!,
  passiveCreated.fund!.id,
  [
    { stockId: "a", weight: 0.5 },
    { stockId: "b", weight: 0.25 },
    { stockId: "c", weight: 0.25 },
  ],
  110,
);
assert.equal(passiveRebalance.success, true);
assert.ok(passiveRebalance.fund);
assert.equal(
  Math.round(passiveRebalance.fund!.holdings.find((h) => h.stockId === "a")!.weight * 100),
  50,
);

const equalized = equalWeightHoldings(passiveRebalance.fund!.holdings);
assert.ok(equalized);
assert.ok(equalized!.every((row) => Math.abs(row.weight - 1 / 3) < 1e-9));
const passiveEqual = rebalanceAmcFund(
  passiveRebalance.manager!,
  passiveCreated.fund!.id,
  equalized!,
  111,
);
assert.equal(passiveEqual.success, true);
assert.ok(
  passiveEqual.fund!.holdings.every((row) => Math.abs(row.weight - 1 / 3) < 1e-9),
);

// 생성/환매는 장부가 기준 — relative≠1 이어도 NAV·seed/shares 불변 (사팔 AUM 붕괴 방지)
{
  const hotPrices: Record<string, number> = {
    a: 20_000,
    b: 40_000,
    c: 60_000,
    bench: 15_000,
  };
  const hotOf = (id: string) => hotPrices[id] ?? 0;
  const baseFund = created.fund!;
  const nav0 = computeAmcFundNavPerShare(baseFund, hotOf, initialOf);
  assert.ok(nav0 > computeAmcFundNavPerShare(baseFund, priceOf, initialOf));

  // 잘못된 방식(시세 NAV를 seed에 가산)이면 붕괴 — 대조군
  const wrongBuySeed =
    baseFund.seedNavValue + Math.round(nav0 * 100_000);
  const wrongBuyShares = baseFund.totalShares + 100_000;
  const wrongAfterBuy = {
    ...baseFund,
    seedNavValue: wrongBuySeed,
    totalShares: wrongBuyShares,
  };
  const wrongNavBuy = computeAmcFundNavPerShare(wrongAfterBuy, hotOf, initialOf);
  assert.ok(wrongNavBuy > nav0);
  const wrongSellSeed =
    wrongBuySeed - Math.round(wrongNavBuy * 100_000);
  const wrongAfterSell = {
    ...wrongAfterBuy,
    seedNavValue: Math.max(0, wrongSellSeed),
    totalShares: wrongBuyShares - 100_000,
  };
  const wrongNavSell = computeAmcFundNavPerShare(
    wrongAfterSell,
    hotOf,
    initialOf,
  );
  assert.ok(wrongNavSell < nav0 * 0.5);

  // 올바른 장부가 생성/환매: 왕복 후 NAV 유지
  const bought = applyAmcShareCreationRedemption(baseFund, 100_000);
  assert.ok(bought);
  const navBought = computeAmcFundNavPerShare(bought!, hotOf, initialOf);
  assert.equal(navBought, nav0);
  const sold = applyAmcShareCreationRedemption(bought!, -100_000);
  assert.ok(sold);
  assert.equal(sold!.totalShares, baseFund.totalShares);
  assert.equal(sold!.seedNavValue, baseFund.seedNavValue);
  assert.equal(
    computeAmcFundNavPerShare(sold!, hotOf, initialOf),
    nav0,
  );

  // relative < 1 에서도 동일
  const coldPrices: Record<string, number> = {
    a: 5_000,
    b: 10_000,
    c: 15_000,
    bench: 15_000,
  };
  const coldOf = (id: string) => coldPrices[id] ?? 0;
  const navCold = computeAmcFundNavPerShare(baseFund, coldOf, initialOf);
  const coldBought = applyAmcShareCreationRedemption(baseFund, 50_000)!;
  assert.equal(
    computeAmcFundNavPerShare(coldBought, coldOf, initialOf),
    navCold,
  );
  const coldSold = applyAmcShareCreationRedemption(coldBought, -50_000)!;
  assert.equal(coldSold.seedNavValue, baseFund.seedNavValue);
}

// 지갑에서 빠진 내 ETF를 상장 원장·신청 페이로드에서 복구
{
  const emptyManager = { ...created.manager!, funds: [] };
  const orphanListed: ListedAmcFund = {
    id: created.fund!.id,
    managerUserId: "owner-1",
    managerGameId: "g1",
    managerName: "북방운용",
    managerTagline: "규칙을 지키는 바스켓",
    name: created.fund!.name,
    ticker: created.fund!.ticker,
    style: "active",
    feeRate: created.fund!.feeRate,
    benchmarkStockId: "bench",
    holdings: created.fund!.holdings,
    totalShares: created.fund!.totalShares,
    seedNavValue: created.fund!.seedNavValue,
    status: "active",
    lastFeeSession: created.fund!.lastFeeSession,
    lastRebalanceSession: created.fund!.lastRebalanceSession,
    graceStartedSession: null,
    createdSession: created.fund!.createdSession,
    cumulativeFeesPaid: 0,
    dividendIntervalDays: 60,
    dividendRate: 0,
    lastDividendSession: created.fund!.createdSession,
    cumulativeDividendsPaid: 0,
    dividendHistory: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const restored = reconcileOwnedListedFundsIntoManager(
    emptyManager,
    [orphanListed],
    "owner-1",
  );
  assert.equal(restored.funds.length, 1);
  assert.equal(restored.funds[0]!.id, created.fund!.id);

  const request: AmcEtfListingRequest = {
    id: "req-restore",
    userId: "owner-1",
    gameId: "g1",
    status: "pending",
    fundName: "복구펀드",
    payload: {
      fundId: "missing-fund",
      ticker: "RSTR",
      style: "passive",
      feeRate: 0.005,
      holdings: [
        { stockId: "a", weight: 1 / 3 },
        { stockId: "b", weight: 1 / 3 },
        { stockId: "c", weight: 1 / 3 },
      ],
      seedNavValue: 900_000,
      totalShares: 10_000,
      managerName: "북방운용",
      managerTagline: "규칙을 지키는 바스켓",
      dividendIntervalDays: 60,
      dividendRate: 0,
    },
    adminNote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const fromRequest = reconcileOwnedListingRequestsIntoManager(emptyManager, [
    request,
  ]);
  assert.equal(fromRequest.funds.length, 1);
  assert.equal(fromRequest.funds[0]!.ticker, "RSTR");
  assert.equal(listingRequestToAmcState(request).listingRequestId, "req-restore");

  // 운용사 지갑 자체가 null 이어도 상장 원장에서 재구성
  const rebuilt = rebuildAssetManagerFromOwnedListed(
    [orphanListed],
    "owner-1",
    null,
  );
  assert.ok(rebuilt);
  assert.equal(rebuilt!.funds.length, 1);
  assert.equal(rebuilt!.name, "북방운용");
  assert.equal(
    rebuildAssetManagerFromOwnedListed([], "owner-1", null),
    null,
  );
  // 기존 운용사가 있으면 listed 로 누락분만 채운다
  const mergedExisting = rebuildAssetManagerFromOwnedListed(
    [orphanListed],
    "owner-1",
    emptyManager,
  );
  assert.ok(mergedExisting);
  assert.equal(mergedExisting!.funds.length, 1);
}

console.log("asset manager founding · fee · compliance scenarios passed");

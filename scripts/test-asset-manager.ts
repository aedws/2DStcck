import assert from "node:assert";
import {
  AMC_FOUNDING_BURN,
  AMC_MIN_NET_WORTH,
  amcFundStockId,
  applyAmcShareCreationRedemption,
  collectHoldingDividendCadences,
  computeAmcFundNavPerShare,
  computePassiveAmcAnnualDividendYield,
  createAmcFund,
  evaluateAmcCompliance,
  foundAssetManager,
  hasMixedDividendCadences,
  isAmcFundStockId,
  rebalanceAmcFund,
  settleAmcDividends,
  settleAmcManagementFees,
  splitAmcSeed,
} from "../src/lib/player/assetManager";
import {
  listedFundToAmcState,
  mergeListedAumIntoManager,
  type ListedAmcFund,
} from "../src/lib/supabase/amcListedFunds";

assert.deepEqual(splitAmcSeed(100_000), { burned: 10_000, navValue: 90_000 });

const prices: Record<string, number> = {
  a: 10_000,
  b: 20_000,
  c: 30_000,
  bench: 15_000,
};
const initials = { ...prices };
const priceOf = (id: string) => prices[id] ?? 0;
const initialOf = (id: string) => initials[id] ?? 0;

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

const created = createAmcFund(
  founded.manager!,
  {
    name: "북방코어",
    ticker: "NRTH",
    style: "active",
    feeRate: 0.03,
    benchmarkStockId: "bench",
    holdings: [
      { stockId: "a", weight: 0.4 },
      { stockId: "b", weight: 0.3 },
      { stockId: "c", weight: 0.3 },
    ],
    seedCash: 1_000_000,
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

const nav = computeAmcFundNavPerShare(created.fund!, priceOf, initialOf);
assert.ok(nav > 0);

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
const merged = mergeListedAumIntoManager(created.manager!, [listed]);
assert.equal(merged.funds[0]!.totalShares, created.fund!.totalShares + 5_000);
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
  passiveDivs.funds[0]!.seedNavValue < passiveCreated.fund!.seedNavValue,
);

const passiveRebalanceBlocked = rebalanceAmcFund(
  passiveCreated.manager!,
  passiveCreated.fund!.id,
  [
    { stockId: "a", weight: 0.5 },
    { stockId: "b", weight: 0.25 },
    { stockId: "c", weight: 0.25 },
  ],
  110,
);
assert.equal(passiveRebalanceBlocked.success, false);
assert.ok(passiveRebalanceBlocked.message.includes("패시브"));

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

console.log("asset manager founding · fee · compliance scenarios passed");

import assert from "node:assert";
import {
  AMC_FOUNDING_BURN,
  AMC_MIN_NET_WORTH,
  amcFundStockId,
  computeAmcFundNavPerShare,
  createAmcFund,
  evaluateAmcCompliance,
  foundAssetManager,
  isAmcFundStockId,
  rebalanceAmcFund,
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

console.log("asset manager founding · fee · compliance scenarios passed");

import assert from "node:assert";
import {
  AMC_FOUNDING_BURN,
  AMC_MIN_NET_WORTH,
  amcDividendHistoryAfter,
  amcFundStockId,
  applyAmcShareCreationRedemption,
  collectHoldingDividendCadences,
  computeAmcFundNavPerShare,
  computePassiveAmcAnnualDividendYield,
  createAmcFund,
  equalWeightHoldings,
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

assert.deepEqual(splitAmcSeed(100_000), { burned: 10_000, navValue: 90_000 });

// 누적 서버 현금원장은 재시도해도 한 번만 반영되고 이후 이벤트만 차액 적용.
const ledgerDebit = reconcileAmcLedgerCash(100_000, 0, -10_000)!;
assert.deepEqual(ledgerDebit, {
  cash: 90_000,
  appliedBalance: -10_000,
  delta: -10_000,
});
assert.deepEqual(
  reconcileAmcLedgerCash(ledgerDebit.cash, ledgerDebit.appliedBalance, -10_000),
  { cash: 90_000, appliedBalance: -10_000, delta: 0 },
);
assert.deepEqual(reconcileAmcLedgerCash(90_000, -10_000, -7_500), {
  cash: 92_500,
  appliedBalance: -7_500,
  delta: 2_500,
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

import assert from "node:assert/strict";
import {
  burryPredictionIsAccurate,
  wallStreetPredictionIsAccurate,
} from "../src/lib/market/institutionalPositions";
import { getLiquidityCrisisOpportunity } from "../src/lib/market/liquidityCrisis";
import {
  getLiquidityResolutionEventsForTick,
  liquidityRescueReturn,
  resolvedLiquidityInterventionAt,
  setLiquidityInterventions,
} from "../src/lib/market/liquidityInterventions";
import { getMarketCrisisWindow } from "../src/lib/market/marketCrises";

const wallStreetHits = Array.from(
  { length: 500 },
  (_, cycle) => wallStreetPredictionIsAccurate(cycle),
).filter(Boolean).length;
assert.equal(wallStreetHits, 400, "월가 전망은 정확히 80%가 적중해야 한다");

const burryHits = Array.from(
  { length: 10_000 },
  (_, cycle) => burryPredictionIsAccurate(cycle),
).filter(Boolean).length;
assert.equal(burryHits, 100, "버리 전망은 정확히 1%만 적중해야 한다");

const creditWindow = getMarketCrisisWindow(1);
assert.equal(creditWindow.theme.id, "credit-crunch");
const credit = getLiquidityCrisisOpportunity(creditWindow.startSession + 3);
assert.equal(credit?.kind, "credit-crunch");
assert.equal(
  credit?.institutionalCentsExact,
  (BigInt(credit?.targetCentsExact ?? "0") * 30n / 100n).toString(),
  "연기금·월가 선투입분은 목표액의 30%여야 한다",
);

const bankWindow = getMarketCrisisWindow(5);
assert.equal(bankWindow.theme.id, "bank-run");
assert.equal(
  getLiquidityCrisisOpportunity(bankWindow.startSession + 3)?.kind,
  "bank-liquidity",
);

setLiquidityInterventions([
  {
    crisisKey: credit!.crisisKey,
    kind: credit!.kind,
    startSession: credit!.startSession,
    endSession: credit!.endSession,
    resolved: true,
    effectiveTick: 1_000,
  },
]);
assert.equal(
  resolvedLiquidityInterventionAt(credit!.startSession + 3, 999),
  null,
  "효력 발생 전에는 위기가 진화되면 안 된다",
);
assert.equal(
  resolvedLiquidityInterventionAt(credit!.startSession + 3, 1_000)?.resolved,
  true,
);
assert.equal(getLiquidityResolutionEventsForTick(999, 1_000).length, 1);
assert.ok(
  liquidityRescueReturn(
    resolvedLiquidityInterventionAt(credit!.startSession + 3, 1_000),
    credit!.startSession + 3,
    1,
  ) > 0,
  "진화 뒤에는 신뢰 회복 수익률이 적용되어야 한다",
);

setLiquidityInterventions([]);
console.log("institutional liquidity tests passed");

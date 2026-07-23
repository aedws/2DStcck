import assert from "node:assert/strict";
import { createInitialStockState, normalizeStockSharePrice } from "../src/lib/market/engine";
import {
  MARGIN_LEVERAGE_OPTIONS,
  normalizeMarginLeverage,
} from "../src/lib/market/margin";
import {
  optionsGrossExposure,
} from "../src/lib/market/options";
import {
  computeProgressiveTaxExact,
  TAX_FREE_NET_WORTH_EXACT,
} from "../src/lib/market/taxes";
import { reconcileLeveragePositionSplits } from "../src/lib/market/leveragePositionSplits";
import { createDailyOperation, getDailyOperationProgress } from "../src/lib/market/dailyOperations";
import type { StockDefinition } from "../src/lib/types/market";

const definition: StockDefinition = {
  id: "balance-test",
  ticker: "BAL",
  name: "Balance Test",
  sector: "기술",
  initialPrice: 120_000,
  volatility: 0.01,
  drift: 0,
};
const now = 500 * 3_600_000;
const expensive = createInitialStockState(definition, now);
const split = normalizeStockSharePrice(expensive, now);
assert.equal(split.currentPrice, 12_000);
assert.equal(split.shareMultiplier, 10);

const reconciled = reconcileLeveragePositionSplits(
  [{ stockId: definition.id, quantity: 2, averagePrice: 120_000 }],
  [split],
).positions[0]!;
assert.equal(reconciled.quantity, 20);
assert.equal(reconciled.averagePrice, 12_000);
assert.equal(reconciled.quantity * split.currentPrice, 240_000);

const cooled = normalizeStockSharePrice(
  { ...split, currentPrice: 100 },
  now + 3_600_000,
);
assert.equal(cooled.currentPrice, 100, "5-session cooldown must prevent split oscillation");
const released = normalizeStockSharePrice(
  { ...split, currentPrice: 100 },
  now + 5 * 3_600_000,
);
assert.equal(released.currentPrice, 1_000, "split adjustment must resume after 5 sessions");
assert.equal(released.shareMultiplier, 1);

assert.deepEqual(MARGIN_LEVERAGE_OPTIONS, [1.25, 1.5, 1.75, 2]);
assert.equal(normalizeMarginLeverage(1.25), 1.25);
assert.equal(normalizeMarginLeverage(1.5), 1.5);
assert.equal(normalizeMarginLeverage(1.75), 1.75);
assert.equal(normalizeMarginLeverage(2), 2);
assert.equal(normalizeMarginLeverage(5), 2);
const longOptionExposure = optionsGrossExposure(
  [{
    id: "opt",
    stockId: definition.id,
    kind: "call",
    side: "long",
    strike: 12_000,
    expirySession: 510,
    quantity: 10,
    openPremium: 100,
    openedAt: now,
  }],
  [split],
  500,
  0.03,
);
assert.equal(longOptionExposure, 120_000, "long options use underlying notional, not premium");

assert.equal(
  computeProgressiveTaxExact("1000000000000", TAX_FREE_NET_WORTH_EXACT, "capital_gains_tax"),
  "0",
);
const taxable = BigInt(
  computeProgressiveTaxExact(
    "1000000000000",
    "200000000000000",
    "capital_gains_tax",
  ),
);
assert(taxable > 0n);
assert(taxable < 1000000000000n);

const operation = createDailyOperation("patient_watch", 500, 1_000_000, 50_000, now);
const progress = getDailyOperationProgress(operation, {
  now: now + 1_000,
  equity: 1_000_000,
  benchmarkPrice: 50_000,
  cash: 1_000_000,
  holdings: [],
  stocks: [],
  trades: [],
  marginCallAt: null,
});
assert.equal(progress.passing, true);
assert.match(progress.detail, /0\.0%/);

console.log("economic balance tests passed");

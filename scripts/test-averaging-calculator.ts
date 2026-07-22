import assert from "node:assert";
import {
  amountToReachTargetAverage,
  quantityFromAddAmount,
  quantityToReachTargetAverage,
  simulateAveragingBuy,
} from "../src/lib/market/averagingCalculator";

const base = simulateAveragingBuy({
  quantity: 10,
  averagePrice: 10_000,
  addPrice: 8_000,
  addQuantity: 10,
});
assert.equal(base.ok, true);
if (base.ok) {
  assert.equal(base.mode, "water");
  assert.equal(base.newQuantity, 20);
  assert.equal(base.newAveragePrice, 9_000);
  assert.equal(base.addCost, 80_000);
  assert.equal(base.totalCost, 180_000);
  assert.equal(base.averageDelta, -1_000);
}

const fire = simulateAveragingBuy({
  quantity: 10,
  averagePrice: 10_000,
  addPrice: 12_000,
  addQuantity: 10,
});
assert.equal(fire.ok, true);
if (fire.ok) {
  assert.equal(fire.mode, "fire");
  assert.equal(fire.newAveragePrice, 11_000);
}

const flat = simulateAveragingBuy({
  quantity: 5,
  averagePrice: 20_000,
  addPrice: 20_000,
  addQuantity: 5,
});
assert.equal(flat.ok, true);
if (flat.ok) {
  assert.equal(flat.mode, "flat");
  assert.equal(flat.newAveragePrice, 20_000);
}

assert.equal(
  simulateAveragingBuy({
    quantity: 0,
    averagePrice: 10_000,
    addPrice: 9_000,
    addQuantity: 1,
  }).ok,
  false,
);

const needQty = quantityToReachTargetAverage({
  quantity: 10,
  averagePrice: 10_000,
  addPrice: 8_000,
  targetAveragePrice: 9_000,
});
assert.ok(needQty !== null);
assert.ok(Math.abs(needQty! - 10) < 1e-9);

const needAmount = amountToReachTargetAverage({
  quantity: 10,
  averagePrice: 10_000,
  addPrice: 8_000,
  targetAveragePrice: 9_000,
});
assert.ok(needAmount !== null);
assert.ok(Math.abs(needAmount! - 80_000) < 1e-6);

assert.equal(
  quantityToReachTargetAverage({
    quantity: 10,
    averagePrice: 10_000,
    addPrice: 8_000,
    targetAveragePrice: 11_000,
  }),
  null,
);

assert.equal(
  quantityToReachTargetAverage({
    quantity: 10,
    averagePrice: 10_000,
    addPrice: 8_000,
    targetAveragePrice: 8_000,
  }),
  null,
);

assert.equal(quantityFromAddAmount(8_000, 40_000), 5);
assert.equal(quantityFromAddAmount(0, 40_000), null);

console.log("averaging calculator water/fire · target reverse scenarios passed");

import assert from "node:assert";
import {
  decimalToScaledInteger,
  exactAdd,
  exactAmountFromNumber,
  exactPercentChange,
  exactPositionValue,
  exactQuantityMultiply,
  formatExactMoney,
  formatExactPercent,
  normalizeExactAmount,
  normalizeExactQuantity,
} from "../src/lib/market/exactAmount";
import { reconcileAmcLedgerCash } from "../src/lib/player/amcLedger";

assert.equal(
  normalizeExactAmount("631890645106586400000000000000000000000000000000000000"),
  "631890645106586400000000000000000000000000000000000000",
);
assert.equal(
  exactAdd(
    "631890645106586400000000000000000000000000000000000000",
    "25",
  ),
  "631890645106586400000000000000000000000000000000000025",
);
assert.equal(decimalToScaledInteger("1.2345678", 6), 1_234_568n);
assert.equal(decimalToScaledInteger("6.318906451065864e+53", 0).toString(),
  "631890645106586400000000000000000000000000000000000000");
assert.equal(normalizeExactQuantity("1000000000000000000000.123456"), "1000000000000000000000.123456");
assert.equal(
  exactQuantityMultiply("1000000000000000000000.123456", 10),
  "10000000000000000000001.23456",
);
assert.equal(exactPositionValue(12345, "2.5"), "30863");
assert.equal(exactPercentChange("125", "100", 4), "25");
assert.equal(exactPercentChange("75", "100", 4), "-25");
assert.equal(formatExactMoney("123456789"), "$1.23M");
assert.equal(
  formatExactMoney(
    "631890645106586400000000000000000000000000000000000000",
  ),
  "$6.31e51",
);
assert.equal(formatExactPercent("726411673472286903911855472676773989612101804400", 2), "+7.26e47%");
assert.equal(exactAmountFromNumber(10_000_000), "10000000");
assert.deepEqual(
  reconcileAmcLedgerCash(
    Number("631890645106586400000000000000000000000000000000000000"),
    10,
    35,
    "631890645106586400000000000000000000000000000000000000",
    "10",
    "35",
  ),
  {
    cash: Number("631890645106586400000000000000000000000000000000000025"),
    cashExact:
      "631890645106586400000000000000000000000000000000000025",
    appliedBalance: 35,
    appliedBalanceExact: "35",
    delta: 25,
    deltaExact: "25",
  },
);

console.log("exact amount serialization · arithmetic · formatting passed");

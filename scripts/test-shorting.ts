import assert from "node:assert/strict";
import {
  coverShort,
  isShortQuoteStale,
  isShortSuccess,
  openShort,
  shortRealizedPnl,
} from "../src/lib/market/shorting";

const opened = openShort(
  1_000_000,
  [],
  "test-stock",
  "TEST",
  10_000,
  10,
  1,
  "1000000",
);
assert.ok(isShortSuccess(opened));
assert.equal(opened.cashExact, "1100000");
assert.equal(opened.shorts[0]?.quantity, 10);

const covered = coverShort(
  opened.cash,
  opened.shorts,
  "test-stock",
  "TEST",
  7_000,
  10,
  2,
  opened.cashExact,
);
assert.ok(isShortSuccess(covered));
assert.equal(covered.cashExact, "1030000");
assert.equal(covered.shorts.length, 0);
assert.equal(shortRealizedPnl(10_000, 7_000, 10), 30_000);

assert.equal(isShortQuoteStale(undefined, 3_971), false);
assert.equal(isShortQuoteStale(1_245, 1_300), false);
assert.equal(isShortQuoteStale(1_245, 3_971), true);
assert.equal(isShortQuoteStale(0, 1_245), true);

console.log("shorting cash and realized-profit scenarios passed");

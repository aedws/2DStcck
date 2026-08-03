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

// 레버리지 액면 변동으로 생긴 0.5주 소수 잔여 공매도도 청산할 수 있어야 한다
// (정수 청산만 허용하던 버그리포트 4caa66b0).
const fractionalShort = [
  {
    stockId: "lev-stock",
    quantity: 0.5,
    quantityExact: "0.500000",
    averagePrice: 20_000,
  },
];
const partialFraction = coverShort(
  0,
  fractionalShort,
  "lev-stock",
  "LEV",
  20_000,
  0.2,
  3,
  "0",
);
assert.ok(isShortSuccess(partialFraction), "소수 부분 청산이 실패하면 안 된다");
assert.equal(Number(partialFraction.shorts[0]?.quantityExact), 0.3);
assert.equal(partialFraction.shorts[0]?.quantity, 0.3);
assert.equal(partialFraction.cashExact, "-4000");

const fullFraction = coverShort(
  0,
  fractionalShort,
  "lev-stock",
  "LEV",
  20_000,
  0.5,
  4,
  "0",
);
assert.ok(isShortSuccess(fullFraction), "소수 잔여 전량 청산이 실패하면 안 된다");
assert.equal(fullFraction.shorts.length, 0, "전량 청산 후 포지션이 남으면 안 된다");

// 보유 잔량보다 많이 청산하려 하면 정확히 거부해야 한다(정밀 원장 기준).
const overCover = coverShort(0, fractionalShort, "lev-stock", "LEV", 20_000, 0.6, 5, "0");
assert.equal(isShortSuccess(overCover), false, "잔량 초과 청산은 거부돼야 한다");

console.log("shorting cash and realized-profit scenarios passed");

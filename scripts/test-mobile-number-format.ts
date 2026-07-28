import assert from "node:assert/strict";
import {
  formatCompactMoney,
  formatCompactQuantity,
} from "../src/lib/market/engine";

assert.equal(formatCompactMoney(1e35), "$1.00Dc");
assert.equal(formatCompactMoney(1e62), "$1.00e60");
assert.ok(
  formatCompactMoney(9.876e80).length < 16,
  "초거대 AUM도 모바일 카드 폭을 밀지 않는 길이여야 함",
);

assert.equal(formatCompactQuantity(1_234_000_000, "좌"), "1.23B좌");
assert.equal(formatCompactQuantity(1e60, "좌"), "1.00e60좌");
assert.ok(
  formatCompactQuantity(9.876e80, "좌").length < 16,
  "초거대 보유 좌수도 지수 표기로 축약해야 함",
);

console.log("mobile number format tests passed");

import assert from "node:assert/strict";
import { calculatePlayerCompanyDividendBudget } from "../src/lib/player/playerCompanyDividend";

const hugeCash =
  "12881594026895514357954178462485961209868030271937033030979346078990616540703617949907283681";
const shares = "91089354066910930";
const budget = calculatePlayerCompanyDividendBudget(hugeCash, shares, 0.01);

assert.equal(
  budget.totalCentsExact,
  (
    (BigInt(hugeCash) * 10_000n + 500_000n) /
    1_000_000n
  ).toString(),
);
assert.ok(
  BigInt(budget.perShareCentsExact) > 9_223_372_036_854_775_807n,
  "초고액 계정의 좌당 배당이 bigint 상한을 넘어서는 회귀 조건이 필요합니다.",
);
assert.ok(
  BigInt(budget.perShareCentsExact) * BigInt(shares) <=
    BigInt(budget.totalCentsExact),
);

assert.deepEqual(calculatePlayerCompanyDividendBudget("1000000", 100, 0), {
  totalCentsExact: "0",
  perShareCentsExact: "0",
});

console.log("player company exact dividend tests passed");

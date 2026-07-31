import assert from "node:assert/strict";
import { calculatePlayerCompanyDividendBudget } from "../src/lib/player/playerCompanyDividend";
import {
  formatSignedExactMoney,
  formatSignedFullExactMoney,
} from "../src/lib/market/exactAmount";
import { cashPaymentKindLabel } from "../src/lib/market/cashPaymentDisplay";

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

const debitExact = `-${budget.totalCentsExact}`;
assert.ok(formatSignedExactMoney(debitExact).startsWith("-$"));
assert.ok(
  formatSignedFullExactMoney(debitExact).includes(","),
  "초고액 배당 차감은 전체 자릿수도 확인할 수 있어야 합니다.",
);
assert.equal(
  cashPaymentKindLabel({
    id: "special",
    kind: "company_special_dividend",
    sourceId: "company",
    amount: -1,
  }),
  "특별배당 재원",
);
assert.equal(
  cashPaymentKindLabel({
    id: "regular",
    kind: "company_regular_dividend",
    sourceId: "company",
    amount: -1,
  }),
  "정기배당 재원",
);
assert.equal(
  cashPaymentKindLabel({
    id: "pcdiv-burn-legacy",
    kind: "company_capital",
    sourceId: "company",
    amount: -1,
  }),
  "회사 배당 재원",
);

console.log("player company exact dividend tests passed");

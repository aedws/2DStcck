import assert from "node:assert/strict";
import {
  calculatePlayerCompanyDividendBudget,
  isPlayerCompanyDividendPerShareSane,
} from "../src/lib/player/playerCompanyDividend";
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

const ultraSmallRate = 2.5e-51;
const ultraSmallBudget = calculatePlayerCompanyDividendBudget(
  hugeCash,
  shares,
  ultraSmallRate,
);
assert.equal(
  ultraSmallBudget.totalCentsExact,
  ((BigInt(hugeCash) * 25n + 5n * 10n ** 51n) / 10n ** 52n).toString(),
  "초고액 계정에서 0.000001%보다 작은 배당률도 0원으로 소실되면 안 됩니다.",
);
assert.ok(BigInt(ultraSmallBudget.totalCentsExact) > 0n);
assert.ok(BigInt(ultraSmallBudget.perShareCentsExact) > 0n);

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

// 좌당 배당 상한: 정상 배당은 통과하고, 오염된 총자산에서 나온 천문학적
// 좌당 배당(주가 대비 수천억 배)은 차단해야 한다(버그리포트 79118168).
assert.equal(
  isPlayerCompanyDividendPerShareSane("0", 48_000),
  true,
  "0원 좌당 배당은 상한과 무관해야 합니다.",
);
assert.equal(
  isPlayerCompanyDividendPerShareSane("120000", 48_000),
  true,
  "주가의 2.5배 정도의 넉넉한 특별배당은 통과해야 합니다.",
);
// $239T/주(= 2.39e16센트)는 $480(48,000센트) 종목 기준 명백한 버그성 값.
assert.equal(
  isPlayerCompanyDividendPerShareSane("23965847115065100", 48_000),
  false,
  "천문학적 좌당 배당은 차단돼야 합니다.",
);
// 상한(주가 × 100만) 경계: 정확히 상한이면 통과, 1센트 초과면 차단.
assert.equal(
  isPlayerCompanyDividendPerShareSane("48000000000", 48_000),
  true,
);
assert.equal(
  isPlayerCompanyDividendPerShareSane("48000000001", 48_000),
  false,
);
// 현재가가 0 이하면(가격 미확정) 보수적으로 차단한다.
assert.equal(isPlayerCompanyDividendPerShareSane("1", 0), false);
assert.equal(
  BigInt(budget.perShareCentsExact) > 0n &&
    isPlayerCompanyDividendPerShareSane(budget.perShareCentsExact, 48_000),
  false,
  "오염된 초고액 계정의 좌당 배당은 상한에 걸려야 합니다.",
);

console.log("player company exact dividend tests passed");

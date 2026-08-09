import assert from "node:assert/strict";
import { isExactBackedFiniteAmount } from "../src/lib/market/overflowRecovery";

const requestedRecovery = `12${"0".repeat(149)}`;
const requestedRecoveryNumber = Number(requestedRecovery);

assert.equal(Number.isFinite(requestedRecoveryNumber), true);
assert.equal(
  isExactBackedFiniteAmount(requestedRecoveryNumber, requestedRecovery),
  true,
  "exact 문자열이 보존된 초고액 복구금은 오버플로 리셋 대상이 아니다",
);
assert.equal(
  isExactBackedFiniteAmount(requestedRecoveryNumber, "491"),
  false,
  "현재 숫자와 불일치하는 exact 필드는 신뢰하지 않는다",
);
assert.equal(isExactBackedFiniteAmount(Infinity, requestedRecovery), false);
assert.equal(isExactBackedFiniteAmount(100, "1e2"), false);

console.log("exact-backed overflow recovery tests passed");


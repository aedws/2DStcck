import assert from "node:assert";
import {
  OPERATIONAL_COMPENSATIONS,
  settleOperationalCompensations,
} from "../src/lib/market/operationalCompensation";
import type { CashPayment } from "../src/lib/types/market";

const compensation = OPERATIONAL_COMPENSATIONS[0];
const payment = (timestamp: number): CashPayment => ({
  id: `operational-${compensation.id}`,
  kind: "compensation",
  sourceId: "operations",
  dueSession: 1,
  amount: compensation.amountCents,
  timestamp,
});

const first = settleOperationalCompensations({
  cash: 1_000_000,
  cashPayments: [],
  claimedCompensationIds: [],
  now: 100,
});
assert.equal(first.cash, 1_000_000 + compensation.amountCents);
assert.equal(first.grantedCents, compensation.amountCents);
assert.equal(first.reconciledCents, 0);
assert.equal(first.cashPayments.length, 1);
assert.deepEqual(first.claimedCompensationIds, [compensation.id]);

// 정식 수령 표식이 남아 있으면 재실행해도 다시 지급하지 않는다.
const repeated = settleOperationalCompensations({
  cash: first.cash,
  cashPayments: first.cashPayments,
  claimedCompensationIds: first.claimedCompensationIds,
  now: 200,
});
assert.equal(repeated.cash, first.cash);
assert.equal(repeated.grantedCents, 0);

// 클라우드 경합으로 claimed 목록만 유실돼도 고유 지급 ID가 수령 증거가 된다.
const recoveredClaim = settleOperationalCompensations({
  cash: first.cash,
  cashPayments: first.cashPayments,
  claimedCompensationIds: [],
  now: 300,
});
assert.equal(recoveredClaim.cash, first.cash);
assert.equal(recoveredClaim.grantedCents, 0);
assert.deepEqual(recoveredClaim.claimedCompensationIds, [compensation.id]);

// 이미 두 번 들어온 같은 운영 보상은 내역과 현금을 정확히 1회분으로 정정한다.
const duplicate = settleOperationalCompensations({
  cash: 1_000_000 + compensation.amountCents * 2,
  cashPayments: [payment(200), payment(100)],
  claimedCompensationIds: [],
  now: 400,
});
assert.equal(duplicate.cash, 1_000_000 + compensation.amountCents);
assert.equal(duplicate.cashPayments.length, 1);
assert.equal(duplicate.grantedCents, 0);
assert.equal(duplicate.reconciledCents, compensation.amountCents);
assert.deepEqual(duplicate.claimedCompensationIds, [compensation.id]);

console.log("operational compensation idempotency & reconciliation scenarios passed");

import assert from "node:assert";
import {
  STOCK_REQUEST_COST,
  STOCK_REQUEST_PROGRESS,
  STOCK_REQUEST_STATUS_LABEL,
  stockRequestProgressIndex,
  stockRequestRefundCents,
  type StockRequestStatus,
} from "../src/lib/supabase/stockRequests";

const refund = (status: StockRequestStatus, costPaid: number) =>
  stockRequestRefundCents({ status, cost_paid: costPaid });

assert.equal(refund("pending", STOCK_REQUEST_COST), 0);
assert.equal(refund("reviewing", STOCK_REQUEST_COST), 0);
assert.equal(refund("accepted", STOCK_REQUEST_COST), 0);
assert.equal(refund("shipped", STOCK_REQUEST_COST), 0);
assert.equal(refund("rejected", STOCK_REQUEST_COST), STOCK_REQUEST_COST);

// 과거에 비용이 달랐던 정상 기록은 실제 결제액까지만 환불한다.
assert.equal(refund("rejected", 1_000_000), 1_000_000);
// 변조된 감사 필드는 현재 신청 비용을 넘겨 환불할 수 없다.
assert.equal(refund("rejected", STOCK_REQUEST_COST * 100), STOCK_REQUEST_COST);
assert.equal(refund("rejected", -1), 0);
assert.equal(refund("rejected", Number.NaN), 0);

assert.deepEqual(STOCK_REQUEST_PROGRESS, [
  "pending",
  "reviewing",
  "accepted",
  "shipped",
]);
assert.equal(stockRequestProgressIndex("pending"), 0);
assert.equal(stockRequestProgressIndex("reviewing"), 1);
assert.equal(stockRequestProgressIndex("accepted"), 2);
assert.equal(stockRequestProgressIndex("shipped"), 3);
assert.equal(stockRequestProgressIndex("rejected"), -1);
assert.deepEqual(
  Object.values(STOCK_REQUEST_STATUS_LABEL),
  ["대기", "검토 중", "반영 예정", "반려", "반영 완료"],
);

console.log("stock request status, rejection & refund scenarios passed");

import assert from "node:assert";
import {
  STOCK_REQUEST_COST,
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

console.log("stock request rejection & refund scenarios passed");

import assert from "node:assert";
import {
  COMPANY_FOUNDATION_REQUEST_MARKER,
  COMPANY_FOUNDATION_STATUS_LABEL,
  isCompanyFoundationRequestRow,
  parseCompanyFoundationRequest,
  serializeCompanyFoundationRequest,
} from "../src/lib/supabase/companyFoundationRequests";
import type { StockRequestRow } from "../src/lib/supabase/stockRequests";

const input = {
  name: "오로라 캐피털",
  ticker: "aura",
  sector: "금융",
  subsector: "초고액 자산 운용",
  description: "천문학적 자본을 태워 성장하는 비상장 회사.",
};

const serialized = serializeCompanyFoundationRequest(input);
assert.ok(serialized.startsWith(COMPANY_FOUNDATION_REQUEST_MARKER));
assert.ok(serialized.includes('"ticker":"AURA"'));

const row: StockRequestRow = {
  id: "req-1",
  user_id: "user-1",
  game_id: "tester",
  sector: "금융",
  name: input.name,
  description: serialized,
  reference_url: null,
  cost_paid: 0,
  status: "accepted",
  admin_note: null,
  created_at: "2026-07-22T00:00:00.000Z",
  updated_at: "2026-07-22T00:00:00.000Z",
};

assert.equal(isCompanyFoundationRequestRow(row), true);

const parsed = parseCompanyFoundationRequest(row);
assert.ok(parsed);
assert.equal(parsed.company.ticker, "AURA");
assert.equal(parsed.company.subsector, input.subsector);
assert.equal(parsed.company.description, input.description);

const regularRow: StockRequestRow = {
  ...row,
  description: "일반 IPO 요청",
};
assert.equal(isCompanyFoundationRequestRow(regularRow), false);
assert.equal(parseCompanyFoundationRequest(regularRow), null);

assert.deepEqual(Object.keys(COMPANY_FOUNDATION_STATUS_LABEL).sort(), [
  "accepted",
  "pending",
  "rejected",
  "reviewing",
  "shipped",
]);

console.log("company foundation request serialize/parse scenarios passed");

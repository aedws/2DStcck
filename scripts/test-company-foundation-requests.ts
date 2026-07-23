import assert from "node:assert";
import {
  COMPANY_FOUNDATION_REQUEST_MARKER,
  COMPANY_FOUNDATION_STATUS_LABEL,
  isCompanyFoundationRequestRow,
  parseCompanyFoundationRequest,
  selectCurrentCompanyFoundationRequest,
  serializeCompanyFoundationRequest,
} from "../src/lib/supabase/companyFoundationRequests";
import type { StockRequestRow } from "../src/lib/supabase/stockRequests";
import { recoverPlayerCompanyFromServerRecords } from "../src/lib/player/serverEntityRecovery";
import type { CashPayment } from "../src/lib/types/market";
import { parsePublicPlayerCompany } from "../src/lib/supabase/publicPlayerCompanies";

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

const rejectedRow: StockRequestRow = {
  ...row,
  status: "rejected",
  admin_note: "티커가 기존 상장사와 혼동됩니다.",
};
const rejected = parseCompanyFoundationRequest(rejectedRow);
assert.ok(rejected);
assert.equal(rejected.status, "rejected");
assert.equal(rejected.adminNote, "티커가 기존 상장사와 혼동됩니다.");
assert.equal(
  selectCurrentCompanyFoundationRequest([rejected, parsed])?.id,
  parsed.id,
  "과거 반려가 있어도 최신 유효 허가를 선택한다",
);

assert.equal(
  recoverPlayerCompanyFromServerRecords([parsed], [], 500),
  null,
  "승인만 받고 설립하지 않은 회사는 자동 생성하지 않는다",
);
const foundingPayment: CashPayment = {
  id: "company-founding-player-company-123",
  kind: "company_capital",
  sourceId: "player-company-123",
  ticker: "AURA",
  dueSession: 400,
  amount: -20_000_000_000,
  timestamp: Date.parse("2026-07-22T01:00:00.000Z"),
};
const recovered = recoverPlayerCompanyFromServerRecords(
  [parsed],
  [foundingPayment],
  500,
);
assert.ok(recovered);
assert.equal(recovered.entity.id, "player-company-123");
assert.equal(recovered.entity.name, input.name);
assert.equal(recovered.entity.foundingCost, 20_000_000_000);
assert.equal(recovered.shouldMarkShipped, true);

const ipoRequest: StockRequestRow = {
  ...regularRow,
  id: "ipo-1",
  name: "오로라 캐피털 (AURA)",
  description: "[플레이어 회사 IPO]\n실제 설립 뒤 제출한 IPO 신청",
  status: "pending",
  created_at: "2026-07-22T02:00:00.000Z",
  updated_at: "2026-07-22T02:00:00.000Z",
};
const recoveredFromIpo = recoverPlayerCompanyFromServerRecords(
  [parsed],
  [],
  500,
  Date.parse("2026-07-22T03:00:00.000Z"),
  [ipoRequest],
);
assert.ok(recoveredFromIpo);
assert.equal(recoveredFromIpo.entity.status, "ipo-requested");
assert.equal(
  recoveredFromIpo.entity.ipoRequestedAt,
  Date.parse(ipoRequest.created_at),
);
assert.equal(recoveredFromIpo.shouldMarkShipped, true);

const publicCompany = parsePublicPlayerCompany({
  founder_game_id: "founder_01",
  company_id: "player-company-123",
  company_name: "오로라 캐피털",
  ticker: "aura",
  sector: "금융",
  subsector: "자산 운용",
  description: "공개 회사 소개",
  company_status: "active",
  founded_at: "1784682000000",
});
assert.ok(publicCompany);
assert.equal(publicCompany.founderGameId, "founder_01");
assert.equal(publicCompany.ticker, "AURA");
const approvedPublicCompany = parsePublicPlayerCompany({
  founder_game_id: "luxury",
  company_id: "foundation-request:req-nexr",
  company_name: "NexR",
  ticker: "nexr",
  sector: "반도체",
  subsector: "종합반도체",
  description: "공개 설립 허가 소개",
  company_status: "foundation-accepted",
  founded_at: String(Date.parse("2026-07-22T08:21:25.351Z")),
});
assert.ok(approvedPublicCompany);
assert.equal(approvedPublicCompany.status, "foundation-accepted");
assert.equal(approvedPublicCompany.founderGameId, "luxury");
assert.equal(
  parsePublicPlayerCompany({
    founder_game_id: "",
    company_id: "broken",
    company_name: "누락",
    ticker: "NONE",
    sector: "금융",
    subsector: null,
    description: null,
    company_status: "active",
    founded_at: null,
  }),
  null,
);

console.log("company foundation request serialize/parse scenarios passed");

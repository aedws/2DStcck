import assert from "node:assert";
import {
  createAmcFund,
  foundAssetManager,
  AMC_FOUNDING_BURN,
  AMC_MIN_NET_WORTH,
} from "../src/lib/player/assetManager";
import {
  parseAmcEtfListingRequest,
  serializeAmcEtfListingRequest,
  AMC_ETF_LISTING_DESCRIPTION_MAX_LENGTH,
  AMC_ETF_LISTING_REQUEST_MARKER,
} from "../src/lib/supabase/amcEtfListingRequests";
import type { StockRequestRow } from "../src/lib/supabase/stockRequests";
import type { AmcFoundationRequest } from "../src/lib/supabase/amcFoundationRequests";
import { recoverAssetManagerFromServerRecords } from "../src/lib/player/serverEntityRecovery";

const prices: Record<string, number> = { a: 10_000, b: 20_000, c: 30_000, bench: 15_000 };
const priceOf = (id: string) => prices[id] ?? 0;
const initialOf = (id: string) => prices[id] ?? 0;

const founded = foundAssetManager(
  { name: "허가운용", tagline: "테스트 한줄" },
  5_000_000,
  AMC_MIN_NET_WORTH,
  "req",
  100,
);
assert.ok(founded.manager);

const created = createAmcFund(
  founded.manager!,
  {
    name: "허가ETF",
    ticker: "APRV",
    style: "passive",
    feeRate: 0.005,
    holdings: [
      { stockId: "a", weight: 1 / 3 },
      { stockId: "b", weight: 1 / 3 },
      { stockId: "c", weight: 1 / 3 },
    ],
    seedCash: 100_000,
    splitTriggerPrice: 500,
    splitRatio: 5,
    reverseSplitTriggerPrice: 5,
    reverseSplitRatio: 2,
  },
  founded.cash!,
  100,
  priceOf,
  initialOf,
);
assert.ok(created.fund);

const description = serializeAmcEtfListingRequest(
  created.fund!,
  created.manager!,
);
assert.ok(description.startsWith(AMC_ETF_LISTING_REQUEST_MARKER));

const row: StockRequestRow = {
  id: "listing-1",
  user_id: "u1",
  game_id: "g1",
  sector: "유저ETF",
  name: created.fund!.name,
  description,
  reference_url: null,
  cost_paid: 0,
  status: "accepted",
  admin_note: null,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};
const parsed = parseAmcEtfListingRequest(row);
assert.ok(parsed);
assert.equal(parsed!.payload.fundId, created.fund!.id);
assert.equal(parsed!.payload.ticker, "APRV");
assert.equal(parsed!.status, "accepted");
assert.equal(parsed!.payload.splitTriggerPrice, 500);
assert.equal(parsed!.payload.splitRatio, 5);
assert.equal(parsed!.payload.reverseSplitTriggerPrice, 5);
assert.equal(parsed!.payload.reverseSplitRatio, 2);

const maximumFund = {
  ...created.fund!,
  holdings: Array.from({ length: 30 }, (_, index) => ({
    stockId: `holding-${index.toString().padStart(2, "0")}`,
    weight: 1 / 30,
    basePrice: 123_456 + index,
  })),
};
const maximumDescription = serializeAmcEtfListingRequest(
  maximumFund,
  created.manager!,
);
assert.ok(
  maximumDescription.length > 1_000,
  "30종목 신청은 구 서버 1,000자 제한을 재현해야 함",
);
assert.ok(
  maximumDescription.length <= AMC_ETF_LISTING_DESCRIPTION_MAX_LENGTH,
  "최대 30종목 신청이 새 서버 저장 한도 안에 들어야 함",
);
assert.ok(
  parseAmcEtfListingRequest({
    ...row,
    id: "listing-maximum",
    description: maximumDescription,
  }),
  "최대 30종목 상장 신청을 정상 복원해야 함",
);

const pumpDescription = serializeAmcEtfListingRequest(
  {
    ...created.fund!,
    holdings: [
      { stockId: "a", weight: 1 / 3 },
      { stockId: "b", weight: 1 / 3 },
      { stockId: "pump-12345", weight: 1 / 3 },
    ],
  },
  created.manager!,
);
assert.equal(
  parseAmcEtfListingRequest({
    ...row,
    id: "listing-pump",
    description: pumpDescription,
  }),
  null,
  "급등주가 든 상장 신청은 복원 단계에서도 거절해야 함",
);

const foundationRequest: AmcFoundationRequest = {
  id: "amc-foundation-1",
  userId: "u1",
  gameId: "g1",
  status: "accepted",
  company: { name: "허가운용", tagline: "테스트 한줄" },
  adminNote: null,
  createdAt: "2026-07-22T00:00:00.000Z",
  updatedAt: "2026-07-22T00:10:00.000Z",
};
const recoveredManager = recoverAssetManagerFromServerRecords(
  [foundationRequest],
  [parsed!],
  [],
  500,
);
assert.ok(recoveredManager);
assert.equal(recoveredManager.entity.name, "허가운용");
assert.equal(recoveredManager.entity.funds.length, 1);
assert.equal(recoveredManager.entity.funds[0]!.ticker, "APRV");
assert.equal(recoveredManager.entity.funds[0]!.splitTriggerPrice, 500);
assert.equal(recoveredManager.entity.funds[0]!.reverseSplitTriggerPrice, 5);
assert.equal(recoveredManager.shouldMarkShipped, true);

console.log("amc etf listing request serialize/parse passed");

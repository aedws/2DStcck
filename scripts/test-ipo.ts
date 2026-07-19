import assert from "node:assert";
import {
  isListed,
  isUpcomingIpo,
  msUntilListing,
  listingTickOf,
  isRecentlyListed,
  upcomingIpos,
} from "../src/lib/market/ipo";
import { SIM_TICK_MS, SESSION_DURATION_MS } from "../src/lib/market/constants";
import {
  EARNINGS_INTERVAL_SESSIONS,
  getEarningsCalendar,
} from "../src/lib/market/earningsCalendar";
import { getCompanyDefinitions } from "../src/data/stocks";
import { stockHref } from "../src/lib/ui/stockLink";

const now = 1_000_000_000_000;

// 예정 없음 → 항상 상장
assert.equal(isListed({}, now), true);
assert.equal(isUpcomingIpo({}, now), false);
assert.equal(listingTickOf({}), Number.NEGATIVE_INFINITY);

// 미래 상장 → 상장 전
const future = { listingEpochMs: now + 3 * 3600_000 }; // 3시간 후
assert.equal(isListed(future, now), false);
assert.equal(isUpcomingIpo(future, now), true);
assert.equal(msUntilListing(future, now), 3 * 3600_000);
assert.equal(listingTickOf(future), Math.floor(future.listingEpochMs / SIM_TICK_MS));

// 과거 상장 → 상장됨
const past = { listingEpochMs: now - 1000 };
assert.equal(isListed(past, now), true);
assert.equal(isUpcomingIpo(past, now), false);
assert.equal(msUntilListing(past, now), 0);

// 최근 상장 판정
assert.equal(isRecentlyListed(past, 24 * 3600_000, now), true);
assert.equal(isRecentlyListed({ listingEpochMs: now - 48 * 3600_000 }, 24 * 3600_000, now), false);
assert.equal(isRecentlyListed({}, 24 * 3600_000, now), false);

// 정렬: 임박 순
const defs = [
  { id: "a", listingEpochMs: now + 5000 },
  { id: "b", listingEpochMs: now + 1000 },
  { id: "c" }, // 이미 상장
  { id: "d", listingEpochMs: now - 1000 }, // 이미 상장
] as { id: string; listingEpochMs?: number }[];
const up = upcomingIpos(defs as never, now).map((d) => d.id);
assert.deepEqual(up, ["b", "a"]);

// 급등주 링크는 전용 /pump, 일반 종목은 /stock/[id]
assert.equal(stockHref("pump-495692"), "/pump");
assert.equal(stockHref({ id: "pump-1" }), "/pump");
assert.equal(stockHref("vnasdaq"), "/stock/vnasdaq");
assert.equal(stockHref({ id: "dante" }), "/stock/dante");

// 실적 캘린더: 상장 예정(IPO) 기업은 상장 세션 전에는 노출되지 않는다.
const upcomingCompany = getCompanyDefinitions().find(
  (c) => c.listingEpochMs && c.listingEpochMs > Date.now(),
);
if (upcomingCompany) {
  const listSession = Math.floor(upcomingCompany.listingEpochMs! / SESSION_DURATION_MS);
  // 상장 세션 직전 구간에는 이 기업의 실적이 없어야 한다.
  const before = getEarningsCalendar(listSession - EARNINGS_INTERVAL_SESSIONS, listSession - 1);
  assert.equal(
    before.some((e) => e.company.id === upcomingCompany.id),
    false,
    "상장 전 IPO 기업이 실적 캘린더에 노출됨",
  );
}

console.log("ipo listing · pump-link · earnings-gate scenarios passed");

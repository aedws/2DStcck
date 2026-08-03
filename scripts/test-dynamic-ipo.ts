/**
 * 관리자 즉시 IPO(동적 상장) 회귀 테스트.
 *  1) 입력 정규화·검증(범위 클램프, 잘못된 값 거부).
 *  2) 결정론: 미래 상장하는 동적 종목을 추가해도 기존 종목의 가격 경로가 한 틱도
 *     바뀌지 않는다(=클라이언트 간 desync·체크포인트 불일치 없음).
 *  3) 동적 종목은 회사 지정 이벤트 추첨 풀에서 제외되고, 상장 전엔 공모가로 동결된다.
 */
import assert from "node:assert";
import {
  normalizeStoredIpoListing,
  setDynamicListingDefs,
  getDynamicListingDefs,
} from "../src/lib/market/dynamicListings";
import {
  BUNDLED_STOCK_IDS,
  getCompanyDefinitions,
  getRuntimeStockDefinitions,
} from "../src/data/stocks";
import { createGenesisStocks, replayMarket } from "../src/lib/market/localSim";

// ── 1) 정규화·검증 ──
assert.equal(
  normalizeStoredIpoListing({ id: "1bad", ticker: "X", name: "n", sector: "금융", listingEpochMs: 1 }),
  null,
  "숫자로 시작하는 id는 거부",
);
assert.equal(
  normalizeStoredIpoListing({ id: "koyu", ticker: "", name: "n", sector: "금융", listingEpochMs: 1 }),
  null,
  "빈 티커는 거부",
);
const clamped = normalizeStoredIpoListing({
  id: "koyu",
  ticker: "koyu",
  name: "코유키 정보해석",
  sector: "기술",
  initialPrice: 999_999_999, // 상한 초과
  volatility: 5, // 상한 초과
  drift: 9, // 상한 초과
  beta: -3, // 하한 미만
  listingEpochMs: Date.UTC(2035, 0, 1),
});
assert.ok(clamped, "유효 입력은 정규화됨");
assert.equal(clamped!.ticker, "KOYU", "티커 대문자화");
assert.ok(clamped!.initialPrice <= 10_000_000, "공모가 상한 클램프");
assert.ok(clamped!.volatility <= 0.2, "변동성 상한 클램프");
assert.ok(clamped!.drift <= 0.005, "드리프트 상한 클램프");
assert.ok(clamped!.beta >= 0, "베타 하한 클램프");

// 도감 캐릭터 연동: 올바른 chr_ id 는 보존, 잘못된 값은 제거.
const withCeo = normalizeStoredIpoListing({
  id: "koyu",
  ticker: "koyu",
  name: "코유키",
  sector: "기술",
  ceoId: "chr_minori",
  listingEpochMs: Date.UTC(2035, 0, 1),
});
assert.equal(withCeo!.ceoId, "chr_minori", "유효한 도감 캐릭터 id 보존");
const badCeo = normalizeStoredIpoListing({
  id: "koyu",
  ticker: "koyu",
  name: "코유키",
  sector: "기술",
  ceoId: "not-a-char",
  listingEpochMs: Date.UTC(2035, 0, 1),
});
assert.equal(badCeo!.ceoId, undefined, "잘못된 캐릭터 id 는 제거");

// ── 기준: 동적 상장 없이 리플레이 ──
setDynamicListingDefs([], BUNDLED_STOCK_IDS);
assert.equal(getDynamicListingDefs().length, 0, "레지스트리 비움");
const FROM = 0;
const TO = 600;
const baseline = replayMarket(createGenesisStocks(), [], FROM, TO);
const baselineById = new Map(baseline.stocks.map((s) => [s.id, s.currentPrice]));
const sampleIds = ["minori", "faust", "honglu", "baqqq", "vnasdaq"].filter((id) =>
  baselineById.has(id),
);
assert.ok(sampleIds.length >= 3, "표본 종목 존재");
const companyCountBefore = getCompanyDefinitions().length;

// ── 2) 미래 상장하는 동적 종목 추가 후 동일 리플레이 ──
const listing = normalizeStoredIpoListing({
  id: "zztest",
  ticker: "ZZT",
  name: "테스트 상장",
  sector: "기술",
  initialPrice: 500_000, // $5,000
  volatility: 0.05,
  drift: 0.001,
  beta: 1.2,
  listingEpochMs: Date.UTC(2035, 0, 1), // 리플레이 구간보다 한참 미래
});
assert.ok(listing, "동적 상장 정규화");
const applied = setDynamicListingDefs([listing!], BUNDLED_STOCK_IDS);
assert.equal(applied, 1, "동적 상장 1건 반영");
assert.ok(
  getRuntimeStockDefinitions().some((d) => d.id === "zztest"),
  "런타임 정의에 동적 종목 포함",
);

const withDynamic = replayMarket(createGenesisStocks(), [], FROM, TO);
const withById = new Map(withDynamic.stocks.map((s) => [s.id, s.currentPrice]));

// 기존 종목의 가격이 한 틱도 바뀌지 않아야 한다.
for (const id of sampleIds) {
  assert.equal(
    withById.get(id),
    baselineById.get(id),
    `동적 상장 추가가 기존 종목(${id}) 가격을 바꾸지 않음`,
  );
}

// 동적 종목은 상장 전이라 공모가로 동결.
assert.equal(withById.get("zztest"), 500_000, "상장 전 동적 종목은 공모가 동결");

// 동적 종목은 회사 이벤트 추첨 풀(getCompanyDefinitions)에서 제외.
assert.equal(
  getCompanyDefinitions().length,
  companyCountBefore,
  "동적 종목은 회사 이벤트 추첨 풀에서 제외",
);
assert.ok(
  !getCompanyDefinitions().some((d) => d.id === "zztest"),
  "동적 종목은 회사 정의 목록에 없음",
);

// 번들 id 와 충돌하면 무시.
const conflictId = [...BUNDLED_STOCK_IDS][0];
const conflict = setDynamicListingDefs(
  [{ ...listing!, id: conflictId }],
  BUNDLED_STOCK_IDS,
);
assert.equal(conflict, 0, "번들 종목 id 와 충돌하는 동적 상장은 무시");

// 정리.
setDynamicListingDefs([], BUNDLED_STOCK_IDS);

console.log(
  `✅ dynamic-ipo: 정규화·결정론(기존 ${sampleIds.length}종목 불변)·이벤트 풀 제외·충돌 무시 검증 통과`,
);

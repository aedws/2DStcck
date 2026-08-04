import assert from "node:assert";
import {
  isListed,
  isUpcomingIpo,
  msUntilListing,
  listingTickOf,
  isRecentlyListed,
  upcomingIpos,
} from "../src/lib/market/ipo";
import {
  MARKET_EPOCH_MS,
  SIM_TICK_MS,
  SESSION_DURATION_MS,
} from "../src/lib/market/constants";
import {
  calculateTickPrice,
  createInitialStockState,
  resolveAsunaAdversityFollowUp,
  resolveEventTemplate,
  tickAllStocks,
} from "../src/lib/market/engine";
import { corporateActionKindsForCompany } from "../src/lib/market/corporateActions";
import { replayMarket } from "../src/lib/market/localSim";
import {
  EARNINGS_INTERVAL_SESSIONS,
  getEarningsCalendar,
} from "../src/lib/market/earningsCalendar";
import {
  EVENT_TEMPLATES,
  STOCK_DEFINITIONS,
  getCompanyDefinitions,
} from "../src/data/stocks";
import { getCharacterById } from "../src/data/characters";
import { stockHref } from "../src/lib/ui/stockLink";
import { getCharacterGuideline } from "../src/lib/market/marketGuidelines";
import {
  belowInitialPriceBuybackReturn,
  effectiveQuarterlyDividend,
} from "../src/lib/market/shareholderPolicy";
import {
  getMarketEra,
  MARKET_ERA_SESSIONS,
  MARKET_ERA_START_SESSION,
} from "../src/lib/market/marketEras";
import { processRecurringInvestments } from "../src/lib/market/recurringInvestments";

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
assert.equal(
  listingTickOf(future),
  Math.floor((future.listingEpochMs - MARKET_EPOCH_MS) / SIM_TICK_MS),
);

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

// 레이센 제약 공식 티커
const reisen = getCompanyDefinitions().find((stock) => stock.id === "udnge");
assert.ok(reisen, "레이센 제약 정의가 없음");
assert.equal(reisen.ticker, "UDGE");

// 모든 예약 IPO: 상장 틱부터 결정론 시세·캔들 생성
const scheduledIpos = getCompanyDefinitions().filter(
  (stock) => stock.listingEpochMs !== undefined,
);
assert.deepEqual(
  scheduledIpos.map((stock) => stock.id).sort(),
  [
    "ames",
    "amnw",
    "asuna",
    "carrot",
    "dante",
    "faust",
    "ghh",
    "gsck",
    "hifumi",
    "hinafg",
    "honglu",
    "htcl",
    "ifrit",
    "iga",
    "iori",
    "ishmael",
    "jbinv",
    "jbinvb",
    "koyuki",
    "ksgk",
    "lcid",
    "levi",
    "miku",
    "militc",
    "minori",
    "mksa",
    "monc",
    "nacm",
    "nagusa",
    "nexr",
    "nkcl",
    "omniro",
    "pghg",
    "shupang",
    "speedwagon",
    "tehty",
    "udnge",
    "vergilius",
    "wakamo",
    "yakumo",
    "yisang",
  ],
);

// 8/3 IPO 4건: 플레이어 금융사 2곳, 슈팡특송, 게헨나헬스 그룹
const august3Slots = [
  ["jbinvb", "JBINVB", Date.UTC(2026, 7, 3, 3, 0)],
  ["shupang", "SHPG", Date.UTC(2026, 7, 3, 6, 0)],
  ["nacm", "NACM", Date.UTC(2026, 7, 3, 9, 0)],
  ["ghh", "GHH", Date.UTC(2026, 7, 3, 12, 0)],
] as const;
for (const [id, ticker, listingAt] of august3Slots) {
  const stock = getCompanyDefinitions().find((item) => item.id === id);
  assert.ok(stock, `${ticker} 종목 정의가 없음`);
  assert.equal(stock.ticker, ticker);
  assert.equal(stock.listingEpochMs, listingAt);
  assert.equal(isListed(stock, listingAt - 1), false);
  assert.equal(isListed(stock, listingAt), true);
  for (const suffix of ["inverse", "inverse-2x", "leverage-2x"]) {
    const derivative = STOCK_DEFINITIONS.find(
      (item) => item.id === `${id}-${suffix}`,
    );
    assert.ok(derivative, `${ticker} ${suffix} 파생상품 정의가 없음`);
    assert.equal(derivative.listingEpochMs, listingAt);
  }
}

const ghhListing = Date.UTC(2026, 7, 3, 12, 0);
const ghh = getCompanyDefinitions().find((item) => item.id === "ghh");
assert.ok(ghh, "게헨나헬스 그룹 종목 정의가 없음");
assert.equal(ghh.ticker, "GHH");
assert.equal(ghh.sector, "헬스케어");
assert.equal(ghh.ceoId, "chr_chinatsu");
assert.equal(ghh.quarterlyDividend, 520);
assert.equal(ghh.listingEpochMs, ghhListing);
assert.ok(getCharacterById("chr_chinatsu"), "히노미야 치나츠 캐릭터 정의가 없음");
const ghhCoveredCall = STOCK_DEFINITIONS.find(
  (item) => item.id === "ghh-covered-call",
);
assert.ok(ghhCoveredCall, "GHH 커버드콜 정의가 없음");
assert.equal(ghhCoveredCall.listingEpochMs, ghhListing);
const ghhPublicInsurance = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "ghh" && template.tag === "공공보험 확대",
);
const ghhMedicalCosts = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "ghh" && template.tag === "의료비 상승",
);
assert.ok(ghhPublicInsurance && ghhPublicInsurance.impact > 0);
assert.ok(ghhMedicalCosts && ghhMedicalCosts.impact < 0);

// 8/4 플레이어 회사 IPO: Kusogaki Capital(KSGK)
const ksgkListing = Date.UTC(2026, 7, 4, 3, 0);
const ksgk = getCompanyDefinitions().find((item) => item.id === "ksgk");
assert.ok(ksgk, "Kusogaki Capital 종목 정의가 없음");
assert.equal(ksgk.ticker, "KSGK");
assert.equal(ksgk.sector, "금융");
assert.equal(ksgk.listingEpochMs, ksgkListing);
assert.ok((ksgk.beta ?? 0) < 0, "KSGK의 공매도 헤지 성격이 반영되지 않음");
assert.equal(isListed(ksgk, ksgkListing - 1), false);
assert.equal(isListed(ksgk, ksgkListing), true);
for (const suffix of ["inverse", "inverse-2x", "leverage-2x"]) {
  const derivative = STOCK_DEFINITIONS.find(
    (item) => item.id === `ksgk-${suffix}`,
  );
  assert.ok(derivative, `KSGK ${suffix} 파생상품 정의가 없음`);
  assert.equal(derivative.listingEpochMs, ksgkListing);
}
const ksgkShortWin = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "ksgk" && template.tag === "공매도 적중",
);
const ksgkShortSqueeze = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "ksgk" && template.tag === "숏 스퀴즈",
);
assert.ok(ksgkShortWin && ksgkShortWin.impact > 0);
assert.ok(ksgkShortSqueeze && ksgkShortSqueeze.impact < 0);

// 상장 전에는 본주·파생 모두 배당락, 프리미엄 적립, 차트 생성을 포함해 완전 동결된다.
const ghhFamily = STOCK_DEFINITIONS.filter((item) =>
  item.id === "ghh" || item.id.startsWith("ghh-"),
);
assert.equal(ghhFamily.length, 5);
const prelistingStates = ghhFamily.map((definition) => ({
  ...createInitialStockState(definition, MARKET_EPOCH_MS),
  priceHistory: [],
  candles: [],
  dailyCandles: [],
}));
const ticksPerSession = SESSION_DURATION_MS / SIM_TICK_MS;
const beforeDividendBoundary = 60 * ticksPerSession - 1;
const afterDividendBoundary = 60 * ticksPerSession + 1;
const prelistingReplay = replayMarket(
  prelistingStates,
  [],
  beforeDividendBoundary,
  afterDividendBoundary,
).stocks;
for (const stock of prelistingReplay) {
  assert.equal(stock.currentPrice, stock.initialPrice, `${stock.id} 상장 전 가격 변동`);
  assert.equal(stock.priceHistory.length, 0, `${stock.id} 상장 전 가격 기록 생성`);
  assert.equal(stock.candles.length, 0, `${stock.id} 상장 전 분봉 생성`);
  assert.equal(stock.dailyCandles.length, 0, `${stock.id} 상장 전 일봉 생성`);
}
const livePrelistingTick = tickAllStocks(
  prelistingStates,
  [],
  ghhListing - 1,
  1,
  10,
);
for (const stock of livePrelistingTick) {
  assert.equal(stock.currentPrice, stock.initialPrice, `${stock.id} 실시간 상장 전 가격 변동`);
}

const shupang = getCompanyDefinitions().find((item) => item.id === "shupang");
assert.ok(shupang);
assert.equal(shupang.minimumPriceRatio, 0.5);
const shupangState = {
  ...createInitialStockState(shupang, shupang.listingEpochMs),
  currentPrice: Math.round(shupang.initialPrice * 0.4),
  prevDayClose: Math.round(shupang.initialPrice * 0.4),
  dayOpen: Math.round(shupang.initialPrice * 0.4),
};
const shupangFloor = calculateTickPrice(
  shupangState,
  [],
  shupang.listingEpochMs! + 1_000,
  0,
  10,
  () => 0.5,
);
assert.ok(
  shupangFloor >= shupang.initialPrice * 0.5,
  "슈팡특송 평시 공모가 50% 하한이 지켜지지 않음",
);
const shupangFuelShock = calculateTickPrice(
  shupangState,
  [{
    id: "shupang-fuel-test",
    title: "연료비 급등",
    description: "평시 하한 해제",
    category: "company",
    tag: "연료비 급등",
    impact: -100,
    affectedStockIds: ["shupang"],
    timestamp: shupang.listingEpochMs!,
  }],
  shupang.listingEpochMs! + 1_000,
  0,
  10,
  () => 0.5,
);
assert.ok(
  shupangFuelShock < shupang.initialPrice * 0.5,
  "연료비 급등 사건 중에는 슈팡특송 평시 하한이 해제되어야 함",
);
for (const ipo of scheduledIpos) {
  const listingTick = listingTickOf(ipo);
  assert.equal(
    listingTick,
    Math.floor((ipo.listingEpochMs! - MARKET_EPOCH_MS) / SIM_TICK_MS),
  );
  const replayed = replayMarket(
    [createInitialStockState(ipo, MARKET_EPOCH_MS)],
    [],
    listingTick - 1,
    listingTick + 5,
  ).stocks[0];
  assert.notEqual(
    replayed.currentPrice,
    ipo.initialPrice,
    `상장 후에도 ${ipo.name} 가격이 공모가에 고정됨`,
  );
  assert.equal(
    replayed.priceHistory.some(
      (point) => point.timestamp >= ipo.listingEpochMs!,
    ),
    true,
    `상장 후 ${ipo.name} 가격 기록이 생성되지 않음`,
  );
  assert.equal(
    replayed.candles.some(
      (candle) => candle.timestamp >= ipo.listingEpochMs!,
    ),
    true,
    `상장 후 ${ipo.name} 캔들이 생성되지 않음`,
  );
}

// 미노리 용역: 지정 시각 전 동결·거래 차단, 무배당·희석 하락 성향과 전용 사건
const minori = getCompanyDefinitions().find((stock) => stock.id === "minori");
assert.ok(minori, "미노리 용역 정의가 없음");
const minoriListing = Date.UTC(2026, 6, 24, 6, 0);
assert.equal(minori.ticker, "MNRI");
assert.equal(minori.listingEpochMs, minoriListing);
assert.equal(minori.quarterlyDividend, undefined);
assert.ok(minori.drift < 0, "희석 압력을 반영한 음의 드리프트가 필요함");
assert.ok(minori.volatility >= 0.07, "급등락 성향이 충분히 반영되지 않음");
assert.equal(isListed(minori, minoriListing - 1), false);
assert.equal(isListed(minori, minoriListing), true);

const minoriBurn = EVENT_TEMPLATES.find(
  (template) => template.companyId === "minori" && template.impact > 0,
);
assert.ok(minoriBurn, "미노리 용역 자사주 소각 사건이 없음");
assert.ok(minoriBurn.impact >= 1.5, "자사주 소각 숏 스퀴즈 강도가 부족함");
const minoriSabotage = EVENT_TEMPLATES.find(
  (template) => template.companyId === "minori" && template.impact < 0,
);
assert.ok(minoriSabotage, "미노리 용역 보수 갈등 사건이 없음");
assert.ok(minoriSabotage.impact <= -1, "보수 갈등 사보타주 강도가 부족함");
assert.equal(
  resolveEventTemplate(minoriBurn, minoriListing - 1, () => 0.5),
  null,
  "상장 전 미노리 용역 전용 사건이 발생함",
);
assert.deepEqual(
  resolveEventTemplate(minoriBurn, minoriListing, () => 0.5)?.affectedStockIds,
  ["minori"],
  "미노리 용역 전용 사건이 다른 종목에 배정됨",
);

// 캬롯 농장: 무배당 저변동 성격은 유지하되 과도한 호재·절대 하한 완화
const carrot = getCompanyDefinitions().find((stock) => stock.id === "carrot");
assert.ok(carrot, "캬롯 농장 정의가 없음");
const carrotListing = Date.UTC(2026, 6, 25, 3, 0);
assert.equal(carrot.ticker, "CROT");
assert.equal(carrot.sector, "식품·외식");
assert.deepEqual(carrot.marketTags, ["식품"]);
assert.equal(carrot.listingEpochMs, carrotListing);
assert.equal(carrot.quarterlyDividend, undefined);
assert.equal(carrot.maxDailyLossRate, 0.08);
assert.ok(carrot.volatility <= 0.02, "장기 투자형 저변동 성향이 필요함");
assert.ok(carrot.drift > 0, "지수 대비 소폭 성장 성향이 필요함");
assert.ok(carrot.drift <= 0.0005, "장기 성장 편향이 여전히 과도함");
assert.ok(
  (carrot.eventBias?.수확량 ?? Number.POSITIVE_INFINITY) <= 1.5,
  "수확량 호재 선택 편향이 여전히 과도함",
);
assert.equal(isListed(carrot, carrotListing - 1), false);
assert.equal(isListed(carrot, carrotListing), true);

const carrotBumperCrop = EVENT_TEMPLATES.find(
  (template) => template.companyId === "carrot" && template.tag === "대풍작",
);
assert.ok(carrotBumperCrop, "캬롯 농장 대풍작 사건이 없음");
assert.ok(carrotBumperCrop.impact <= -1, "대풍작 공급 과잉 충격이 부족함");
const carrotHarvest = EVENT_TEMPLATES.find(
  (template) => template.companyId === "carrot" && template.tag === "수확량",
);
assert.ok(carrotHarvest, "캬롯 농장 수확량 사건이 없음");
assert.ok(carrotHarvest.impact <= 0.35, "수확량 호재 충격이 여전히 과도함");
const carrotState = createInitialStockState(carrot, carrotListing);
const carrotFloor = calculateTickPrice(
  carrotState,
  [
    {
      id: "carrot-floor-test",
      title: "대풍작",
      description: "공급 과잉",
      category: "company",
      tag: "대풍작",
      impact: -100,
      affectedStockIds: ["carrot"],
      timestamp: carrotListing,
    },
  ],
  carrotListing + 1000,
  0,
  10,
  () => 0.5,
);
assert.ok(
  carrotFloor >= Math.round(carrotState.prevDayClose * 0.92),
  "캬롯 농장 완화된 하루 -8% 방어선이 지켜지지 않음",
);

// 아스나 유업: 7/25 15:00 KST 개장과 악재 1분 후 회사 호재
const asuna = getCompanyDefinitions().find((stock) => stock.id === "asuna");
assert.ok(asuna, "아스나 유업 정의가 없음");
const asunaListing = Date.UTC(2026, 6, 25, 6, 0);
assert.equal(asuna.ticker, "ASNA");
assert.equal(asuna.sector, "식품·외식");
assert.deepEqual(asuna.marketTags, ["식품"]);
assert.equal(asuna.listingEpochMs, asunaListing);
assert.equal(isListed(asuna, asunaListing - 1), false);
assert.equal(isListed(asuna, asunaListing), true);

const asunaBadEvent = {
  id: "asuna-bad-test",
  title: "원유 리콜",
  description: "품질 검사 이상",
  category: "company" as const,
  tag: "원유 리콜",
  impact: -0.9,
  affectedStockIds: ["asuna"],
  timestamp: asunaListing,
};
assert.equal(
  resolveAsunaAdversityFollowUp(asunaListing + 59_999, [asunaBadEvent]),
  null,
  "악재 직후 곧바로 후속 사건이 발생함",
);
const asunaRecovery = resolveAsunaAdversityFollowUp(
  asunaListing + 60_000,
  [asunaBadEvent],
  () => 0.9,
);
assert.ok(asunaRecovery, "아스나 유업 악재 후속 호재가 없음");
assert.equal(asunaRecovery.tag, "악재 후 호재");
assert.ok(asunaRecovery.impact > 0, "납품 계약 후속 사건이 주가 호재가 아님");
const asunaDilution = resolveAsunaAdversityFollowUp(
  asunaListing + 60_000,
  [asunaBadEvent],
  () => 0.1,
);
assert.ok(asunaDilution, "아스나 유업 유상증자 후속 사건이 없음");
assert.match(asunaDilution.title, /유상증자/);
assert.ok(asunaDilution.impact < 0, "주주 희석 후속 사건이 주가 악재가 아님");
assert.equal(
  resolveAsunaAdversityFollowUp(
    asunaListing + 120_000,
    [asunaBadEvent, asunaRecovery],
  ),
  null,
  "같은 악재의 후속 사건이 중복 발생함",
);

// 까모투자증권: 7/25 18:00 KST 개장, 고배당·고변동과 자사주 매입 제외
const wakamo = getCompanyDefinitions().find((stock) => stock.id === "wakamo");
assert.ok(wakamo, "까모투자증권 정의가 없음");
const wakamoListing = Date.UTC(2026, 6, 25, 9, 0);
assert.equal(wakamo.ticker, "KAMO");
assert.equal(wakamo.sector, "금융");
assert.deepEqual(wakamo.marketTags, ["금융", "증권"]);
assert.equal(wakamo.listingEpochMs, wakamoListing);
assert.ok((wakamo.quarterlyDividend ?? 0) >= 1500, "고배당 설정이 부족함");
assert.ok(wakamo.volatility >= 0.06, "하락장 고변동 성향이 부족함");
assert.ok((wakamo.beta ?? 0) >= 1.4, "시장 하락 민감도가 부족함");
assert.equal(
  corporateActionKindsForCompany("wakamo").includes("buyback"),
  false,
  "까모투자증권에 자사주 매입 기업행동이 허용됨",
);
const wakamoGain = EVENT_TEMPLATES.find(
  (template) => template.companyId === "wakamo" && template.tag === "역행 투자",
);
const wakamoLoss = EVENT_TEMPLATES.find(
  (template) => template.companyId === "wakamo" && template.tag === "엉뚱한 투자",
);
assert.ok(wakamoGain && wakamoGain.impact > 1, "역행 투자 급등 사건이 없음");
assert.ok(wakamoLoss && wakamoLoss.impact < -1, "엉뚱한 투자 급락 사건이 없음");

// 모모톡프렌즈: 7/26 12:00 KST 개장, 메신저·페로로 페스티벌 전용 사건
const hifumi = getCompanyDefinitions().find((stock) => stock.id === "hifumi");
assert.ok(hifumi, "모모톡프렌즈 정의가 없음");
const hifumiListing = Date.UTC(2026, 6, 26, 3, 0);
assert.equal(hifumi.ticker, "AHMF");
assert.equal(hifumi.sector, "미디어·콘텐츠");
assert.deepEqual(hifumi.marketTags, ["미디어", "콘텐츠", "기술"]);
assert.equal(hifumi.listingEpochMs, hifumiListing);
assert.equal(isListed(hifumi, hifumiListing - 1), false);
assert.equal(isListed(hifumi, hifumiListing), true);

const hifumiFestival = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "hifumi" && template.tag === "페로로 페스티벌",
);
const hifumiOutage = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "hifumi" && template.tag === "서비스 장애",
);
assert.ok(hifumiFestival && hifumiFestival.impact > 1, "페로로 페스티벌 급등 사건이 없음");
assert.ok(hifumiOutage && hifumiOutage.impact < -1, "모모톡 서비스 장애 급락 사건이 없음");
assert.equal(
  resolveEventTemplate(hifumiFestival, hifumiListing - 1, () => 0.5),
  null,
  "상장 전 모모톡프렌즈 전용 사건이 발생함",
);

// 이프리트 화력발전: 7/26 15:00 KST 개장, 연료비 절감·화력조절 실패 사건
const ifrit = getCompanyDefinitions().find((stock) => stock.id === "ifrit");
assert.ok(ifrit, "이프리트 화력발전 정의가 없음");
const ifritListing = Date.UTC(2026, 6, 26, 6, 0);
assert.equal(ifrit.ticker, "IFRT");
assert.equal(ifrit.sector, "에너지·인프라");
assert.deepEqual(ifrit.marketTags, ["에너지", "유틸리티"]);
assert.equal(ifrit.listingEpochMs, ifritListing);
assert.equal(isListed(ifrit, ifritListing - 1), false);
assert.equal(isListed(ifrit, ifritListing), true);

const ifritSavings = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "ifrit" && template.tag === "연료비 절감",
);
const ifritRepair = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "ifrit" && template.tag === "화력조절 실패",
);
assert.ok(ifritSavings && ifritSavings.impact > 1, "이프리트 연료비 절감 급등 사건이 없음");
assert.ok(ifritRepair && ifritRepair.impact < -1, "이프리트 화력조절 실패 급락 사건이 없음");
assert.equal(
  resolveEventTemplate(ifritSavings, ifritListing - 1, () => 0.5),
  null,
  "상장 전 이프리트 화력발전 전용 사건이 발생함",
);

// 7/26 승인 요청 4건: 오전·오후·저녁·밤 슬롯과 전 파생상품 잠금 상속
const july26Slots = [
  ["jbinv", "JBINV", Date.UTC(2026, 6, 26, 0, 0)],
  ["honglu", "HONGL", Date.UTC(2026, 6, 26, 5, 0)],
  ["pghg", "PGHG", Date.UTC(2026, 6, 26, 10, 0)],
  ["amnw", "AMNW", Date.UTC(2026, 6, 26, 13, 0)],
] as const;
for (const [id, ticker, listingAt] of july26Slots) {
  const stock = getCompanyDefinitions().find((item) => item.id === id);
  assert.ok(stock, `${ticker} 종목 정의가 없음`);
  assert.equal(stock.ticker, ticker);
  assert.equal(stock.listingEpochMs, listingAt);
  assert.equal(isListed(stock, listingAt - 1), false);
  assert.equal(isListed(stock, listingAt), true);

  const derivativeSuffixes = [
    "inverse",
    "inverse-2x",
    "leverage-2x",
    ...(id === "honglu" ? ["covered-call"] : []),
  ];
  for (const suffix of derivativeSuffixes) {
    const derivative = STOCK_DEFINITIONS.find(
      (item) => item.id === `${id}-${suffix}`,
    );
    assert.ok(derivative, `${ticker} ${suffix} 파생상품 정의가 없음`);
    assert.equal(
      derivative.listingEpochMs,
      listingAt,
      `${ticker} ${suffix}가 본주보다 먼저 열림`,
    );
  }
}

// 7/31 베르길리우스 다크 투어리즘: 운영 DB 동적 목록과 무관한 번들 상장
const vergiliusListing = Date.UTC(2026, 6, 31, 6, 0);
const vergilius = getCompanyDefinitions().find(
  (item) => item.id === "vergilius",
);
assert.ok(vergilius, "베르길리우스 다크 투어리즘 종목 정의가 없음");
assert.equal(vergilius.ticker, "VRGL");
assert.equal(vergilius.sector, "소비재·서비스");
assert.equal(vergilius.listingEpochMs, vergiliusListing);
assert.equal(isListed(vergilius, vergiliusListing - 1), false);
assert.equal(isListed(vergilius, vergiliusListing), true);
for (const suffix of ["inverse", "inverse-2x", "leverage-2x"]) {
  const derivative = STOCK_DEFINITIONS.find(
    (item) => item.id === `vergilius-${suffix}`,
  );
  assert.ok(derivative, `VRGL ${suffix} 파생상품 정의가 없음`);
  assert.equal(derivative.listingEpochMs, vergiliusListing);
}
const vergiliusDemand = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "vergilius" && template.tag === "여행 수요",
);
const vergiliusEthics = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "vergilius" && template.tag === "윤리 논란",
);
assert.ok(vergiliusDemand && vergiliusDemand.impact > 0);
assert.ok(vergiliusEthics && vergiliusEthics.impact < 0);

// 7/31 플레이어 회사 IPO: 밀리테크 인터내셔널 아머먼츠(MILITC)
const militechListing = Date.UTC(2026, 6, 31, 9, 0);
const militech = getCompanyDefinitions().find((item) => item.id === "militc");
assert.ok(militech, "밀리테크 종목 정의가 없음");
assert.equal(militech.ticker, "MILITC");
assert.equal(militech.sector, "방산·치안");
assert.equal(militech.listingEpochMs, militechListing);
assert.equal(isListed(militech, militechListing - 1), false);
assert.equal(isListed(militech, militechListing), true);
for (const suffix of ["inverse", "inverse-2x", "leverage-2x"]) {
  const derivative = STOCK_DEFINITIONS.find(
    (item) => item.id === `militc-${suffix}`,
  );
  assert.ok(derivative, `MILITC ${suffix} 파생상품 정의가 없음`);
  assert.equal(derivative.listingEpochMs, militechListing);
}
const militechContract = EVENT_TEMPLATES.find(
  (template) => template.companyId === "militc" && template.tag === "수주",
);
const militechInvestigation = EVENT_TEMPLATES.find(
  (template) => template.companyId === "militc" && template.tag === "스캔들",
);
assert.ok(militechContract && militechContract.impact > 0);
assert.ok(militechInvestigation && militechInvestigation.impact < 0);

// 8/1 이스마엘 해운: 안정 배당과 공모가 하회 시 배당 중지·자사주 매입 방어
const ishmaelListing = Date.UTC(2026, 7, 1, 6, 0);
const ishmael = getCompanyDefinitions().find((item) => item.id === "ishmael");
assert.ok(ishmael, "이스마엘 해운 종목 정의가 없음");
assert.equal(ishmael.ticker, "ISML");
assert.equal(ishmael.sector, "산업재");
assert.equal(ishmael.ceoId, "chr_ishmael");
assert.equal(ishmael.listingEpochMs, ishmaelListing);
assert.equal(isListed(ishmael, ishmaelListing - 1), false);
assert.equal(isListed(ishmael, ishmaelListing), true);
const ishmaelState = createInitialStockState(ishmael, ishmaelListing - 1);
const preListingRecurring = processRecurringInvestments(
  [{
    id: "ishmael-pre-listing-recurring",
    stockId: ishmael.id,
    amount: 100_000,
    intervalSessions: 1,
    nextSession: 1,
    enabled: true,
    createdAt: 0,
  }],
  1_000_000,
  [],
  [],
  [ishmaelState],
  1,
  ishmaelListing - 1,
);
assert.equal(preListingRecurring.filledPlans.length, 0);
assert.equal(preListingRecurring.failedPlans.length, 1);
assert.equal(preListingRecurring.trades.length, 0);
assert.equal(preListingRecurring.cash, 1_000_000);
assert.equal(preListingRecurring.holdings.length, 0);
assert.equal(preListingRecurring.plans[0]?.lastStatus, "unavailable");

const listedRecurring = processRecurringInvestments(
  [{
    id: "ishmael-listed-recurring",
    stockId: ishmael.id,
    amount: 100_000,
    intervalSessions: 1,
    nextSession: 1,
    enabled: true,
    createdAt: 0,
  }],
  1_000_000,
  [],
  [],
  [ishmaelState],
  1,
  ishmaelListing,
);
assert.equal(listedRecurring.filledPlans.length, 1);
assert.equal(listedRecurring.failedPlans.length, 0);
assert.equal(listedRecurring.trades.length, 1);
assert.ok((ishmael.quarterlyDividend ?? 0) > 0, "안정 배당 설정이 없음");
assert.equal(ishmael.suspendDividendBelowInitialPrice, true);

// 8/2 스피드웨건 오일: 석유 탐사·정유와 안정 배당
const speedwagonListing = Date.UTC(2026, 7, 2, 9, 0);
const speedwagon = getCompanyDefinitions().find(
  (item) => item.id === "speedwagon",
);
assert.ok(speedwagon, "스피드웨건 오일 종목 정의가 없음");
assert.equal(speedwagon.ticker, "SPWO");
assert.equal(speedwagon.sector, "에너지");
assert.equal(speedwagon.ceoId, "chr_speedwagon");
assert.equal(speedwagon.listingEpochMs, speedwagonListing);
assert.equal(isListed(speedwagon, speedwagonListing - 1), false);
assert.equal(isListed(speedwagon, speedwagonListing), true);
assert.ok((speedwagon.quarterlyDividend ?? 0) > 0);
assert.ok(
  EVENT_TEMPLATES.some(
    (template) =>
      template.companyId === "speedwagon" &&
      template.tag === "유전 발견" &&
      template.impact > 0,
  ),
);
assert.ok(
  EVENT_TEMPLATES.some(
    (template) =>
      template.companyId === "speedwagon" &&
      template.tag === "탐사 실패" &&
      template.impact < 0,
  ),
);
assert.ok(
  (ishmael.belowInitialPriceBuybackSupportPerSession ?? 0) > 0,
  "공모가 하회 자사주 매입 방어가 없음",
);

const ishmaelAtIpo = createInitialStockState(ishmael, ishmaelListing);
assert.equal(
  effectiveQuarterlyDividend(ishmaelAtIpo),
  ishmael.quarterlyDividend,
  "공모가 이상에서 배당이 중단됨",
);
const ishmaelBelowIpo = {
  ...ishmaelAtIpo,
  currentPrice: Math.round(ishmael.initialPrice * 0.9),
};
assert.equal(
  effectiveQuarterlyDividend(ishmaelBelowIpo),
  0,
  "공모가 아래에서 현금배당이 계속 지급됨",
);
assert.ok(
  belowInitialPriceBuybackReturn(ishmaelBelowIpo, SESSION_DURATION_MS / 1_000) >
    0,
  "배당 중지 재원이 자사주 매입 지지로 전환되지 않음",
);
assert.equal(
  belowInitialPriceBuybackReturn(ishmaelAtIpo, SESSION_DURATION_MS / 1_000),
  0,
  "공모가 이상에서도 자사주 매입 방어가 상시 작동함",
);
for (const suffix of [
  "inverse",
  "inverse-2x",
  "leverage-2x",
  "covered-call",
]) {
  const derivative = STOCK_DEFINITIONS.find(
    (item) => item.id === `ishmael-${suffix}`,
  );
  assert.ok(derivative, `ISML ${suffix} 파생상품 정의가 없음`);
  assert.equal(derivative.listingEpochMs, ishmaelListing);
}
const ishmaelRoute = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "ishmael" && template.tag === "항로 최적화",
);
const ishmaelPort = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "ishmael" && template.tag === "항만 차질",
);
assert.ok(ishmaelRoute && ishmaelRoute.impact > 0);
assert.ok(ishmaelPort && ishmaelPort.impact < 0);

// 7/27 승인 요청: 이오리 소프트웨어(IORI) 15:30 KST 예약 상장과 전 파생상품 잠금 상속
const ioriListing = Date.UTC(2026, 6, 27, 6, 30);
const iori = getCompanyDefinitions().find((item) => item.id === "iori");
assert.ok(iori, "이오리 소프트웨어 종목 정의가 없음");
assert.equal(iori.ticker, "IORI");
assert.equal(iori.sector, "기술");
assert.equal(iori.ceoId, "chr_iori");
assert.equal(iori.listingEpochMs, ioriListing);
assert.equal(isListed(iori, ioriListing - 1), false);
assert.equal(isListed(iori, ioriListing), true);
for (const suffix of ["inverse", "inverse-2x", "leverage-2x", "covered-call"]) {
  const derivative = STOCK_DEFINITIONS.find(
    (item) => item.id === `iori-${suffix}`,
  );
  assert.ok(derivative, `IORI ${suffix} 파생상품 정의가 없음`);
  assert.equal(
    derivative.listingEpochMs,
    ioriListing,
    `IORI ${suffix}가 본주보다 먼저 열림`,
  );
}

// 운영자 즉시 상장 2종: 예약 잠금 없이 본주·전 파생상품이 바로 거래 가능
const immediateListings = [
  ["dorothy", "EDEN", "소비재·서비스", "chr_dorothy"],
  ["elysia", "ELYS", "헬스케어", "chr_elysia"],
] as const;
for (const [id, ticker, sector, ceoId] of immediateListings) {
  const stock = getCompanyDefinitions().find((item) => item.id === id);
  assert.ok(stock, `${ticker} 종목 정의가 없음`);
  assert.equal(stock.ticker, ticker);
  assert.equal(stock.sector, sector);
  assert.equal(stock.ceoId, ceoId);
  assert.equal(stock.listingEpochMs, undefined);
  assert.equal(isListed(stock, MARKET_EPOCH_MS), true);

  for (const suffix of [
    "inverse",
    "inverse-2x",
    "leverage-2x",
    "covered-call",
  ]) {
    const derivative = STOCK_DEFINITIONS.find(
      (item) => item.id === `${id}-${suffix}`,
    );
    assert.ok(derivative, `${ticker} ${suffix} 파생상품 정의가 없음`);
    assert.equal(derivative.listingEpochMs, undefined);
  }
}

const dorothyMoat = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "dorothy" &&
    template.tag === "시그니처 디자인",
);
assert.ok(dorothyMoat && dorothyMoat.impact > 0);
const elysiaCharity = EVENT_TEMPLATES.find(
  (template) =>
    template.companyId === "elysia" && template.tag === "선행",
);
assert.ok(elysiaCharity && elysiaCharity.impact > 0);
for (let eraIndex = 0; eraIndex < 24; eraIndex += 1) {
  const era = getMarketEra(
    MARKET_ERA_START_SESSION + eraIndex * MARKET_ERA_SESSIONS,
  );
  assert.equal(getCharacterGuideline("chr_dorothy", era).id, "shareholder");
  assert.equal(getCharacterGuideline("chr_elysia", era).id, "shareholder");
}

// 나구사 야키토리&닭꼬치: 7/23 15:00 KST 개장과 AI 급등·조류독감 급락 사건
const nagusa = getCompanyDefinitions().find((stock) => stock.id === "nagusa");
assert.ok(nagusa, "나구사 야키토리&닭꼬치 정의가 없음");
const nagusaListing = Date.UTC(2026, 6, 23, 6, 0);
assert.equal(nagusa.ticker, "NGSA");
assert.equal(nagusa.sector, "식품·외식");
assert.deepEqual(nagusa.marketTags, ["식품"]);
assert.equal(nagusa.listingEpochMs, nagusaListing);
assert.equal(isListed(nagusa, nagusaListing - 1), false);
assert.equal(isListed(nagusa, nagusaListing), true);

const nagusaAi = EVENT_TEMPLATES.find(
  (template) => template.companyId === "nagusa" && template.tag === "AI",
);
assert.ok(nagusaAi, "나구사 AI 테마 급등 사건이 없음");
assert.ok(nagusaAi.impact >= 1, "AI 테마 급등 강도가 부족함");
const nagusaBirdFlu = EVENT_TEMPLATES.find(
  (template) => template.companyId === "nagusa" && template.tag === "조류독감",
);
assert.ok(nagusaBirdFlu, "나구사 조류독감 급락 사건이 없음");
assert.ok(nagusaBirdFlu.impact <= -1, "조류독감 급락 강도가 부족함");
assert.equal(
  resolveEventTemplate(nagusaAi, nagusaListing - 1, () => 0.5),
  null,
  "상장 전 나구사 전용 사건이 발생함",
);
assert.deepEqual(
  resolveEventTemplate(nagusaAi, nagusaListing, () => 0.5)?.affectedStockIds,
  ["nagusa"],
  "나구사 전용 사건이 다른 종목에 배정됨",
);

// 붉은겨울 출판부: 7/23 18:00 KST 개장과 잠입 판매 급등·금서 검열 급락 사건
const yakumo = getCompanyDefinitions().find((stock) => stock.id === "yakumo");
assert.ok(yakumo, "붉은겨울 출판부 정의가 없음");
const yakumoListing = Date.UTC(2026, 6, 23, 9, 0);
assert.equal(yakumo.ticker, "YKMO");
assert.equal(yakumo.sector, "미디어·콘텐츠");
assert.deepEqual(yakumo.marketTags, ["미디어"]);
assert.equal(yakumo.listingEpochMs, yakumoListing);
assert.equal(isListed(yakumo, yakumoListing - 1), false);
assert.equal(isListed(yakumo, yakumoListing), true);

const yakumoSale = EVENT_TEMPLATES.find(
  (template) => template.companyId === "yakumo" && template.tag === "잠입 판매",
);
assert.ok(yakumoSale, "붉은겨울 출판부 잠입 판매 급등 사건이 없음");
assert.ok(yakumoSale.impact >= 1, "잠입 판매 급등 강도가 부족함");
const yakumoCensor = EVENT_TEMPLATES.find(
  (template) => template.companyId === "yakumo" && template.tag === "금서 검열",
);
assert.ok(yakumoCensor, "붉은겨울 출판부 금서 검열 급락 사건이 없음");
assert.ok(yakumoCensor.impact <= -1, "금서 검열 급락 강도가 부족함");
assert.equal(
  resolveEventTemplate(yakumoSale, yakumoListing - 1, () => 0.5),
  null,
  "상장 전 붉은겨울 출판부 전용 사건이 발생함",
);
assert.deepEqual(
  resolveEventTemplate(yakumoSale, yakumoListing, () => 0.5)?.affectedStockIds,
  ["yakumo"],
  "붉은겨울 출판부 전용 사건이 다른 종목에 배정됨",
);

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

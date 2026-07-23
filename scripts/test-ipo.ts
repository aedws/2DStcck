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
    "amnw",
    "asuna",
    "carrot",
    "dante",
    "faust",
    "gsck",
    "hifumi",
    "hinafg",
    "honglu",
    "ifrit",
    "jbinv",
    "miku",
    "minori",
    "nagusa",
    "pghg",
    "udnge",
    "wakamo",
    "yakumo",
    "yisang",
  ],
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

// 캬롯 농장: 7/25 12:00 KST 개장, 무배당 저변동 성장과 전일 대비 -3% 하한
const carrot = getCompanyDefinitions().find((stock) => stock.id === "carrot");
assert.ok(carrot, "캬롯 농장 정의가 없음");
const carrotListing = Date.UTC(2026, 6, 25, 3, 0);
assert.equal(carrot.ticker, "CROT");
assert.equal(carrot.sector, "식품·외식");
assert.deepEqual(carrot.marketTags, ["식품"]);
assert.equal(carrot.listingEpochMs, carrotListing);
assert.equal(carrot.quarterlyDividend, undefined);
assert.equal(carrot.maxDailyLossRate, 0.03);
assert.ok(carrot.volatility <= 0.02, "장기 투자형 저변동 성향이 필요함");
assert.ok(carrot.drift > 0, "지수 대비 소폭 성장 성향이 필요함");
assert.equal(isListed(carrot, carrotListing - 1), false);
assert.equal(isListed(carrot, carrotListing), true);

const carrotBumperCrop = EVENT_TEMPLATES.find(
  (template) => template.companyId === "carrot" && template.tag === "대풍작",
);
assert.ok(carrotBumperCrop, "캬롯 농장 대풍작 사건이 없음");
assert.ok(carrotBumperCrop.impact <= -1, "대풍작 공급 과잉 충격이 부족함");
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
  carrotFloor >= Math.round(carrotState.prevDayClose * 0.97),
  "캬롯 농장 하루 -3% 하한이 지켜지지 않음",
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

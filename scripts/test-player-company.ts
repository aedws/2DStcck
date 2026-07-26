import assert from "node:assert";
import {
  PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
  PLAYER_COMPANY_MIN_NET_WORTH,
  dilutePlayerCompanyCapitalCall,
  foundPlayerCompany,
  fundPlayerCompanyCapitalCall,
  isPlayerCompanyIpoReady,
  markPlayerCompanyIpoRequested,
  normalizePlayerCompany,
  playerCompanyCapitalCallAmount,
  playerCompanyBookPricePerShare,
  playerCompanyFounderOwnership,
  playerCompanyFoundingCost,
  playerCompanyPrestige,
  preparePlayerCompanyCapitalCall,
  reconcilePlayerCompanyIpo,
  refusePlayerCompanyCapitalCall,
  resumePlayerCompany,
} from "../src/lib/player/playerCompany";

const session = 10_000;
const now = 1_800_000_000_000;
const foundingInput = {
  name: "오로라 캐피털",
  ticker: "AURA",
  sector: "금융",
  subsector: "초고액 자산 운용",
  description: "천문학적 자본을 태워 성장하는 비상장 회사.",
};

assert.equal(
  foundPlayerCompany(
    foundingInput,
    PLAYER_COMPANY_MIN_NET_WORTH - 1,
    PLAYER_COMPANY_MIN_NET_WORTH,
    session,
    now,
  ).success,
  false,
);
assert.equal(
  foundPlayerCompany(
    foundingInput,
    PLAYER_COMPANY_MIN_NET_WORTH,
    PLAYER_COMPANY_MIN_NET_WORTH,
    session,
    now,
    ["AURA"],
  ).success,
  false,
);

const foundingCost = playerCompanyFoundingCost(PLAYER_COMPANY_MIN_NET_WORTH);
assert.equal(foundingCost, 20_000_000_000);
const founded = foundPlayerCompany(
  foundingInput,
  PLAYER_COMPANY_MIN_NET_WORTH,
  PLAYER_COMPANY_MIN_NET_WORTH,
  session,
  now,
);
assert.equal(founded.success, true);
assert.ok(founded.company);
assert.equal(founded.cash, 80_000_000_000);
assert.equal(founded.company.cumulativeCapitalBurned, foundingCost);
assert.equal(playerCompanyFounderOwnership(founded.company), 1);

let company = founded.company;
const early = preparePlayerCompanyCapitalCall(
  company,
  80_000_000_000,
  session + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL - 1,
  now + 1,
);
assert.equal(early, company);

company = preparePlayerCompanyCapitalCall(
  company,
  80_000_000_000,
  session + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
  now + 2,
);
const callAmount = playerCompanyCapitalCallAmount(80_000_000_000);
assert.equal(company.pendingCapitalCall?.amount, callAmount);

let cash = 80_000_000_000;
const firstFunding = fundPlayerCompanyCapitalCall(
  company,
  cash,
  session + 5,
  now + 3,
);
assert.equal(firstFunding.success, true);
assert.ok(firstFunding.company);
company = firstFunding.company;
cash = firstFunding.cash!;
assert.equal(cash, 80_000_000_000 - callAmount);
assert.equal(company.fundedRounds, 1);

company = preparePlayerCompanyCapitalCall(
  company,
  cash,
  session + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL * 2,
  now + 4,
);
const secondFunding = fundPlayerCompanyCapitalCall(
  company,
  cash,
  session + 10,
  now + 5,
);
assert.ok(secondFunding.company);
company = secondFunding.company;
cash = secondFunding.cash!;
assert.equal(company.fundedRounds, 2);

company = preparePlayerCompanyCapitalCall(
  company,
  cash,
  session + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL * 3,
  now + 6,
);
const firstDilution = dilutePlayerCompanyCapitalCall(
  company,
  session + 15,
  now + 7,
);
assert.ok(firstDilution.company);
company = firstDilution.company;
assert.equal(company.totalShares, 110_000);
assert.equal(company.publicShares, 10_000);

company = preparePlayerCompanyCapitalCall(
  company,
  cash,
  session + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL * 4,
  now + 8,
);
const secondDilution = dilutePlayerCompanyCapitalCall(
  company,
  session + 20,
  now + 9,
);
assert.ok(secondDilution.company);
company = secondDilution.company;
assert.equal(company.totalShares, 121_000);
assert.equal(company.publicShares, 21_000);
assert.ok(playerCompanyFounderOwnership(company) > 0.8);
assert.ok(playerCompanyPrestige(company) >= 300);
assert.equal(isPlayerCompanyIpoReady(company), true);

const ipo = markPlayerCompanyIpoRequested(company, now + 10);
assert.equal(ipo.company?.status, "ipo-requested");
assert.ok(ipo.company);

const listingAt = now + 20;
const ipoStock = {
  id: "aura",
  ticker: "AURA",
  name: "오로라 캐피털",
  instrumentType: "company",
  sector: "금융",
  initialPrice: 50_000,
  currentPrice: 50_000,
  prevDayClose: 50_000,
  dayOpen: 50_000,
  volatility: 0.03,
  drift: 0.001,
  listingEpochMs: listingAt,
  priceHistory: [],
  candles: [],
  dailyCandles: [],
  orderBook: { bids: [], asks: [] },
} as never;
const scheduledCompany = {
  ...ipo.company,
  ipoListingStockId: "aura",
  ipoListingAt: listingAt,
};
assert.equal(
  reconcilePlayerCompanyIpo(
    scheduledCompany,
    [],
    [ipoStock],
    listingAt - 1,
  ),
  null,
  "개장 전에는 유저 기업 지분을 지급하거나 상태를 열면 안 됨",
);
const listedCompany = reconcilePlayerCompanyIpo(
  scheduledCompany,
  [],
  [ipoStock],
  listingAt,
);
assert.ok(listedCompany);
assert.equal(listedCompany.company.status, "listed");
// 가치 보존 리베이스: 창업주 보통주 = round(창업주좌수 × 장부가/공모가).
const preBook = playerCompanyBookPricePerShare(scheduledCompany);
const ratio = preBook / 50_000;
const expectedFounderShares = Math.round(scheduledCompany.founderShares * ratio);
assert.ok(ratio > 1, "테스트 전제: 장부가가 공모가보다 커야 리베이스가 의미 있음");
assert.equal(listedCompany.holdings[0]?.quantity, expectedFounderShares);
assert.equal(listedCompany.company.founderShares, expectedFounderShares);
assert.equal(listedCompany.holdings[0]?.averagePrice, 50_000);
// 상장 전 창업주 장부 지분가치 ≈ 상장 후 보통주 평가액(가치 보존).
const preStakeValue =
  preBook * playerCompanyFounderOwnership(scheduledCompany) *
  scheduledCompany.totalShares;
const postStakeValue = expectedFounderShares * 50_000;
assert.ok(
  Math.abs(postStakeValue - preStakeValue) / Math.max(1, preStakeValue) < 0.001,
  `가치 보존: 상장 전 $${preStakeValue} ≈ 상장 후 $${postStakeValue}`,
);
// 상장 후 좌당 장부가는 시장가를 따른다.
assert.equal(
  playerCompanyBookPricePerShare(listedCompany.company, 77_000),
  77_000,
  "상장 후 좌당 장부가 = 시장가",
);
const repeatedListing = reconcilePlayerCompanyIpo(
  listedCompany.company,
  listedCompany.holdings,
  [ipoStock],
  listingAt + 1,
);
assert.equal(repeatedListing?.grantedShares, 0);
assert.equal(
  repeatedListing?.holdings[0]?.quantity,
  expectedFounderShares,
  "재접속 시 창업주 지분이 중복 지급되면 안 됨",
);

// 구 로직(공모가 1:1)으로 상장돼 리베이스가 안 된 회사는 다음 접속에서 부족분을
// 1회 보정받아야 한다(가치 보존 목표 좌수까지 top-up).
const oldListed = {
  ...scheduledCompany,
  status: "listed" as const,
  founderSharesGrantedAt: now,
  founderSharesRebasedAt: undefined,
  ipoListingStockId: "aura",
  ipoListingAt: listingAt,
};
const oldHoldings = [
  {
    stockId: "aura",
    quantity: scheduledCompany.founderShares, // 구 1:1 지급분
    quantityExact: String(scheduledCompany.founderShares),
    averagePrice: 50_000,
  },
];
const topUp = reconcilePlayerCompanyIpo(oldListed, oldHoldings, [ipoStock], listingAt + 100);
assert.ok(topUp, "구 상장 회사도 보정 대상");
assert.equal(
  topUp.holdings[0]?.quantity,
  expectedFounderShares,
  "구 1:1 상장 회사가 가치 보존 목표 좌수까지 보정되어야",
);
assert.equal(
  topUp.grantedShares,
  expectedFounderShares - scheduledCompany.founderShares,
  "부족분만큼만 지급",
);
assert.ok(topUp.company.founderSharesRebasedAt, "보정 후 리베이스 플래그 설정");
// 보정 후 재실행은 중복 지급 없음
const afterTopUp = reconcilePlayerCompanyIpo(
  topUp.company,
  topUp.holdings,
  [ipoStock],
  listingAt + 200,
);
assert.equal(afterTopUp?.grantedShares, 0, "보정 완료 후 재지급 없음");

let pausedCandidate = preparePlayerCompanyCapitalCall(
  founded.company,
  80_000_000_000,
  session + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
  now + 11,
);
const refused = refusePlayerCompanyCapitalCall(
  pausedCandidate,
  session + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
  now + 12,
);
assert.equal(refused.company?.status, "paused");
const resumed = resumePlayerCompany(
  refused.company!,
  80_000_000_000,
  session + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL + 1,
  now + 13,
);
assert.equal(resumed.company?.status, "active");
assert.ok(resumed.company?.pendingCapitalCall);

const normalized = normalizePlayerCompany({
  ...company,
  totalShares: Number.NaN,
  cumulativeCapitalBurned: Number.POSITIVE_INFINITY,
});
assert.ok(normalized);
assert.ok(Number.isFinite(normalized.cumulativeCapitalBurned));
assert.ok(normalized.totalShares >= 100_000);

console.log("player company founding · burn · dilution · IPO scenarios passed");

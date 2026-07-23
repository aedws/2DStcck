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
assert.equal(company.pendingCapitalCall?.amount, 4_000_000_000);

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
assert.equal(cash, 76_000_000_000);
assert.equal(company.fundedRounds, 1);

company = preparePlayerCompanyCapitalCall(company, cash, session + 10, now + 4);
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

company = preparePlayerCompanyCapitalCall(company, cash, session + 15, now + 6);
const firstDilution = dilutePlayerCompanyCapitalCall(
  company,
  session + 15,
  now + 7,
);
assert.ok(firstDilution.company);
company = firstDilution.company;
assert.equal(company.totalShares, 110_000);
assert.equal(company.publicShares, 10_000);

company = preparePlayerCompanyCapitalCall(company, cash, session + 20, now + 8);
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
assert.equal(
  listedCompany.holdings[0]?.quantity,
  scheduledCompany.founderShares,
);
assert.equal(listedCompany.holdings[0]?.averagePrice, 50_000);
const repeatedListing = reconcilePlayerCompanyIpo(
  listedCompany.company,
  listedCompany.holdings,
  [ipoStock],
  listingAt + 1,
);
assert.equal(repeatedListing?.grantedShares, 0);
assert.equal(
  repeatedListing?.holdings[0]?.quantity,
  scheduledCompany.founderShares,
  "재접속 시 창업주 지분이 중복 지급되면 안 됨",
);

let pausedCandidate = preparePlayerCompanyCapitalCall(
  founded.company,
  80_000_000_000,
  session + 5,
  now + 11,
);
const refused = refusePlayerCompanyCapitalCall(
  pausedCandidate,
  session + 5,
  now + 12,
);
assert.equal(refused.company?.status, "paused");
const resumed = resumePlayerCompany(
  refused.company!,
  80_000_000_000,
  session + 6,
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

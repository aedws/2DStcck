import assert from "node:assert/strict";
import {
  buildInvestorCalendar,
  SHAREHOLDER_MEETING_INTERVAL_SESSIONS,
} from "../src/lib/market/investorCalendar";
import type { AmcFundState } from "../src/lib/player/assetManager";
import type { StockState } from "../src/lib/types/market";
import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "../src/lib/market/constants";

const stock: StockState = {
  id: "calendar-company",
  ticker: "CAL",
  name: "캘린더 회사",
  instrumentType: "company",
  ceoId: "ceo-calendar",
  sector: "기술",
  initialPrice: 10_000,
  currentPrice: 11_000,
  prevDayClose: 10_800,
  dayOpen: 10_900,
  volatility: 0.02,
  drift: 0.001,
  quarterlyDividend: 100,
  priceHistory: [],
  candles: [],
  dailyCandles: [],
  orderBook: { bids: [], asks: [] },
};

const fund: AmcFundState = {
  id: "calendar-fund",
  name: "나의 장기 ETF",
  ticker: "MYLT",
  style: "active",
  status: "active",
  feeRate: 0.01,
  holdings: [{ stockId: stock.id, weight: 1 }],
  totalShares: 100,
  seedNavValue: 1_000_000,
  createdAt: 0,
  createdSession: 100,
  lastFeeSession: 100,
  lastRebalanceSession: 100,
  dividendIntervalDays: 20,
  dividendRate: 0.01,
  lastDividendSession: 100,
  cumulativeDividendsPaid: 0,
  dividendHistory: [],
  graceStartedSession: null,
  navHistory: [],
  cumulativeFeesPaid: 0,
};

const currentSession =
  Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS) + 100;
fund.createdSession = currentSession;
fund.lastFeeSession = currentSession;
fund.lastRebalanceSession = currentSession;
fund.lastDividendSession = currentSession;

const events = buildInvestorCalendar({
  currentSession,
  watchlist: [stock.id],
  holdings: [
    {
      stockId: "amc:calendar-fund",
      quantity: 5,
      averagePrice: 10_000,
    },
  ],
  stocks: [stock],
  amcFunds: [fund],
  horizonSessions: 100,
});

assert.ok(events.some((event) => event.type === "earnings"));
assert.ok(events.some((event) => event.type === "dividend"));
assert.ok(events.some((event) => event.type === "meeting"));
assert.ok(
  events.some(
    (event) =>
      event.type === "amc-dividend" &&
      event.session === currentSession + 20,
  ),
  "보유 중인 유저 ETF의 다음 분배 기준일을 포함",
);
assert.ok(
  events.every(
    (event, index) => index === 0 || events[index - 1].session <= event.session,
  ),
  "모든 일정은 가까운 순으로 정렬",
);
assert.equal(SHAREHOLDER_MEETING_INTERVAL_SESSIONS, 90);

console.log("investor calendar tests passed");

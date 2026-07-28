import assert from "node:assert/strict";
import { getRuntimeStockDefinitions } from "../src/data/stocks";
import { createInitialStockState } from "../src/lib/market/engine";
import {
  applyDuePlayerCompanyMarketActions,
  playerCompanyMarketActionFactor,
  setPlayerCompanyMarketActions,
  type PlayerCompanyMarketAction,
} from "../src/lib/market/playerCompanyMarketActions";
import { replayMarket } from "../src/lib/market/localSim";
import type { StockState } from "../src/lib/types/market";

assert.equal(
  playerCompanyMarketActionFactor("issue", 10_000, 100_000),
  100_000 / 110_000,
);
assert.equal(
  playerCompanyMarketActionFactor("buyback", 10_000, 100_000),
  1.1,
);
assert.equal(
  playerCompanyMarketActionFactor("retire", 10_000, 100_000),
  100_000 / 90_000,
);
assert.equal(
  playerCompanyMarketActionFactor("issue", 100_000, 100_000),
  0.85,
  "신주 발행 1회 하락은 -15%로 제한",
);
assert.equal(
  playerCompanyMarketActionFactor("retire", 50_000, 100_000),
  1.15,
  "소각 1회 상승은 +15%로 제한",
);

const action: PlayerCompanyMarketAction = {
  id: "action-1",
  sequence: 1,
  stockId: "testco",
  ticker: "TEST",
  actionType: "retire",
  shares: 10_000,
  totalSharesBefore: 100_000,
  publicSharesBefore: 20_000,
  totalSharesAfter: 90_000,
  publicSharesAfter: 10_000,
  priceFactor: 1.1,
  priceCents: 10_000,
  effectiveTick: 100,
  createdAt: "2026-07-28T00:00:00Z",
};
setPlayerCompanyMarketActions([action]);

const baseStock: StockState = {
  id: "testco",
  ticker: "TEST",
  name: "테스트 회사",
  sector: "기술",
  initialPrice: 10_000,
  currentPrice: 10_000,
  prevDayClose: 10_000,
  dayOpen: 10_000,
  volatility: 0.03,
  drift: 0.0005,
  priceHistory: [],
  candles: [],
  dailyCandles: [],
  orderBook: { bids: [], asks: [] },
};
assert.equal(
  applyDuePlayerCompanyMarketActions(baseStock, 99),
  baseStock,
  "효력 틱 전에는 적용하지 않음",
);
const applied = applyDuePlayerCompanyMarketActions(baseStock, 100);
assert.equal(applied.currentPrice, 11_000);
assert.equal(applied.lastPlayerCompanyActionSequence, 1);
assert.equal(
  applyDuePlayerCompanyMarketActions(applied, 101).currentPrice,
  11_000,
  "같은 기업행동을 중복 적용하지 않음",
);

const definition = getRuntimeStockDefinitions().find(
  (stock) => stock.id === "baridc",
);
assert.ok(definition, "결정론 리플레이용 기초 종목이 없음");
const replayAction: PlayerCompanyMarketAction = {
  ...action,
  id: "action-replay",
  stockId: definition.id,
  ticker: definition.ticker,
  priceFactor: 1.08,
  effectiveTick: 20,
};
setPlayerCompanyMarketActions([replayAction]);
const genesis = createInitialStockState(definition, 0);
const single = replayMarket([genesis], [], 10, 40).stocks[0];
const first = replayMarket([genesis], [], 10, 19);
const segmented = replayMarket(first.stocks, first.events, 19, 40).stocks[0];
assert.equal(segmented.currentPrice, single.currentPrice);
assert.equal(
  segmented.lastPlayerCompanyActionSequence,
  single.lastPlayerCompanyActionSequence,
);
assert.equal(single.lastPlayerCompanyActionSequence, 1);

setPlayerCompanyMarketActions([]);
console.log("player company market action tests passed");

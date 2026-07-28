import assert from "node:assert/strict";
import { computeRealizedPnl } from "../src/lib/market/portfolioStats";
import { replayClosedTrades } from "../src/lib/market/tradeReplay";
import { buildTradingStats } from "../src/lib/player/playerProfile";
import type { Trade } from "../src/lib/types/market";

const legacySplitTrades: Trade[] = [
  {
    id: "wwmne-sell",
    stockId: "wwmne",
    ticker: "WWMNE",
    type: "sell",
    quantity: 310,
    price: 7_763,
    total: 2_406_530,
    timestamp: 2,
  },
  {
    id: "wwmne-buy",
    stockId: "wwmne",
    ticker: "WWMNE",
    type: "buy",
    quantity: 31,
    price: 37_658,
    total: 1_167_398,
    timestamp: 1,
  },
];

assert.equal(computeRealizedPnl(legacySplitTrades), 1_239_132);
assert.deepEqual(replayClosedTrades(legacySplitTrades), [
  {
    tradeId: "wwmne-sell",
    ticker: "WWMNE",
    timestamp: 2,
    pnl: 1_239_132,
  },
]);
assert.deepEqual(buildTradingStats(legacySplitTrades), {
  tradeCount: 2,
  buyCount: 1,
  sellCount: 1,
  closeCount: 1,
  winningCloses: 1,
  winRate: 100,
  turnover: 3_573_928,
  realizedPnl: 1_239_132,
});

const explicitSplitTrades: Trade[] = [
  {
    id: "partial-sell",
    stockId: "wwmne",
    ticker: "WWMNE",
    type: "sell",
    quantity: 155,
    price: 7_763,
    total: 1_203_265,
    timestamp: 2,
    shareMultiplier: 10,
  },
  {
    id: "original-buy",
    stockId: "wwmne",
    ticker: "WWMNE",
    type: "buy",
    quantity: 31,
    price: 37_658,
    total: 1_167_398,
    timestamp: 1,
    shareMultiplier: 1,
  },
];

assert.equal(computeRealizedPnl(explicitSplitTrades), 619_566);

console.log("trade split stats tests passed");

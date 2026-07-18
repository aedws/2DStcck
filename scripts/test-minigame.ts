import assert from "node:assert";
import {
  computeBrickBreakerCash,
  compute2048Cash,
  computeTetrisCash,
  MINIGAME_CASH_DIVISOR,
  MINIGAME_REWARD_HARD_CAP,
  G2048_CENTS_PER_POINT,
  TETRIS_CENTS_PER_POINT,
  COIN_PER_BRICK,
  BALL_PRICE,
} from "../src/lib/market/minigame";
import { seasonExternalCashTotal } from "../src/lib/market/investmentSeasons";
import type { CashPayment } from "../src/lib/types/market";

// 점수 → 현금 (점수 / N)
assert.equal(computeBrickBreakerCash(0), 0);
assert.equal(computeBrickBreakerCash(-100), 0);
assert.equal(computeBrickBreakerCash(100_000), Math.floor(100_000 / MINIGAME_CASH_DIVISOR));
assert.equal(computeBrickBreakerCash(999), Math.floor(999 / MINIGAME_CASH_DIVISOR));
// 하드캡
assert.equal(computeBrickBreakerCash(1e12), MINIGAME_REWARD_HARD_CAP);

// 2048: 점수 × 계수, 음수 방어, 하드캡
assert.equal(compute2048Cash(0), 0);
assert.equal(compute2048Cash(-10), 0);
assert.equal(compute2048Cash(4000), 4000 * G2048_CENTS_PER_POINT);
assert.equal(compute2048Cash(1e12), MINIGAME_REWARD_HARD_CAP);

// 테트리스
assert.equal(computeTetrisCash(0), 0);
assert.equal(computeTetrisCash(-10), 0);
assert.equal(computeTetrisCash(5000), 5000 * TETRIS_CENTS_PER_POINT);
assert.equal(computeTetrisCash(1e12), MINIGAME_REWARD_HARD_CAP);

// 등급 가격은 N < S < SS
assert.ok(BALL_PRICE.N < BALL_PRICE.S && BALL_PRICE.S < BALL_PRICE.SS);
// 코인/벽돌 양수
assert.ok(COIN_PER_BRICK > 0);

// 미니게임 소득은 외생(노동) 소득 — 시즌 성과에서 제외
const pay = (kind: CashPayment["kind"], amount: number): CashPayment => ({
  id: `${kind}-${amount}`,
  kind,
  sourceId: "x",
  dueSession: 0,
  amount,
  timestamp: 0,
});
const payments: CashPayment[] = [
  pay("minigame", 100_000),
  pay("salary", 1_000_000),
  pay("dividend", 50_000),
  pay("lottery", 30_000),
];
assert.equal(seasonExternalCashTotal(payments), 100_000 + 1_000_000 + 30_000);

console.log("minigame reward & income-classification scenarios passed");

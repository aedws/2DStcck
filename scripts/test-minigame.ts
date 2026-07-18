import assert from "node:assert";
import {
  computeBrickBreakerReward,
  BRICK_REWARD_PER_ROUND,
  BRICK_REWARD_PER_BRICK,
  MINIGAME_REWARD_HARD_CAP,
} from "../src/lib/market/minigame";
import { seasonExternalCashTotal } from "../src/lib/market/investmentSeasons";
import type { CashPayment } from "../src/lib/types/market";

// 보상 공식
assert.equal(computeBrickBreakerReward(0, 0), 0);
assert.equal(
  computeBrickBreakerReward(3, 10),
  3 * BRICK_REWARD_PER_ROUND + 10 * BRICK_REWARD_PER_BRICK,
);
// 음수·소수 방어
assert.equal(computeBrickBreakerReward(-5, -3), 0);
assert.equal(
  computeBrickBreakerReward(2.9, 4.9),
  2 * BRICK_REWARD_PER_ROUND + 4 * BRICK_REWARD_PER_BRICK,
);
// 하드캡
assert.equal(computeBrickBreakerReward(1e9, 1e9), MINIGAME_REWARD_HARD_CAP);

// 미니게임 소득은 '외생(노동) 소득'으로 시즌 성과에서 제외돼야 한다.
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
  pay("dividend", 50_000), // 투자 소득 — 제외 안 됨
  pay("lottery", 30_000),
];
// 외생 소득 = minigame + salary + lottery (dividend 제외)
assert.equal(
  seasonExternalCashTotal(payments),
  100_000 + 1_000_000 + 30_000,
);

console.log("minigame reward & income-classification scenarios passed");

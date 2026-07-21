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
import { sweepCircleAgainstRect } from "../src/lib/minigame/brickBreakerPhysics";

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

// 코인 브레이커: 한 프레임에 블록을 완전히 통과하는 고속 공도 이동 경로에서 충돌한다.
const brick = { left: 40, top: 40, right: 60, bottom: 60 };
const verticalHit = sweepCircleAgainstRect(50, 0, 0, 100, 5, brick);
assert.ok(verticalHit);
assert.equal(verticalHit.normalY, -1);
assert.ok(Math.abs(verticalHit.time - 0.35) < 1e-9);

const horizontalHit = sweepCircleAgainstRect(0, 50, 100, 0, 5, brick);
assert.ok(horizontalHit);
assert.equal(horizontalHit.normalX, -1);
assert.ok(Math.abs(horizontalHit.time - 0.35) < 1e-9);

// 모서리 충돌은 양 축을 모두 반사할 수 있도록 두 법선을 반환한다.
const cornerHit = sweepCircleAgainstRect(0, 0, 100, 100, 5, brick);
assert.ok(cornerHit);
assert.equal(cornerHit.normalX, -1);
assert.equal(cornerHit.normalY, -1);

// 블록을 빗나가는 평행 이동은 오탐하지 않는다.
assert.equal(sweepCircleAgainstRect(0, 20, 100, 0, 5, brick), null);

// 기존 판정에서 블록 안에 남던 공은 가장 가까운 안전 경계로 즉시 복구한다.
const embeddedHit = sweepCircleAgainstRect(50, 50, 0, 10, 5, brick);
assert.ok(embeddedHit?.startedInside);
assert.ok(
  embeddedHit.correctedX === 35 ||
    embeddedHit.correctedX === 65 ||
    embeddedHit.correctedY === 35 ||
    embeddedHit.correctedY === 65,
);

// 수백 개의 공이 동시에 고속 이동해도 어느 하나도 충돌을 누락하지 않는다.
for (let i = 0; i < 500; i++) {
  const x = 45 + (i % 11);
  assert.ok(sweepCircleAgainstRect(x, 0, 0, 100, 5, brick));
}

console.log("minigame reward, income-classification & collision scenarios passed");

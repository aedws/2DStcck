import assert from "node:assert/strict";
import {
  BOOM_BUBBLE_ERA_INTERVAL,
  BOOM_BUBBLE_FIRST_ERA_INDEX,
  BOOM_BUBBLE_MIN_SIDEWAYS_OFFSET,
  BOOM_BUBBLE_SIDEWAYS_SESSIONS,
  CRISIS_TO_WAR_CRISIS_SESSIONS,
  CRISIS_TO_WAR_FIRST_ERA_INDEX,
  CRISIS_TO_WAR_RECOVERY_SESSIONS,
  MARKET_ERA_SESSIONS,
  MARKET_ERA_START_SESSION,
  WHY_IS_IT_RISING_FIRST_ERA_INDEX,
  WHY_IS_IT_RISING_REVEAL_OFFSET,
  getMarketEra,
} from "../src/lib/market/marketEras";
import { SESSION_DURATION_MS } from "../src/lib/market/constants";

const perSession = (era: ReturnType<typeof getMarketEra>) =>
  era.driftPerSecond * (SESSION_DURATION_MS / 1_000);

// 신규 국면 도입 전 과거 에라에는 복합 국면이 끼어들지 않는다.
for (let index = 0; index < BOOM_BUBBLE_FIRST_ERA_INDEX; index++) {
  const era = getMarketEra(
    MARKET_ERA_START_SESSION + index * MARKET_ERA_SESSIONS,
  );
  assert.notEqual(era.archetypeId, "boom-bubble");
}

let sawBoom = false;
let sawBubble = false;
for (let occurrence = 0; occurrence < 20; occurrence++) {
  const index =
    BOOM_BUBBLE_FIRST_ERA_INDEX +
    occurrence * BOOM_BUBBLE_ERA_INTERVAL;
  const start = MARKET_ERA_START_SESSION + index * MARKET_ERA_SESSIONS;
  const opening = getMarketEra(start);
  assert.equal(opening.archetypeId, "boom-bubble");
  assert.equal(opening.boomBubble?.phase, "runup");
  assert.equal(opening.boomBubble?.outcome, undefined);
  assert.ok(perSession(opening) >= 0.01, "초반 강한 상승 필요");

  const decision = opening.boomBubble!.decisionSession;
  const sidewaysStart = opening.boomBubble!.sidewaysStartSession;
  const sidewaysEnd = opening.boomBubble!.sidewaysEndSession;
  const decisionOffset = decision - start;
  const delay = sidewaysStart - decision;
  assert.ok(decisionOffset >= 6 && decisionOffset <= 15);
  assert.ok(delay >= 6 && delay <= 15);
  assert.ok(sidewaysStart - start >= BOOM_BUBBLE_MIN_SIDEWAYS_OFFSET);
  assert.equal(sidewaysEnd - sidewaysStart, BOOM_BUBBLE_SIDEWAYS_SESSIONS);

  const beforeDecision = getMarketEra(decision - 1);
  const afterDecision = getMarketEra(decision);
  assert.equal(beforeDecision.boomBubble?.decisionMade, false);
  assert.equal(afterDecision.boomBubble?.decisionMade, true);
  assert.equal(afterDecision.boomBubble?.outcome, undefined);

  const sideways = getMarketEra(sidewaysStart);
  assert.equal(sideways.boomBubble?.phase, "sideways");
  assert.equal(sideways.boomBubble?.outcome, undefined);
  assert.equal(perSession(sideways), 0);

  const reveal = getMarketEra(sidewaysEnd);
  assert.ok(reveal.boomBubble?.outcome, "횡보 종료 뒤 결과 공개 필요");
  if (reveal.boomBubble?.outcome === "boom") {
    sawBoom = true;
    assert.equal(reveal.boomBubble.phase, "boom");
    assert.ok(perSession(reveal) > 0.01);
  } else {
    sawBubble = true;
    assert.equal(reveal.boomBubble?.phase, "crash");
    assert.ok(perSession(reveal) <= -0.12, "버블 판정 직후 대폭락 필요");
    const decline = getMarketEra(sidewaysEnd + 1);
    assert.equal(decline.boomBubble?.phase, "decline");
    assert.ok(perSession(decline) < -0.01, "국면 종료까지 강한 하락 필요");
  }
}

assert.ok(sawBoom, "결정론 결과에 대호황 분기가 필요함");
assert.ok(sawBubble, "결정론 결과에 버블 분기가 필요함");

const disguisedStart =
  MARKET_ERA_START_SESSION +
  WHY_IS_IT_RISING_FIRST_ERA_INDEX * MARKET_ERA_SESSIONS;
const disguised = getMarketEra(disguisedStart);
assert.equal(disguised.archetypeId, "why-is-it-rising");
assert.equal(disguised.whyIsItRising?.phase, "cover");
assert.ok(["횡보장", "약세장"].includes(disguised.name));
assert.equal(
  disguised.whyIsItRising?.revealSession,
  disguisedStart + WHY_IS_IT_RISING_REVEAL_OFFSET,
);
const disguisedReveal = getMarketEra(
  disguisedStart + WHY_IS_IT_RISING_REVEAL_OFFSET,
);
assert.equal(disguisedReveal.whyIsItRising?.phase, "reveal");
assert.match(disguisedReveal.name, /^정체 공개/);
assert.ok(perSession(disguisedReveal) >= 0.02);

const crisisWarStart =
  MARKET_ERA_START_SESSION +
  CRISIS_TO_WAR_FIRST_ERA_INDEX * MARKET_ERA_SESSIONS;
const crisisWar = getMarketEra(crisisWarStart);
assert.equal(crisisWar.archetypeId, "crisis-to-war");
assert.equal(crisisWar.crisisToWar?.phase, "crisis");
assert.equal(crisisWar.economyAsUsual?.phase, "active");
const recovery = getMarketEra(
  crisisWarStart + CRISIS_TO_WAR_CRISIS_SESSIONS,
);
assert.equal(recovery.crisisToWar?.phase, "recovery");
assert.equal(recovery.economyAsUsual, undefined);
const battle = getMarketEra(
  crisisWarStart +
    CRISIS_TO_WAR_CRISIS_SESSIONS +
    CRISIS_TO_WAR_RECOVERY_SESSIONS,
);
assert.equal(battle.crisisToWar?.phase, "war");

console.log("market era boom/bubble tests passed");

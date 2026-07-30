import assert from "node:assert/strict";

import { SESSION_DURATION_MS } from "../src/lib/market/constants";
import {
  economyAsUsualReturnForStock,
  economyAsUsualTargets,
  getEconomyAsUsualEventsForSession,
  isEconomyAsUsualDividendRestricted,
  isEconomyAsUsualDownsideFloorSuspended,
} from "../src/lib/market/economyAsUsual";
import {
  ECONOMY_AS_USUAL_DECISION_INTERVAL,
  ECONOMY_AS_USUAL_FIRST_DECISION_OFFSET,
  ECONOMY_AS_USUAL_FIRST_ERA_INDEX,
  ECONOMY_AS_USUAL_ERA_INTERVAL,
  MARKET_ERA_SESSIONS,
  MARKET_ERA_START_SESSION,
  getMarketEra,
} from "../src/lib/market/marketEras";

const SESSION_SECONDS = SESSION_DURATION_MS / 1_000;
const firstStart =
  MARKET_ERA_START_SESSION +
  ECONOMY_AS_USUAL_FIRST_ERA_INDEX * MARKET_ERA_SESSIONS;
assert.equal(
  firstStart * SESSION_DURATION_MS,
  Date.UTC(2026, 7, 5, 0, 0),
  "첫 경제대그냥 국면은 2026-08-05 09:00 KST여야 합니다.",
);

const scenarios = new Set<string>();
let sawNoCrisis = false;
let sawCarrotFloorSuspension = false;

for (let occurrence = 0; occurrence < 400; occurrence += 1) {
  const index =
    ECONOMY_AS_USUAL_FIRST_ERA_INDEX +
    occurrence * ECONOMY_AS_USUAL_ERA_INTERVAL;
  const start = MARKET_ERA_START_SESSION + index * MARKET_ERA_SESSIONS;
  const opening = getMarketEra(start);
  assert.equal(opening.archetypeId, "economy-as-usual");
  assert.equal(opening.name, "경제대그냥");
  assert.equal(opening.economyAsUsual?.phase, "cover");
  assert.equal(
    opening.economyAsUsual?.decisionSessions[0] - start,
    ECONOMY_AS_USUAL_FIRST_DECISION_OFFSET,
  );
  assert.equal(
    (opening.economyAsUsual?.decisionSessions[1] ?? 0) -
      (opening.economyAsUsual?.decisionSessions[0] ?? 0),
    ECONOMY_AS_USUAL_DECISION_INTERVAL,
  );

  const crisisStart = opening.economyAsUsual?.crisisStartSession;
  const scenario = opening.economyAsUsual?.hiddenScenarioId;
  if (crisisStart === undefined || !scenario) {
    sawNoCrisis = true;
    continue;
  }
  scenarios.add(scenario);

  const active = getMarketEra(crisisStart);
  assert.equal(active.economyAsUsual?.phase, "active");
  const targets = economyAsUsualTargets(active);

  if (scenario === "liquidity-drought") {
    assert.ok(
      economyAsUsualReturnForStock(
        active,
        crisisStart,
        {
          id: "sample-company",
          sector: "기술",
          beta: 1,
          instrumentType: "company",
        },
        SESSION_SECONDS,
      ) <= -0.15,
    );
  }

  if (scenario === "giant-fraud") {
    const target = {
      id: "fraud-sector-company",
      sector: targets.fraudSector,
      beta: 1,
      instrumentType: "company" as const,
    };
    assert.ok(
      economyAsUsualReturnForStock(
        active,
        crisisStart,
        target,
        SESSION_SECONDS,
      ) <= -0.2,
    );
    assert.equal(
      isEconomyAsUsualDividendRestricted(crisisStart, target),
      true,
    );
    if (targets.fraudSector === "식품·외식") {
      sawCarrotFloorSuspension = true;
      assert.equal(
        isEconomyAsUsualDownsideFloorSuspended(active, crisisStart, {
          id: "carrot",
          sector: "식품·외식",
          beta: 0.72,
          instrumentType: "company",
        }),
        true,
      );
    }
  }

  if (scenario === "bank-run") {
    const failureSession = crisisStart + targets.bankRunDelay;
    const failureEra = getMarketEra(failureSession);
    assert.ok(
      economyAsUsualReturnForStock(
        failureEra,
        failureSession,
        {
          id: targets.bankRunTargetId,
          sector: "금융",
          beta: 1,
          instrumentType: "company",
        },
        SESSION_SECONDS,
      ) <= -0.2,
    );
    assert.ok(
      economyAsUsualReturnForStock(
        failureEra,
        failureSession,
        {
          id: "faust",
          sector: "금융",
          beta: 1.25,
          instrumentType: "company",
        },
        SESSION_SECONDS,
      ) > 0.1,
    );
  }

  if (scenario === "private-credit") {
    assert.ok(
      economyAsUsualReturnForStock(
        active,
        crisisStart,
        {
          id: "growth",
          sector: "기술",
          beta: 1.2,
          instrumentType: "company",
          marketTags: ["성장"],
        },
        SESSION_SECONDS,
      ) > 0,
    );
    const revealSession = crisisStart + targets.privateCreditLead;
    const revealEra = getMarketEra(revealSession);
    assert.ok(
      economyAsUsualReturnForStock(
        revealEra,
        revealSession,
        {
          id: "growth",
          sector: "기술",
          beta: 1.2,
          instrumentType: "company",
          marketTags: ["성장"],
        },
        SESSION_SECONDS,
      ) <= -0.18,
    );
  }

  for (let session = crisisStart; session < active.endSession; session += 1) {
    for (const news of getEconomyAsUsualEventsForSession(session)) {
      assert.ok(!news.title.includes("유동성 가뭄"));
      assert.ok(!news.title.includes("거대한 사기"));
      assert.ok(!news.title.includes("갑작스런 뱅크런"));
      assert.ok(!news.title.includes("사모신용 위기"));
    }
  }
}

assert.deepEqual(
  [...scenarios].sort(),
  ["bank-run", "giant-fraud", "liquidity-drought", "private-credit"].sort(),
  "반복 국면에서 네 가지 비공개 위기가 모두 나와야 합니다.",
);
assert.equal(sawNoCrisis, true, "경제위기 없음 판정 경로도 필요합니다.");
assert.equal(
  sawCarrotFloorSuspension,
  true,
  "거대한 사기에 CROT가 걸리면 하한 해제 경로가 필요합니다.",
);

console.log("economy-as-usual hidden crisis scenarios passed");

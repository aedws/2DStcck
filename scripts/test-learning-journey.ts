import assert from "node:assert";
import {
  reachedLearningLayer,
  isJourneyComplete,
  type LearningSignals,
} from "../src/lib/player/learningProgress";

function base(): LearningSignals {
  return {
    trades: 0,
    distinctSectors: 0,
    hasEtfHolding: false,
    hasCharacterHolding: false,
    maxAffinityTierIndex: 0,
    missionsDone: 0,
    seasonsDone: 0,
    reputation: 0,
    netWorthRatio: 1,
    usedAdvanced: false,
  };
}

// 시작: 레이어 1.
assert.equal(reachedLearningLayer(base()), 1);
assert.equal(isJourneyComplete(base()), false);

// 첫 거래 → 레이어 2.
assert.equal(reachedLearningLayer({ ...base(), trades: 1 }), 2);

// 3거래 → 레이어 3.
assert.equal(reachedLearningLayer({ ...base(), trades: 3 }), 3);

// 분산(ETF 보유) → 레이어 4. (단 순차라 trades도 채워야 함)
assert.equal(
  reachedLearningLayer({ ...base(), trades: 3, hasEtfHolding: true }),
  4,
);

// 순차성: 분산했어도 거래 수가 모자라면 레이어 3에서 멈춘다.
assert.equal(
  reachedLearningLayer({ ...base(), trades: 1, hasEtfHolding: true }),
  2,
);

// 캐릭터 보유 + 관심(tier1) → 레이어 5.
assert.equal(
  reachedLearningLayer({
    ...base(),
    trades: 3,
    hasEtfHolding: true,
    hasCharacterHolding: true,
    maxAffinityTierIndex: 1,
  }),
  5,
);

// 캐릭터는 보유했으나 아직 면식(tier0)이면 레이어 4에서 멈춘다.
assert.equal(
  reachedLearningLayer({
    ...base(),
    trades: 3,
    hasEtfHolding: true,
    hasCharacterHolding: true,
    maxAffinityTierIndex: 0,
  }),
  4,
);

// 의뢰/시즌/평판 → 레이어 6.
assert.equal(
  reachedLearningLayer({
    ...base(),
    trades: 3,
    hasEtfHolding: true,
    hasCharacterHolding: true,
    maxAffinityTierIndex: 1,
    missionsDone: 1,
  }),
  6,
);

// 심화 도구 사용 → 여정 완주(레이어 6 유지, complete true).
const full: LearningSignals = {
  ...base(),
  trades: 5,
  hasEtfHolding: true,
  distinctSectors: 3,
  hasCharacterHolding: true,
  maxAffinityTierIndex: 2,
  missionsDone: 2,
  usedAdvanced: true,
};
assert.equal(reachedLearningLayer(full), 6);
assert.equal(isJourneyComplete(full), true);

// 순자산 1.3배로도 마지막 목표 달성.
assert.equal(isJourneyComplete({ ...full, usedAdvanced: false, netWorthRatio: 1.3 }), true);
assert.equal(isJourneyComplete({ ...full, usedAdvanced: false, netWorthRatio: 1.2 }), false);

console.log("learning journey progression scenarios passed");

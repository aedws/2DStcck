/**
 * 이사 보통주 스톡옵션 회귀 테스트.
 * - 티어 위촉 시 위촉 시점 시장가로 옵션 부여(중복 없음)
 * - 베스팅 전에는 행사 불가, 이후 가능
 * - 행사 비용 = 행사가 × 수량
 */
import assert from "node:assert";
import {
  DIRECTOR_TIERS,
  DIRECTOR_OPTION_VESTING_SESSIONS,
  MAX_CHARACTER_TRUST,
} from "../src/lib/market/characterProgress";
import {
  reconcileCharacterStockOptions,
  isOptionVested,
  isOptionExercisable,
  optionExerciseCost,
  normalizeCharacterStockOptions,
} from "../src/lib/player/characterStockOptions";

const progress = {
  chr_x: { affinity: 0, trust: MAX_CHARACTER_TRUST, holdingSessions: 0 } as never,
  chr_y: { affinity: 0, trust: 40, holdingSessions: 0 } as never, // 임계 미만
};
const priceOf = (id: string) => (id === "chr_x" ? 76_000 : 0);

// 신뢰도 100 → 모든 티어(자문역~C급) 옵션 부여, 임계 미만은 없음.
let options = reconcileCharacterStockOptions(progress, [], priceOf, 100);
assert.equal(
  options.length,
  DIRECTOR_TIERS.length,
  "신뢰도 100은 전 티어 옵션 부여",
);
assert.ok(options.every((o) => o.characterId === "chr_x"));
assert.ok(options.every((o) => o.strike === 76_000), "행사가=위촉 시점 시장가");

// 재실행: 중복 부여 없음.
const again = reconcileCharacterStockOptions(progress, options, priceOf, 105);
assert.equal(again.length, options.length, "중복 부여 없음");

// 시장가가 0이면 부여 보류.
const noPrice = reconcileCharacterStockOptions(progress, [], () => 0, 100);
assert.equal(noPrice.length, 0, "시장가 없으면 미부여");

const one = options[0];
// 베스팅: 부여 직후엔 불가, 기간 경과 후 가능.
assert.equal(isOptionVested(one, 100), false, "부여 직후 베스팅 미완료");
assert.equal(
  isOptionVested(one, 100 + DIRECTOR_OPTION_VESTING_SESSIONS),
  true,
  "베스팅 기간 경과 후 완료",
);
assert.equal(isOptionExercisable(one, 100), false);
assert.equal(
  isOptionExercisable(one, 100 + DIRECTOR_OPTION_VESTING_SESSIONS),
  true,
);
// 행사 완료 표시된 옵션은 행사 불가.
assert.equal(
  isOptionExercisable({ ...one, exercisedSession: 110 }, 200),
  false,
  "행사 완료 옵션은 재행사 불가",
);
assert.equal(optionExerciseCost(one), one.strike * one.quantity);

// 직렬화 정규화: 잘못된 항목 제거·중복 제거.
const normalized = normalizeCharacterStockOptions([
  { characterId: "a", tierId: "advisor", strike: 100, quantity: 10, grantedSession: 1 },
  { characterId: "a", tierId: "advisor", strike: 999, quantity: 5, grantedSession: 2 }, // 중복
  { characterId: "", tierId: "x", strike: 100, quantity: 1, grantedSession: 0 }, // 무효
  { characterId: "b", tierId: "csuite", strike: 0, quantity: 1, grantedSession: 0 }, // 무효(행사가 0)
]);
assert.equal(normalized.length, 1, "무효·중복 제거");
assert.equal(normalized[0].strike, 100, "중복은 첫 항목 유지");

console.log(
  `✅ stock-options: 위촉 부여·행사가·베스팅·행사비용·정규화 검증 통과 (${DIRECTOR_TIERS.length}티어)`,
);

/**
 * 신뢰도 위촉 이사 시스템 회귀 테스트.
 * - directorRoleForCharacter: 결정론적(같은 id는 항상 같은 직위)
 * - earnedDirectorships: 신뢰도 임계 이상만 위촉
 * - director 칭호 id 왕복
 * - 보유 일관성 신뢰도: 장기 보유가 5거래일마다 신뢰도를 올린다
 */
import assert from "node:assert";
import {
  DIRECTOR_ROLES,
  DIRECTOR_TRUST_THRESHOLD,
  LONG_HOLD_SESSIONS,
  directorRoleForCharacter,
  earnedDirectorships,
  directorTitleId,
  parseDirectorTitleId,
  accrueLongHoldingAffinity,
  getCharacterProgress,
} from "../src/lib/market/characterProgress";
import type { StockState } from "../src/lib/types/market";

// 결정론적 직위
const role1 = directorRoleForCharacter("chr_minori");
assert.equal(directorRoleForCharacter("chr_minori"), role1, "같은 id는 같은 직위");
assert.ok(DIRECTOR_ROLES.includes(role1), "정의된 직위 중 하나");

// 위촉 목록: 임계 이상만
const directors = earnedDirectorships({
  chr_a: { affinity: 0, trust: DIRECTOR_TRUST_THRESHOLD, holdingSessions: 0 } as never,
  chr_b: { affinity: 0, trust: DIRECTOR_TRUST_THRESHOLD - 1, holdingSessions: 0 } as never,
});
assert.equal(directors.length, 1, "임계 이상 1명만 위촉");
assert.equal(directors[0].characterId, "chr_a");

// 칭호 id 왕복
const tid = directorTitleId("chr_a");
assert.equal(parseDirectorTitleId(tid), "chr_a");
assert.equal(parseDirectorTitleId("rookie"), null, "정적 칭호는 이사 id가 아님");

// 보유 일관성 신뢰도: 본주를 3% 이상 LONG_HOLD_SESSIONS 만큼 유지하면 신뢰도 상승
const stock = {
  id: "minori",
  ticker: "MNRI",
  name: "미노리 용역",
  ceoId: "chr_minori",
  currentPrice: 10_000,
  initialPrice: 10_000,
} as unknown as StockState;
const holdings = [{ stockId: "minori", quantity: 100, averagePrice: 10_000 }];
const equity = 1_000_000; // 보유가치 1,000,000 이 전체의 100% → 3% 이상
let progress = {};
// 첫 호출: lastHoldingSession 기록만.
progress = accrueLongHoldingAffinity(progress, holdings, [stock], equity, 0);
// LONG_HOLD_SESSIONS 경과 후: 신뢰도가 올라야 한다.
progress = accrueLongHoldingAffinity(
  progress,
  holdings,
  [stock],
  equity,
  LONG_HOLD_SESSIONS,
);
const minoriProgress = getCharacterProgress(progress, "chr_minori");
assert.ok(
  minoriProgress.trust > 0,
  `보유 일관성으로 신뢰도가 올라야: ${minoriProgress.trust}`,
);

console.log(
  `✅ character-directors: 결정론 직위·위촉 임계·보유 일관성 신뢰도(+${minoriProgress.trust}) 검증 통과`,
);

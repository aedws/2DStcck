/**
 * 미니게임(노동 소득) 보상 규칙.
 * 이 소득은 '노동 소득'으로 분류돼 시즌·투자 성과(초과수익) 평가에서 제외된다.
 * 체류 시간을 늘리는 게 목적이라 플레이 횟수·총액에 제한을 두지 않는다 —
 * 실력(점수)만큼 현금을 벌고, 그 현금은 투자 '연료'로만 쓰인다.
 */

/** 벽돌깨기: 라운드당 보상 (센트) — $400 */
export const BRICK_REWARD_PER_ROUND = 40_000;
/** 벽돌깨기: 깬 벽돌당 보상 (센트) — $60 */
export const BRICK_REWARD_PER_BRICK = 6_000;
/** 1회 지급 상한 (버그 방어용 안전장치; 정상 플레이에선 사실상 도달 불가) — $5,000,000 */
export const MINIGAME_REWARD_HARD_CAP = 500_000_000;

/** 벽돌깨기 한 판 보상 (센트). */
export function computeBrickBreakerReward(rounds: number, bricks: number): number {
  const raw =
    Math.max(0, Math.floor(rounds)) * BRICK_REWARD_PER_ROUND +
    Math.max(0, Math.floor(bricks)) * BRICK_REWARD_PER_BRICK;
  return Math.min(MINIGAME_REWARD_HARD_CAP, raw);
}

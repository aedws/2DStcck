/**
 * 미니게임(노동 소득) 경제 규칙.
 * 이 소득은 '노동 소득'으로 분류돼 시즌·투자 성과(초과수익) 평가에서 제외된다.
 * 체류 시간을 늘리는 게 목적이라 플레이 횟수·총액에 제한을 두지 않는다.
 *
 * 벽돌깨기 루프: 벽돌을 깨면 '코인(내부 재화)'과 '점수'가 오른다. 코인으로 공을
 * 등급별(N/S/SS)로 사서 화력을 키우고, 게임오버 시 최종 점수의 1/N 만큼 현금으로
 * 출력된다. (코인은 구매로 소모되지만, 점수는 누적 획득분이라 줄지 않는다.)
 */

export type BallGrade = "N" | "S" | "SS";

/** 벽돌 1개 파괴 시 얻는 코인·점수 */
export const COIN_PER_BRICK = 1_000;
/** 라운드(턴) 생존 보너스 코인·점수 */
export const COIN_PER_ROUND = 2_000;

/** 공 등급별 구매가 (코인) */
export const BALL_PRICE: Record<BallGrade, number> = {
  N: 1_500,
  S: 6_500,
  SS: 20_000,
};

export const BALL_GRADE_LABEL: Record<BallGrade, string> = {
  N: "일반",
  S: "광역",
  SS: "십자",
};

export const BALL_GRADE_DESC: Record<BallGrade, string> = {
  N: "부딪힌 벽돌 1개에 데미지",
  S: "부딪힌 벽돌 + 주변 8칸에 광역 데미지",
  SS: "부딪힌 벽돌의 가로·세로 전체(십자)에 데미지",
};

/** 최종 점수 → 현금 환산 계수 (현금 = 점수 / 이 값). '1/N'의 N. */
export const MINIGAME_CASH_DIVISOR = 2;
/** 1회 지급 상한 (버그 방어용 안전장치) — $5,000,000 */
export const MINIGAME_REWARD_HARD_CAP = 500_000_000;

/** 최종 점수(코인 누적)를 현금(센트)으로 환산한다. */
export function computeBrickBreakerCash(score: number): number {
  const cash = Math.floor(Math.max(0, score) / MINIGAME_CASH_DIVISOR);
  return Math.min(MINIGAME_REWARD_HARD_CAP, cash);
}

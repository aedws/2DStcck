/**
 * 즉석 복권: 5거래일 회차마다 최대 5장 구매 가능. 사는 즉시 결과가 나온다.
 * 기대값을 티켓가보다 낮게 두어 재화 sink로 기능하되 잭팟으로 한탕 로망을 준다.
 */

/** 티켓 1장 가격 (센트) — $1,000 */
export const LOTTERY_TICKET_PRICE = 100_000;
/** 회차당 최대 구매 장수 */
export const LOTTERY_MAX_PER_WINDOW = 5;
/** 구매 한도 리셋 주기 (거래일) */
export const LOTTERY_INTERVAL_DAYS = 5;

export interface LotteryPrize {
  amount: number; // 센트
  tier: "lose" | "refund" | "small" | "mid" | "big" | "jackpot";
  label: string;
}

export interface LotteryResult {
  success: boolean;
  message: string;
  prize?: LotteryPrize;
}

interface Tier {
  p: number;
  prize: LotteryPrize;
}

const TIERS: Tier[] = [
  { p: 0.72, prize: { amount: 0, tier: "lose", label: "꽝" } },
  { p: 0.2, prize: { amount: 100_000, tier: "refund", label: "$1,000" } },
  { p: 0.06, prize: { amount: 300_000, tier: "small", label: "$3,000" } },
  { p: 0.018, prize: { amount: 1_000_000, tier: "mid", label: "$10,000" } },
  { p: 0.0018, prize: { amount: 5_000_000, tier: "big", label: "$50,000" } },
  {
    p: 0.0002,
    prize: { amount: 50_000_000, tier: "jackpot", label: "잭팟 $500,000" },
  },
];

/** 복권 1장 추첨 (즉석). 기대값 ≈ $750 (하우스엣지 25%). */
export function drawLotteryPrize(rand: () => number = Math.random): LotteryPrize {
  let r = rand();
  for (const t of TIERS) {
    if (r < t.p) return t.prize;
    r -= t.p;
  }
  return TIERS[0].prize;
}

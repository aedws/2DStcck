import { seededRand } from "@/lib/market/engine";

/**
 * 두 종류의 복권.
 *  ① 일반 복권(숫자 5/45): 1~45 중 서로 다른 5개를 고르고, 티켓별 즉석 추첨된
 *     당첨 번호 5개와 맞춘 개수로 등수가 갈린다(한국식 로또 감성). 추첨은 구매
 *     시점 논스로 시드돼 미리 계산할 수 없다(악용 방지). 픽 자체는 확률에 영향이
 *     없지만(모든 조합 동일 확률) 고르는 재미를 준다.
 *  ② 연금 복권: 당첨 시 한 번에 큰돈 대신 5거래일마다 정기 지급되는 '연금'을 준다.
 * 두 복권 모두 기대값 < 티켓가라 재화 sink로 기능한다.
 */

/** 일반 복권 티켓 1장 가격 (센트) — $1,000 */
export const LOTTERY_TICKET_PRICE = 100_000;
/** 회차당 최대 구매 장수 (일반+연금 합산) */
export const LOTTERY_MAX_PER_WINDOW = 5;
/** 구매 한도 리셋 주기 (거래일) */
export const LOTTERY_INTERVAL_DAYS = 5;

/** 숫자 복권: 1~45 중 5개 */
export const LOTTO_MAX_NUMBER = 45;
export const LOTTO_PICK = 5;

export interface LotteryPrize {
  amount: number; // 센트 (연금이면 회차당 금액)
  tier: "lose" | "refund" | "small" | "mid" | "big" | "jackpot";
  label: string;
}

export interface LottoResult {
  success: boolean;
  message: string;
  picks?: number[];
  winning?: number[];
  matches?: number;
  prize?: LotteryPrize;
}

/** 결정론적으로 서로 다른 정수 count개를 1~max에서 뽑는다. */
export function drawDistinctNumbers(
  count: number,
  max: number,
  rand: () => number,
): number[] {
  const pool = Array.from({ length: max }, (_, i) => i + 1);
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rand() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, count).sort((a, b) => a - b);
}

/** 맞춘 개수별 상금 (5/45, 5개 픽 기준). */
export function lottoPrizeForMatches(matches: number): LotteryPrize {
  switch (matches) {
    case 5:
      return { amount: 80_000_000, tier: "jackpot", label: "1등 잭팟 $800,000" };
    case 4:
      return { amount: 1_000_000, tier: "big", label: "2등 $10,000" };
    case 3:
      return { amount: 40_000, tier: "mid", label: "3등 $400" };
    case 2:
      return { amount: 3_000, tier: "small", label: "4등 $30" };
    default:
      return { amount: 0, tier: "lose", label: "낙첨" };
  }
}

/** 일반 복권 1장 즉석 추첨. nonce로 시드해 미리 계산 불가. */
export function drawLotto(
  picks: number[],
  nonce: number,
): { winning: number[]; matches: number; prize: LotteryPrize } {
  const winning = drawDistinctNumbers(
    LOTTO_PICK,
    LOTTO_MAX_NUMBER,
    seededRand(nonce, "lotto-draw"),
  );
  const set = new Set(picks);
  const matches = winning.filter((n) => set.has(n)).length;
  return { winning, matches, prize: lottoPrizeForMatches(matches) };
}

/** 자동 번호 (퀵픽). */
export function autoPickNumbers(nonce: number): number[] {
  return drawDistinctNumbers(
    LOTTO_PICK,
    LOTTO_MAX_NUMBER,
    seededRand(nonce, "lotto-quickpick"),
  );
}

// ─────────────────────── 연금 복권 ───────────────────────

/** 연금 복권 티켓 가격 (센트) — $2,000 */
export const PENSION_TICKET_PRICE = 200_000;

export interface PensionOutcome {
  tier: "lose" | "third" | "second" | "first";
  label: string;
  /** 회차당 지급액 (센트). 연금이 아니면(3등 일시금) totalPeriods=1. */
  amountPerPeriod: number;
  totalPeriods: number;
}

interface PensionTier {
  p: number;
  outcome: PensionOutcome;
}

/**
 * 연금 복권 등수. 1등·2등은 5거래일마다 지급되는 연금, 3등은 소액 일시금.
 * 기대값 ≈ $760 (티켓 $2,000 대비 sink).
 *   1등: 1/20,000 · $50,000 × 40회 = 총 $2,000,000
 *   2등: 1/1,000 · $10,000 × 20회 = 총 $200,000
 *   3등: 1/40 · $12,000 일시금
 */
const PENSION_TIERS: PensionTier[] = [
  {
    p: 1 / 20_000,
    outcome: {
      tier: "first",
      label: "연금 1등 · $500/회 × 40회",
      amountPerPeriod: 5_000_000,
      totalPeriods: 40,
    },
  },
  {
    p: 1 / 1_000,
    outcome: {
      tier: "second",
      label: "연금 2등 · $100/회 × 20회",
      amountPerPeriod: 1_000_000,
      totalPeriods: 20,
    },
  },
  {
    p: 1 / 40,
    outcome: {
      tier: "third",
      label: "3등 $120 일시금",
      amountPerPeriod: 12_000,
      totalPeriods: 1,
    },
  },
];

/** 연금 복권 1장 즉석 추첨. */
export function drawPension(nonce: number): PensionOutcome {
  let r = seededRand(nonce, "pension-draw")();
  for (const t of PENSION_TIERS) {
    if (r < t.p) return t.outcome;
    r -= t.p;
  }
  return {
    tier: "lose",
    label: "낙첨",
    amountPerPeriod: 0,
    totalPeriods: 0,
  };
}

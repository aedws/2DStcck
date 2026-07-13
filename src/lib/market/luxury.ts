import { LUXURY_BY_ID } from "@/data/luxuries";
import type { OwnedLuxury } from "@/lib/types/luxury";

/** 구매 즉시 소비·감가되는 비율. 나머지만 순자산으로 인정한다. */
export const LUXURY_ACCOUNTING_RATE = 0.7;

/** 보유 사치재의 순자산 합산 가치(구매가의 70%, 센트). */
export function getLuxuryValue(owned: OwnedLuxury[]): number {
  return owned.reduce(
    (sum, item) => sum + Math.round((item.paidPrice ?? 0) * LUXURY_ACCOUNTING_RATE),
    0,
  );
}

/** 보유 사치재 중 가장 높은 과시 등급(없으면 0). 랭킹 뱃지에 사용. */
export function getTopLuxuryTier(owned: OwnedLuxury[]): number {
  let top = 0;
  for (const item of owned) {
    const def = LUXURY_BY_ID.get(item.id);
    if (def && def.tier > top) top = def.tier;
  }
  return top;
}

/** 랭킹 보드용 과시 요약: 보유 사치재 이모지를 등급 높은 순으로 반환. */
export function getLuxuryShowcase(owned: OwnedLuxury[], limit = 5): string[] {
  return [...owned]
    .map((item) => LUXURY_BY_ID.get(item.id))
    .filter((def): def is NonNullable<typeof def> => def !== undefined)
    .sort((a, b) => b.tier - a.tier || b.price - a.price)
    .slice(0, limit)
    .map((def) => def.emoji);
}

export function isLuxuryOwned(owned: OwnedLuxury[], id: string): boolean {
  return owned.some((item) => item.id === id);
}

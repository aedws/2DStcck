import { LUXURY_BY_ID } from "@/data/luxuries";
import type { OwnedLuxury } from "@/lib/types/luxury";

/**
 * 보유 사치재의 순자산 합산 가치(센트).
 * 구매가(paidPrice)를 그대로 자산으로 인정하므로 "사도 순자산이 줄지 않고"
 * 현금이 사치재 자산으로 형태만 바뀐다 → 랭킹 손해 없이 과시 가능.
 */
export function getLuxuryValue(owned: OwnedLuxury[]): number {
  return owned.reduce((sum, item) => sum + (item.paidPrice ?? 0), 0);
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

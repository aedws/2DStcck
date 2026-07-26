/**
 * 이사 보통주 스톡옵션 — 신뢰도 티어 위촉 시 부여된다.
 *
 * 규칙(소유자 확정 2026-07-26):
 *  - 행사가(strike) = 위촉 시점의 캐릭터 회사 시장가. 즉시 차익이 없어 돈복사가 아니며,
 *    위촉 이후 주가가 오른 만큼만 이익이다(실제 임직원 스톡옵션과 동일).
 *  - 수량 = 티어별 상한(자문역<사외이사<상무이사<C급).
 *  - 베스팅 = 위촉 후 DIRECTOR_OPTION_VESTING_SESSIONS 거래일이 지나야 행사 가능.
 *  - 행사 = 현금으로 행사가×수량을 내고 같은 수량의 보통주를 받는다.
 */
import {
  DIRECTOR_TIERS,
  DIRECTOR_OPTION_VESTING_SESSIONS,
} from "@/lib/market/characterProgress";
import type { CharacterProgressMap } from "@/lib/types/market";

export interface CharacterStockOption {
  characterId: string;
  tierId: string;
  /** 행사가(센트) — 위촉 시점 시장가. */
  strike: number;
  quantity: number;
  grantedSession: number;
  /** 행사 완료 거래일(미행사면 undefined). */
  exercisedSession?: number;
}

const finiteInt = (value: unknown, fallback = 0): number => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? n : fallback;
};

export function normalizeCharacterStockOptions(
  value: unknown,
): CharacterStockOption[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const result: CharacterStockOption[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<CharacterStockOption>;
    const characterId = String(item.characterId ?? "");
    const tierId = String(item.tierId ?? "");
    const strike = finiteInt(item.strike);
    const quantity = finiteInt(item.quantity);
    if (!characterId || !tierId || strike <= 0 || quantity <= 0) continue;
    const key = `${characterId}:${tierId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({
      characterId,
      tierId,
      strike,
      quantity,
      grantedSession: finiteInt(item.grantedSession),
      ...(finiteInt(item.exercisedSession) > 0
        ? { exercisedSession: finiteInt(item.exercisedSession) }
        : {}),
    });
  }
  return result;
}

/**
 * 신뢰도 티어를 새로 넘은 캐릭터에 대해, 그 티어의 스톡옵션을 위촉 시점 시장가로
 * 1회 부여한다. `priceOf(characterId)`는 해당 캐릭터 회사의 현재 시장가(센트)를
 * 돌려주고, 시장가가 없으면(0) 부여하지 않는다. 이미 있는 (캐릭터, 티어) 부여는 유지.
 */
export function reconcileCharacterStockOptions(
  progress: CharacterProgressMap,
  existing: CharacterStockOption[],
  priceOf: (characterId: string) => number,
  currentSession: number,
): CharacterStockOption[] {
  const has = new Set(existing.map((o) => `${o.characterId}:${o.tierId}`));
  let next = existing;
  for (const [characterId, entry] of Object.entries(progress)) {
    const trust = entry?.trust ?? 0;
    for (const tier of DIRECTOR_TIERS) {
      if (trust < tier.minTrust) continue;
      const key = `${characterId}:${tier.id}`;
      if (has.has(key)) continue;
      const strike = Math.round(priceOf(characterId));
      if (!(strike > 0)) continue;
      if (next === existing) next = [...existing];
      next.push({
        characterId,
        tierId: tier.id,
        strike,
        quantity: tier.optionShares,
        grantedSession: currentSession,
      });
      has.add(key);
    }
  }
  return next;
}

export function isOptionVested(
  option: CharacterStockOption,
  currentSession: number,
): boolean {
  return (
    currentSession - option.grantedSession >= DIRECTOR_OPTION_VESTING_SESSIONS
  );
}

/** 행사 가능(미행사·베스팅 완료) 옵션인지. */
export function isOptionExercisable(
  option: CharacterStockOption,
  currentSession: number,
): boolean {
  return option.exercisedSession === undefined && isOptionVested(option, currentSession);
}

/** 옵션 1건의 행사 비용(센트) = 행사가 × 수량. */
export function optionExerciseCost(option: CharacterStockOption): number {
  return option.strike * option.quantity;
}

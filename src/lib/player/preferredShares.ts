import { getCompanyDefinitions } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import {
  getCharacterProgress,
  PREFERRED_SHARE_AFFINITY,
} from "@/lib/market/characterProgress";
import type {
  CharacterProgressMap,
  PreferredShare,
} from "@/lib/types/market";

/** 우선주 1좌 액면가 (총자산 반영, 시세와 무관한 고정값). */
export const PREFERRED_FACE_VALUE = 80_000;
/** 우선주 1좌 분기 배당액 (고배당). */
export const PREFERRED_QUARTERLY_DIVIDEND = 4_000;

/** 보유 우선주의 총 액면가치. */
export function getPreferredShareValue(shares: PreferredShare[]): number {
  let total = 0;
  for (const share of shares) total += share.faceValue * share.shares;
  return total;
}

/** 우선주 1좌의 분기 총 배당액. */
export function getPreferredQuarterlyDividend(shares: PreferredShare[]): number {
  let total = 0;
  for (const share of shares) total += share.dividendPerShare * share.shares;
  return total;
}

/**
 * 동맹(호감 100) 이상인 캐릭터에게 아직 발행하지 않은 우선주를 발행한다.
 * 멱등: 이미 보유한 캐릭터는 건너뛰므로 오프라인 누적분도 로드 시 한 번만 정산된다.
 * 새로 발행된 우선주 목록을 함께 돌려줘 발행 축하 토스트에 쓴다.
 */
export function reconcilePreferredShares(
  progress: CharacterProgressMap,
  existing: PreferredShare[],
  session: number,
  now: number,
): { shares: PreferredShare[]; issued: PreferredShare[] } {
  const owned = new Set(existing.map((share) => share.characterId));
  const issued: PreferredShare[] = [];
  for (const company of getCompanyDefinitions()) {
    const characterId = company.ceoId;
    if (!characterId || owned.has(characterId)) continue;
    const affinity = getCharacterProgress(progress, characterId).affinity;
    if (affinity < PREFERRED_SHARE_AFFINITY) continue;
    const ceo = getCharacterById(characterId);
    issued.push({
      characterId,
      companyId: company.id,
      ticker: company.ticker,
      companyName: company.name,
      emoji: ceo?.emoji ?? "🎖️",
      shares: 1,
      faceValue: PREFERRED_FACE_VALUE,
      dividendPerShare: PREFERRED_QUARTERLY_DIVIDEND,
      issuedSession: session,
      issuedAt: now,
    });
    owned.add(characterId);
  }
  return {
    shares: issued.length > 0 ? [...existing, ...issued] : existing,
    issued,
  };
}

/** 저장값에서 우선주 배열을 안전하게 복원한다. */
export function normalizePreferredShares(value: unknown): PreferredShare[] {
  if (!Array.isArray(value)) return [];
  const result: PreferredShare[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const item = raw as Partial<PreferredShare>;
    if (typeof item.characterId !== "string" || seen.has(item.characterId)) continue;
    if (typeof item.companyId !== "string") continue;
    seen.add(item.characterId);
    result.push({
      characterId: item.characterId,
      companyId: item.companyId,
      ticker: typeof item.ticker === "string" ? item.ticker : "",
      companyName: typeof item.companyName === "string" ? item.companyName : "",
      emoji: typeof item.emoji === "string" ? item.emoji : "🎖️",
      shares: Math.max(1, Math.floor(Number(item.shares) || 1)),
      faceValue: Math.max(0, Number(item.faceValue) || PREFERRED_FACE_VALUE),
      dividendPerShare: Math.max(
        0,
        Number(item.dividendPerShare) || PREFERRED_QUARTERLY_DIVIDEND,
      ),
      issuedSession: Math.max(0, Math.floor(Number(item.issuedSession) || 0)),
      issuedAt: Number(item.issuedAt) || 0,
    });
  }
  return result;
}

import { getCompanyDefinitions } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import {
  getCharacterProgress,
  PREFERRED_SHARE_AFFINITY,
} from "@/lib/market/characterProgress";
import type { CharacterConcentration } from "@/lib/market/characterConcentration";
import { isPreferredEligible } from "@/lib/market/characterConcentration";
import type {
  CharacterProgressMap,
  PreferredShare,
  StockState,
} from "@/lib/types/market";

/** 우선주 발행가 = 발행 시점 본주 가격 × 1.30 (30% 상향). 이후 본주 등락을 추종한다. */
export const PREFERRED_FACE_PREMIUM = 1.3;
/** 우선주 분기 배당률 = 본주 분기 배당률 + 5.0%p. (구 모델 호환용 상수) */
export const PREFERRED_DIVIDEND_YIELD_BONUS = 0.05;
/** 가치 추종: 본주 일별 상승은 200%, 하락은 20%만 반영한다(비대칭). */
export const PREFERRED_UPSIDE_TRACK = 2.0;
export const PREFERRED_DOWNSIDE_TRACK = 0.2;
/** 20거래일마다 지급하는 배당 = 현재 가치의 50%. */
export const PREFERRED_DIVIDEND_RATE = 0.5;

/** 본주 등락을 비대칭 추종해 갱신한 좌당 가치를 돌려준다. */
export function trackedPreferredFaceValue(
  previousFace: number,
  lastTrackPrice: number,
  currentPrice: number,
): number {
  if (!(lastTrackPrice > 0) || !(currentPrice > 0)) return previousFace;
  const rawReturn = currentPrice / lastTrackPrice - 1;
  const factor =
    1 +
    rawReturn * (rawReturn >= 0 ? PREFERRED_UPSIDE_TRACK : PREFERRED_DOWNSIDE_TRACK);
  return Math.max(1, Math.round(previousFace * Math.max(0, factor)));
}
/** 시세를 못 구할 때 쓰는 액면 하한 (초기 발행 안전장치). */
const PREFERRED_FACE_FALLBACK = 80_000;
/** 매각이 발동하는 '유의미한 분산' 기준 — 보유 캐릭터 수. */
export const PREFERRED_DIVERSIFY_CHARACTERS = 5;
/** 분산 지속 후 휴면 우선주가 매각되기까지의 거래일 유예. */
export const PREFERRED_SALE_GRACE_SESSIONS = 5;
/** 동맹·집중 조건 유지 시 우선주 1좌가 추가 지급되는 간격. */
export const PREFERRED_GRANT_INTERVAL_SESSIONS = 5;

/**
 * 활성 우선주 — 지금 집중(focused) 상태인 캐릭터의 우선주만 혜택이 살아있다.
 * 집중을 풀면 기록은 남되 휴면(자산·배당 0)이 되고, 재집중하면 부활한다.
 */
export function getActivePreferredShares(
  shares: PreferredShare[],
  concentration: CharacterConcentration,
): PreferredShare[] {
  if (!isPreferredEligible(concentration)) return [];
  const focused = new Set(concentration.focusedCharacterIds);
  return shares.filter((share) => focused.has(share.characterId));
}

/** 우선주가 지금 활성(집중 유지)인지 판정. */
export function isPreferredActive(
  share: PreferredShare,
  concentration: CharacterConcentration,
): boolean {
  return (
    isPreferredEligible(concentration) &&
    concentration.focusedCharacterIds.includes(share.characterId)
  );
}

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

export interface PreferredReconcileResult {
  shares: PreferredShare[];
  /** 이번 정산에서 신규 또는 추가 지급된 좌. shares는 지급 수량이다. */
  issued: PreferredShare[];
  /** 집중 해제로 매각된 우선주 */
  sold: PreferredShare[];
  /** 매각 대금 (액면 합계) — 현금으로 지급된다 */
  proceeds: number;
  /** 지금까지 한 번이라도 발행된 캐릭터 id (매각 후 재발행 방지) */
  issuedCharacterIds: string[];
}

/**
 * 우선주를 정산한다.
 * - 발행: 호감 100(동맹) + 원 앤 온리·트윈 스타·트리플 하르모니아 지정 캐릭터 +
 *   최초 미발행이면 1좌 지급. 조건을 계속 유지하면 5거래일마다 1좌 추가 지급.
 *   액면 = 최초 발행 시 본주 × 1.30, 분기배당 = 액면 ×(본주배당률 + 5%p).
 * - 매각: 집중이 풀려 더는 지정이 아닌 우선주는 액면가로 매각(현금화)되고 사라진다.
 * - 재발행 방지: 매각된 캐릭터는 다시 최초 발행되지 않는다(무한 현금화 차단).
 * 컨텍스트(보유·집중 데이터)가 없으면 그대로 둔다(로드 시엔 직후 tick 이 정산).
 */
export function reconcilePreferredShares(
  progress: CharacterProgressMap,
  existing: PreferredShare[],
  issuedCharacterIds: string[],
  session: number,
  now: number,
  context?: {
    stocks: StockState[];
    concentration: CharacterConcentration;
    /** 유의미 분산(5캐릭터↑)이 유예(5거래일)를 넘겨 휴면분 매각이 확정됐는지 */
    sellDormant: boolean;
  },
): PreferredReconcileResult {
  if (!context) {
    return { shares: existing, issued: [], sold: [], proceeds: 0, issuedCharacterIds };
  }
  const eligible = isPreferredEligible(context.concentration);
  const focused = new Set(context.concentration.focusedCharacterIds);
  const isActive = (characterId: string) => eligible && focused.has(characterId);

  const stockByCharacter = new Map<string, StockState>();
  for (const stock of context.stocks) {
    if (stock.ceoId && stock.leverage === undefined && !stock.coveredCallUnderlyingId) {
      stockByCharacter.set(stock.ceoId, stock);
    }
  }
  // 활성 우선주 가치를 본주 등락에 맞춰 비대칭 추종 갱신하고, 20거래일 배당액을
  // 현재 가치의 50%로 재산정한다.
  const trackValue = (share: PreferredShare): PreferredShare => {
    const price = stockByCharacter.get(share.characterId)?.currentPrice ?? 0;
    if (!(price > 0)) return share;
    const base = share.lastTrackPrice ?? price;
    const faceValue = trackedPreferredFaceValue(share.faceValue, base, price);
    return {
      ...share,
      faceValue,
      lastTrackPrice: price,
      dividendPerShare: Math.round(faceValue * PREFERRED_DIVIDEND_RATE),
    };
  };

  // 1) 보유 우선주: 집중 유지 중이면 가치를 추종 갱신하고 조건 충족 시 1좌 추가.
  //    유의미 분산(5캐릭터↑)이 확정되면 전량 소멸한다 — 가치는 환급되지 않는다.
  const kept: PreferredShare[] = [];
  const sold: PreferredShare[] = [];
  const issued: PreferredShare[] = [];
  const proceeds = 0;
  for (const share of existing) {
    if (context.sellDormant && !isActive(share.characterId)) {
      // 분산 확정 — 0주 초기화, 환급 없음.
      sold.push(share);
      continue;
    }
    const tracked = isActive(share.characterId) ? trackValue(share) : share;
    const affinity = getCharacterProgress(progress, share.characterId).affinity;
    const lastIssuedSession = tracked.lastIssuedSession ?? tracked.issuedSession;
    if (
      isActive(share.characterId) &&
      affinity >= PREFERRED_SHARE_AFFINITY &&
      session - lastIssuedSession >= PREFERRED_GRANT_INTERVAL_SESSIONS
    ) {
      const updated = {
        ...tracked,
        shares: tracked.shares + 1,
        lastIssuedSession: session,
      };
      kept.push(updated);
      issued.push({ ...updated, shares: 1 });
    } else {
      kept.push(tracked);
    }
  }

  // 2) 신규 발행 (지정·동맹·과거 미발행)
  const everIssued = new Set(issuedCharacterIds);
  const ownedNow = new Set(kept.map((share) => share.characterId));
  const newlyIssued: PreferredShare[] = [];
  if (eligible) {
    for (const company of getCompanyDefinitions()) {
      const characterId = company.ceoId;
      if (!characterId || !focused.has(characterId)) continue;
      if (ownedNow.has(characterId) || everIssued.has(characterId)) continue;
      if (getCharacterProgress(progress, characterId).affinity < PREFERRED_SHARE_AFFINITY) {
        continue;
      }
      const stock = stockByCharacter.get(characterId);
      const price = stock?.currentPrice ?? 0;
      const faceValue =
        price > 0 ? Math.round(price * PREFERRED_FACE_PREMIUM) : PREFERRED_FACE_FALLBACK;
      const dividendPerShare = Math.round(faceValue * PREFERRED_DIVIDEND_RATE);
      const ceo = getCharacterById(characterId);
      const share = {
        characterId,
        companyId: company.id,
        ticker: company.ticker,
        companyName: company.name,
        emoji: ceo?.emoji ?? "🎖️",
        shares: 1,
        faceValue,
        dividendPerShare,
        lastTrackPrice: price > 0 ? price : undefined,
        issuedSession: session,
        issuedAt: now,
        lastIssuedSession: session,
      };
      newlyIssued.push(share);
      issued.push(share);
      everIssued.add(characterId);
    }
  }

  return {
    shares: [...kept, ...newlyIssued],
    issued,
    sold,
    proceeds,
    issuedCharacterIds: [...everIssued],
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
      faceValue: Math.max(0, Number(item.faceValue) || PREFERRED_FACE_FALLBACK),
      dividendPerShare: Math.max(0, Number(item.dividendPerShare) || 0),
      lastTrackPrice:
        Number(item.lastTrackPrice) > 0 ? Number(item.lastTrackPrice) : undefined,
      issuedSession: Math.max(0, Math.floor(Number(item.issuedSession) || 0)),
      issuedAt: Number(item.issuedAt) || 0,
      lastIssuedSession: Math.max(
        0,
        Math.floor(
          Number(item.lastIssuedSession) ||
            Number(item.issuedSession) ||
            0,
        ),
      ),
    });
  }
  return result;
}

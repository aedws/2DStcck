import { getCompanyDefinitions } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import {
  getCharacterProgress,
  PREFERRED_SHARE_AFFINITY,
} from "@/lib/market/characterProgress";
import type { CharacterConcentration } from "@/lib/market/characterConcentration";
import { isPreferredEligible } from "@/lib/market/characterConcentration";
import { TRADING_SESSIONS_PER_YEAR } from "@/lib/market/distributions";
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
/** 배당 주기 — 커버드콜 월 분배와 같은 20거래일 그리드로 지급한다. */
export const PREFERRED_DIVIDEND_INTERVAL_SESSIONS = 20;
/** 연 배당률 4800% (= 5거래일당 100%). */
export const PREFERRED_ANNUAL_DIVIDEND_RATE = 48.0;
/**
 * 회차(20거래일) 배당 비율 = 연 4800% ÷ (240/20 = 12회) = 4.0.
 * 즉 20거래일마다 현재 가치의 400%를 지급하며, 이는 5거래일당 100%와 같다.
 */
export const PREFERRED_DIVIDEND_RATE =
  (PREFERRED_ANNUAL_DIVIDEND_RATE * PREFERRED_DIVIDEND_INTERVAL_SESSIONS) /
  TRADING_SESSIONS_PER_YEAR;

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
/** 동맹·집중 조건 유지 시 우선주 1좌가 추가 지급되는 기본 간격(호감 100). */
export const PREFERRED_GRANT_INTERVAL_SESSIONS = 5;
/** 호감도 120 이상: 발행 간격 단축(3거래일당 1좌). */
export const PREFERRED_GRANT_FAST_AFFINITY = 120;
export const PREFERRED_GRANT_FAST_INTERVAL_SESSIONS = 3;
/** 호감도 150(만점): 추가 단축(2거래일당 1좌). */
export const PREFERRED_GRANT_FASTEST_AFFINITY = 150;
export const PREFERRED_GRANT_FASTEST_INTERVAL_SESSIONS = 2;

/**
 * 호감도에 따른 우선주 추가 발행 간격(거래일). 관계가 깊을수록 더 자주 지급된다.
 * 호감 150 → 2거래일, 120 → 3거래일, 그 외(≥100) → 5거래일.
 */
export function preferredGrantIntervalSessions(affinity: number): number {
  if (affinity >= PREFERRED_GRANT_FASTEST_AFFINITY) {
    return PREFERRED_GRANT_FASTEST_INTERVAL_SESSIONS;
  }
  if (affinity >= PREFERRED_GRANT_FAST_AFFINITY) {
    return PREFERRED_GRANT_FAST_INTERVAL_SESSIONS;
  }
  return PREFERRED_GRANT_INTERVAL_SESSIONS;
}

/** 발행된 우선주는 집중 상태와 무관하게 계속 자산·배당에 반영된다. */
export function getActivePreferredShares(
  shares: PreferredShare[],
  _concentration: CharacterConcentration,
): PreferredShare[] {
  return shares.filter((share) => share.shares > 0);
}

/** 보유 수량이 있는 우선주는 집중 상태와 무관하게 항상 활성이다. */
export function isPreferredActive(
  share: PreferredShare,
  _concentration: CharacterConcentration,
): boolean {
  return share.shares > 0;
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
  /** 지금까지 한 번이라도 발행된 캐릭터 id */
  issuedCharacterIds: string[];
}

/**
 * 우선주를 정산한다.
 * - 발행: 호감 100(동맹) + 원 앤 온리·트윈 스타·트리플 하르모니아 지정 캐릭터 +
 *   최초 미발행이면 1좌 지급. 조건을 계속 유지하면 5거래일마다 1좌 추가 지급.
 *   액면 = 최초 발행 시 본주 × 1.30, 분기배당 = 액면 ×(본주배당률 + 5%p).
 * - 보유: 한 번 발행된 우선주는 집중이 풀려도 영구 보존되고 자산·배당이 유지된다.
 * - 추가 발행: 동맹·집중 조건을 현재 만족할 때만 지급한다.
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
  },
): PreferredReconcileResult {
  if (!context) {
    return { shares: existing, issued: [], issuedCharacterIds };
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
  // 현재 가치의 400%(5거래일당 100%)로 재산정한다.
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

  // 1) 보유 우선주: 집중 여부와 무관하게 영구 보존하고 가치를 추종 갱신한다.
  //    동맹·집중 조건을 현재 만족할 때만 1좌를 추가 발행한다.
  const kept: PreferredShare[] = [];
  const issued: PreferredShare[] = [];
  for (const share of existing) {
    const tracked = trackValue(share);
    const affinity = getCharacterProgress(progress, share.characterId).affinity;
    const lastIssuedSession = tracked.lastIssuedSession ?? tracked.issuedSession;
    if (
      isActive(share.characterId) &&
      affinity >= PREFERRED_SHARE_AFFINITY &&
      session - lastIssuedSession >= preferredGrantIntervalSessions(affinity)
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

  // 2) 신규 발행 (지정·동맹). 보유 기록과 과거 발행 기록을 모두 보존한다.
  const ownedNow = new Set(kept.map((share) => share.characterId));
  const newlyIssued: PreferredShare[] = [];
  if (eligible) {
    for (const company of getCompanyDefinitions()) {
      const characterId = company.ceoId;
      if (!characterId || !focused.has(characterId)) continue;
      if (ownedNow.has(characterId)) continue;
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
      ownedNow.add(characterId);
    }
  }

  return {
    shares: [...kept, ...newlyIssued],
    issued,
    issuedCharacterIds: [...new Set([...issuedCharacterIds, ...ownedNow])],
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

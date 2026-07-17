import type {
  CharacterProgress,
  CharacterProgressMap,
  Holding,
  StockState,
} from "@/lib/types/market";

export const MAX_CHARACTER_TRUST = 100;
export const MAX_CHARACTER_AFFINITY = 120;
/** 인버스·곱버스(적대 베팅) 보유 시 호감도가 음수로 내려갈 수 있는 하한. */
export const MIN_CHARACTER_AFFINITY = -120;
export const PRIVATE_CLUE_AFFINITY = 30;
export const CHARACTER_MISSION_AFFINITY = 50;
export const SPECIAL_CHOICE_AFFINITY = 100;
export const LONG_HOLD_SESSIONS = 5;
export const LONG_HOLD_MIN_EQUITY_RATIO = 0.03;

/** 우선주가 발행되는 관계 임계값 (동맹 등급). */
export const PREFERRED_SHARE_AFFINITY = SPECIAL_CHOICE_AFFINITY;

function clampAffinity(value: number): number {
  return Math.max(MIN_CHARACTER_AFFINITY, Math.min(MAX_CHARACTER_AFFINITY, value));
}

/**
 * 주주 권리 계수 — 호감도가 음수(인버스·곱버스로 적대)면 배당 권리가 약해진다.
 * 스펙: 약한 권리 = 호감도/10000. 양수(우호)면 온전한 1.0, 음수면 1 + 호감/10000
 * 로 완만히 감소해 0에서 멈춘다. (호감 하한 -120 기준 최대 약 1.2% 감소)
 */
export function shareholderRightFactor(affinity: number): number {
  if (affinity >= 0) return 1;
  return Math.max(0, 1 + affinity / 10000);
}

export interface RelationshipTier {
  index: number;
  id: "acquaintance" | "interest" | "trust" | "ally" | "favorite";
  name: string;
  emoji: string;
  /** 이 등급이 시작되는 최소 호감도 */
  min: number;
}

/** 호감도(0~120)를 관계 등급으로 승격. 기존 게이트 값을 그대로 경계로 쓴다. */
export const RELATIONSHIP_TIERS: RelationshipTier[] = [
  { index: 0, id: "acquaintance", name: "면식", emoji: "🤝", min: 0 },
  { index: 1, id: "interest", name: "관심", emoji: "🌱", min: PRIVATE_CLUE_AFFINITY },
  { index: 2, id: "trust", name: "신뢰", emoji: "🔗", min: CHARACTER_MISSION_AFFINITY },
  { index: 3, id: "ally", name: "동맹", emoji: "🤍", min: SPECIAL_CHOICE_AFFINITY },
  { index: 4, id: "favorite", name: "최애", emoji: "⭐", min: MAX_CHARACTER_AFFINITY },
];

/** 최애(호감 만렙) 관계 수 — 수집 완성 진척도. */
export function countFavoriteRelationships(
  progress: CharacterProgressMap,
): number {
  let count = 0;
  for (const entry of Object.values(progress)) {
    if ((entry?.affinity ?? 0) >= MAX_CHARACTER_AFFINITY) count += 1;
  }
  return count;
}

export function getRelationshipTier(affinity: number): RelationshipTier {
  let tier = RELATIONSHIP_TIERS[0];
  for (const candidate of RELATIONSHIP_TIERS) {
    if (affinity >= candidate.min) tier = candidate;
  }
  return tier;
}

export function emptyCharacterProgress(characterId: string): CharacterProgress {
  return {
    characterId,
    trust: 0,
    affinity: 0,
    holdingSessions: 0,
  };
}

export function getCharacterProgress(
  progress: CharacterProgressMap,
  characterId: string | undefined,
): CharacterProgress {
  if (!characterId) return emptyCharacterProgress("");
  return progress[characterId] ?? emptyCharacterProgress(characterId);
}

export function addCharacterProgress(
  progress: CharacterProgressMap,
  characterId: string | undefined,
  trustDelta: number,
  affinityDelta: number,
  session: number,
): CharacterProgressMap {
  if (!characterId) return progress;
  const current = getCharacterProgress(progress, characterId);
  const trust = Math.max(
    0,
    Math.min(MAX_CHARACTER_TRUST, current.trust + trustDelta),
  );
  const affinity = clampAffinity(current.affinity + affinityDelta);
  const bondedAtSession =
    current.bondedAtSession ??
    (current.affinity < SPECIAL_CHOICE_AFFINITY &&
    affinity >= SPECIAL_CHOICE_AFFINITY
      ? session
      : undefined);

  return {
    ...progress,
    [characterId]: {
      ...current,
      trust,
      affinity,
      bondedAtSession,
    },
  };
}

export function settleMissionRelationship(
  progress: CharacterProgressMap,
  characterId: string | undefined,
  succeeded: boolean,
  session: number,
  exclusive = false,
): CharacterProgressMap {
  return addCharacterProgress(
    progress,
    characterId,
    succeeded ? (exclusive ? 8 : 5) : 0,
    succeeded ? (exclusive ? 6 : 4) : 1,
    session,
  );
}

export function addStorySupportAffinity(
  progress: CharacterProgressMap,
  characterId: string | undefined,
  session: number,
): CharacterProgressMap {
  return addCharacterProgress(progress, characterId, 0, 3, session);
}

/**
 * 캐릭터 종목 보유 기간을 거래일 단위로 누적해 5거래일마다 호감도를 조정한다.
 * 직접 회사 주식을 순자산 3% 이상 보유하면 +2(우호), 그 캐릭터의 인버스를 보유하면
 * −2, 곱버스(레버리지 ≤ −2)면 −4(적대)로 호감이 깎여 음수까지 내려갈 수 있다.
 * 직접 보유(우호)가 인버스보다 우선한다. 오프라인 동안에도 포지션이 유지됐다고 본다.
 */
export function accrueLongHoldingAffinity(
  progress: CharacterProgressMap,
  holdings: Holding[],
  stocks: StockState[],
  equity: number,
  currentSession: number,
): CharacterProgressMap {
  if (equity <= 0) return progress;
  const holdingsById = new Map(holdings.map((holding) => [holding.stockId, holding]));
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));

  // 캐릭터별 스탠스 rate 산출: 우호(+2)가 적대(−2/−4)보다 우선한다.
  const rateByCharacter = new Map<string, number>();
  for (const stock of stocks) {
    const holding = holdingsById.get(stock.id);
    const quantity = holding?.quantity ?? 0;
    if (quantity <= 0) continue;

    // 직접 캐릭터 종목 (파생 제외) — 우호
    if (
      stock.ceoId &&
      stock.leverage === undefined &&
      !stock.coveredCallUnderlyingId &&
      !stock.universalDerivative
    ) {
      if ((quantity * stock.currentPrice) / equity >= LONG_HOLD_MIN_EQUITY_RATIO) {
        rateByCharacter.set(stock.ceoId, 2);
      }
      continue;
    }
    // 인버스·곱버스 (음수 레버리지) — 적대. 기초자산의 캐릭터에 반대 베팅.
    if ((stock.leverage ?? 0) < 0 && stock.leverageUnderlyingId) {
      const ceoId = stockById.get(stock.leverageUnderlyingId)?.ceoId;
      if (!ceoId) continue;
      const hostileRate = (stock.leverage ?? 0) <= -2 ? -4 : -2;
      const existing = rateByCharacter.get(ceoId);
      if (existing === undefined || (existing < 0 && hostileRate < existing)) {
        rateByCharacter.set(ceoId, hostileRate);
      }
    }
  }

  let next = progress;
  const characters = new Set<string>([
    ...rateByCharacter.keys(),
    ...Object.keys(progress),
  ]);
  for (const characterId of characters) {
    const rate = rateByCharacter.get(characterId) ?? 0;
    const current = getCharacterProgress(next, characterId);
    const lastSession = current.lastHoldingSession;

    if (rate === 0) {
      if (current.holdingSessions === 0 && lastSession === currentSession) continue;
      next = {
        ...next,
        [characterId]: {
          ...current,
          holdingSessions: 0,
          lastHoldingSession: currentSession,
        },
      };
      continue;
    }
    if (lastSession === undefined) {
      next = {
        ...next,
        [characterId]: { ...current, lastHoldingSession: currentSession },
      };
      continue;
    }
    const elapsed = Math.max(0, currentSession - lastSession);
    if (elapsed === 0) continue;
    const total = current.holdingSessions + elapsed;
    const rewards = Math.floor(total / LONG_HOLD_SESSIONS);
    const affinity = clampAffinity(current.affinity + rewards * rate);
    next = {
      ...next,
      [characterId]: {
        ...current,
        affinity,
        holdingSessions: total % LONG_HOLD_SESSIONS,
        lastHoldingSession: currentSession,
        bondedAtSession:
          current.bondedAtSession ??
          (current.affinity < SPECIAL_CHOICE_AFFINITY &&
          affinity >= SPECIAL_CHOICE_AFFINITY
            ? currentSession
            : undefined),
      },
    };
  }

  return next;
}

export function canUseBondChoice(
  progress: CharacterProgress,
  storyWindowStart: number,
): boolean {
  return (
    progress.affinity >= SPECIAL_CHOICE_AFFINITY &&
    progress.bondedAtSession !== undefined &&
    progress.bondedAtSession < storyWindowStart
  );
}

export function normalizeCharacterProgressMap(
  value: unknown,
): CharacterProgressMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const normalized: CharacterProgressMap = {};
  for (const [characterId, raw] of Object.entries(value)) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) continue;
    const item = raw as Partial<CharacterProgress>;
    normalized[characterId] = {
      characterId,
      trust: Math.max(
        0,
        Math.min(MAX_CHARACTER_TRUST, Number(item.trust) || 0),
      ),
      affinity: clampAffinity(Number(item.affinity) || 0),
      holdingSessions: Math.max(
        0,
        Math.min(LONG_HOLD_SESSIONS - 1, Number(item.holdingSessions) || 0),
      ),
      lastHoldingSession: Number.isSafeInteger(item.lastHoldingSession)
        ? item.lastHoldingSession
        : undefined,
      bondedAtSession: Number.isSafeInteger(item.bondedAtSession)
        ? item.bondedAtSession
        : undefined,
    };
  }
  return normalized;
}

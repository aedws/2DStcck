import type {
  CharacterProgress,
  CharacterProgressMap,
  Holding,
  StockState,
} from "@/lib/types/market";

export const MAX_CHARACTER_TRUST = 100;
export const MAX_CHARACTER_AFFINITY = 120;
export const PRIVATE_CLUE_AFFINITY = 30;
export const CHARACTER_MISSION_AFFINITY = 50;
export const SPECIAL_CHOICE_AFFINITY = 100;
export const LONG_HOLD_SESSIONS = 5;
export const LONG_HOLD_MIN_EQUITY_RATIO = 0.03;

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
  const affinity = Math.max(
    0,
    Math.min(MAX_CHARACTER_AFFINITY, current.affinity + affinityDelta),
  );
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
 * 직접 회사 주식이 순자산 3% 이상인 기간을 거래일 단위로 누적한다.
 * 5거래일마다 호감도 +2. 오프라인 동안에도 포지션이 유지됐다고 간주한다.
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
  let next = progress;

  for (const stock of stocks) {
    if (!stock.ceoId || stock.universalDerivative) continue;
    if (stock.leverage !== undefined || stock.coveredCallUnderlyingId) continue;
    const holding = holdingsById.get(stock.id);
    const qualifies =
      Boolean(holding && holding.quantity > 0) &&
      ((holding?.quantity ?? 0) * stock.currentPrice) / equity >=
        LONG_HOLD_MIN_EQUITY_RATIO;
    const current = getCharacterProgress(next, stock.ceoId);
    const lastSession = current.lastHoldingSession;

    if (!qualifies) {
      if (current.holdingSessions === 0 && lastSession === currentSession) continue;
      next = {
        ...next,
        [stock.ceoId]: {
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
        [stock.ceoId]: { ...current, lastHoldingSession: currentSession },
      };
      continue;
    }
    const elapsed = Math.max(0, currentSession - lastSession);
    if (elapsed === 0) continue;
    const total = current.holdingSessions + elapsed;
    const rewards = Math.floor(total / LONG_HOLD_SESSIONS);
    const affinity = Math.min(
      MAX_CHARACTER_AFFINITY,
      current.affinity + rewards * 2,
    );
    next = {
      ...next,
      [stock.ceoId]: {
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
      affinity: Math.max(
        0,
        Math.min(MAX_CHARACTER_AFFINITY, Number(item.affinity) || 0),
      ),
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

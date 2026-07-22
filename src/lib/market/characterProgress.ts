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
 * 우호(≥0)면 온전한 1.0, 적대면 하한(−120)까지 선형으로 감소해 0%(배당 전무)에
 * 이른다. 예: 호감 −60 → 0.5(배당 절반), −120 → 0(배당 없음).
 */
export function shareholderRightFactor(affinity: number): number {
  if (affinity >= 0) return 1;
  return Math.max(0, 1 + affinity / Math.abs(MIN_CHARACTER_AFFINITY));
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

/** 보유 유형별 호감 상승 가중치 (5거래일당 상승 = 가중치 × 2). */
export const AFFINITY_WEIGHT_PREFERRED = 5;
export const AFFINITY_WEIGHT_LEVERAGE = 2;
export const AFFINITY_WEIGHT_COMMON = 1;
export const AFFINITY_WEIGHT_COVERED_CALL = 0.5;
/** 여러 캐릭터를 담은 유저 ETF는 보통주와 같은 속도로 구성원 전원의 호감도가 오른다. */
export const AFFINITY_WEIGHT_USER_ETF = 1;
/** 단일 캐릭터 테마 ETF 보유는 보통주보다 약간 높은 속도로 오른다. */
export const AFFINITY_WEIGHT_SINGLE_CHARACTER_ETF = 1.5;
/** 단일 캐릭터 테마 ETF를 처음 설정할 때 즉시 주는 호감도. */
export const SINGLE_CHARACTER_ETF_ISSUANCE_AFFINITY = 20;
/** 가중치를 정수 상승폭으로 바꾸는 단위(×2). 보통주=+2로 기존과 동일. */
const AFFINITY_RATE_UNIT = 2;

export interface CharacterLinkedEtfHolding {
  /** 현재 보유 ETF 평가액(센트). */
  value: number;
  holdings: { stockId: string; weight: number }[];
}

function resolveStockCharacterId(
  stockId: string,
  stockById: Map<string, StockState>,
): string | undefined {
  let stock = stockById.get(stockId);
  const visited = new Set<string>();
  while (stock && !visited.has(stock.id)) {
    visited.add(stock.id);
    if (stock.ceoId) return stock.ceoId;
    const underlyingId =
      stock.coveredCallUnderlyingId ?? stock.leverageUnderlyingId;
    stock = underlyingId ? stockById.get(underlyingId) : undefined;
  }
  return undefined;
}

/** 파생상품은 기초기업까지 따라가고, 같은 캐릭터는 한 번만 반환한다. */
export function resolveEtfCharacterIds(
  holdings: { stockId: string }[],
  stocks: StockState[],
): string[] {
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
  return [
    ...new Set(
      holdings
        .map((holding) => resolveStockCharacterId(holding.stockId, stockById))
        .filter((characterId): characterId is string => Boolean(characterId)),
    ),
  ];
}

/**
 * 캐릭터 보유 기간을 거래일 단위로 누적해 5거래일마다 호감도를 조정한다.
 * 우호 상승폭은 보유 유형별 가중을 따른다(5거래일당): 우선주 +10 / 레버리지 +4 /
 * 보통주 +2 / 커버드콜 +1. 한 캐릭터를 여러 유형으로 보유하면 가장 높은 가중을 쓴다.
 * 직접·레버리지·커버드콜·우선주는 모두 그 캐릭터 보유로 인정(순자산 3% 이상 시).
 * 인버스는 −2, 곱버스는 −4로 적대(음수까지). 우호가 적대보다 우선한다.
 */
export function accrueLongHoldingAffinity(
  progress: CharacterProgressMap,
  holdings: Holding[],
  stocks: StockState[],
  equity: number,
  currentSession: number,
  activePreferred: { characterId: string; faceValue: number; shares: number }[] = [],
  userEtfHoldings: CharacterLinkedEtfHolding[] = [],
): CharacterProgressMap {
  if (equity <= 0) return progress;
  const holdingsById = new Map(holdings.map((holding) => [holding.stockId, holding]));
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));

  // 캐릭터별 우호 가중치(max)·보유가치 합계·적대 rate 를 모은다.
  const posWeight = new Map<string, number>();
  const posValue = new Map<string, number>();
  const hostile = new Map<string, number>();
  const bump = (map: Map<string, number>, key: string, value: number) => {
    map.set(key, (map.get(key) ?? 0) + value);
  };
  const raiseWeight = (key: string, weight: number) => {
    posWeight.set(key, Math.max(posWeight.get(key) ?? 0, weight));
  };

  for (const share of activePreferred) {
    raiseWeight(share.characterId, AFFINITY_WEIGHT_PREFERRED);
    bump(posValue, share.characterId, share.faceValue * share.shares);
  }
  for (const etf of userEtfHoldings) {
    if (!(etf.value > 0)) continue;
    const characterIds = resolveEtfCharacterIds(etf.holdings, stocks);
    if (!characterIds.length) continue;
    const weight =
      characterIds.length === 1
        ? AFFINITY_WEIGHT_SINGLE_CHARACTER_ETF
        : AFFINITY_WEIGHT_USER_ETF;
    for (const characterId of characterIds) {
      // ETF 자체가 계좌의 3% 이상이면 구성 캐릭터 전원을 보유한 것으로 본다.
      raiseWeight(characterId, weight);
      bump(posValue, characterId, etf.value);
    }
  }
  for (const stock of stocks) {
    const quantity = holdingsById.get(stock.id)?.quantity ?? 0;
    if (quantity <= 0) continue;
    const value = quantity * stock.currentPrice;

    if (
      stock.ceoId &&
      stock.leverage === undefined &&
      !stock.coveredCallUnderlyingId &&
      !stock.universalDerivative
    ) {
      raiseWeight(stock.ceoId, AFFINITY_WEIGHT_COMMON);
      bump(posValue, stock.ceoId, value);
      continue;
    }
    if (stock.coveredCallUnderlyingId) {
      const ceoId = stockById.get(stock.coveredCallUnderlyingId)?.ceoId;
      if (ceoId) {
        raiseWeight(ceoId, AFFINITY_WEIGHT_COVERED_CALL);
        bump(posValue, ceoId, value);
      }
      continue;
    }
    if ((stock.leverage ?? 0) > 0 && stock.leverageUnderlyingId) {
      const ceoId = stockById.get(stock.leverageUnderlyingId)?.ceoId;
      if (ceoId) {
        raiseWeight(ceoId, AFFINITY_WEIGHT_LEVERAGE);
        bump(posValue, ceoId, value);
      }
      continue;
    }
    if ((stock.leverage ?? 0) < 0 && stock.leverageUnderlyingId) {
      const ceoId = stockById.get(stock.leverageUnderlyingId)?.ceoId;
      if (!ceoId) continue;
      const hostileRate = (stock.leverage ?? 0) <= -2 ? -4 : -2;
      const existing = hostile.get(ceoId);
      if (existing === undefined || hostileRate < existing) hostile.set(ceoId, hostileRate);
    }
  }

  // 캐릭터별 최종 rate: 우호(가중×2, 3% 이상)가 적대보다 우선.
  const rateByCharacter = new Map<string, number>();
  for (const [ceoId, weight] of posWeight) {
    if ((posValue.get(ceoId) ?? 0) / equity >= LONG_HOLD_MIN_EQUITY_RATIO) {
      rateByCharacter.set(ceoId, weight * AFFINITY_RATE_UNIT);
    }
  }
  for (const [ceoId, hostileRate] of hostile) {
    if (!rateByCharacter.has(ceoId)) rateByCharacter.set(ceoId, hostileRate);
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

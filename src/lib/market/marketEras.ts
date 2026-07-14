import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "@/lib/market/constants";

/**
 * 시장 국면(에라) — "시즌 변주 시드"의 시장 절반.
 *
 * 공정성: 국면은 오직 전역 세션 번호(벽시계의 순함수)로만 정해진다. 개인 시작
 * 시각과 무관하므로 같은 시각에 접속한 모두가 같은 국면·같은 가격을 본다.
 *
 * 안전성: 국면 효과는 미래의 고정 시작 세션(MARKET_ERA_START_SESSION)부터만
 * 적용되고, 그 이전은 완전한 중립(배율 1.0, 편향 0)이다. 따라서 과거 틱의
 * 계산 결과가 부동소수점까지 동일 → 기존 체크포인트 유효 → 버전 bump 불필요.
 * (엔진의 SMOOTHING_START_TICK과 같은 방식)
 */

export type MarketEraArchetypeId =
  | "neutral"
  | "bull"
  | "bear"
  | "highvol"
  | "calm"
  | "recovery"
  | "choppy";

interface EraArchetype {
  id: MarketEraArchetypeId;
  name: string;
  emoji: string;
  /** 변동성 배율(중립 1) */
  volMul: number;
  /** 추세 진폭 배율(중립 1) */
  trendMul: number;
  /** 방향성 편향: 거래일당 목표 초과수익(중립 0) */
  driftBiasPerSession: number;
}

const ARCHETYPES: EraArchetype[] = [
  { id: "bull", name: "강세장", emoji: "📈", volMul: 1.0, trendMul: 1.0, driftBiasPerSession: 0.01 },
  { id: "bear", name: "약세장", emoji: "📉", volMul: 1.15, trendMul: 1.0, driftBiasPerSession: -0.008 },
  { id: "highvol", name: "고변동", emoji: "⚡", volMul: 1.6, trendMul: 1.3, driftBiasPerSession: 0 },
  { id: "calm", name: "저변동 안정", emoji: "🌤️", volMul: 0.7, trendMul: 0.85, driftBiasPerSession: 0.003 },
  { id: "recovery", name: "회복 랠리", emoji: "🌅", volMul: 1.2, trendMul: 1.1, driftBiasPerSession: 0.008 },
  { id: "choppy", name: "순환 등락", emoji: "🔄", volMul: 1.05, trendMul: 1.5, driftBiasPerSession: 0 },
];

/** 국면 길이(거래일). 시즌(20)의 배수라 이후 시즌 정렬과 맞물린다. */
export const MARKET_ERA_SESSIONS = 60;

const EPOCH_SESSION = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);

/**
 * 국면이 시작되는 세션(그 전은 중립). 미래로 잡아 현재/과거 시장을 바꾸지 않는다.
 * 에라 그리드는 이 시점부터 MARKET_ERA_SESSIONS 간격으로 타일링된다.
 */
export const MARKET_ERA_START_SESSION = Math.floor(
  Date.UTC(2026, 6, 16) / SESSION_DURATION_MS,
);

export interface MarketEra {
  /** 국면 번호(0부터). 시작 전이면 -1 */
  index: number;
  archetypeId: MarketEraArchetypeId;
  name: string;
  emoji: string;
  volMul: number;
  trendMul: number;
  /** 방향성 편향(초당). changeRate 에 beta × 이 값 × dt 로 더한다. 중립 0 */
  driftPerSecond: number;
  startSession: number;
  endSession: number;
}

const NEUTRAL_ERA: MarketEra = {
  index: -1,
  archetypeId: "neutral",
  name: "기본",
  emoji: "",
  volMul: 1,
  trendMul: 1,
  driftPerSecond: 0,
  startSession: -1,
  endSession: MARKET_ERA_START_SESSION,
};

/** 결정론 정수 해시 → [0, n) */
function hashIndex(index: number, n: number): number {
  let h = (2166136261 ^ index) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h = (h ^ (h >>> 16)) >>> 0;
  return h % n;
}

/** 연속한 국면이 같은 성격으로 반복되지 않게 결정론적으로 회피한다. */
function archetypeForEra(index: number): EraArchetype {
  const pick = hashIndex(index, ARCHETYPES.length);
  if (index > 0 && pick === hashIndex(index - 1, ARCHETYPES.length)) {
    return ARCHETYPES[(pick + 1) % ARCHETYPES.length];
  }
  return ARCHETYPES[pick];
}

/** 해당 세션의 시장 국면. 시작 전이면 중립(효과 없음). */
export function getMarketEra(session: number): MarketEra {
  if (!Number.isFinite(session) || session < MARKET_ERA_START_SESSION) {
    return NEUTRAL_ERA;
  }
  const index = Math.floor(
    (session - MARKET_ERA_START_SESSION) / MARKET_ERA_SESSIONS,
  );
  const arch = archetypeForEra(index);
  const startSession = MARKET_ERA_START_SESSION + index * MARKET_ERA_SESSIONS;
  return {
    index,
    archetypeId: arch.id,
    name: arch.name,
    emoji: arch.emoji,
    volMul: arch.volMul,
    trendMul: arch.trendMul,
    driftPerSecond: arch.driftBiasPerSession / (SESSION_DURATION_MS / 1000),
    startSession,
    endSession: startSession + MARKET_ERA_SESSIONS,
  };
}

// EPOCH_SESSION 은 향후 시즌 정렬(그리드 계산)에서 재사용한다.
export const MARKET_EPOCH_SESSION = EPOCH_SESSION;

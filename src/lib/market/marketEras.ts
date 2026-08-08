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
  | "choppy"
  | "boom-bubble"
  | "economy-as-usual"
  | "why-is-it-rising"
  | "crisis-to-war";

export type WhyIsItRisingPhase = "cover" | "reveal";

export interface WhyIsItRisingEraState {
  phase: WhyIsItRisingPhase;
  /** 80% 지점 전에는 UI에 노출하지 않는 실제 기반 국면. */
  hiddenArchetypeId: Exclude<
    MarketEraArchetypeId,
    | "neutral"
    | "boom-bubble"
    | "economy-as-usual"
    | "why-is-it-rising"
    | "crisis-to-war"
  >;
  revealSession: number;
  displayMode: "sideways" | "bear";
}

export type CrisisToWarPhase = "crisis" | "recovery" | "war";

export interface CrisisToWarEraState {
  phase: CrisisToWarPhase;
  hiddenScenarioId: EconomyAsUsualScenarioId;
  crisisEndSession: number;
  recoveryEndSession: number;
}

export type BoomBubbleOutcome = "boom" | "bubble";
export type BoomBubblePhase =
  | "runup"
  | "sideways"
  | "boom"
  | "crash"
  | "decline";

export interface BoomBubbleEraState {
  phase: BoomBubblePhase;
  /** 국면 내부 비공개 판정 시점. 결과는 횡보 종료 전까지 노출하지 않는다. */
  decisionSession: number;
  decisionMade: boolean;
  sidewaysStartSession: number;
  sidewaysEndSession: number;
  /** 횡보가 끝나 가격으로 결과가 드러난 뒤에만 채운다. */
  outcome?: BoomBubbleOutcome;
}

export type EconomyAsUsualScenarioId =
  | "liquidity-drought"
  | "giant-fraud"
  | "bank-run"
  | "private-credit";
export type EconomyAsUsualPhase = "cover" | "warning" | "active";

export interface EconomyAsUsualEraState {
  phase: EconomyAsUsualPhase;
  coverArchetypeId: Exclude<
    MarketEraArchetypeId,
    | "neutral"
    | "boom-bubble"
    | "economy-as-usual"
    | "why-is-it-rising"
    | "crisis-to-war"
  >;
  decisionSessions: number[];
  /** UI에는 노출하지 않는 전역 공통 판정 결과다. */
  hiddenScenarioId?: EconomyAsUsualScenarioId;
  triggerDecisionSession?: number;
  crisisStartSession?: number;
}

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

const BOOM_BUBBLE_ARCHETYPE: EraArchetype = {
  id: "boom-bubble",
  name: "대호황과 버블은 구별할 수 없다",
  emoji: "🎈",
  volMul: 1.25,
  trendMul: 1.2,
  driftBiasPerSession: 0.012,
};

const ECONOMY_AS_USUAL_ARCHETYPE: EraArchetype = {
  id: "economy-as-usual",
  name: "경제대그냥",
  emoji: "🏦",
  volMul: 1,
  trendMul: 1,
  driftBiasPerSession: 0,
};

const WHY_IS_IT_RISING_ARCHETYPE: EraArchetype = {
  id: "why-is-it-rising",
  name: "뭐임? 왜오름???",
  emoji: "❓",
  volMul: 0.9,
  trendMul: 0.85,
  driftBiasPerSession: -0.002,
};

const CRISIS_TO_WAR_ARCHETYPE: EraArchetype = {
  id: "crisis-to-war",
  name: "역사적인 경제위기는 언제나 대전쟁의 불씨였다",
  emoji: "🔥",
  volMul: 1.8,
  trendMul: 1.35,
  driftBiasPerSession: -0.012,
};

/** 국면 길이(거래일). 시즌(20)의 배수라 이후 시즌 정렬과 맞물린다. */
export const MARKET_ERA_SESSIONS = 60;
/** 최초 신규 복합 국면. 2026-07-31 09:00 KST 시작, 기존 과거 에라는 불변. */
export const BOOM_BUBBLE_FIRST_ERA_INDEX = 6;
/** 이후 기존 국면 일곱 개마다 한 번씩 다시 등장한다. */
export const BOOM_BUBBLE_ERA_INTERVAL = 7;
/** 비공개 경제위기 국면은 전쟁 종료 뒤인 2026-08-05 09:00 KST에 처음 시작한다. */
export const ECONOMY_AS_USUAL_FIRST_ERA_INDEX = 8;
/** 대호황·버블과 겹치지 않는 별도 7국면 주기다. */
export const ECONOMY_AS_USUAL_ERA_INTERVAL = 7;
/** 2026-08-10 09:00 KST부터 신규 위장 국면을 미래 시장에만 편성한다. */
export const WHY_IS_IT_RISING_FIRST_ERA_INDEX = 10;
export const WHY_IS_IT_RISING_ERA_INTERVAL = 13;
/** 위장 국면 다음 에라부터 경제위기→회복→전쟁 복합 국면을 편성한다. */
export const CRISIS_TO_WAR_FIRST_ERA_INDEX = 11;
export const CRISIS_TO_WAR_ERA_INTERVAL = 13;
export const WHY_IS_IT_RISING_REVEAL_OFFSET = Math.floor(
  MARKET_ERA_SESSIONS * 0.8,
);
export const CRISIS_TO_WAR_CRISIS_SESSIONS = Math.floor(
  MARKET_ERA_SESSIONS * 0.5,
);
export const CRISIS_TO_WAR_RECOVERY_SESSIONS = 5;
export const ECONOMY_AS_USUAL_FIRST_DECISION_OFFSET = 5;
export const ECONOMY_AS_USUAL_DECISION_INTERVAL = 10;
export const ECONOMY_AS_USUAL_CRISIS_DELAY = 4;
export const BOOM_BUBBLE_SIDEWAYS_SESSIONS = Math.round(
  MARKET_ERA_SESSIONS * 0.2,
);
export const BOOM_BUBBLE_MIN_SIDEWAYS_OFFSET = Math.ceil(
  MARKET_ERA_SESSIONS * 0.35,
);

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
  boomBubble?: BoomBubbleEraState;
  economyAsUsual?: EconomyAsUsualEraState;
  whyIsItRising?: WhyIsItRisingEraState;
  crisisToWar?: CrisisToWarEraState;
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
  if (
    index >= BOOM_BUBBLE_FIRST_ERA_INDEX &&
    (index - BOOM_BUBBLE_FIRST_ERA_INDEX) % BOOM_BUBBLE_ERA_INTERVAL === 0
  ) {
    return BOOM_BUBBLE_ARCHETYPE;
  }
  if (
    index >= ECONOMY_AS_USUAL_FIRST_ERA_INDEX &&
    (index - ECONOMY_AS_USUAL_FIRST_ERA_INDEX) %
      ECONOMY_AS_USUAL_ERA_INTERVAL ===
      0
  ) {
    return ECONOMY_AS_USUAL_ARCHETYPE;
  }
  if (
    index >= WHY_IS_IT_RISING_FIRST_ERA_INDEX &&
    (index - WHY_IS_IT_RISING_FIRST_ERA_INDEX) %
      WHY_IS_IT_RISING_ERA_INTERVAL ===
      0
  ) {
    return WHY_IS_IT_RISING_ARCHETYPE;
  }
  if (
    index >= CRISIS_TO_WAR_FIRST_ERA_INDEX &&
    (index - CRISIS_TO_WAR_FIRST_ERA_INDEX) %
      CRISIS_TO_WAR_ERA_INTERVAL ===
      0
  ) {
    return CRISIS_TO_WAR_ARCHETYPE;
  }
  const pick = hashIndex(index, ARCHETYPES.length);
  if (index > 0 && pick === hashIndex(index - 1, ARCHETYPES.length)) {
    return ARCHETYPES[(pick + 1) % ARCHETYPES.length];
  }
  return ARCHETYPES[pick];
}

function whyIsItRisingModifiers(
  index: number,
  session: number,
  startSession: number,
) {
  const hidden = ARCHETYPES[
    hashIndex(index * 149 + 31, ARCHETYPES.length)
  ];
  const revealSession = startSession + WHY_IS_IT_RISING_REVEAL_OFFSET;
  const displayMode =
    hashIndex(Math.floor((session - startSession) / 4) + index * 17, 2) === 0
      ? ("sideways" as const)
      : ("bear" as const);
  const revealed = session >= revealSession;
  return {
    name: revealed
      ? `정체 공개 · ${hidden.name}`
      : displayMode === "sideways"
        ? "횡보장"
        : "약세장",
    volMul: revealed ? Math.max(1.3, hidden.volMul) : displayMode === "sideways" ? 0.72 : 1.15,
    trendMul: revealed ? Math.max(1.2, hidden.trendMul) : displayMode === "sideways" ? 0.75 : 1.05,
    driftBiasPerSession: revealed
      ? 0.022
      : displayMode === "sideways"
        ? 0
        : -0.009,
    state: {
      phase: revealed ? ("reveal" as const) : ("cover" as const),
      hiddenArchetypeId:
        hidden.id as WhyIsItRisingEraState["hiddenArchetypeId"],
      revealSession,
      displayMode,
    },
  };
}

function crisisToWarModifiers(
  index: number,
  session: number,
  startSession: number,
) {
  const crisisEndSession = startSession + CRISIS_TO_WAR_CRISIS_SESSIONS;
  const recoveryEndSession =
    crisisEndSession + CRISIS_TO_WAR_RECOVERY_SESSIONS;
  const scenarioIds: EconomyAsUsualScenarioId[] = [
    "liquidity-drought",
    "giant-fraud",
    "bank-run",
    "private-credit",
  ];
  const hiddenScenarioId =
    scenarioIds[hashIndex(index * 163 + 47, scenarioIds.length)];
  const phase: CrisisToWarPhase =
    session < crisisEndSession
      ? "crisis"
      : session < recoveryEndSession
        ? "recovery"
        : "war";
  return {
    name:
      phase === "crisis"
        ? "역사적 경제위기"
        : phase === "recovery"
          ? "폐허 속 숨 고르기"
          : "위기가 낳은 대전쟁",
    volMul: phase === "crisis" ? 2.05 : phase === "recovery" ? 0.8 : 1.75,
    trendMul: phase === "crisis" ? 1.45 : phase === "recovery" ? 0.75 : 1.35,
    driftBiasPerSession:
      phase === "crisis" ? -0.018 : phase === "recovery" ? 0.004 : -0.007,
    state: {
      phase,
      hiddenScenarioId,
      crisisEndSession,
      recoveryEndSession,
    },
    economyState: {
      phase: "active" as const,
      coverArchetypeId: "bear" as const,
      decisionSessions: [startSession],
      hiddenScenarioId,
      triggerDecisionSession: startSession,
      crisisStartSession: startSession,
    },
  };
}

function economyAsUsualState(
  index: number,
  session: number,
  startSession: number,
): EconomyAsUsualEraState {
  const cover = ARCHETYPES[hashIndex(index * 73 + 19, ARCHETYPES.length)];
  const decisionSessions: number[] = [];
  for (
    let offset = ECONOMY_AS_USUAL_FIRST_DECISION_OFFSET;
    offset <=
    MARKET_ERA_SESSIONS - ECONOMY_AS_USUAL_CRISIS_DELAY - 5;
    offset += ECONOMY_AS_USUAL_DECISION_INTERVAL
  ) {
    decisionSessions.push(startSession + offset);
  }

  // 요청 확률: 10거래일 / 국면 60거래일 × 50% = 판정 1회당 1/12.
  const triggerDecisionSession = decisionSessions.find(
    (decisionSession, decisionIndex) =>
      hashIndex(index * 101 + decisionIndex * 37 + 71, 12) === 0,
  );
  if (triggerDecisionSession === undefined) {
    return {
      phase: "cover",
      coverArchetypeId: cover.id as EconomyAsUsualEraState["coverArchetypeId"],
      decisionSessions,
    };
  }

  const crisisStartSession =
    triggerDecisionSession + ECONOMY_AS_USUAL_CRISIS_DELAY;
  const scenarioIds: EconomyAsUsualScenarioId[] = [
    "liquidity-drought",
    "giant-fraud",
    "bank-run",
    "private-credit",
  ];
  return {
    phase:
      session < triggerDecisionSession
        ? "cover"
        : session < crisisStartSession
          ? "warning"
          : "active",
    coverArchetypeId: cover.id as EconomyAsUsualEraState["coverArchetypeId"],
    decisionSessions,
    hiddenScenarioId:
      scenarioIds[hashIndex(index * 101 + triggerDecisionSession + 89, 4)],
    triggerDecisionSession,
    crisisStartSession,
  };
}

function boomBubbleTiming(index: number, startSession: number) {
  // 판정과 판정→횡보 지연은 각각 국면의 10~25%(60일 기준 6~15일).
  const decisionOffset = 6 + hashIndex(index * 31 + 11, 10);
  const sidewaysDelay = 6 + hashIndex(index * 31 + 23, 10);
  const sidewaysStartOffset = Math.max(
    BOOM_BUBBLE_MIN_SIDEWAYS_OFFSET,
    decisionOffset + sidewaysDelay,
  );
  const sidewaysStartSession = startSession + sidewaysStartOffset;
  return {
    decisionSession: startSession + decisionOffset,
    sidewaysStartSession,
    sidewaysEndSession:
      sidewaysStartSession + BOOM_BUBBLE_SIDEWAYS_SESSIONS,
    hiddenOutcome:
      hashIndex(index * 31 + 47, 2) === 0
        ? ("boom" as const)
        : ("bubble" as const),
  };
}

function boomBubbleModifiers(
  index: number,
  session: number,
  startSession: number,
): {
  name: string;
  volMul: number;
  trendMul: number;
  driftBiasPerSession: number;
  state: BoomBubbleEraState;
} {
  const timing = boomBubbleTiming(index, startSession);
  let phase: BoomBubblePhase = "runup";
  let name = BOOM_BUBBLE_ARCHETYPE.name;
  let volMul = 1.25;
  let trendMul = 1.2;
  let driftBiasPerSession = 0.012;
  let outcome: BoomBubbleOutcome | undefined;

  if (
    session >= timing.sidewaysStartSession &&
    session < timing.sidewaysEndSession
  ) {
    phase = "sideways";
    volMul = 0.75;
    trendMul = 0.8;
    driftBiasPerSession = 0;
  } else if (session >= timing.sidewaysEndSession) {
    outcome = timing.hiddenOutcome;
    if (outcome === "boom") {
      phase = "boom";
      name = "대호황 확정";
      volMul = 1.2;
      trendMul = 1.15;
      driftBiasPerSession = 0.014;
    } else if (session === timing.sidewaysEndSession) {
      phase = "crash";
      name = "버블 붕괴";
      volMul = 2.4;
      trendMul = 1.5;
      driftBiasPerSession = -0.16;
    } else {
      phase = "decline";
      name = "버블 붕괴 후 하락장";
      volMul = 1.5;
      trendMul = 1.2;
      driftBiasPerSession = -0.018;
    }
  }

  return {
    name,
    volMul,
    trendMul,
    driftBiasPerSession,
    state: {
      phase,
      decisionSession: timing.decisionSession,
      decisionMade: session >= timing.decisionSession,
      sidewaysStartSession: timing.sidewaysStartSession,
      sidewaysEndSession: timing.sidewaysEndSession,
      outcome,
    },
  };
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
  const boomBubble =
    arch.id === "boom-bubble"
      ? boomBubbleModifiers(index, session, startSession)
      : null;
  const economyAsUsual =
    arch.id === "economy-as-usual"
      ? economyAsUsualState(index, session, startSession)
      : null;
  const whyIsItRising =
    arch.id === "why-is-it-rising"
      ? whyIsItRisingModifiers(index, session, startSession)
      : null;
  const crisisToWar =
    arch.id === "crisis-to-war"
      ? crisisToWarModifiers(index, session, startSession)
      : null;
  const cover =
    economyAsUsual && economyAsUsual.phase !== "active"
      ? ARCHETYPES.find(
          (candidate) => candidate.id === economyAsUsual.coverArchetypeId,
        )
      : null;
  return {
    index,
    archetypeId: arch.id,
    name:
      boomBubble?.name ??
      whyIsItRising?.name ??
      crisisToWar?.name ??
      arch.name,
    emoji: arch.emoji,
    volMul:
      boomBubble?.volMul ??
      whyIsItRising?.volMul ??
      crisisToWar?.volMul ??
      cover?.volMul ??
      (economyAsUsual?.phase === "active" ? 1.55 : arch.volMul),
    trendMul:
      boomBubble?.trendMul ??
      whyIsItRising?.trendMul ??
      crisisToWar?.trendMul ??
      cover?.trendMul ??
      (economyAsUsual?.phase === "active" ? 1.25 : arch.trendMul),
    driftPerSecond:
      (boomBubble?.driftBiasPerSession ??
        whyIsItRising?.driftBiasPerSession ??
        crisisToWar?.driftBiasPerSession ??
        cover?.driftBiasPerSession ??
        arch.driftBiasPerSession) /
      (SESSION_DURATION_MS / 1000),
    startSession,
    endSession: startSession + MARKET_ERA_SESSIONS,
    boomBubble: boomBubble?.state,
    economyAsUsual:
      economyAsUsual ??
      (crisisToWar?.state.phase === "crisis"
        ? crisisToWar.economyState
        : undefined),
    whyIsItRising: whyIsItRising?.state,
    crisisToWar: crisisToWar?.state,
  };
}

// EPOCH_SESSION 은 향후 시즌 정렬(그리드 계산)에서 재사용한다.
export const MARKET_EPOCH_SESSION = EPOCH_SESSION;

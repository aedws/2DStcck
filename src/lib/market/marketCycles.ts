import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "@/lib/market/constants";

export type MarketCyclePhaseId =
  | "accumulation"
  | "breakout"
  | "expansion"
  | "melt-up"
  | "correction"
  | "recovery"
  | "consolidation"
  | "late-rally";

export interface MarketCyclePhase {
  id: MarketCyclePhaseId;
  name: string;
  emoji: string;
  duration: number;
  baseReturnPerSession: number;
  volatilityMultiplier: number;
  eventImpactMultiplier: number;
  counterTrendChance: number;
  summary: string;
}

export interface ActiveMarketCyclePhase extends MarketCyclePhase {
  cycleNumber: number;
  cycleSession: number;
  phaseIndex: number;
  phaseSession: number;
  sessionsLeft: number;
  sessionReturn: number;
}

export const MARKET_CYCLE_SESSIONS = 200;

export const MARKET_CYCLE_PHASES: MarketCyclePhase[] = [
  {
    id: "accumulation",
    name: "저점 축적",
    emoji: "🌱",
    duration: 35,
    baseReturnPerSession: 0.0005,
    volatilityMultiplier: 0.8,
    eventImpactMultiplier: 0.9,
    counterTrendChance: 0.28,
    summary: "거래가 잠잠한 가운데 매수세가 천천히 바닥을 다집니다.",
  },
  {
    id: "breakout",
    name: "돌파 급상승 랠리",
    emoji: "🚀",
    duration: 12,
    baseReturnPerSession: 0.006,
    volatilityMultiplier: 1.45,
    eventImpactMultiplier: 1.2,
    counterTrendChance: 0.1,
    summary: "대기 자금이 한꺼번에 유입되며 짧고 강한 상승이 이어집니다.",
  },
  {
    id: "expansion",
    name: "실적 확장 장세",
    emoji: "📈",
    duration: 48,
    baseReturnPerSession: 0.0012,
    volatilityMultiplier: 1,
    eventImpactMultiplier: 1,
    counterTrendChance: 0.2,
    summary: "상승 추세 속에서도 차익 실현과 재진입이 교차합니다.",
  },
  {
    id: "melt-up",
    name: "과열 급등",
    emoji: "🔥",
    duration: 10,
    baseReturnPerSession: 0.007,
    volatilityMultiplier: 1.75,
    eventImpactMultiplier: 1.35,
    counterTrendChance: 0.08,
    summary: "추격 매수가 몰리며 상승 속도와 변동성이 동시에 치솟습니다.",
  },
  {
    id: "correction",
    name: "급격한 조정",
    emoji: "🌧️",
    duration: 18,
    baseReturnPerSession: -0.006,
    volatilityMultiplier: 1.65,
    eventImpactMultiplier: 1.4,
    counterTrendChance: 0.14,
    summary: "과열 해소 매물이 쏟아지며 급락과 기술적 반등이 반복됩니다.",
  },
  {
    id: "recovery",
    name: "바닥 확인·회복",
    emoji: "🌤️",
    duration: 35,
    baseReturnPerSession: 0.0022,
    volatilityMultiplier: 1.2,
    eventImpactMultiplier: 1.05,
    counterTrendChance: 0.2,
    summary: "낙폭 과대 매수와 불안한 되돌림이 맞물리며 시장이 회복합니다.",
  },
  {
    id: "consolidation",
    name: "박스권 재정비",
    emoji: "🧭",
    duration: 27,
    baseReturnPerSession: 0,
    volatilityMultiplier: 0.75,
    eventImpactMultiplier: 0.9,
    counterTrendChance: 0.5,
    summary: "상승과 하락이 짧게 교차하며 다음 방향을 탐색합니다.",
  },
  {
    id: "late-rally",
    name: "후반 순환 랠리",
    emoji: "✨",
    duration: 15,
    baseReturnPerSession: 0.0035,
    volatilityMultiplier: 1.25,
    eventImpactMultiplier: 1.1,
    counterTrendChance: 0.16,
    summary: "주도 종목이 바뀌며 200거래일 사이클을 상승으로 마무리합니다.",
  },
];

const EPOCH_SESSION = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);
const PHASE_CACHE = new Map<number, ActiveMarketCyclePhase>();

function deterministicUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

export function getMarketCycleAtSession(session: number): ActiveMarketCyclePhase {
  const cached = PHASE_CACHE.get(session);
  if (cached) return cached;

  const elapsed = Math.max(0, session - EPOCH_SESSION);
  const cycleNumber = Math.floor(elapsed / MARKET_CYCLE_SESSIONS) + 1;
  const cycleSession = elapsed % MARKET_CYCLE_SESSIONS;
  let cursor = 0;
  let phase = MARKET_CYCLE_PHASES[0];
  let phaseIndex = 0;
  for (let index = 0; index < MARKET_CYCLE_PHASES.length; index++) {
    const candidate = MARKET_CYCLE_PHASES[index];
    if (cycleSession < cursor + candidate.duration) {
      phase = candidate;
      phaseIndex = index;
      break;
    }
    cursor += candidate.duration;
  }

  const phaseSession = cycleSession - cursor;
  const intensity = 0.55 + deterministicUnit(`${session}:cycle-intensity`) * 1.1;
  const counterTrend =
    deterministicUnit(`${session}:cycle-counter`) < phase.counterTrendChance;
  const burst =
    (phase.id === "breakout" || phase.id === "melt-up" || phase.id === "correction") &&
    deterministicUnit(`${session}:cycle-burst`) > 0.72
      ? 1.35
      : 1;
  const direction = counterTrend ? -0.35 : 1;
  const active: ActiveMarketCyclePhase = {
    ...phase,
    cycleNumber,
    cycleSession,
    phaseIndex,
    phaseSession,
    sessionsLeft: phase.duration - phaseSession,
    sessionReturn: phase.baseReturnPerSession * intensity * burst * direction,
  };
  PHASE_CACHE.set(session, active);
  return active;
}

export function cycleReturnForStock(
  phase: ActiveMarketCyclePhase,
  sector: string,
  dtSeconds: number,
): number {
  const exposure = sector === "채권" ? -0.3 : 1;
  return (
    phase.sessionReturn *
    exposure *
    (dtSeconds / (SESSION_DURATION_MS / 1_000))
  );
}

export function expectedCycleReturn(): number {
  return MARKET_CYCLE_PHASES.reduce(
    (sum, phase) => sum + phase.baseReturnPerSession * phase.duration,
    0,
  );
}

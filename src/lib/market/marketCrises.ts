import { STOCK_DEFINITIONS } from "@/data/stocks";
import { withCharacterQuote } from "@/data/eventQuotes";
import {
  MARKET_EPOCH_MS,
  SESSION_DURATION_MS,
} from "@/lib/market/constants";
import type {
  MarketEvent,
  StockDefinition,
} from "@/lib/types/market";

export type MarketCrisisThemeId =
  | "credit-crunch"
  | "tech-bubble"
  | "pandemic"
  | "energy-shock"
  | "bank-run";

export type MarketCrisisPhaseId =
  | "warning"
  | "crash"
  | "panic"
  | "intervention"
  | "recovery";

export interface MarketCrisisTheme {
  id: MarketCrisisThemeId;
  name: string;
  emoji: string;
  summary: string;
}

export interface MarketCrisisPhase {
  id: MarketCrisisPhaseId;
  name: string;
  emoji: string;
  duration: number;
  marketReturnPerSession: number;
  volatilityMultiplier: number;
  eventImpactMultiplier: number;
  description: string;
}

export interface MarketCrisisWindow {
  crisisNumber: number;
  startSession: number;
  endSession: number;
  theme: MarketCrisisTheme;
}

export interface ActiveMarketCrisis extends MarketCrisisWindow {
  phase: MarketCrisisPhase;
  phaseIndex: number;
  phaseSession: number;
  phaseSessionsLeft: number;
  sessionsLeft: number;
}

export const CRISIS_GAME_YEAR_SESSIONS = 200;
export const CRISIS_MIN_INTERVAL_SESSIONS = 8 * CRISIS_GAME_YEAR_SESSIONS;
export const CRISIS_MAX_INTERVAL_SESSIONS = 12 * CRISIS_GAME_YEAR_SESSIONS;

export const MARKET_CRISIS_PHASES: MarketCrisisPhase[] = [
  {
    id: "warning",
    name: "균열 경고",
    emoji: "⚠️",
    duration: 3,
    marketReturnPerSession: -0.002,
    volatilityMultiplier: 1.35,
    eventImpactMultiplier: 1.15,
    description: "유동성과 신용 지표에 이상 신호가 나타나지만 시장은 아직 낙관을 버리지 않습니다.",
  },
  {
    id: "crash",
    name: "연쇄 폭락",
    emoji: "📉",
    duration: 4,
    marketReturnPerSession: -0.028,
    volatilityMultiplier: 2,
    eventImpactMultiplier: 1.7,
    description: "강제 청산과 투매가 겹치며 위험자산 가격이 빠르게 무너집니다.",
  },
  {
    id: "panic",
    name: "공포 확산",
    emoji: "🚨",
    duration: 4,
    marketReturnPerSession: -0.015,
    volatilityMultiplier: 2.2,
    eventImpactMultiplier: 1.9,
    description: "시장 신뢰가 얼어붙고 작은 악재에도 가격이 크게 흔들립니다.",
  },
  {
    id: "intervention",
    name: "정책 개입",
    emoji: "🏦",
    duration: 4,
    marketReturnPerSession: 0.012,
    volatilityMultiplier: 1.8,
    eventImpactMultiplier: 1.55,
    description: "긴급 유동성과 안정화 정책이 투입되며 거친 기술적 반등이 시작됩니다.",
  },
  {
    id: "recovery",
    name: "불안한 회복",
    emoji: "🌱",
    duration: 5,
    marketReturnPerSession: 0.007,
    volatilityMultiplier: 1.4,
    eventImpactMultiplier: 1.25,
    description: "실물 충격은 남아 있지만 시장은 생존 기업을 중심으로 바닥을 다집니다.",
  },
];

export const MARKET_CRISIS_DURATION_SESSIONS = MARKET_CRISIS_PHASES.reduce(
  (sum, phase) => sum + phase.duration,
  0,
);

export const MARKET_CRISIS_THEMES: MarketCrisisTheme[] = [
  {
    id: "credit-crunch",
    name: "글로벌 신용 경색",
    emoji: "💳",
    summary: "부실 자산이 금융권으로 번지며 기업 자금 조달과 부동산 유동성이 동시에 얼어붙습니다.",
  },
  {
    id: "tech-bubble",
    name: "기술주 거품 붕괴",
    emoji: "💻",
    summary: "과도한 성장 기대가 꺾이며 고평가 기술·게임 기업을 중심으로 밸류에이션이 압축됩니다.",
  },
  {
    id: "pandemic",
    name: "세계 공급망 봉쇄",
    emoji: "🦠",
    summary: "이동 제한과 생산 차질이 관광·외식 산업을 강타하고 바이오와 방어 자산이 주목받습니다.",
  },
  {
    id: "energy-shock",
    name: "에너지 공급 충격",
    emoji: "🛢️",
    summary: "원자재 공급 차질과 비용 급등이 소비·생산을 압박하고 에너지 기업의 상대 강세를 만듭니다.",
  },
  {
    id: "bank-run",
    name: "은행 유동성 위기",
    emoji: "🏚️",
    summary: "예금 이탈과 자산 매각이 금융 시스템으로 전염되며 중앙은행의 긴급 대응을 부릅니다.",
  },
];

const EPOCH_SESSION = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);
const WINDOW_CACHE = new Map<number, MarketCrisisWindow>();

function deterministicUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

function seededRandom(seed: string): () => number {
  let state = Math.floor(deterministicUnit(seed) * 4_294_967_296) >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** 위기가 끝난 뒤 다음 위기까지 8~12게임년의 결정론적 간격을 둔다. */
export function crisisIntervalSessions(crisisNumber: number): number {
  const span = CRISIS_MAX_INTERVAL_SESSIONS - CRISIS_MIN_INTERVAL_SESSIONS;
  return (
    CRISIS_MIN_INTERVAL_SESSIONS +
    Math.round(deterministicUnit(`crisis:${crisisNumber}:interval`) * span)
  );
}

export function getMarketCrisisWindow(crisisNumber: number): MarketCrisisWindow {
  const normalizedNumber = Math.max(1, Math.floor(crisisNumber));
  const cached = WINDOW_CACHE.get(normalizedNumber);
  if (cached) return cached;

  let cursor = EPOCH_SESSION;
  for (let number = 1; number <= normalizedNumber; number++) {
    cursor += crisisIntervalSessions(number);
    const startSession = cursor;
    const window: MarketCrisisWindow = {
      crisisNumber: number,
      startSession,
      endSession: startSession + MARKET_CRISIS_DURATION_SESSIONS,
      theme: MARKET_CRISIS_THEMES[(number - 1) % MARKET_CRISIS_THEMES.length],
    };
    WINDOW_CACHE.set(number, window);
    cursor = window.endSession;
  }
  return WINDOW_CACHE.get(normalizedNumber)!;
}

function findCurrentOrNextWindow(session: number): MarketCrisisWindow {
  let crisisNumber = 1;
  while (true) {
    const window = getMarketCrisisWindow(crisisNumber);
    if (session < window.endSession) return window;
    crisisNumber += 1;
  }
}

export function getNextMarketCrisis(session: number): MarketCrisisWindow {
  return findCurrentOrNextWindow(session);
}

export function getActiveMarketCrisis(session: number): ActiveMarketCrisis | null {
  const window = findCurrentOrNextWindow(session);
  if (session < window.startSession) return null;

  const crisisSession = session - window.startSession;
  let cursor = 0;
  for (let index = 0; index < MARKET_CRISIS_PHASES.length; index++) {
    const phase = MARKET_CRISIS_PHASES[index];
    if (crisisSession < cursor + phase.duration) {
      const phaseSession = crisisSession - cursor;
      return {
        ...window,
        phase,
        phaseIndex: index,
        phaseSession,
        phaseSessionsLeft: phase.duration - phaseSession,
        sessionsLeft: window.endSession - session,
      };
    }
    cursor += phase.duration;
  }
  return null;
}

function themeExposure(
  active: ActiveMarketCrisis,
  stock: Pick<
    StockDefinition,
    "sector" | "subsector" | "beta" | "marketTags"
  >,
): number {
  const { sector, subsector } = stock;
  const hasMarketTag = (tag: string) =>
    sector === tag || stock.marketTags?.includes(tag);
  const negativePhase = active.phase.marketReturnPerSession < 0;
  let exposure = stock.beta ?? (sector === "채권" ? -0.35 : 0.65);

  if (sector === "지수" || sector === "선물") exposure = stock.beta ?? 1;

  if (active.theme.id === "credit-crunch" || active.theme.id === "bank-run") {
    if (hasMarketTag("금융")) exposure *= 1.55;
  } else if (active.theme.id === "tech-bubble") {
    if (hasMarketTag("기술") || hasMarketTag("게임")) exposure *= 1.5;
  } else if (active.theme.id === "pandemic") {
    if (hasMarketTag("관광") || hasMarketTag("요식업")) exposure *= 1.6;
    if (hasMarketTag("바이오")) exposure *= 0.35;
  } else if (active.theme.id === "energy-shock") {
    if (hasMarketTag("에너지")) exposure *= negativePhase ? -0.45 : 0.65;
    if (hasMarketTag("요식업") || hasMarketTag("관광")) exposure *= 1.25;
  }

  if (subsector?.includes("인버스")) exposure *= -1;
  return exposure;
}

export function crisisReturnForStock(
  active: ActiveMarketCrisis,
  stock: Pick<
    StockDefinition,
    "sector" | "subsector" | "beta" | "marketTags"
  >,
  dtSeconds: number,
): number {
  return (
    active.phase.marketReturnPerSession *
    themeExposure(active, stock) *
    (dtSeconds / (SESSION_DURATION_MS / 1_000))
  );
}

const PHASE_EVENT_COPY: Record<
  MarketCrisisPhaseId,
  { title: string; description: string; impact: number }
> = {
  warning: {
    title: "이상 신호 포착",
    description: "신용·유동성 지표가 빠르게 악화되며 대형 위기의 전조가 감지됩니다.",
    impact: -0.025,
  },
  crash: {
    title: "전 세계 시장 연쇄 폭락",
    description: "강제 청산과 매도 주문이 쏟아지며 거래소가 극심한 변동성에 휩싸였습니다.",
    impact: -0.075,
  },
  panic: {
    title: "공포가 실물 경제로 확산",
    description: "자금 시장이 얼어붙고 기업들이 투자와 고용 계획을 잇달아 축소합니다.",
    impact: -0.05,
  },
  intervention: {
    title: "긴급 시장 안정화 조치",
    description: "중앙은행과 정부가 유동성 공급과 자산 매입을 포함한 비상 대책을 발표했습니다.",
    impact: 0.055,
  },
  recovery: {
    title: "금융 시장 기능 회복 조짐",
    description: "신용 거래가 재개되고 생존 기업으로 자금이 돌아오며 바닥 기대가 형성됩니다.",
    impact: 0.035,
  },
};

/** 각 위기 단계가 시작되는 거래일에 한 번만 뉴스 사건을 만든다. */
export function getCrisisEventsForSession(session: number): MarketEvent[] {
  const active = getActiveMarketCrisis(session);
  if (!active || active.phaseSession !== 0) return [];

  const copy = PHASE_EVENT_COPY[active.phase.id];
  const event: MarketEvent = {
    id: `crisis-${active.crisisNumber}-${active.phase.id}`,
    title: `${active.theme.emoji} ${active.theme.name}: ${copy.title}`,
    description: `${active.theme.summary} ${copy.description}`,
    affectedStockIds: STOCK_DEFINITIONS.map((stock) => stock.id),
    impact: copy.impact,
    timestamp: session * SESSION_DURATION_MS,
    category: "macro",
    tag: "위기",
  };
  return [
    withCharacterQuote(
      event,
      seededRandom(`crisis:${active.crisisNumber}:${active.phase.id}:quote`),
    ),
  ];
}

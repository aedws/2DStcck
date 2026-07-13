import type { CashPayment } from "@/lib/types/market";

export const INVESTMENT_SEASON_SESSIONS = 20;
export const MAX_SEASON_HISTORY = 20;

export type InvestmentSeasonTierId =
  | "bronze"
  | "silver"
  | "gold"
  | "platinum"
  | "diamond"
  | "master";

export interface InvestmentSeasonTier {
  id: InvestmentSeasonTierId;
  name: string;
  emoji: string;
  /** 지수 대비 초과수익률 하한. 0.02는 +2%p를 뜻한다. */
  minimumAlpha: number;
  summary: string;
}

export const INVESTMENT_SEASON_TIERS: InvestmentSeasonTier[] = [
  {
    id: "bronze",
    name: "브론즈",
    emoji: "🥉",
    minimumAlpha: Number.NEGATIVE_INFINITY,
    summary: "지수 대비 -5%p 미만",
  },
  {
    id: "silver",
    name: "실버",
    emoji: "🥈",
    minimumAlpha: -0.05,
    summary: "지수 대비 -5%p 이상 · -2%p 미만",
  },
  {
    id: "gold",
    name: "골드",
    emoji: "🥇",
    minimumAlpha: -0.02,
    summary: "지수 대비 -2%p 이상 · 0%p 미만",
  },
  {
    id: "platinum",
    name: "플래티넘",
    emoji: "💠",
    minimumAlpha: 0,
    summary: "지수 이상 · +2%p 미만",
  },
  {
    id: "diamond",
    name: "다이아몬드",
    emoji: "💎",
    minimumAlpha: 0.02,
    summary: "지수 대비 +2%p 이상 · +5%p 미만",
  },
  {
    id: "master",
    name: "마스터",
    emoji: "👑",
    minimumAlpha: 0.05,
    summary: "지수 대비 +5%p 이상",
  },
];

export interface ActiveInvestmentSeason {
  id: string;
  number: number;
  startSession: number;
  endSession: number;
  startEquity: number;
  startBenchmarkPrice: number;
  minimumEquity: number;
  peakEquity: number;
  maximumDrawdown: number;
  /** 시즌 시작 시점까지의 급여·복권 누계. 투자 외 현금흐름 제거 기준. */
  startExternalCashTotal: number;
}

export interface InvestmentSeasonResult extends ActiveInvestmentSeason {
  completedAt: number;
  playerReturn: number;
  benchmarkReturn: number;
  alpha: number;
  maxDrawdown: number;
  tierId: InvestmentSeasonTierId;
}

export interface InvestmentSeasonState {
  current: ActiveInvestmentSeason | null;
  history: InvestmentSeasonResult[];
}

export interface SeasonPerformance {
  playerReturn: number;
  benchmarkReturn: number;
  alpha: number;
  maxDrawdown: number;
}

export function createInitialInvestmentSeasonState(): InvestmentSeasonState {
  return { current: null, history: [] };
}

export function seasonTierForAlpha(alpha: number): InvestmentSeasonTier {
  let tier = INVESTMENT_SEASON_TIERS[0];
  for (const candidate of INVESTMENT_SEASON_TIERS) {
    // 수익률 나눗셈의 부동소수 오차로 정확한 경계값이 한 단계 낮아지지 않게 한다.
    if (alpha + 1e-9 >= candidate.minimumAlpha) tier = candidate;
  }
  return tier;
}

export function getInvestmentSeasonTier(
  tierId: InvestmentSeasonTierId,
): InvestmentSeasonTier {
  return (
    INVESTMENT_SEASON_TIERS.find((tier) => tier.id === tierId) ??
    INVESTMENT_SEASON_TIERS[0]
  );
}

export function calculateSeasonPerformance(
  season: ActiveInvestmentSeason,
  equity: number,
  benchmarkPrice: number,
  externalCashTotal = season.startExternalCashTotal,
): SeasonPerformance {
  const adjustedEquity =
    equity - (externalCashTotal - season.startExternalCashTotal);
  const playerReturn =
    season.startEquity > 0 ? adjustedEquity / season.startEquity - 1 : -1;
  const benchmarkReturn =
    season.startBenchmarkPrice > 0
      ? benchmarkPrice / season.startBenchmarkPrice - 1
      : 0;
  const livePeak = Math.max(season.peakEquity, adjustedEquity);
  const maxDrawdown = Math.max(
    season.maximumDrawdown,
    livePeak > 0 ? Math.max(0, 1 - adjustedEquity / livePeak) : 1,
  );
  return {
    playerReturn,
    benchmarkReturn,
    alpha: playerReturn - benchmarkReturn,
    maxDrawdown,
  };
}

/** 투자 실력과 무관한 고정급·복권 손익은 시즌 수익률에서 제거한다. */
export function seasonExternalCashTotal(cashPayments: CashPayment[]): number {
  return cashPayments.reduce(
    (sum, payment) =>
      payment.kind === "salary" || payment.kind === "lottery"
        ? sum + payment.amount
        : sum,
    0,
  );
}

function nextSeasonNumber(state: InvestmentSeasonState): number {
  return Math.max(
    state.current?.number ?? 0,
    ...state.history.map((season) => season.number),
    0,
  ) + 1;
}

function createActiveSeason(
  number: number,
  session: number,
  equity: number,
  benchmarkPrice: number,
  externalCashTotal: number,
): ActiveInvestmentSeason {
  return {
    id: `season-${number}-${session}`,
    number,
    startSession: session,
    endSession: session + INVESTMENT_SEASON_SESSIONS,
    startEquity: Math.max(1, Math.round(equity)),
    startBenchmarkPrice: Math.max(1, Math.round(benchmarkPrice)),
    minimumEquity: Math.max(1, Math.round(equity)),
    peakEquity: Math.max(1, Math.round(equity)),
    maximumDrawdown: 0,
    startExternalCashTotal: externalCashTotal,
  };
}

export function normalizeInvestmentSeasonState(
  value: InvestmentSeasonState | null | undefined,
): InvestmentSeasonState {
  if (!value || typeof value !== "object") {
    return createInitialInvestmentSeasonState();
  }
  const history = Array.isArray(value.history)
    ? value.history
        .filter(
          (item) =>
            item &&
            Number.isSafeInteger(item.number) &&
            item.number > 0 &&
            Number.isFinite(item.alpha) &&
            INVESTMENT_SEASON_TIERS.some((tier) => tier.id === item.tierId),
        )
        .slice(0, MAX_SEASON_HISTORY)
    : [];
  const current = value.current;
  const validCurrent =
    current &&
    Number.isSafeInteger(current.number) &&
    current.number > 0 &&
    Number.isSafeInteger(current.startSession) &&
    Number.isSafeInteger(current.endSession) &&
    current.endSession > current.startSession &&
    Number.isFinite(current.startEquity) &&
    current.startEquity > 0 &&
    Number.isFinite(current.startBenchmarkPrice) &&
    current.startBenchmarkPrice > 0;
  return {
    current: validCurrent
      ? {
          ...current,
          minimumEquity: Number.isFinite(current.minimumEquity)
            ? Math.max(1, current.minimumEquity)
            : current.startEquity,
          peakEquity: Number.isFinite(current.peakEquity)
            ? Math.max(current.startEquity, current.peakEquity)
            : current.startEquity,
          maximumDrawdown: Number.isFinite(current.maximumDrawdown)
            ? Math.max(0, Math.min(1, current.maximumDrawdown))
            : 0,
          startExternalCashTotal: Number.isFinite(current.startExternalCashTotal)
            ? current.startExternalCashTotal
            : 0,
        }
      : null,
    history,
  };
}

export function updateInvestmentSeason(
  input: InvestmentSeasonState,
  {
    currentSession,
    equity,
    benchmarkPrice,
    externalCashTotal = 0,
    now = Date.now(),
  }: {
    currentSession: number;
    equity: number;
    benchmarkPrice: number;
    externalCashTotal?: number;
    now?: number;
  },
): {
  state: InvestmentSeasonState;
  completed: InvestmentSeasonResult | null;
} {
  const state = normalizeInvestmentSeasonState(input);
  if (equity <= 0 || benchmarkPrice <= 0) {
    return { state, completed: null };
  }
  if (!state.current) {
    return {
      state: {
        ...state,
        current: createActiveSeason(
          nextSeasonNumber(state),
          currentSession,
          equity,
          benchmarkPrice,
          externalCashTotal,
        ),
      },
      completed: null,
    };
  }

  const trackedEquity =
    equity - (externalCashTotal - state.current.startExternalCashTotal);
  const minimumEquity = Math.min(state.current.minimumEquity, trackedEquity);
  const peakEquity = Math.max(state.current.peakEquity, trackedEquity);
  const maximumDrawdown = Math.max(
    state.current.maximumDrawdown,
    peakEquity > 0 ? Math.max(0, 1 - trackedEquity / peakEquity) : 1,
  );
  const current =
    minimumEquity === state.current.minimumEquity &&
    peakEquity === state.current.peakEquity &&
    maximumDrawdown === state.current.maximumDrawdown
    ? state.current
    : { ...state.current, minimumEquity, peakEquity, maximumDrawdown };
  if (currentSession < current.endSession) {
    return current === state.current
      ? { state: input, completed: null }
      : { state: { ...state, current }, completed: null };
  }

  const performance = calculateSeasonPerformance(
    current,
    equity,
    benchmarkPrice,
    externalCashTotal,
  );
  const tier = seasonTierForAlpha(performance.alpha);
  const completed: InvestmentSeasonResult = {
    ...current,
    ...performance,
    completedAt: now,
    tierId: tier.id,
  };
  const history = [completed, ...state.history].slice(0, MAX_SEASON_HISTORY);
  return {
    state: {
      current: createActiveSeason(
        current.number + 1,
        currentSession,
        equity,
        benchmarkPrice,
        externalCashTotal,
      ),
      history,
    },
    completed,
  };
}

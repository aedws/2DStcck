import type {
  CashPayment,
  Holding,
  StockState,
} from "@/lib/types/market";
import { MARKET_ERA_START_SESSION } from "@/lib/market/marketEras";
import { instrumentTypeOf } from "@/lib/market/taxonomy";
import type { AmcPortfolioLookThroughPosition } from "@/lib/player/amcPortfolio";

export const INVESTMENT_SEASON_SESSIONS = 20;
export const MAX_SEASON_HISTORY = 20;
/**
 * 시즌 1은 전 계정 마스터 지급으로 종료한 운영 시즌이다. v2부터 실제 성과를
 * 새 기준자산으로 측정한다. 구 v1 진행값은 시즌 2에 섞지 않고 한 번 폐기한다.
 */
export const INVESTMENT_SEASON_TRACKING_EPOCH = 2;

/**
 * 시즌 그리드: 국면(에라) 시작 세션에 앵커링된 20거래일 블록.
 * 국면(60) = 3 × 시즌(20)이라 각 시즌이 하나의 국면 안에 들어온다.
 */
function seasonBlockStart(session: number): number {
  const offset =
    (((session - MARKET_ERA_START_SESSION) % INVESTMENT_SEASON_SESSIONS) +
      INVESTMENT_SEASON_SESSIONS) %
    INVESTMENT_SEASON_SESSIONS;
  return session - offset;
}

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
  minimumAlpha: number;
  summary: string;
}

export const INVESTMENT_SEASON_TIERS: InvestmentSeasonTier[] = [
  { id: "bronze", name: "브론즈", emoji: "🥉", minimumAlpha: Number.NEGATIVE_INFINITY, summary: "지수 대비 -5%p 미만" },
  { id: "silver", name: "실버", emoji: "🥈", minimumAlpha: -0.05, summary: "지수 대비 -5%p 이상 · -2%p 미만" },
  { id: "gold", name: "골드", emoji: "🥇", minimumAlpha: -0.02, summary: "지수 대비 -2%p 이상 · 0%p 미만" },
  { id: "platinum", name: "플래티넘", emoji: "💠", minimumAlpha: 0, summary: "지수 이상 · +2%p 미만" },
  { id: "diamond", name: "다이아몬드", emoji: "💎", minimumAlpha: 0.02, summary: "지수 대비 +2%p 이상 · +5%p 미만" },
  { id: "master", name: "마스터", emoji: "👑", minimumAlpha: 0.05, summary: "지수 대비 +5%p 이상" },
];

export type SeasonGoalId =
  | "growth"
  | "income"
  | "defense"
  | "direct"
  | "index"
  | "cyclical";

export interface SeasonGoalDefinition {
  id: SeasonGoalId;
  name: string;
  emoji: string;
  description: string;
  includedAssets: string;
  targetWeights: number[];
}

export const SEASON_GOALS: SeasonGoalDefinition[] = [
  {
    id: "growth",
    name: "성장 집중",
    emoji: "🚀",
    description: "성장 업종과 정방향 레버리지 비중을 유지합니다.",
    includedAssets: "기술·반도체·헬스케어·콘텐츠 기업, 정방향 레버리지",
    targetWeights: [0.2, 0.35, 0.5],
  },
  {
    id: "income",
    name: "인컴 운용",
    emoji: "💵",
    description: "배당과 커버드콜 자산을 일정 비중 이상 보유합니다.",
    includedAssets: "배당주, 지수·단일 종목 커버드콜",
    targetWeights: [0.2, 0.35, 0.5],
  },
  {
    id: "defense",
    name: "방어·헤지",
    emoji: "🛡️",
    description: "채권과 인버스 자산으로 하락 방어 비중을 유지합니다.",
    includedAssets: "채권, 인버스·곱버스",
    targetWeights: [0.1, 0.2, 0.3],
  },
  {
    id: "direct",
    name: "기업 직접 투자",
    emoji: "🏢",
    description: "캐릭터가 있는 일반 기업 주식의 비중을 유지합니다.",
    includedAssets: "파생상품이 아닌 캐릭터 기업 주식",
    targetWeights: [0.3, 0.5, 0.7],
  },
  {
    id: "index",
    name: "지수 코어",
    emoji: "🌐",
    description: "레버리지 없이 시장 전체를 담는 지수 ETF를 중심에 둡니다.",
    includedAssets: "일반 지수 추종 ETF",
    targetWeights: [0.2, 0.35, 0.5],
  },
  {
    id: "cyclical",
    name: "경기 순환 대응",
    emoji: "⚙️",
    description: "경기 변화에 민감한 전통 산업의 비중을 유지합니다.",
    includedAssets: "방산·PMC·보안·금융·에너지·관광·요식업",
    targetWeights: [0.2, 0.35, 0.5],
  },
];

export type SeasonTraitId =
  | "alpha_hunter"
  | "drawdown_guard"
  | "discipline"
  | "balanced"
  | "turnaround"
  | "mandate";

export interface SeasonTraitDefinition {
  id: SeasonTraitId;
  name: string;
  emoji: string;
  description: string;
  success: string;
  failure: string;
}

export const SEASON_TRAITS: SeasonTraitDefinition[] = [
  {
    id: "alpha_hunter",
    name: "초과수익 사냥꾼",
    emoji: "🦅",
    description: "지수보다 강하게 앞서는 공격형 특성입니다.",
    success: "초과수익 +2%p 이상 +8점 · 0%p 이상 +4점",
    failure: "지수 하회 시 -4점",
  },
  {
    id: "drawdown_guard",
    name: "낙폭 관리자",
    emoji: "🛡️",
    description: "큰 손실 없이 시즌을 완주하는 방어형 특성입니다.",
    success: "최대 낙폭 6% 이하 +8점 · 12% 이하 +4점",
    failure: "최대 낙폭 12% 초과 시 -4점",
  },
  {
    id: "discipline",
    name: "운용 규율",
    emoji: "📐",
    description: "선택한 시즌 목표 비중을 꾸준히 지키는 규율형 특성입니다.",
    success: "목표 준수율 80% 이상 +8점 · 50% 이상 +3점",
    failure: "목표 미선택 또는 준수율 50% 미만 -4점",
  },
  {
    id: "balanced",
    name: "균형 운용",
    emoji: "⚖️",
    description: "초과수익과 낙폭 통제를 동시에 노리는 중립형 특성입니다.",
    success: "지수 이상·낙폭 8% 이하 모두 달성 +8점 · 하나 달성 +3점",
    failure: "두 조건 모두 실패 시 -4점",
  },
  {
    id: "turnaround",
    name: "반전 설계자",
    emoji: "🔄",
    description: "중간 낙폭을 견디고 시즌을 플러스 초과수익으로 되돌립니다.",
    success: "낙폭 3% 이상 후 지수 초과 +8점 · 지수 초과만 달성 +3점",
    failure: "지수 대비 -2%p 미만 -4점",
  },
  {
    id: "mandate",
    name: "고집중 운용",
    emoji: "🎖️",
    description: "높은 목표 비중을 실제 시즌 내내 유지하는 집중형 특성입니다.",
    success: "최고 비중 목표·준수율 70% +8점 · 중간 비중 목표·준수율 60% +4점",
    failure: "목표 미선택 또는 준수율 50% 미만 -4점",
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
  startExternalCashTotal: number;
  goalId?: SeasonGoalId;
  goalTargetWeight?: number;
  goalSelectedAtSession?: number;
  goalLastCheckedSession?: number;
  goalChecks?: number;
  goalMetChecks?: number;
  goalMisses?: number;
  lastGoalAllocation?: number;
  traitId?: SeasonTraitId;
  traitSelectedAtSession?: number;
  /** 중도 참가로 국면 경계에 못 맞춘 부분 시즌 — 연습(무순위). 기록·보상 없음. */
  warmup?: boolean;
}

export interface InvestmentSeasonResult extends ActiveInvestmentSeason {
  completedAt: number;
  playerReturn: number;
  benchmarkReturn: number;
  alpha: number;
  maxDrawdown: number;
  tierId: InvestmentSeasonTierId;
  seasonScore: number;
  baseScore: number;
  goalBonus: number;
  goalPenalty: number;
  goalComplianceRate: number;
  traitScore: number;
  /** 운영 종료로 전원 지급된 보존 시즌. 실제 투자 성과·라이벌 승부로 해석하지 않는다. */
  operationalAward?: boolean;
}

export interface InvestmentSeasonState {
  trackingEpoch?: number;
  current: ActiveInvestmentSeason | null;
  history: InvestmentSeasonResult[];
  seenCeremonyIds: string[];
}

export const SEASON_ONE_MASTER_ARCHIVE_ID = "season-1-master-award";

/** 시즌 1은 성과 경쟁이 아니라 전 계정 마스터 지급으로 종료한 운영 기록이다. */
export const SEASON_ONE_MASTER_ARCHIVE: InvestmentSeasonResult = {
  id: SEASON_ONE_MASTER_ARCHIVE_ID,
  number: 1,
  startSession: MARKET_ERA_START_SESSION - INVESTMENT_SEASON_SESSIONS,
  endSession: MARKET_ERA_START_SESSION,
  startEquity: 1,
  startBenchmarkPrice: 1,
  minimumEquity: 1,
  peakEquity: 1,
  maximumDrawdown: 0,
  startExternalCashTotal: 0,
  completedAt: MARKET_ERA_START_SESSION * 3_600_000,
  playerReturn: 0,
  benchmarkReturn: 0,
  alpha: 0,
  maxDrawdown: 0,
  tierId: "master",
  seasonScore: 100,
  baseScore: 100,
  goalBonus: 0,
  goalPenalty: 0,
  goalComplianceRate: 1,
  traitScore: 0,
  operationalAward: true,
};

function ensureSeasonOneArchive(
  history: InvestmentSeasonResult[],
): InvestmentSeasonResult[] {
  const competitiveHistory = history
    .filter((season) => season.number !== 1)
    .sort((a, b) => b.number - a.number)
    .slice(0, MAX_SEASON_HISTORY - 1);
  return [...competitiveHistory, { ...SEASON_ONE_MASTER_ARCHIVE }]
    .sort((a, b) => b.number - a.number)
    .slice(0, MAX_SEASON_HISTORY);
}

export interface SeasonPerformance {
  playerReturn: number;
  benchmarkReturn: number;
  alpha: number;
  maxDrawdown: number;
}

export interface SeasonScoreBreakdown {
  totalScore: number;
  baseScore: number;
  goalBonus: number;
  goalPenalty: number;
  goalComplianceRate: number;
  traitScore: number;
}

export interface SeasonRival {
  id: string;
  name: string;
  emoji: string;
  style: string;
  description: string;
  disciplineBonus: number;
  aheadQuote: string;
  closeQuote: string;
  behindQuote: string;
}

export interface SeasonRivalPerformance {
  rival: SeasonRival;
  alpha: number;
  score: number;
  finalAlpha: number;
  remark: string;
}

const SEASON_RIVALS: SeasonRival[] = [
  {
    id: "rena",
    name: "레나",
    emoji: "🔥",
    style: "모멘텀 추종자",
    description: "강한 종목을 끝까지 따라붙는 공격적인 가상 투자자입니다.",
    disciplineBonus: 3,
    aheadQuote: "추세가 보이는데 망설일 이유가 있을까?",
    closeQuote: "제법이네. 마지막까지 속도를 늦추지 마.",
    behindQuote: "이번 추세는 네가 먼저 잡았네. 아직 끝난 건 아니야.",
  },
  {
    id: "sion",
    name: "시온",
    emoji: "🛡️",
    style: "손실 통제자",
    description: "큰 손실을 피하면서 꾸준히 지수 초과를 노리는 가상 투자자입니다.",
    disciplineBonus: 5,
    aheadQuote: "수익보다 먼저 살아남는 법을 배워야 해.",
    closeQuote: "한 번의 실수로 승부가 갈릴 거리군.",
    behindQuote: "안정적으로 앞서고 있군. 내 방어선도 다시 조정하지.",
  },
  {
    id: "moa",
    name: "모아",
    emoji: "💰",
    style: "현금흐름 수집가",
    description: "배당과 분배금을 쌓아 변동성을 버티는 가상 투자자입니다.",
    disciplineBonus: 4,
    aheadQuote: "조용히 쌓이는 현금흐름을 무시하면 안 돼.",
    closeQuote: "우리 차이는 분배금 한 번이면 뒤집히겠는걸?",
    behindQuote: "이번에는 네 포트폴리오가 더 단단했어.",
  },
  {
    id: "zero",
    name: "제로",
    emoji: "🤖",
    style: "규칙 기반 퀀트",
    description: "감정을 배제하고 정해진 규칙만 집행하는 가상 투자자입니다.",
    disciplineBonus: 6,
    aheadQuote: "현재 확률은 내가 우세하다고 말하고 있다.",
    closeQuote: "오차 범위 안이다. 다음 데이터가 승부를 정한다.",
    behindQuote: "모델 수정 필요. 네 성과를 새로운 변수로 기록한다.",
  },
  {
    id: "yura",
    name: "유라",
    emoji: "🐺",
    style: "역발상 사냥꾼",
    description: "공포가 커질 때 반대로 움직이는 가상 투자자입니다.",
    disciplineBonus: 2,
    aheadQuote: "사람들이 겁낼 때가 내가 가장 좋아하는 순간이지.",
    closeQuote: "서로 다른 길인데 거의 같은 곳에 도착했네.",
    behindQuote: "이번엔 네 판단이 시장의 공포보다 빨랐어.",
  },
  {
    id: "ian",
    name: "이안",
    emoji: "🧭",
    style: "거시 순환 투자자",
    description: "시장 국면과 금리 변화에 맞춰 자산군 비중을 전환합니다.",
    disciplineBonus: 4,
    aheadQuote: "큰 흐름을 읽으면 종목 선택은 그다음 문제야.",
    closeQuote: "같은 국면을 서로 다르게 해석했군.",
    behindQuote: "이번 순환은 네가 한발 먼저 읽었어.",
  },
  {
    id: "nabi",
    name: "나비",
    emoji: "🦋",
    style: "분산 포트폴리오 설계자",
    description: "여러 업종의 상관관계를 이용해 안정적인 점수를 쌓습니다.",
    disciplineBonus: 5,
    aheadQuote: "한 종목의 확신보다 여러 가능성의 균형을 믿어.",
    closeQuote: "포트폴리오 무게 하나로 승부가 갈리겠네.",
    behindQuote: "오늘은 네 분산이 내 설계보다 정교했어.",
  },
  {
    id: "taeho",
    name: "태호",
    emoji: "🦈",
    style: "집중 가치 투자자",
    description: "소수 기업을 깊게 분석해 큰 비중으로 오래 보유합니다.",
    disciplineBonus: 2,
    aheadQuote: "좋은 기업을 찾았다면 비중으로 증명해야지.",
    closeQuote: "확신의 크기까지 비슷한 모양이군.",
    behindQuote: "이번에는 네 기업 분석이 더 깊었어.",
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function deterministicUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

/** 특성 풀은 넓게 유지하되 한 시즌에는 항상 3장만 제시한다. */
export function getSeasonTraitCandidates(
  season: Pick<ActiveInvestmentSeason, "id">,
): SeasonTraitDefinition[] {
  return [...SEASON_TRAITS]
    .map((trait) => ({
      trait,
      order: deterministicUnit(`${season.id}:trait:${trait.id}`),
    }))
    .sort((a, b) => a.order - b.order)
    .slice(0, 3)
    .map((item) => item.trait);
}

export function createInitialInvestmentSeasonState(): InvestmentSeasonState {
  return {
    trackingEpoch: INVESTMENT_SEASON_TRACKING_EPOCH,
    current: null,
    history: [{ ...SEASON_ONE_MASTER_ARCHIVE }],
    seenCeremonyIds: [SEASON_ONE_MASTER_ARCHIVE_ID],
  };
}

export function seasonTierForAlpha(alpha: number): InvestmentSeasonTier {
  let tier = INVESTMENT_SEASON_TIERS[0];
  for (const candidate of INVESTMENT_SEASON_TIERS) {
    if (alpha + 1e-9 >= candidate.minimumAlpha) tier = candidate;
  }
  return tier;
}

export function getInvestmentSeasonTier(tierId: InvestmentSeasonTierId): InvestmentSeasonTier {
  return INVESTMENT_SEASON_TIERS.find((tier) => tier.id === tierId) ?? INVESTMENT_SEASON_TIERS[0];
}

export function getSeasonGoal(goalId: SeasonGoalId | undefined): SeasonGoalDefinition | undefined {
  return SEASON_GOALS.find((goal) => goal.id === goalId);
}

export function getSeasonTrait(
  traitId: SeasonTraitId | undefined,
): SeasonTraitDefinition | undefined {
  return SEASON_TRAITS.find((trait) => trait.id === traitId);
}

export function calculateSeasonTraitScore(
  season: ActiveInvestmentSeason,
  performance: Pick<SeasonPerformance, "alpha" | "maxDrawdown">,
  goalComplianceRate: number,
): number {
  if (season.traitId === "alpha_hunter") {
    return performance.alpha >= 0.02 ? 8 : performance.alpha >= 0 ? 4 : -4;
  }
  if (season.traitId === "drawdown_guard") {
    return performance.maxDrawdown <= 0.06
      ? 8
      : performance.maxDrawdown <= 0.12
        ? 4
        : -4;
  }
  if (season.traitId === "discipline") {
    if (!season.goalId) return -4;
    return goalComplianceRate >= 0.8 ? 8 : goalComplianceRate >= 0.5 ? 3 : -4;
  }
  if (season.traitId === "balanced") {
    const alphaMet = performance.alpha >= 0;
    const drawdownMet = performance.maxDrawdown <= 0.08;
    return alphaMet && drawdownMet ? 8 : alphaMet || drawdownMet ? 3 : -4;
  }
  if (season.traitId === "turnaround") {
    return performance.alpha >= 0 && performance.maxDrawdown >= 0.03
      ? 8
      : performance.alpha >= 0
        ? 3
        : performance.alpha < -0.02
          ? -4
          : 0;
  }
  if (season.traitId === "mandate") {
    if (!season.goalId) return -4;
    const goal = getSeasonGoal(season.goalId);
    if (!goal) return -4;
    const weight = season.goalTargetWeight ?? 0;
    const maximumTarget = Math.max(...goal.targetWeights);
    const middleTarget = goal.targetWeights[Math.floor(goal.targetWeights.length / 2)];
    if (weight >= maximumTarget && goalComplianceRate >= 0.7) return 8;
    if (weight >= middleTarget && goalComplianceRate >= 0.6) return 4;
    return goalComplianceRate < 0.5 ? -4 : 0;
  }
  return 0;
}

function stockMatchesGoal(goalId: SeasonGoalId, stock: StockState): boolean {
  if (goalId === "growth") {
    return (
      ["기술", "반도체", "헬스케어", "미디어·콘텐츠"].includes(
        stock.sector,
      ) ||
      (stock.leverage ?? 0) > 0
    );
  }
  if (goalId === "income") {
    return (
      (stock.coveredCallAnnualYield ?? 0) > 0 ||
      (stock.quarterlyDividend ?? 0) > 0
    );
  }
  if (goalId === "defense") {
    return stock.sector === "채권" || (stock.leverage ?? 0) < 0;
  }
  if (goalId === "direct") {
    return Boolean(stock.ceoId) && instrumentTypeOf(stock) === "company";
  }
  if (goalId === "index") {
    return (
      instrumentTypeOf(stock) === "etf" &&
      Boolean(stock.etfHoldings?.length) &&
      stock.leverage === undefined &&
      stock.coveredCallAnnualYield === undefined
    );
  }
  return [
    "방산·치안",
    "산업재",
    "금융",
    "에너지·인프라",
    "소비재·서비스",
    "식품·외식",
  ].includes(stock.sector);
}

export function calculateSeasonGoalAllocation(
  goalId: SeasonGoalId | undefined,
  holdings: Holding[],
  stocks: StockState[],
  equity: number,
  userEtfPositions: readonly AmcPortfolioLookThroughPosition[] = [],
): number {
  if (!goalId || equity <= 0) return 0;
  const byId = new Map(stocks.map((stock) => [stock.id, stock]));
  let value = holdings.reduce((sum, holding) => {
    const stock = byId.get(holding.stockId);
    if (!stock || !stockMatchesGoal(goalId, stock)) return sum;
    return sum + holding.quantity * stock.currentPrice;
  }, 0);
  for (const position of userEtfPositions) {
    if (goalId === "direct") continue;
    if (
      goalId === "income" &&
      position.exposure.profile === "income"
    ) {
      value += Math.max(0, position.evaluation);
      continue;
    }
    value += position.constituents.reduce((sum, constituent) => {
      const stock = byId.get(constituent.stockId);
      return stock && stockMatchesGoal(goalId, stock)
        ? sum + Math.max(0, constituent.value)
        : sum;
    }, 0);
  }
  return Math.max(0, value / equity);
}

export function calculateSeasonPerformance(
  season: ActiveInvestmentSeason,
  equity: number,
  benchmarkPrice: number,
  externalCashTotal = season.startExternalCashTotal,
): SeasonPerformance {
  const adjustedEquity = equity - (externalCashTotal - season.startExternalCashTotal);
  const playerReturn = season.startEquity > 0 ? adjustedEquity / season.startEquity - 1 : -1;
  const benchmarkReturn = season.startBenchmarkPrice > 0
    ? benchmarkPrice / season.startBenchmarkPrice - 1
    : 0;
  const livePeak = Math.max(season.peakEquity, adjustedEquity);
  const maxDrawdown = Math.max(
    season.maximumDrawdown,
    livePeak > 0 ? Math.max(0, 1 - adjustedEquity / livePeak) : 1,
  );
  return { playerReturn, benchmarkReturn, alpha: playerReturn - benchmarkReturn, maxDrawdown };
}

export function calculateSeasonScore(
  season: ActiveInvestmentSeason,
  performance: Pick<SeasonPerformance, "alpha" | "maxDrawdown">,
): SeasonScoreBreakdown {
  const baseScore = clamp(Math.round(50 + performance.alpha * 500), 0, 100);
  const checks = Math.max(0, season.goalChecks ?? 0);
  const metChecks = Math.max(0, Math.min(checks, season.goalMetChecks ?? 0));
  const misses = Math.max(0, season.goalMisses ?? 0);
  const goalComplianceRate = checks > 0 ? metChecks / checks : 0;
  const goalBonus = season.goalId
    ? Math.round((season.goalTargetWeight ?? 0) * metChecks)
    : 0;
  const goalPenalty = season.goalId ? misses * 2 : 0;
  const traitScore = calculateSeasonTraitScore(
    season,
    performance,
    goalComplianceRate,
  );
  return {
    totalScore: clamp(baseScore + goalBonus - goalPenalty + traitScore, 0, 100),
    baseScore,
    goalBonus,
    goalPenalty,
    goalComplianceRate,
    traitScore,
  };
}

export function seasonExternalCashTotal(cashPayments: CashPayment[]): number {
  return cashPayments.reduce(
    (sum, payment) => {
      if (payment.kind === "compensation") {
        // 양수 운영 보상만 외부 유입으로 제외한다. 오류 수익 회수처럼 음수인
        // 계정 조정까지 제외하면 차감된 금액이 다시 투자 수익으로 잡힌다.
        return sum + Math.max(0, payment.amount);
      }
      return payment.kind === "salary" ||
      payment.kind === "lottery" ||
      payment.kind === "attendance" ||
      payment.kind === "minigame"
        ? sum + payment.amount
        : sum;
    },
    0,
  );
}

/**
 * 총자산에서 고정급·복권·출석·미니게임·운영 보상 같은 외부 유입을 제외한
 * 순수 투자 손익과 수익률. 포트폴리오의 전체 기간 성과 표시에 사용한다.
 */
export function calculateAccountInvestmentPerformance(
  equity: number,
  initialCash: number,
  cashPayments: CashPayment[],
): { profit: number; returnRate: number; externalCashTotal: number } {
  const externalCashTotal = seasonExternalCashTotal(cashPayments);
  const profit = equity - initialCash - externalCashTotal;
  return {
    profit,
    returnRate: initialCash > 0 ? (profit / initialCash) * 100 : 0,
    externalCashTotal,
  };
}

export function getSeasonRival(season: Pick<ActiveInvestmentSeason, "id" | "number">): SeasonRival {
  const index = Math.floor(deterministicUnit(`${season.id}:rival`) * SEASON_RIVALS.length);
  return SEASON_RIVALS[Math.min(index, SEASON_RIVALS.length - 1)];
}

export function getSeasonRivalPerformance(
  season: Pick<ActiveInvestmentSeason, "id" | "number" | "startSession" | "endSession">,
  currentSession: number,
  playerScore?: number,
): SeasonRivalPerformance {
  const rival = getSeasonRival(season);
  const totalSessions = Math.max(1, season.endSession - season.startSession);
  const elapsed = clamp(currentSession - season.startSession, 0, totalSessions);
  const progress = elapsed / totalSessions;
  const finalAlpha = -0.015 + deterministicUnit(`${season.id}:rival-final`) * 0.075;
  const dailyPulse =
    (deterministicUnit(`${season.id}:rival:${elapsed}`) - 0.5) *
    0.018 *
    Math.sin(Math.PI * progress);
  const alpha = finalAlpha * progress + dailyPulse;
  const score = clamp(
    Math.round(50 + alpha * 500 + rival.disciplineBonus * progress),
    0,
    100,
  );
  const difference = playerScore === undefined ? 0 : playerScore - score;
  const remark = difference >= 7
    ? rival.behindQuote
    : difference <= -7
      ? rival.aheadQuote
      : rival.closeQuote;
  return { rival, alpha, score, finalAlpha, remark };
}

function nextSeasonNumber(state: InvestmentSeasonState): number {
  return Math.max(
    state.current?.number ?? 0,
    ...state.history.map((season) => season.number),
    // 시즌 1은 전 계정 마스터 지급으로 이미 종료했다.
    1,
  ) + 1;
}

function createActiveSeason(
  number: number,
  session: number,
  equity: number,
  benchmarkPrice: number,
  externalCashTotal: number,
): ActiveInvestmentSeason {
  // 시즌은 국면 그리드에 정렬한다. 블록 경계에서 시작하면 정식 시즌(20거래일 전체),
  // 중도 참가(블록 중간)면 다음 경계까지의 연습(무순위) 시즌으로 만든다.
  const blockStart = seasonBlockStart(session);
  const onBoundary = blockStart === session;
  const endSession = blockStart + INVESTMENT_SEASON_SESSIONS;
  return {
    id: `season-${number}-${session}`,
    number,
    startSession: session,
    endSession,
    ...(onBoundary ? {} : { warmup: true }),
    startEquity: Math.max(1, Math.round(equity)),
    startBenchmarkPrice: Math.max(1, Math.round(benchmarkPrice)),
    minimumEquity: Math.max(1, Math.round(equity)),
    peakEquity: Math.max(1, Math.round(equity)),
    maximumDrawdown: 0,
    startExternalCashTotal: externalCashTotal,
  };
}

function normalizeActiveSeason(current: ActiveInvestmentSeason): ActiveInvestmentSeason {
  const goal = getSeasonGoal(current.goalId);
  const targetValid = goal?.targetWeights.some(
    (target) => Math.abs(target - (current.goalTargetWeight ?? -1)) < 1e-9,
  );
  const traitValid = Boolean(getSeasonTrait(current.traitId));
  return {
    ...current,
    minimumEquity: Number.isFinite(current.minimumEquity) ? Math.max(1, current.minimumEquity) : current.startEquity,
    peakEquity: Number.isFinite(current.peakEquity) ? Math.max(current.startEquity, current.peakEquity) : current.startEquity,
    maximumDrawdown: Number.isFinite(current.maximumDrawdown) ? clamp(current.maximumDrawdown, 0, 1) : 0,
    startExternalCashTotal: Number.isFinite(current.startExternalCashTotal) ? current.startExternalCashTotal : 0,
    goalId: targetValid ? current.goalId : undefined,
    goalTargetWeight: targetValid ? current.goalTargetWeight : undefined,
    goalSelectedAtSession: targetValid ? current.goalSelectedAtSession : undefined,
    goalLastCheckedSession: targetValid ? current.goalLastCheckedSession : undefined,
    goalChecks: targetValid ? Math.max(0, current.goalChecks ?? 0) : 0,
    goalMetChecks: targetValid ? Math.max(0, current.goalMetChecks ?? 0) : 0,
    goalMisses: targetValid ? Math.max(0, current.goalMisses ?? 0) : 0,
    lastGoalAllocation: targetValid ? Math.max(0, current.lastGoalAllocation ?? 0) : 0,
    traitId: traitValid ? current.traitId : undefined,
    traitSelectedAtSession: traitValid ? current.traitSelectedAtSession : undefined,
  };
}

export function normalizeInvestmentSeasonState(
  value: InvestmentSeasonState | null | undefined,
): InvestmentSeasonState {
  if (!value || typeof value !== "object") return createInitialInvestmentSeasonState();
  const history = ensureSeasonOneArchive(Array.isArray(value.history)
    ? value.history
        .filter(
          (item) =>
            item &&
            Number.isSafeInteger(item.number) &&
            item.number > 0 &&
            Number.isFinite(item.alpha) &&
            INVESTMENT_SEASON_TIERS.some((tier) => tier.id === item.tierId),
        )
        .map((item) => {
          const normalized = normalizeActiveSeason(item);
          const score = calculateSeasonScore(normalized, item);
          return {
            ...item,
            ...normalized,
            seasonScore: Number.isFinite(item.seasonScore) ? clamp(Math.round(item.seasonScore), 0, 100) : score.totalScore,
            baseScore: Number.isFinite(item.baseScore) ? item.baseScore : score.baseScore,
            goalBonus: Number.isFinite(item.goalBonus) ? item.goalBonus : score.goalBonus,
            goalPenalty: Number.isFinite(item.goalPenalty) ? item.goalPenalty : score.goalPenalty,
            goalComplianceRate: Number.isFinite(item.goalComplianceRate) ? clamp(item.goalComplianceRate, 0, 1) : score.goalComplianceRate,
            traitScore: Number.isFinite(item.traitScore) ? item.traitScore : score.traitScore,
          };
        })
        .slice(0, MAX_SEASON_HISTORY)
    : []);
  const current = value.current;
  const currentEpoch =
    value.trackingEpoch === INVESTMENT_SEASON_TRACKING_EPOCH;
  const validCurrent =
    currentEpoch &&
    current &&
    Number.isSafeInteger(current.number) && current.number > 0 &&
    Number.isSafeInteger(current.startSession) &&
    Number.isSafeInteger(current.endSession) && current.endSession > current.startSession &&
    Number.isFinite(current.startEquity) && current.startEquity > 0 &&
    Number.isFinite(current.startBenchmarkPrice) && current.startBenchmarkPrice > 0;
  const seenCeremonyIds = Array.isArray(value.seenCeremonyIds)
    ? value.seenCeremonyIds
        .filter(
          (id): id is string =>
            typeof id === "string" && id !== SEASON_ONE_MASTER_ARCHIVE_ID,
        )
        .slice(0, 49)
    : history
        .map((result) => result.id)
        .filter((id) => id !== SEASON_ONE_MASTER_ARCHIVE_ID)
        .slice(0, 49);
  seenCeremonyIds.push(SEASON_ONE_MASTER_ARCHIVE_ID);
  return {
    trackingEpoch: INVESTMENT_SEASON_TRACKING_EPOCH,
    current: validCurrent ? normalizeActiveSeason(current) : null,
    history,
    seenCeremonyIds,
  };
}

export function selectSeasonGoal(
  input: InvestmentSeasonState,
  goalId: SeasonGoalId,
  targetWeight: number,
  currentSession: number,
): InvestmentSeasonState | null {
  const state = normalizeInvestmentSeasonState(input);
  const current = state.current;
  const goal = getSeasonGoal(goalId);
  if (
    !current ||
    current.goalId ||
    currentSession >= current.endSession ||
    !goal?.targetWeights.some((target) => Math.abs(target - targetWeight) < 1e-9)
  ) {
    return null;
  }
  return {
    ...state,
    current: {
      ...current,
      goalId,
      goalTargetWeight: targetWeight,
      goalSelectedAtSession: currentSession,
      goalLastCheckedSession: currentSession,
      goalChecks: 0,
      goalMetChecks: 0,
      goalMisses: 0,
      lastGoalAllocation: 0,
    },
  };
}

export function selectSeasonTrait(
  input: InvestmentSeasonState,
  traitId: SeasonTraitId,
  currentSession: number,
): InvestmentSeasonState | null {
  const state = normalizeInvestmentSeasonState(input);
  const current = state.current;
  if (
    !current ||
    current.traitId ||
    currentSession >= current.endSession ||
    !getSeasonTraitCandidates(current).some((trait) => trait.id === traitId)
  ) {
    return null;
  }
  return {
    ...state,
    current: {
      ...current,
      traitId,
      traitSelectedAtSession: currentSession,
    },
  };
}

export function markSeasonCeremonySeen(
  input: InvestmentSeasonState,
  seasonId: string,
): InvestmentSeasonState {
  const state = normalizeInvestmentSeasonState(input);
  if (state.seenCeremonyIds.includes(seasonId)) return input;
  return {
    ...state,
    seenCeremonyIds: [seasonId, ...state.seenCeremonyIds].slice(0, 50),
  };
}

export function updateInvestmentSeason(
  input: InvestmentSeasonState,
  {
    currentSession,
    equity,
    benchmarkPrice,
    externalCashTotal = 0,
    goalAllocation = 0,
    now = Date.now(),
  }: {
    currentSession: number;
    equity: number;
    benchmarkPrice: number;
    externalCashTotal?: number;
    goalAllocation?: number;
    now?: number;
  },
): { state: InvestmentSeasonState; completed: InvestmentSeasonResult | null } {
  const state = normalizeInvestmentSeasonState(input);
  if (equity <= 0 || benchmarkPrice <= 0) return { state, completed: null };
  if (!state.current) {
    return {
      state: {
        ...state,
        current: createActiveSeason(nextSeasonNumber(state), currentSession, equity, benchmarkPrice, externalCashTotal),
      },
      completed: null,
    };
  }

  let current = state.current;
  if (current.goalId && current.goalTargetWeight !== undefined) {
    const lastChecked = current.goalLastCheckedSession ?? current.goalSelectedAtSession ?? current.startSession;
    const checkUntil = Math.min(currentSession, current.endSession);
    const addedChecks = Math.max(0, checkUntil - lastChecked);
    if (addedChecks > 0) {
      const met = goalAllocation + 1e-9 >= current.goalTargetWeight;
      current = {
        ...current,
        goalLastCheckedSession: checkUntil,
        goalChecks: (current.goalChecks ?? 0) + addedChecks,
        goalMetChecks: (current.goalMetChecks ?? 0) + (met ? addedChecks : 0),
        goalMisses: (current.goalMisses ?? 0) + (met ? 0 : addedChecks),
        lastGoalAllocation: goalAllocation,
      };
    } else if (current.lastGoalAllocation !== goalAllocation) {
      current = { ...current, lastGoalAllocation: goalAllocation };
    }
  }

  const trackedEquity = equity - (externalCashTotal - current.startExternalCashTotal);
  const minimumEquity = Math.min(current.minimumEquity, trackedEquity);
  const peakEquity = Math.max(current.peakEquity, trackedEquity);
  const maximumDrawdown = Math.max(
    current.maximumDrawdown,
    peakEquity > 0 ? Math.max(0, 1 - trackedEquity / peakEquity) : 1,
  );
  if (
    minimumEquity !== current.minimumEquity ||
    peakEquity !== current.peakEquity ||
    maximumDrawdown !== current.maximumDrawdown
  ) {
    current = { ...current, minimumEquity, peakEquity, maximumDrawdown };
  }
  if (currentSession < current.endSession) {
    return current === state.current
      ? { state: input, completed: null }
      : { state: { ...state, current }, completed: null };
  }

  // 연습(무순위) 시즌은 기록·보상·의식 없이 다음 정식 시즌으로 롤오버한다.
  if (current.warmup) {
    return {
      state: {
        ...state,
        current: createActiveSeason(
          current.number,
          currentSession,
          equity,
          benchmarkPrice,
          externalCashTotal,
        ),
      },
      completed: null,
    };
  }

  const performance = calculateSeasonPerformance(current, equity, benchmarkPrice, externalCashTotal);
  const tier = seasonTierForAlpha(performance.alpha);
  const score = calculateSeasonScore(current, performance);
  const completed: InvestmentSeasonResult = {
    ...current,
    ...performance,
    completedAt: now,
    tierId: tier.id,
    seasonScore: score.totalScore,
    baseScore: score.baseScore,
    goalBonus: score.goalBonus,
    goalPenalty: score.goalPenalty,
    goalComplianceRate: score.goalComplianceRate,
    traitScore: score.traitScore,
  };
  const history = ensureSeasonOneArchive([completed, ...state.history]);
  return {
    state: {
      ...state,
      current: createActiveSeason(current.number + 1, currentSession, equity, benchmarkPrice, externalCashTotal),
      history,
    },
    completed,
  };
}

import { STOCK_DEFINITIONS } from "@/data/stocks";
import {
  MARKET_CRISIS_DURATION_SESSIONS,
  MARKET_CRISIS_PHASES,
  MARKET_CRISIS_THEMES,
  crisisReturnForStock,
  type ActiveMarketCrisis,
  type MarketCrisisThemeId,
} from "@/lib/market/marketCrises";
import {
  getPortfolioStrategy,
  type PortfolioStrategyId,
} from "@/lib/market/portfolioStrategies";

export interface StressTestPoint {
  session: number;
  equity: number;
  phaseId: string;
  phaseName: string;
  phaseEmoji: string;
}

export interface StressTestPhaseResult {
  phaseId: string;
  phaseName: string;
  phaseEmoji: string;
  startEquity: number;
  endEquity: number;
  returnRate: number;
}

export interface StressTestResult {
  strategyId: PortfolioStrategyId;
  themeId: MarketCrisisThemeId;
  startingEquity: number;
  endingEquity: number;
  totalReturn: number;
  maximumDrawdown: number;
  bankrupt: boolean;
  bankruptAtSession?: number;
  points: StressTestPoint[];
  phases: StressTestPhaseResult[];
  grade: "S" | "A" | "B" | "C" | "F";
  verdict: string;
}

function deterministicUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

function gradeFor(bankrupt: boolean, totalReturn: number, drawdown: number) {
  if (bankrupt) return "F" as const;
  if (totalReturn >= 0 && drawdown <= 0.15) return "S" as const;
  if (totalReturn >= -0.1 && drawdown <= 0.25) return "A" as const;
  if (totalReturn >= -0.25 && drawdown <= 0.4) return "B" as const;
  return "C" as const;
}

export function runCrisisStressTest(
  strategyId: PortfolioStrategyId,
  themeId: MarketCrisisThemeId,
  startingEquity = 10_000_000,
): StressTestResult {
  const strategy = getPortfolioStrategy(strategyId);
  const theme = MARKET_CRISIS_THEMES.find((candidate) => candidate.id === themeId) ?? MARKET_CRISIS_THEMES[0];
  let assetValue = startingEquity * strategy.grossExposure;
  const debt = startingEquity * Math.max(0, strategy.grossExposure - 1);
  let equity = startingEquity;
  let peak = startingEquity;
  let maximumDrawdown = 0;
  let bankrupt = false;
  let bankruptAtSession: number | undefined;
  let cursor = 0;
  const points: StressTestPoint[] = [{
    session: 0,
    equity,
    phaseId: "start",
    phaseName: "위기 직전",
    phaseEmoji: "🏁",
  }];
  const phases: StressTestPhaseResult[] = [];

  for (let phaseIndex = 0; phaseIndex < MARKET_CRISIS_PHASES.length; phaseIndex += 1) {
    const phase = MARKET_CRISIS_PHASES[phaseIndex];
    const phaseStartEquity = equity;
    for (let phaseSession = 0; phaseSession < phase.duration; phaseSession += 1) {
      const active: ActiveMarketCrisis = {
        crisisNumber: 0,
        startSession: 0,
        endSession: MARKET_CRISIS_DURATION_SESSIONS,
        theme,
        phase,
        phaseIndex,
        phaseSession,
        phaseSessionsLeft: phase.duration - phaseSession,
        sessionsLeft: MARKET_CRISIS_DURATION_SESSIONS - cursor,
      };
      const portfolioReturn = strategy.buckets.reduce((sum, bucket) => {
        if (!bucket.matches) return sum;
        const matched = STOCK_DEFINITIONS.filter((stock) => bucket.matches?.(stock));
        if (matched.length === 0) return sum;
        const bucketReturn = matched.reduce(
          (bucketSum, stock) =>
            bucketSum + crisisReturnForStock(active, stock, 60 * 60),
          0,
        ) / matched.length;
        return sum + bucket.targetWeight * bucketReturn;
      }, 0);
      const noise =
        (deterministicUnit(`${strategy.id}:${theme.id}:${cursor}`) - 0.5) *
        0.006 *
        phase.volatilityMultiplier;
      assetValue *= 1 + Math.max(-0.95, portfolioReturn + noise);
      equity = assetValue - debt;
      cursor += 1;
      if (equity <= 0) {
        equity = 0;
        bankrupt = true;
        bankruptAtSession = cursor;
        maximumDrawdown = 1;
      } else {
        peak = Math.max(peak, equity);
        maximumDrawdown = Math.max(maximumDrawdown, 1 - equity / peak);
      }
      points.push({
        session: cursor,
        equity,
        phaseId: phase.id,
        phaseName: phase.name,
        phaseEmoji: phase.emoji,
      });
      if (bankrupt) break;
    }
    phases.push({
      phaseId: phase.id,
      phaseName: phase.name,
      phaseEmoji: phase.emoji,
      startEquity: phaseStartEquity,
      endEquity: equity,
      returnRate: phaseStartEquity > 0 ? equity / phaseStartEquity - 1 : -1,
    });
    if (bankrupt) break;
  }

  const totalReturn = equity / startingEquity - 1;
  const grade = gradeFor(bankrupt, totalReturn, maximumDrawdown);
  const verdict = bankrupt
    ? `${bankruptAtSession}거래일차에 모형 자기자본이 소진됐습니다. 총노출을 줄이거나 현금·채권 비중을 높여야 합니다.`
    : grade === "S"
      ? "위기 전 구간에서 자본을 지키고 회복까지 연결한 강한 생존 구조입니다."
      : grade === "A"
        ? "큰 충격을 감당하면서도 회생 가능한 손실 범위로 위기를 통과했습니다."
        : grade === "B"
          ? "생존에는 성공했지만 다음 충격 전에 비중 조정과 현금 보강이 필요합니다."
          : "파산은 피했지만 회복 부담이 큽니다. 전략의 총노출과 집중도를 낮춰야 합니다.";

  return {
    strategyId: strategy.id,
    themeId: theme.id,
    startingEquity,
    endingEquity: equity,
    totalReturn,
    maximumDrawdown,
    bankrupt,
    bankruptAtSession,
    points,
    phases,
    grade,
    verdict,
  };
}

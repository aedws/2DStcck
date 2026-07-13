import type { Holding, StockDefinition, StockState } from "@/lib/types/market";

export type PortfolioStrategyId =
  | "index_core"
  | "growth_focus"
  | "income_builder"
  | "defensive_hedge"
  | "all_weather"
  | "leveraged_attack";

export interface PortfolioStrategyBucket {
  id: string;
  label: string;
  emoji: string;
  targetWeight: number;
  description: string;
  matches?: (stock: StockDefinition) => boolean;
}

export interface PortfolioStrategyDefinition {
  id: PortfolioStrategyId;
  name: string;
  emoji: string;
  risk: "낮음" | "중간" | "높음" | "매우 높음";
  description: string;
  /** 백테스트에서 목표 자산 수익률에 곱하는 총노출 배수. */
  grossExposure: number;
  buckets: PortfolioStrategyBucket[];
}

const GROWTH_SECTORS = new Set(["기술", "게임", "바이오", "엔터"]);
const CYCLICAL_SECTORS = new Set([
  "방산",
  "PMC",
  "보안",
  "금융",
  "에너지",
  "관광",
  "요식업",
]);

const cashBucket = (targetWeight: number): PortfolioStrategyBucket => ({
  id: "cash",
  label: "현금",
  emoji: "💵",
  targetWeight,
  description: "급락 대응과 신규 매수 여력",
});

const indexBucket = (targetWeight: number): PortfolioStrategyBucket => ({
  id: "index",
  label: "시장 지수",
  emoji: "🌐",
  targetWeight,
  description: "V-NASDAQ 중심 시장 노출",
  matches: (stock) => stock.id === "vnasdaq",
});

const bondBucket = (targetWeight: number): PortfolioStrategyBucket => ({
  id: "bond",
  label: "채권",
  emoji: "📜",
  targetWeight,
  description: "위험자산 충격 완화",
  matches: (stock) => stock.sector === "채권",
});

const coveredCallBucket = (targetWeight: number): PortfolioStrategyBucket => ({
  id: "covered-call",
  label: "커버드콜",
  emoji: "🟨",
  targetWeight,
  description: "분배금과 완만한 가격 추종",
  matches: (stock) => (stock.coveredCallAnnualYield ?? 0) > 0,
});

const growthBucket = (targetWeight: number): PortfolioStrategyBucket => ({
  id: "growth",
  label: "성장 기업",
  emoji: "🚀",
  targetWeight,
  description: "기술·게임·바이오·엔터 직접 투자",
  matches: (stock) => Boolean(stock.ceoId) && GROWTH_SECTORS.has(stock.sector),
});

const leverageBucket = (targetWeight: number): PortfolioStrategyBucket => ({
  id: "leverage",
  label: "정방향 레버리지",
  emoji: "🩷",
  targetWeight,
  description: "상승 방향 레버리지 상품",
  matches: (stock) => (stock.leverage ?? 0) > 1,
});

export const PORTFOLIO_STRATEGIES: PortfolioStrategyDefinition[] = [
  {
    id: "index_core",
    name: "지수 코어",
    emoji: "🌐",
    risk: "낮음",
    description: "시장 지수를 중심으로 채권과 현금을 남기는 기본형 전략입니다.",
    grossExposure: 1,
    buckets: [indexBucket(0.7), bondBucket(0.15), cashBucket(0.15)],
  },
  {
    id: "growth_focus",
    name: "성장 집중",
    emoji: "🚀",
    risk: "높음",
    description: "캐릭터 성장 기업과 정방향 레버리지로 초과수익을 노립니다.",
    grossExposure: 1.15,
    buckets: [growthBucket(0.55), leverageBucket(0.25), cashBucket(0.2)],
  },
  {
    id: "income_builder",
    name: "인컴 빌더",
    emoji: "🪙",
    risk: "중간",
    description: "커버드콜과 배당 기업을 조합해 현금흐름을 쌓습니다.",
    grossExposure: 1,
    buckets: [
      coveredCallBucket(0.5),
      {
        id: "dividend",
        label: "배당 기업",
        emoji: "💰",
        targetWeight: 0.3,
        description: "커버드콜이 아닌 직접 배당주",
        matches: (stock) =>
          Boolean(stock.ceoId) &&
          (stock.quarterlyDividend ?? 0) > 0 &&
          (stock.coveredCallAnnualYield ?? 0) <= 0,
      },
      cashBucket(0.2),
    ],
  },
  {
    id: "defensive_hedge",
    name: "방어 헤지",
    emoji: "🛡️",
    risk: "낮음",
    description: "채권·인버스·커버드콜로 하락장에서 계좌 생존을 우선합니다.",
    grossExposure: 1,
    buckets: [
      bondBucket(0.35),
      {
        id: "inverse",
        label: "인버스",
        emoji: "🟥",
        targetWeight: 0.2,
        description: "시장 하락 방향 상품",
        matches: (stock) => (stock.leverage ?? 0) < 0,
      },
      coveredCallBucket(0.2),
      cashBucket(0.25),
    ],
  },
  {
    id: "all_weather",
    name: "올웨더 분산",
    emoji: "🌦️",
    risk: "중간",
    description: "지수·채권·인컴·경기민감 업종을 함께 담아 국면 전환에 대비합니다.",
    grossExposure: 1.05,
    buckets: [
      indexBucket(0.3),
      bondBucket(0.25),
      coveredCallBucket(0.2),
      {
        id: "cyclical",
        label: "경기민감 기업",
        emoji: "⚙️",
        targetWeight: 0.15,
        description: "전통 산업의 경기 순환 노출",
        matches: (stock) => Boolean(stock.ceoId) && CYCLICAL_SECTORS.has(stock.sector),
      },
      cashBucket(0.1),
    ],
  },
  {
    id: "leveraged_attack",
    name: "레버리지 공세",
    emoji: "⚡",
    risk: "매우 높음",
    description: "미수와 레버리지 상품을 전제로 큰 초과수익과 파산 위험을 함께 감수합니다.",
    grossExposure: 5,
    buckets: [leverageBucket(0.5), growthBucket(0.3), cashBucket(0.2)],
  },
];

export interface StrategyAllocationRow {
  id: string;
  label: string;
  emoji: string;
  targetWeight: number;
  actualWeight: number;
  description: string;
}

export interface StrategyAllocationResult {
  rows: StrategyAllocationRow[];
  compliance: number;
}

export interface StrategyBacktestStats {
  strategyId: PortfolioStrategyId;
  samples: number;
  successRate: number;
  bankruptcyRate: number;
  averageReturn: number;
  averageMaxDrawdown: number;
  bestReturn: number;
  worstReturn: number;
}

export function getPortfolioStrategy(
  id: string | null | undefined,
): PortfolioStrategyDefinition {
  return PORTFOLIO_STRATEGIES.find((strategy) => strategy.id === id) ?? PORTFOLIO_STRATEGIES[0];
}

export function normalizePortfolioStrategyId(value: unknown): PortfolioStrategyId {
  return getPortfolioStrategy(typeof value === "string" ? value : undefined).id;
}

export function calculateStrategyAllocation(
  strategy: PortfolioStrategyDefinition,
  holdings: Holding[],
  stocks: StockState[],
  cash: number,
  equity: number,
): StrategyAllocationResult {
  const values = new Map(strategy.buckets.map((bucket) => [bucket.id, 0]));
  const byId = new Map(stocks.map((stock) => [stock.id, stock]));
  for (const holding of holdings) {
    const stock = byId.get(holding.stockId);
    if (!stock) continue;
    const bucket = strategy.buckets.find(
      (candidate) => candidate.id !== "cash" && candidate.matches?.(stock),
    );
    if (!bucket) continue;
    values.set(
      bucket.id,
      (values.get(bucket.id) ?? 0) + holding.quantity * stock.currentPrice,
    );
  }
  values.set("cash", Math.max(0, cash));
  const denominator = Math.max(1, equity);
  const rows = strategy.buckets.map((bucket) => ({
    id: bucket.id,
    label: bucket.label,
    emoji: bucket.emoji,
    targetWeight: bucket.targetWeight,
    actualWeight: Math.max(0, values.get(bucket.id) ?? 0) / denominator,
    description: bucket.description,
  }));
  const compliance = rows.reduce(
    (sum, row) =>
      sum + Math.min(row.actualWeight, row.targetWeight) / Math.max(0.0001, row.targetWeight) * row.targetWeight,
    0,
  );
  return { rows, compliance: Math.max(0, Math.min(1, compliance)) };
}

function returnForBucket(
  bucket: PortfolioStrategyBucket,
  stocks: StockState[],
  closeByStock: Map<string, Map<number, number>>,
  previousTimestamp: number,
  timestamp: number,
): number {
  if (!bucket.matches) return 0;
  const returns: number[] = [];
  for (const stock of stocks) {
    if (!bucket.matches(stock)) continue;
    const closes = closeByStock.get(stock.id);
    const previous = closes?.get(previousTimestamp);
    const current = closes?.get(timestamp);
    if (previous && current && previous > 0) returns.push(current / previous - 1);
  }
  return returns.length > 0
    ? returns.reduce((sum, value) => sum + value, 0) / returns.length
    : 0;
}

export function backtestPortfolioStrategy(
  strategy: PortfolioStrategyDefinition,
  stocks: StockState[],
  windowSessions = 20,
  maxSamples = 240,
): StrategyBacktestStats {
  const benchmark = stocks.find((stock) => stock.id === "vnasdaq");
  const candles = benchmark?.dailyCandles ?? [];
  const closeByStock = new Map(
    stocks.map((stock) => [
      stock.id,
      new Map(stock.dailyCandles.map((candle) => [candle.timestamp, candle.close])),
    ]),
  );
  const results: Array<{ value: number; drawdown: number; bankrupt: boolean; benchmark: number }> = [];
  const firstStart = Math.max(0, candles.length - maxSamples - windowSessions);

  for (let start = firstStart; start + windowSessions < candles.length; start += 1) {
    let value = 1;
    let assetValue = strategy.grossExposure;
    const debt = Math.max(0, strategy.grossExposure - 1);
    let peak = 1;
    let maxDrawdown = 0;
    let bankrupt = false;
    for (let offset = 1; offset <= windowSessions; offset += 1) {
      const previousTimestamp = candles[start + offset - 1].timestamp;
      const timestamp = candles[start + offset].timestamp;
      const weightedReturn = strategy.buckets.reduce(
        (sum, bucket) =>
          sum + bucket.targetWeight * returnForBucket(
            bucket,
            stocks,
            closeByStock,
            previousTimestamp,
            timestamp,
          ),
        0,
      );
      assetValue *= 1 + weightedReturn;
      value = assetValue - debt;
      if (value <= 0) {
        value = 0;
        bankrupt = true;
        maxDrawdown = 1;
        break;
      }
      peak = Math.max(peak, value);
      maxDrawdown = Math.max(maxDrawdown, 1 - value / peak);
    }
    const benchmarkStart = candles[start].close;
    const benchmarkEnd = candles[start + windowSessions].close;
    const benchmarkReturn = benchmarkStart > 0 ? benchmarkEnd / benchmarkStart - 1 : 0;
    results.push({ value, drawdown: maxDrawdown, bankrupt, benchmark: benchmarkReturn });
  }

  if (results.length === 0) {
    return {
      strategyId: strategy.id,
      samples: 0,
      successRate: 0,
      bankruptcyRate: 0,
      averageReturn: 0,
      averageMaxDrawdown: 0,
      bestReturn: 0,
      worstReturn: 0,
    };
  }
  const returns = results.map((result) => result.value - 1);
  const successes = results.filter(
    (result) => !result.bankrupt && result.value - 1 >= result.benchmark,
  ).length;
  const bankruptcies = results.filter((result) => result.bankrupt).length;
  return {
    strategyId: strategy.id,
    samples: results.length,
    successRate: successes / results.length,
    bankruptcyRate: bankruptcies / results.length,
    averageReturn: returns.reduce((sum, value) => sum + value, 0) / results.length,
    averageMaxDrawdown:
      results.reduce((sum, result) => sum + result.drawdown, 0) / results.length,
    bestReturn: Math.max(...returns),
    worstReturn: Math.min(...returns),
  };
}

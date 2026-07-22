import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  economicSectorsForStock,
  instrumentTypeOf,
} from "@/lib/market/taxonomy";
import type { Holding, StockState, Trade } from "@/lib/types/market";

export type DailyOperationId =
  | "measured_trades"
  | "alpha_dash"
  | "capital_guard"
  | "patient_watch"
  | "sector_mix"
  | "cash_buffer"
  | "income_setup"
  | "hedge_setup"
  | "direct_conviction";

export type DailyOperationStatus = "active" | "completed" | "failed";

export interface DailyOperationOffer {
  id: DailyOperationId;
  title: string;
  description: string;
  target: string;
  reward: number;
  emoji: string;
}

export interface DailyOperation {
  id: string;
  offerId: DailyOperationId;
  startSession: number;
  acceptedAt: number;
  endAt: number;
  startEquity: number;
  startBenchmarkPrice: number;
  minimumEquity: number;
  reward: number;
  status: DailyOperationStatus;
  completedAt?: number;
  playerReturn?: number;
  benchmarkReturn?: number;
  resultDetail?: string;
}

export interface DailyOperationContext {
  now: number;
  equity: number;
  benchmarkPrice: number;
  cash: number;
  holdings: Holding[];
  stocks: StockState[];
  trades: Trade[];
  marginCallAt: number | null;
}

export interface DailyOperationProgress {
  percent: number;
  detail: string;
  passing: boolean;
}

export const DAILY_OPERATION_OFFERS: DailyOperationOffer[] = [
  {
    id: "measured_trades",
    title: "계획 매매",
    description: "충동적인 과매매를 피하고 필요한 주문만 집행합니다.",
    target: "체결 1~3건 · 강제청산 없음",
    reward: 20,
    emoji: "🎯",
  },
  {
    id: "alpha_dash",
    title: "지수 추월",
    description: "짧은 한 거래일 동안 벤치마크보다 앞서세요.",
    target: "V-NASDAQ 대비 +0.2%p",
    reward: 35,
    emoji: "🏁",
  },
  {
    id: "capital_guard",
    title: "자본 방어",
    description: "수익을 서두르기보다 손실 폭을 통제합니다.",
    target: "수익률 0% 이상 · 최대 낙폭 1.5% 이내",
    reward: 30,
    emoji: "🛡️",
  },
  {
    id: "patient_watch",
    title: "관망 훈련",
    description: "매매하지 않고 시장 흐름과 보유 자산을 관찰합니다.",
    target: "체결 0건 · 순자산 손실 0.5% 이내",
    reward: 20,
    emoji: "🔭",
  },
  {
    id: "sector_mix",
    title: "분산 대형",
    description: "한 업종에 몰리지 않는 기본 포트폴리오를 구성합니다.",
    target: "3개 이상 업종 · 투자 비중 30% 이상",
    reward: 25,
    emoji: "🧺",
  },
  {
    id: "cash_buffer",
    title: "현금 방어선",
    description: "다음 기회를 기다릴 수 있는 현금 여력을 남깁니다.",
    target: "현금 비중 25% 이상 · 손실 0.5% 이내",
    reward: 20,
    emoji: "💵",
  },
  {
    id: "income_setup",
    title: "인컴 진지",
    description: "배당·커버드콜 자산으로 현금흐름 기반을 만듭니다.",
    target: "인컴 자산 비중 15% 이상",
    reward: 25,
    emoji: "🪙",
  },
  {
    id: "hedge_setup",
    title: "하락 대비",
    description: "채권이나 인버스로 포트폴리오의 충격을 흡수합니다.",
    target: "헤지 자산 비중 10% 이상",
    reward: 25,
    emoji: "☂️",
  },
  {
    id: "direct_conviction",
    title: "기업 직접 분석",
    description: "파생상품 대신 캐릭터 기업에 직접 투자합니다.",
    target: "일반 기업 주식 비중 20% 이상",
    reward: 25,
    emoji: "🏢",
  },
];

export function getDailyOperationOffer(id: DailyOperationId): DailyOperationOffer {
  return DAILY_OPERATION_OFFERS.find((offer) => offer.id === id) ?? DAILY_OPERATION_OFFERS[0];
}

/** 같은 거래일에는 모든 클라이언트가 같은 3개 후보를 본다. */
export function getDailyOperationOffers(session: number): DailyOperationOffer[] {
  const indexes = DAILY_OPERATION_OFFERS.map((_, index) => index);
  let seed = (Math.imul(session ^ 0x6d2b79f5, 0x45d9f3b) >>> 0) || 1;
  for (let index = indexes.length - 1; index > 0; index -= 1) {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    const swap = (seed >>> 0) % (index + 1);
    [indexes[index], indexes[swap]] = [indexes[swap], indexes[index]];
  }
  return indexes.slice(0, 3).map((index) => DAILY_OPERATION_OFFERS[index]);
}

export function createDailyOperation(
  offerId: DailyOperationId,
  session: number,
  equity: number,
  benchmarkPrice: number,
  now = Date.now(),
): DailyOperation {
  const offer = getDailyOperationOffer(offerId);
  return {
    id: `daily-operation-${now}-${offerId}`,
    offerId,
    startSession: session,
    acceptedAt: now,
    endAt: now + SESSION_DURATION_MS,
    startEquity: equity,
    startBenchmarkPrice: benchmarkPrice,
    minimumEquity: equity,
    reward: offer.reward,
    status: "active",
  };
}

function allocationMetrics(context: DailyOperationContext) {
  const byId = new Map(context.stocks.map((stock) => [stock.id, stock]));
  let invested = 0;
  let income = 0;
  let hedge = 0;
  let direct = 0;
  const sectors = new Set<string>();

  for (const holding of context.holdings) {
    const stock = byId.get(holding.stockId);
    if (!stock) continue;
    const value = Math.max(0, holding.quantity * stock.currentPrice);
    invested += value;
    const economicSectors = economicSectorsForStock(stock, byId);
    for (const sector of economicSectors) sectors.add(sector);
    if ((stock.coveredCallAnnualYield ?? 0) > 0 || (stock.quarterlyDividend ?? 0) > 0) {
      income += value;
    }
    if (economicSectors.has("채권") || (stock.leverage ?? 0) < 0) hedge += value;
    if (stock.ceoId && instrumentTypeOf(stock) === "company") direct += value;
  }

  const denominator = Math.max(1, context.equity);
  return {
    investedRatio: invested / denominator,
    incomeRatio: income / denominator,
    hedgeRatio: hedge / denominator,
    directRatio: direct / denominator,
    cashRatio: Math.max(0, context.cash) / denominator,
    sectorCount: sectors.size,
  };
}

export function getDailyOperationProgress(
  operation: DailyOperation,
  context: DailyOperationContext,
): DailyOperationProgress {
  const tradeCount = context.trades.filter(
    (trade) => trade.timestamp >= operation.acceptedAt && trade.timestamp <= operation.endAt,
  ).length;
  const playerReturn = operation.startEquity > 0
    ? context.equity / operation.startEquity - 1
    : -1;
  const benchmarkReturn = operation.startBenchmarkPrice > 0
    ? context.benchmarkPrice / operation.startBenchmarkPrice - 1
    : 0;
  const minimumEquity = Math.min(operation.minimumEquity, context.equity);
  const drawdown = operation.startEquity > 0
    ? Math.max(0, 1 - minimumEquity / operation.startEquity)
    : 1;
  const marginCalled = context.marginCallAt !== null && context.marginCallAt >= operation.acceptedAt;
  const allocation = allocationMetrics(context);
  const pct = (value: number) => `${(value * 100).toFixed(1)}%`;

  if (operation.offerId === "measured_trades") {
    const passing = tradeCount >= 1 && tradeCount <= 3 && !marginCalled;
    return {
      passing,
      percent: tradeCount > 3 || marginCalled ? 0 : Math.min(100, tradeCount * 100),
      detail: `체결 ${tradeCount}건${marginCalled ? " · 강제청산 발생" : ""}`,
    };
  }
  if (operation.offerId === "alpha_dash") {
    const alpha = playerReturn - benchmarkReturn;
    return {
      passing: alpha >= 0.002,
      percent: Math.max(0, Math.min(100, (alpha / 0.002) * 100)),
      detail: `지수 대비 ${alpha >= 0 ? "+" : ""}${pct(alpha)}`,
    };
  }
  if (operation.offerId === "capital_guard") {
    const passing = playerReturn >= 0 && drawdown <= 0.015 && !marginCalled;
    return {
      passing,
      percent: marginCalled ? 0 : playerReturn >= 0 && drawdown <= 0.015 ? 100 : Math.max(0, 100 - drawdown * 5_000),
      detail: `수익률 ${playerReturn >= 0 ? "+" : ""}${pct(playerReturn)} · 낙폭 ${pct(drawdown)}`,
    };
  }
  if (operation.offerId === "patient_watch") {
    const passing = tradeCount === 0 && playerReturn >= -0.005;
    return {
      passing,
      percent: tradeCount === 0 ? Math.max(0, Math.min(100, 100 + playerReturn * 10_000)) : 0,
      detail: `체결 ${tradeCount}건 · 수익률 ${playerReturn >= 0 ? "+" : ""}${pct(playerReturn)}`,
    };
  }
  if (operation.offerId === "sector_mix") {
    const passing = allocation.sectorCount >= 3 && allocation.investedRatio >= 0.3;
    return {
      passing,
      percent: Math.min(100, Math.min(allocation.sectorCount / 3, allocation.investedRatio / 0.3) * 100),
      detail: `${allocation.sectorCount}개 업종 · 투자 비중 ${pct(allocation.investedRatio)}`,
    };
  }
  if (operation.offerId === "cash_buffer") {
    const passing = allocation.cashRatio >= 0.25 && playerReturn >= -0.005;
    return {
      passing,
      percent: Math.min(100, allocation.cashRatio / 0.25 * 100),
      detail: `현금 ${pct(allocation.cashRatio)} · 수익률 ${playerReturn >= 0 ? "+" : ""}${pct(playerReturn)}`,
    };
  }
  if (operation.offerId === "income_setup") {
    return {
      passing: allocation.incomeRatio >= 0.15,
      percent: Math.min(100, allocation.incomeRatio / 0.15 * 100),
      detail: `인컴 자산 ${pct(allocation.incomeRatio)}`,
    };
  }
  if (operation.offerId === "hedge_setup") {
    return {
      passing: allocation.hedgeRatio >= 0.1,
      percent: Math.min(100, allocation.hedgeRatio / 0.1 * 100),
      detail: `헤지 자산 ${pct(allocation.hedgeRatio)}`,
    };
  }
  return {
    passing: allocation.directRatio >= 0.2,
    percent: Math.min(100, allocation.directRatio / 0.2 * 100),
    detail: `일반 기업 주식 ${pct(allocation.directRatio)}`,
  };
}

export function updateDailyOperation(
  operation: DailyOperation,
  context: DailyOperationContext,
): DailyOperation {
  if (operation.status !== "active") return operation;
  const minimumEquity = Math.min(operation.minimumEquity, context.equity);
  if (context.now < operation.endAt) {
    return minimumEquity === operation.minimumEquity
      ? operation
      : { ...operation, minimumEquity };
  }
  const tracked = { ...operation, minimumEquity };
  const progress = getDailyOperationProgress(tracked, context);
  const playerReturn = operation.startEquity > 0
    ? context.equity / operation.startEquity - 1
    : -1;
  const benchmarkReturn = operation.startBenchmarkPrice > 0
    ? context.benchmarkPrice / operation.startBenchmarkPrice - 1
    : 0;
  return {
    ...tracked,
    status: progress.passing ? "completed" : "failed",
    completedAt: context.now,
    playerReturn,
    benchmarkReturn,
    resultDetail: progress.detail,
  };
}

export function normalizeDailyOperation(value: unknown): DailyOperation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<DailyOperation>;
  if (
    typeof candidate.id !== "string" ||
    !DAILY_OPERATION_OFFERS.some((offer) => offer.id === candidate.offerId) ||
    !["active", "completed", "failed"].includes(candidate.status ?? "") ||
    !Number.isFinite(candidate.acceptedAt) ||
    !Number.isFinite(candidate.endAt) ||
    !Number.isFinite(candidate.startEquity) ||
    !Number.isFinite(candidate.startBenchmarkPrice)
  ) {
    return null;
  }
  return {
    ...(candidate as DailyOperation),
    startSession: Number.isSafeInteger(candidate.startSession) ? candidate.startSession! : 0,
    minimumEquity: Number.isFinite(candidate.minimumEquity)
      ? candidate.minimumEquity!
      : candidate.startEquity!,
    reward: Number.isFinite(candidate.reward)
      ? Math.max(0, Math.round(candidate.reward!))
      : getDailyOperationOffer(candidate.offerId!).reward,
  };
}

export function normalizeDailyOperationHistory(value: unknown): DailyOperation[] {
  if (!Array.isArray(value)) return [];
  return value
    .map(normalizeDailyOperation)
    .filter((operation): operation is DailyOperation => operation !== null && operation.status !== "active")
    .slice(0, 20);
}

import { buildDailyScorecard } from "@/lib/market/dailyScorecard";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { economicSectorsForStock } from "@/lib/market/taxonomy";
import { parseAmcFundId } from "@/lib/player/assetManager";
import type { AmcPortfolioLookThroughPosition } from "@/lib/player/amcPortfolio";
import type {
  CashPayment,
  Holding,
  InvestmentMissionHistory,
  StockState,
  Trade,
} from "@/lib/types/market";

export type InvestmentStyleId =
  | "growth"
  | "income"
  | "derivatives"
  | "short"
  | "risk"
  | "diversified";

export interface InvestmentMasteryState {
  xp: Record<InvestmentStyleId, number>;
  awardedIds: string[];
}

export interface InvestmentStyleDefinition {
  id: InvestmentStyleId;
  emoji: string;
  name: string;
  description: string;
  titles: string[];
}

export const MASTERY_LEVEL_THRESHOLDS = [0, 50, 150, 350, 700, 1_200];

export const INVESTMENT_STYLES: InvestmentStyleDefinition[] = [
  { id: "growth", emoji: "🚀", name: "성장 투자", description: "성장 업종 투자와 공격적·전용 의뢰 성공", titles: ["관찰자", "성장 추적자", "모멘텀 헌터", "성장주 전문가", "혁신 투자자", "미래 설계자"] },
  { id: "income", emoji: "💵", name: "인컴 투자", description: "배당과 커버드콜 분배금 수령", titles: ["저축가", "현금흐름 수집가", "배당 사냥꾼", "인컴 전문가", "분배금 설계자", "현금흐름 거장"] },
  { id: "derivatives", emoji: "🎟️", name: "파생 전략", description: "일정 규모 이상의 옵션 거래", titles: ["입문자", "프리미엄 관찰자", "옵션 전술가", "변동성 전문가", "파생 설계자", "그릭스 마스터"] },
  { id: "short", emoji: "📉", name: "공매도 전략", description: "일정 규모 이상의 공매도·청산 거래", titles: ["경계자", "약세 관찰자", "하락 추적자", "공매도 전문가", "위기 사냥꾼", "역방향의 지배자"] },
  { id: "risk", emoji: "🛡️", name: "리스크 관리", description: "리스크 의뢰 성공과 높은 거래일 성적표", titles: ["생존자", "손실 통제자", "방어 전략가", "리스크 전문가", "자본 수호자", "철벽 운용자"] },
  { id: "diversified", emoji: "🧺", name: "분산 투자", description: "시장 초과 의뢰와 5개 이상 업종 분산 유지", titles: ["분산 입문자", "바스켓 수집가", "섹터 배분가", "포트폴리오 전문가", "자산 배분가", "올웨더 거장"] },
];

export function createInitialMastery(): InvestmentMasteryState {
  return {
    xp: {
      growth: 0,
      income: 0,
      derivatives: 0,
      short: 0,
      risk: 0,
      diversified: 0,
    },
    awardedIds: [],
  };
}

export function masteryLevel(xp: number): number {
  let level = 0;
  for (let index = 0; index < MASTERY_LEVEL_THRESHOLDS.length; index++) {
    if (xp >= MASTERY_LEVEL_THRESHOLDS[index]) level = index;
  }
  return level;
}

export function normalizeInvestmentMastery(value: unknown): InvestmentMasteryState {
  const initial = createInitialMastery();
  if (!value || typeof value !== "object" || Array.isArray(value)) return initial;
  const raw = value as Partial<InvestmentMasteryState>;
  for (const style of INVESTMENT_STYLES) {
    initial.xp[style.id] = Math.max(0, Math.min(99_999, Number(raw.xp?.[style.id]) || 0));
  }
  initial.awardedIds = Array.isArray(raw.awardedIds)
    ? raw.awardedIds.filter((id): id is string => typeof id === "string").slice(0, 2_000)
    : [];
  return initial;
}

function award(
  state: InvestmentMasteryState,
  awarded: Set<string>,
  id: string,
  style: InvestmentStyleId,
  xp: number,
): boolean {
  if (awarded.has(id)) return false;
  awarded.add(id);
  state.xp[style] = Math.min(99_999, state.xp[style] + xp);
  return true;
}

export function updateInvestmentMastery(
  current: InvestmentMasteryState,
  input: {
    trades: Trade[];
    cashPayments: CashPayment[];
    missionHistory: InvestmentMissionHistory[];
    holdings: Holding[];
    stocks: StockState[];
    userEtfPositions?: readonly AmcPortfolioLookThroughPosition[];
    equity: number;
    initialCash: number;
    marginCallAt: number | null;
    currentSession: number;
  },
): InvestmentMasteryState {
  const next = normalizeInvestmentMastery(current);
  const awarded = new Set(next.awardedIds);
  let changed = false;

  for (const mission of input.missionHistory) {
    if (mission.status !== "completed") continue;
    const style: InvestmentStyleId =
      mission.kind === "risk"
        ? "risk"
        : mission.kind === "benchmark"
          ? "diversified"
          : "growth";
    const xp = mission.kind === "character" ? 50 : mission.kind === "risk" ? 45 : 40;
    changed = award(next, awarded, `mastery-mission:${mission.id}`, style, xp) || changed;
  }

  for (const payment of input.cashPayments) {
    if (payment.amount <= 0 || (payment.kind !== "covered_call" && payment.kind !== "dividend" && payment.kind !== "amc_dividend")) continue;
    changed = award(next, awarded, `mastery-income:${payment.id}`, "income", 15) || changed;
  }

  const minimumNotional = Math.max(50_000, input.initialCash * 0.005);
  const growthSectors = new Set([
    "기술",
    "반도체",
    "헬스케어",
    "미디어·콘텐츠",
  ]);
  const stockById = new Map(input.stocks.map((stock) => [stock.id, stock]));
  const userEtfByFundId = new Map(
    (input.userEtfPositions ?? []).map((position) => [
      position.fundId,
      position,
    ]),
  );
  for (const trade of input.trades) {
    if (Math.abs(trade.total) < minimumNotional) continue;
    const tradeSession = Math.floor(trade.timestamp / SESSION_DURATION_MS);
    if (trade.type.startsWith("option_")) {
      changed = award(next, awarded, `mastery-derivatives:${tradeSession}`, "derivatives", 12) || changed;
    }
    if (trade.type === "short" || trade.type === "cover") {
      changed = award(next, awarded, `mastery-short:${tradeSession}`, "short", 12) || changed;
    }
    const stock = stockById.get(trade.stockId);
    const userEtf = (() => {
      const fundId = parseAmcFundId(trade.stockId);
      return fundId ? userEtfByFundId.get(fundId) : undefined;
    })();
    const isGrowthStock =
      stock &&
      [...economicSectorsForStock(stock, stockById)].some((sector) =>
        growthSectors.has(sector),
      );
    if (trade.type === "buy" && isGrowthStock) {
      changed = award(next, awarded, `mastery-growth:${tradeSession}`, "growth", 10) || changed;
    }
    const isIncomeAsset =
      (stock &&
        ((stock.coveredCallAnnualYield ?? 0) > 0 ||
          (stock.quarterlyDividend ?? 0) > 0)) ||
      userEtf?.exposure.profile === "income";
    if (trade.type === "buy" && isIncomeAsset) {
      changed =
        award(
          next,
          awarded,
          `mastery-income-trade:${tradeSession}`,
          "income",
          10,
        ) || changed;
    }
  }

  const previousSession = input.currentSession - 1;
  const scorecard = buildDailyScorecard(
    input.trades,
    previousSession,
    input.initialCash,
    input.marginCallAt,
  );
  if (scorecard.grade === "S" || scorecard.grade === "A") {
    changed = award(next, awarded, `mastery-risk:${previousSession}`, "risk", 20) || changed;
  }

  if (input.equity > 0) {
    const qualifyingSectors = new Set<string>();
    for (const holding of input.holdings) {
      const stock = stockById.get(holding.stockId);
      if (!stock) continue;
      if ((holding.quantity * stock.currentPrice) / input.equity >= 0.02) {
        for (const sector of economicSectorsForStock(stock, stockById)) {
          qualifyingSectors.add(sector);
        }
      }
    }
    for (const position of input.userEtfPositions ?? []) {
      for (const constituent of position.constituents) {
        const stock = stockById.get(constituent.stockId);
        if (!stock || constituent.value / input.equity < 0.02) continue;
        for (const sector of economicSectorsForStock(stock, stockById)) {
          qualifyingSectors.add(sector);
        }
      }
    }
    if (qualifyingSectors.size >= 5) {
      changed = award(next, awarded, `mastery-diversified:${input.currentSession}`, "diversified", 15) || changed;
    }
  }

  if (!changed) return current;
  next.awardedIds = [...awarded].slice(-2_000);
  return next;
}

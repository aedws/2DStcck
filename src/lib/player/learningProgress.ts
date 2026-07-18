import type {
  CharacterProgressMap,
  Holding,
  NetWorthPoint,
  OptionPosition,
  ShortPosition,
  StockState,
} from "@/lib/types/market";
import { getRelationshipTier } from "@/lib/market/characterProgress";
import { LEARNING_LAYERS } from "@/data/learningJourney";

export interface LearningSignals {
  trades: number;
  distinctSectors: number;
  hasEtfHolding: boolean;
  hasCharacterHolding: boolean;
  maxAffinityTierIndex: number;
  missionsDone: number;
  seasonsDone: number;
  reputation: number;
  netWorthRatio: number;
  usedAdvanced: boolean;
}

interface LearningStateSlice {
  trades: readonly unknown[];
  holdings: Holding[];
  stocks: StockState[];
  options: OptionPosition[];
  shorts: ShortPosition[];
  cash: number;
  marginEnabled: boolean;
  characterProgress: CharacterProgressMap;
  missionHistory: readonly unknown[];
  investmentSeason?: { history?: readonly unknown[] };
  reputation: number;
  netWorthHistory: NetWorthPoint[];
  initialCash: number;
}

/** 스토어 상태에서 학습 진척 신호를 추출한다. */
export function deriveLearningSignals(
  s: LearningStateSlice,
): LearningSignals {
  const byId = new Map(s.stocks.map((stock) => [stock.id, stock]));
  const heldStocks = s.holdings
    .map((h) => byId.get(h.stockId))
    .filter((stock): stock is StockState => Boolean(stock));

  const distinctSectors = new Set(heldStocks.map((stock) => stock.sector)).size;
  const hasEtfHolding = heldStocks.some((stock) => stock.sector === "ETF");
  const hasCharacterHolding = heldStocks.some(
    (stock) => Boolean(stock.ceoId) && !stock.universalDerivative,
  );
  const usedAdvanced =
    heldStocks.some(
      (stock) =>
        stock.leverage !== undefined ||
        Boolean(stock.coveredCallUnderlyingId),
    ) ||
    s.options.length > 0 ||
    s.shorts.length > 0 ||
    s.cash < 0 ||
    s.marginEnabled;

  let maxAffinityTierIndex = 0;
  for (const entry of Object.values(s.characterProgress ?? {})) {
    const tier = getRelationshipTier(entry?.affinity ?? 0);
    if (tier.index > maxAffinityTierIndex) maxAffinityTierIndex = tier.index;
  }

  const lastNetWorth =
    s.netWorthHistory.length > 0
      ? s.netWorthHistory[s.netWorthHistory.length - 1].value
      : s.cash;
  const netWorthRatio =
    s.initialCash > 0 ? lastNetWorth / s.initialCash : 1;

  return {
    trades: s.trades.length,
    distinctSectors,
    hasEtfHolding,
    hasCharacterHolding,
    maxAffinityTierIndex,
    missionsDone: s.missionHistory.length,
    seasonsDone: s.investmentSeason?.history?.length ?? 0,
    reputation: s.reputation ?? 0,
    netWorthRatio,
    usedAdvanced,
  };
}

/**
 * 레이어 N의 목표 달성 여부 — 달성하면 레이어 N+1의 교육이 열린다.
 * (레이어 6의 목표는 여정 완주 조건)
 */
export function isLayerGoalMet(
  layerId: number,
  s: LearningSignals,
): boolean {
  switch (layerId) {
    case 1:
      return s.trades >= 1;
    case 2:
      return s.trades >= 3;
    case 3:
      return s.hasEtfHolding || s.distinctSectors >= 2;
    case 4:
      return s.hasCharacterHolding && s.maxAffinityTierIndex >= 1;
    case 5:
      return (
        s.missionsDone >= 1 || s.seasonsDone >= 1 || s.reputation > 0
      );
    case 6:
      return s.usedAdvanced || s.netWorthRatio >= 1.3;
    default:
      return false;
  }
}

/**
 * 현재 도달(교육을 보여야 할 최고) 레이어. 목표를 순차로 채운 만큼 열린다.
 * 레이어 1은 시작부터 도달로 간주(첫 안내가 담당)한다. 최대 6.
 */
export function reachedLearningLayer(s: LearningSignals): number {
  let reached = 1;
  for (const layer of LEARNING_LAYERS) {
    if (isLayerGoalMet(layer.id, s)) {
      reached = Math.min(6, layer.id + 1);
    } else {
      break;
    }
  }
  return reached;
}

/** 6개 목표를 모두 달성했으면 여정 완주. */
export function isJourneyComplete(s: LearningSignals): boolean {
  return LEARNING_LAYERS.every((layer) => isLayerGoalMet(layer.id, s));
}

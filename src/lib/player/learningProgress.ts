import type {
  CharacterProgressMap,
  Holding,
  NetWorthPoint,
  OptionPosition,
  ShortPosition,
  StockState,
} from "@/lib/types/market";
import {
  getRelationshipTier,
  resolveEtfCharacterExposures,
  type CharacterLinkedEtfHolding,
} from "@/lib/market/characterProgress";
import {
  economicSectorsForStock,
  instrumentTypeOf,
} from "@/lib/market/taxonomy";
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
  userEtfHoldings?: readonly CharacterLinkedEtfHolding[];
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

  const economicSectors = new Set<string>();
  for (const stock of heldStocks) {
    for (const sector of economicSectorsForStock(stock, byId)) {
      economicSectors.add(sector);
    }
  }
  const userEtfHoldings = (s.userEtfHoldings ?? []).filter(
    (position) => position.value > 0,
  );
  for (const position of userEtfHoldings) {
    for (const holding of position.holdings) {
      const stock = byId.get(holding.stockId);
      if (!stock) continue;
      for (const sector of economicSectorsForStock(stock, byId)) {
        economicSectors.add(sector);
      }
    }
  }
  const distinctSectors = economicSectors.size;
  const hasEtfHolding = heldStocks.some(
    (stock) => instrumentTypeOf(stock) === "etf",
  ) || userEtfHoldings.length > 0;
  const hasCharacterHolding =
    heldStocks.some(
      (stock) =>
        Boolean(stock.ceoId) && instrumentTypeOf(stock) === "company",
    ) ||
    userEtfHoldings.some((position) =>
      resolveEtfCharacterExposures(position.holdings, s.stocks).some(
        (exposure) => exposure.kind !== "hostile",
      ),
    );
  const usedAdvanced =
    heldStocks.some(
      (stock) =>
        stock.leverage !== undefined ||
        Boolean(stock.coveredCallUnderlyingId),
    ) ||
    userEtfHoldings.some((position) =>
      position.holdings.some((holding) => {
        const stock = byId.get(holding.stockId);
        return Boolean(
          stock &&
            (stock.leverage !== undefined ||
              stock.coveredCallUnderlyingId),
        );
      }),
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
      // 캐릭터 회사 주식을 보유하기 시작하면(원앤온리·트윈스타·트리플하르모니아 등
      // 어떤 집중 형태든) 수집을 시작한 것으로 보고 다음 레이어를 연다. 관계 '관심'
      // 도달은 시간이 오래 걸려 온보딩 진행이 막히므로 조건에서 제외한다.
      return s.hasCharacterHolding;
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

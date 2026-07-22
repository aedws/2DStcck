import type { Holding, StockState } from "@/lib/types/market";
import {
  resolveStockCharacterExposure,
  type CharacterLinkedEtfHolding,
} from "@/lib/market/characterProgress";

/**
 * 캐릭터(기업)별 보유 집중도. 직접 종목과 그 회사를 기초로 한 커버드콜·양수 레버리지는
 * 같은 캐릭터로 합산하고, 인버스·곱버스(음수 레버리지)는 반대 베팅이므로 제외한다.
 * 집중 업적(원 앤 온리·트윈 스타·트리플 하르모니아) 판정과 우선주·전담 의뢰의
 * '지정 대상' 산출에 함께 쓴다.
 */
export interface CharacterConcentration {
  /** 캐릭터별 순자산 비중, 내림차순 */
  ranked: { characterId: string; share: number }[];
  /** 보유 중인 서로 다른 캐릭터 수 */
  heldCount: number;
  topCharacterShare: number;
  topTwoCharacterShare: number;
  topThreeCharacterShare: number;
  oneAndOnly: boolean;
  twinStar: boolean;
  tripleHarmonia: boolean;
  /** 집중 자격을 만족하는 지정(집중) 캐릭터 id 집합 */
  focusedCharacterIds: string[];
}

export function computeCharacterConcentration(
  holdings: Holding[],
  stocks: StockState[],
  equity: number,
  userEtfHoldings: readonly CharacterLinkedEtfHolding[] = [],
): CharacterConcentration {
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
  const byCharacter = new Map<string, number>();
  for (const holding of holdings) {
    if (holding.quantity <= 0) continue;
    const stock = stockById.get(holding.stockId);
    if (!stock) continue;
    let ceoId = stock.ceoId;
    if (!ceoId) {
      // 인버스·곱버스(음수 레버리지)는 제외. 커버드콜·양수 레버리지만 기초 캐릭터로 합산.
      const underlyingId =
        stock.coveredCallUnderlyingId ??
        ((stock.leverage ?? 0) > 0 ? stock.leverageUnderlyingId : undefined);
      ceoId = underlyingId ? stockById.get(underlyingId)?.ceoId : undefined;
    }
    if (!ceoId) continue;
    byCharacter.set(
      ceoId,
      (byCharacter.get(ceoId) ?? 0) + holding.quantity * stock.currentPrice,
    );
  }

  // 유저 ETF는 일반 종목 맵에 없으므로 NAV를 구성 비중대로 기초 캐릭터에 배분한다.
  // 인버스·곱버스는 우호 보유로 보지 않아 의뢰 발행 대상에서 제외한다.
  for (const etf of userEtfHoldings) {
    if (!(etf.value > 0)) continue;
    const totalWeight = etf.holdings.reduce(
      (sum, holding) => sum + (holding.weight > 0 ? holding.weight : 0),
      0,
    );
    if (!(totalWeight > 0)) continue;
    const positiveRows = etf.holdings.flatMap((holding) => {
      if (!(holding.weight > 0)) return [];
      const exposure = resolveStockCharacterExposure(holding.stockId, stockById);
      return exposure && exposure.kind !== "hostile"
        ? [{ characterId: exposure.characterId, weight: holding.weight }]
        : [];
    });
    for (const row of positiveRows) {
      byCharacter.set(
        row.characterId,
        (byCharacter.get(row.characterId) ?? 0) +
          etf.value * (row.weight / totalWeight),
      );
    }
  }

  const ranked =
    equity > 0
      ? [...byCharacter.entries()]
          .map(([characterId, value]) => ({ characterId, share: value / equity }))
          .sort((a, b) => b.share - a.share)
      : [];
  const heldCount = byCharacter.size;
  const topCharacterShare = ranked[0]?.share ?? 0;
  const topTwoCharacterShare =
    ranked.length >= 2 ? ranked[0].share + ranked[1].share : 0;
  const topThreeCharacterShare =
    ranked.length >= 3
      ? ranked[0].share + ranked[1].share + ranked[2].share
      : 0;

  const oneAndOnly = topCharacterShare >= 0.45;
  const twinStar = topTwoCharacterShare >= 0.7;
  const tripleHarmonia = heldCount <= 3 && topThreeCharacterShare >= 0.75;

  const focused = new Set<string>();
  if (oneAndOnly && ranked[0]) focused.add(ranked[0].characterId);
  if (twinStar) ranked.slice(0, 2).forEach((r) => focused.add(r.characterId));
  if (tripleHarmonia) ranked.slice(0, 3).forEach((r) => focused.add(r.characterId));

  return {
    ranked,
    heldCount,
    topCharacterShare,
    topTwoCharacterShare,
    topThreeCharacterShare,
    oneAndOnly,
    twinStar,
    tripleHarmonia,
    focusedCharacterIds: [...focused],
  };
}

/** 우선주 발행·보유 자격: 원 앤 온리·트윈 스타·트리플 하르모니아 중 하나. */
export function isPreferredEligible(c: CharacterConcentration): boolean {
  return c.oneAndOnly || c.twinStar || c.tripleHarmonia;
}

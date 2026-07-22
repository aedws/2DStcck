import { STOCK_DEFINITIONS } from "@/data/stocks";
import {
  resolveEtfCharacterExposures,
  resolveStockCharacterExposure,
} from "@/lib/market/characterProgress";
import {
  parseAmcFundId,
  type AmcFundState,
} from "@/lib/player/assetManager";
import type { Holding, StockState } from "@/lib/types/market";

export type CharacterRelationStatus =
  | "locked"
  | "direct"
  | "covered-call"
  | "hostile"
  | "leverage"
  | "bonded";

export interface CharacterRelation {
  status: CharacterRelationStatus;
  unlocked: boolean;
  /** 현재 우호 방향 자산을 실제 보유 중인지 여부. 도감 정렬에 사용한다. */
  currentlyHeld: boolean;
  label: string;
}

export interface CharacterRelationContext {
  stocks?: StockState[];
  funds?: ReadonlyArray<Pick<AmcFundState, "id" | "holdings" | "status">>;
  /** 호감도 100을 한 번이라도 달성해 자산 없이도 도감을 유지한다. */
  permanentlyUnlocked?: boolean;
}

const STOCK_BY_ID = new Map(STOCK_DEFINITIONS.map((stock) => [stock.id, stock]));

/**
 * 레버리지 > 인버스 > 커버드콜 > 일반 보유 순으로 도감 관계를 결정한다.
 * 유저 ETF는 구성 상품을 최종 기초 캐릭터까지 따라가며, 인버스·곱버스는
 * 적대로 분류한다. 호감도 100을 한 번 달성했다면 보유 자산이 없어도 해금된다.
 */
export function getCharacterRelation(
  companyId: string,
  holdings: Holding[],
  context: CharacterRelationContext = {},
): CharacterRelation {
  const stocks = context.stocks?.length
    ? context.stocks
    : STOCK_DEFINITIONS as StockState[];
  const stockById = new Map(stocks.map((stock) => [stock.id, stock]));
  const company = stockById.get(companyId) ?? STOCK_BY_ID.get(companyId);
  const characterId = company?.ceoId;
  const fundById = new Map((context.funds ?? []).map((fund) => [fund.id, fund]));

  let direct = false;
  let coveredCall = false;
  let hostile = false;
  let leverage = false;
  let etfDirect = false;
  let etfCoveredCall = false;
  let etfHostile = false;
  let etfLeverage = false;

  for (const holding of holdings) {
    if (holding.quantity <= 0) continue;
    const fundId = parseAmcFundId(holding.stockId);
    if (fundId) {
      const fund = fundById.get(fundId);
      if (!fund || fund.status === "delisted" || !characterId) continue;
      for (const exposure of resolveEtfCharacterExposures(fund.holdings, stocks)) {
        if (exposure.characterId !== characterId) continue;
        if (exposure.kind === "leverage") etfLeverage = true;
        else if (exposure.kind === "covered-call") etfCoveredCall = true;
        else if (exposure.kind === "hostile") etfHostile = true;
        else etfDirect = true;
      }
      continue;
    }

    const exposure = resolveStockCharacterExposure(holding.stockId, stockById);
    if (!exposure || exposure.characterId !== characterId) continue;
    if (exposure.kind === "leverage") leverage = true;
    else if (exposure.kind === "covered-call") coveredCall = true;
    else if (exposure.kind === "hostile") hostile = true;
    else direct = true;
  }

  const hasLeverage = leverage || etfLeverage;
  const hasCoveredCall = coveredCall || etfCoveredCall;
  const hasDirect = direct || etfDirect;
  const hasHostile = hostile || etfHostile;
  const currentlyHeld = hasLeverage || hasCoveredCall || hasDirect;
  const unlocked = currentlyHeld || Boolean(context.permanentlyUnlocked);

  if (hasLeverage) {
    return {
      status: "leverage",
      unlocked: true,
      currentlyHeld: true,
      label: leverage ? "레버리지 동맹" : "유저 ETF · 레버리지",
    };
  }
  if (hasHostile) {
    return {
      status: "hostile",
      unlocked,
      currentlyHeld,
      label: unlocked ? "적대 포지션" : "미활성 · 적대",
    };
  }
  if (hasCoveredCall) {
    return {
      status: "covered-call",
      unlocked: true,
      currentlyHeld: true,
      label: coveredCall ? "커버드콜 보유" : "유저 ETF · 커버드콜",
    };
  }
  if (hasDirect) {
    return {
      status: "direct",
      unlocked: true,
      currentlyHeld: true,
      label: direct ? "일반 보유" : "유저 ETF 보유",
    };
  }
  if (context.permanentlyUnlocked) {
    return {
      status: "bonded",
      unlocked: true,
      currentlyHeld: false,
      label: "관계 영구 해금",
    };
  }
  return {
    status: "locked",
    unlocked: false,
    currentlyHeld: false,
    label: "미발견",
  };
}

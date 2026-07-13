import { STOCK_DEFINITIONS } from "@/data/stocks";
import type { Holding } from "@/lib/types/market";

export type CharacterRelationStatus =
  | "locked"
  | "direct"
  | "covered-call"
  | "hostile"
  | "leverage";

export interface CharacterRelation {
  status: CharacterRelationStatus;
  unlocked: boolean;
  label: string;
}

const STOCK_BY_ID = new Map(STOCK_DEFINITIONS.map((stock) => [stock.id, stock]));

/** 레버리지 > 인버스 > 커버드콜 > 일반 보유 순으로 도감 관계를 결정한다. */
export function getCharacterRelation(
  companyId: string,
  holdings: Holding[],
): CharacterRelation {
  let direct = false;
  let coveredCall = false;
  let hostile = false;
  let leverage = false;

  for (const holding of holdings) {
    if (holding.quantity <= 0) continue;
    if (holding.stockId === companyId) direct = true;
    const stock = STOCK_BY_ID.get(holding.stockId);
    if (!stock) continue;
    if (stock.coveredCallUnderlyingId === companyId) coveredCall = true;
    if (stock.leverageUnderlyingId !== companyId) continue;
    if ((stock.leverage ?? 0) > 0) leverage = true;
    if ((stock.leverage ?? 0) < 0) hostile = true;
  }

  const unlocked = direct || coveredCall || leverage;
  if (leverage) return { status: "leverage", unlocked: true, label: "레버리지 동맹" };
  if (hostile) {
    return {
      status: "hostile",
      unlocked,
      label: unlocked ? "적대 포지션" : "미활성 · 적대",
    };
  }
  if (coveredCall) return { status: "covered-call", unlocked: true, label: "커버드콜 보유" };
  if (direct) return { status: "direct", unlocked: true, label: "일반 보유" };
  return { status: "locked", unlocked: false, label: "미발견" };
}

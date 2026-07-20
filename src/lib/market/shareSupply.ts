import type { StockDefinition } from "@/lib/types/market";

/** 중앙 유통 재고를 쓰지 않는 상품군. 관계 보상 우선주는 별도 지갑 자산이다. */
const UNLIMITED_SECTORS = new Set(["ETF", "채권", "지수", "선물", "급등주"]);

export interface ShareStructure {
  issuedShares: number;
  floatRatio: number;
  floatShares: number;
}

/** 실제 회사 보통주만 전역 유통주식수 제한을 적용한다. */
export function isSupplyLimitedStock(
  stock: Pick<StockDefinition, "sector" | "universalDerivative">,
): boolean {
  return !stock.universalDerivative && !UNLIMITED_SECTORS.has(stock.sector);
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * CSV에서 수치를 지정하지 않은 회사도 기기마다 같은 자본 구조를 갖게 한다.
 * 발행주식수는 2천만~2억 주(백만 주 단위), 유통비율은 45~80% 범위다.
 */
export function getShareStructure(
  stock: Pick<
    StockDefinition,
    "id" | "ticker" | "sector" | "universalDerivative" | "issuedShares" | "floatRatio"
  >,
): ShareStructure | null {
  if (!isSupplyLimitedStock(stock)) return null;
  const hash = stableHash(`${stock.id}:${stock.ticker}`);
  const issuedShares =
    stock.issuedShares ?? (20 + (hash % 181)) * 1_000_000;
  const floatRatio = stock.floatRatio ?? (45 + ((hash >>> 8) % 36)) / 100;
  return {
    issuedShares,
    floatRatio,
    floatShares: Math.round(issuedShares * floatRatio),
  };
}

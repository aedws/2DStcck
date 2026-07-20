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

/**
 * 별도 설정이 없는 회사의 기본 자본 구조. 현재 최고 자산 계정이 500% 미수를
 * 모두 써도 한 종목 유통량을 잠그기 어렵도록 종목당 5조 주를 넉넉히 발행한다.
 */
export function getShareStructure(
  stock: Pick<
    StockDefinition,
    "id" | "ticker" | "sector" | "universalDerivative" | "issuedShares" | "floatRatio"
  >,
): ShareStructure | null {
  if (!isSupplyLimitedStock(stock)) return null;
  const issuedShares = stock.issuedShares ?? 5_000_000_000_000;
  const floatRatio = stock.floatRatio ?? 0.9;
  return {
    issuedShares,
    floatRatio,
    floatShares: Math.round(issuedShares * floatRatio),
  };
}

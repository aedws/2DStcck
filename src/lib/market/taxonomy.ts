import type {
  FundType,
  InstrumentType,
  StockDefinition,
  StrategyType,
} from "@/lib/types/market";

export const COMPANY_SECTOR_ORDER = [
  "방산·치안",
  "산업재",
  "반도체",
  "소비재·서비스",
  "식품·외식",
  "채권",
  "금융",
  "헬스케어",
  "미디어·콘텐츠",
  "기술",
  "에너지·인프라",
] as const;

export const FUND_FILTER_ORDER = [
  "종합·성장",
  "섹터",
  "채권",
  "원자재",
  "배당·인컴",
] as const;

export const STRATEGY_FILTER_ORDER = [
  "레버리지",
  "인버스",
  "곱버스",
  "커버드콜",
] as const;

export function instrumentTypeOf(
  stock: Pick<
    StockDefinition,
    | "instrumentType"
    | "sector"
    | "leverage"
    | "coveredCallUnderlyingId"
  >,
): InstrumentType {
  if (stock.instrumentType) return stock.instrumentType;
  if (stock.leverage !== undefined || stock.coveredCallUnderlyingId) {
    return "strategy";
  }
  if (stock.sector === "ETF") return "etf";
  if (stock.sector === "지수") return "index";
  if (stock.sector === "선물") return "future";
  return "company";
}

export function strategyTypeOf(
  stock: Pick<
    StockDefinition,
    "strategyType" | "leverage" | "coveredCallUnderlyingId"
  >,
): StrategyType | undefined {
  if (stock.strategyType) return stock.strategyType;
  if (stock.coveredCallUnderlyingId) return "covered-call";
  if (stock.leverage === -1) return "inverse";
  if ((stock.leverage ?? 0) <= -2) return "inverse-2x";
  if ((stock.leverage ?? 0) >= 2) return "leverage";
  return undefined;
}

export function fundFilterLabel(fundType: FundType | undefined): string {
  if (fundType === "broad" || fundType === "growth") return "종합·성장";
  if (fundType === "sector") return "섹터";
  if (fundType === "bond") return "채권";
  if (fundType === "commodity") return "원자재";
  if (fundType === "income") return "배당·인컴";
  return "기타";
}

export function strategyFilterLabel(
  stock: Pick<
    StockDefinition,
    "strategyType" | "leverage" | "coveredCallUnderlyingId"
  >,
): string {
  const type = strategyTypeOf(stock);
  if (type === "leverage") return "레버리지";
  if (type === "inverse") return "인버스";
  if (type === "inverse-2x") return "곱버스";
  if (type === "covered-call") return "커버드콜";
  return "기타";
}

export function productGroupLabel(
  stock: Pick<
    StockDefinition,
    | "instrumentType"
    | "sector"
    | "leverage"
    | "coveredCallUnderlyingId"
  >,
): "기업" | "ETF" | "파생·전략" | "지수·선물" {
  const type = instrumentTypeOf(stock);
  if (type === "company") return "기업";
  if (type === "etf") return "ETF";
  if (type === "strategy") return "파생·전략";
  return "지수·선물";
}

export function marketClassificationLabel(stock: StockDefinition): string {
  const type = instrumentTypeOf(stock);
  if (type === "strategy") return `파생·전략 · ${strategyFilterLabel(stock)}`;
  if (type === "etf") return `ETF · ${fundFilterLabel(stock.fundType)}`;
  if (type === "index" || type === "future") {
    return `지수·선물 · ${stock.sector}`;
  }
  return stock.subsector
    ? `${stock.sector} · ${stock.subsector}`
    : stock.sector;
}

/**
 * 보유 상품의 실제 경제 섹터를 재귀적으로 찾는다.
 * 전략상품은 기초자산, ETF는 구성종목 기준이라 상품 개수로 분산도가 부풀지 않는다.
 */
export function economicSectorsForStock(
  stock: StockDefinition,
  stockById: ReadonlyMap<string, StockDefinition>,
  visited: ReadonlySet<string> = new Set(),
): Set<string> {
  if (visited.has(stock.id)) return new Set();
  const nextVisited = new Set(visited).add(stock.id);

  const underlyingId =
    stock.leverageUnderlyingId ?? stock.coveredCallUnderlyingId;
  if (underlyingId) {
    const underlying = stockById.get(underlyingId);
    return underlying
      ? economicSectorsForStock(underlying, stockById, nextVisited)
      : new Set();
  }

  if (stock.etfHoldings?.length) {
    const sectors = new Set<string>();
    for (const holding of stock.etfHoldings) {
      const constituent = stockById.get(holding.stockId);
      if (!constituent) continue;
      for (const sector of economicSectorsForStock(
        constituent,
        stockById,
        nextVisited,
      )) {
        sectors.add(sector);
      }
    }
    return sectors;
  }

  return instrumentTypeOf(stock) === "company"
    ? new Set([stock.sector])
    : new Set();
}

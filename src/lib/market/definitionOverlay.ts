import { getRuntimeStockDefinitions } from "@/data/stocks";
import type { StockState } from "@/lib/types/market";

/** 저장된 상태 위에 최신 정의(이름·설정·베타 등 정적 콘텐츠)를 덮어쓴다.
 * 동적 상태(가격·캔들·호가)는 유지 — 콘텐츠 수정이 배포만으로 반영되게.
 * 런타임 정의를 참조하므로 관리자 즉시 IPO(동적 상장) 종목의 이름·섹터도 적용된다. */
export function applyDefinitionOverlay(stock: StockState): StockState {
  const def = getRuntimeStockDefinitions().find((d) => d.id === stock.id);
  if (!def) return stock;
  return {
    ...def,
    currentPrice: stock.currentPrice,
    shareMultiplier: stock.shareMultiplier,
    lastShareAdjustmentSession: stock.lastShareAdjustmentSession,
    lastPlayerCompanyActionSequence:
      stock.lastPlayerCompanyActionSequence,
    coveredCallPremiumReserve: stock.coveredCallPremiumReserve,
    navDistributionAdjustment: stock.navDistributionAdjustment,
    prevDayClose: stock.prevDayClose,
    dayOpen: stock.dayOpen,
    daySessionId: stock.daySessionId,
    leveragePathSessionId: stock.leveragePathSessionId,
    leveragePathSessionBase: stock.leveragePathSessionBase,
    leveragePathFactors: stock.leveragePathFactors,
    priceHistory: stock.priceHistory,
    candles: stock.candles,
    dailyCandles: stock.dailyCandles ?? [],
    orderBook: stock.orderBook,
  };
}

"use client";

import { useMemo } from "react";
import { useMarketStore } from "@/store/marketStore";
import {
  leverageAdjustedCandles,
  leverageAdjustedHistory,
} from "@/lib/market/engine";
import type { Candle, PricePoint, StockState } from "@/lib/types/market";

interface ChartSeries {
  candles: Candle[];
  dailyCandles: Candle[];
  history: PricePoint[];
}

/**
 * 차트에 넘길 시계열. 레버리지·인버스 ETF는 액면분할·병합으로 표시가가 튀어
 * 차트가 절벽처럼 망가지므로, 기초자산의 (분할 없는) 캔들에서 연속적인
 * 분할조정 시계열을 재구성해 돌려준다. 일반 종목은 원본 그대로.
 */
export function useChartSeries(stock: StockState | undefined): ChartSeries {
  const underlying = useMarketStore((s) =>
    stock && stock.leverage !== undefined && stock.leverageUnderlyingId
      ? s.stocks.find((x) => x.id === stock.leverageUnderlyingId)
      : undefined,
  );
  return useMemo<ChartSeries>(() => {
    if (!stock) {
      return { candles: [], dailyCandles: [], history: [] };
    }
    if (!underlying) {
      return {
        candles: stock.candles,
        dailyCandles: stock.dailyCandles,
        history: stock.priceHistory,
      };
    }
    return {
      candles: leverageAdjustedCandles(stock, underlying, underlying.candles),
      dailyCandles: leverageAdjustedCandles(
        stock,
        underlying,
        underlying.dailyCandles,
      ),
      history: leverageAdjustedHistory(stock, underlying, underlying.priceHistory),
    };
  }, [stock, underlying]);
}

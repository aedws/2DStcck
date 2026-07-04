"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ColorType,
  CrosshairMode,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import type { Candle, PricePoint } from "@/lib/types/market";
import { buildCandles } from "@/lib/market/engine";

const UP_COLOR = "#f04452";
const DOWN_COLOR = "#3182f6";

interface CandlestickChartProps {
  /** 서버 관리 1분봉 (없으면 history에서 임시 생성) */
  candles?: Candle[];
  history?: PricePoint[];
  height?: number;
  averagePrice?: number;
  prevDayClose?: number;
}

function toSeriesData(candles: Candle[]) {
  return candles.map((c) => ({
    time: (c.timestamp / 1000) as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

export function CandlestickChart({
  candles,
  history,
  height = 320,
  averagePrice,
  prevDayClose,
}: CandlestickChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const avgLineRef = useRef<IPriceLine | null>(null);
  const prevCloseLineRef = useRef<IPriceLine | null>(null);
  const initialFitDoneRef = useRef(false);

  const data = useMemo(() => {
    const source =
      candles && candles.length > 0
        ? candles
        : history
          ? buildCandles(history)
          : [];
    return toSeriesData(source);
  }, [candles, history]);

  // 차트 생성/해제
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const styles = getComputedStyle(document.documentElement);
    const muted = styles.getPropertyValue("--muted").trim() || "#8b95a1";
    const border = styles.getPropertyValue("--border").trim() || "#333d4b";

    const chart = createChart(el, {
      height,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: muted,
        fontSize: 11,
      },
      grid: {
        vertLines: { color: border, style: LineStyle.Dotted },
        horzLines: { color: border, style: LineStyle.Dotted },
      },
      crosshair: { mode: CrosshairMode.Normal },
      rightPriceScale: { borderColor: border },
      timeScale: {
        borderColor: border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: 8,
      },
      localization: {
        priceFormatter: (p: number) => Math.round(p).toLocaleString("ko-KR"),
      },
      autoSize: true,
    });

    const series = chart.addCandlestickSeries({
      upColor: UP_COLOR,
      downColor: DOWN_COLOR,
      borderUpColor: UP_COLOR,
      borderDownColor: DOWN_COLOR,
      wickUpColor: UP_COLOR,
      wickDownColor: DOWN_COLOR,
    });

    chartRef.current = chart;
    seriesRef.current = series;
    initialFitDoneRef.current = false;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      avgLineRef.current = null;
      prevCloseLineRef.current = null;
    };
  }, [height]);

  // 데이터 갱신 — 사용자가 스크롤한 위치는 유지, 최초 1회만 맞춤
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart || data.length === 0) return;

    series.setData(data);

    if (!initialFitDoneRef.current) {
      chart.timeScale().scrollToRealTime();
      initialFitDoneRef.current = true;
    }
  }, [data]);

  // 평단가 / 전일 종가 기준선
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    if (avgLineRef.current) {
      series.removePriceLine(avgLineRef.current);
      avgLineRef.current = null;
    }
    if (averagePrice && averagePrice > 0) {
      avgLineRef.current = series.createPriceLine({
        price: averagePrice,
        color: "#f2b94b",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "평단",
      });
    }

    if (prevCloseLineRef.current) {
      series.removePriceLine(prevCloseLineRef.current);
      prevCloseLineRef.current = null;
    }
    if (prevDayClose && prevDayClose > 0) {
      prevCloseLineRef.current = series.createPriceLine({
        price: prevDayClose,
        color: "#8b95a1",
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: "전일",
      });
    }
  }, [averagePrice, prevDayClose, data.length > 0]);

  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-[var(--surface)] text-sm text-[var(--muted)]"
        style={{ height }}
      >
        캔들 차트 수집 중...
      </div>
    );
  }

  return (
    <div className="rounded-2xl bg-[var(--surface)] p-2">
      <div ref={containerRef} style={{ height }} />
    </div>
  );
}

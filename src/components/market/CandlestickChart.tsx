"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import {
  aggregateCandlesBySessions,
  buildCandles,
} from "@/lib/market/engine";

const UP_COLOR = "#f04452";
const DOWN_COLOR = "#3182f6";

interface CandlestickChartProps {
  /** 서버 관리 1분봉 (없으면 history에서 임시 생성) */
  candles?: Candle[];
  /** 게임 거래일(3시간) 기준 일봉 */
  dailyCandles?: Candle[];
  history?: PricePoint[];
  height?: number;
  mobileHeight?: number;
  averagePrice?: number;
  prevDayClose?: number;
  /** 축 가격 표기: dollar = 센트→$, points = 정수 포인트 (지수·선물) */
  priceKind?: "dollar" | "points";
}

/** lightweight-charts는 UTC로만 그리므로, 로컬 시간대만큼 이동시켜 표시 */
const TZ_OFFSET_MS = -new Date().getTimezoneOffset() * 60_000;
type ChartTimeframe = "minute" | "day" | "week" | "month";

const TIMEFRAMES: Array<{ id: ChartTimeframe; label: string }> = [
  { id: "minute", label: "1분" },
  { id: "day", label: "일" },
  { id: "week", label: "주" },
  { id: "month", label: "월" },
];

function toSeriesData(candles: Candle[]) {
  return candles.map((c) => ({
    time: ((c.timestamp + TZ_OFFSET_MS) / 1000) as UTCTimestamp,
    open: c.open,
    high: c.high,
    low: c.low,
    close: c.close,
  }));
}

export function CandlestickChart({
  candles,
  dailyCandles,
  history,
  height = 320,
  mobileHeight,
  averagePrice,
  prevDayClose,
  priceKind = "dollar",
}: CandlestickChartProps) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("day");
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const avgLineRef = useRef<IPriceLine | null>(null);
  const prevCloseLineRef = useRef<IPriceLine | null>(null);
  const initialFitDoneRef = useRef(false);
  const chartHeight = isMobile && mobileHeight ? mobileHeight : height;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  const data = useMemo(() => {
    const historyCandles = history ? buildCandles(history) : [];
    const minuteSource =
      candles && candles.length >= historyCandles.length
        ? candles
        : historyCandles;
    const daySource =
      dailyCandles && dailyCandles.length > 0
        ? dailyCandles
        : minuteSource;
    const source =
      timeframe === "minute"
        ? minuteSource
        : timeframe === "day"
          ? daySource
          : aggregateCandlesBySessions(
              daySource,
              timeframe === "week" ? 5 : 20,
            );
    return toSeriesData(source);
  }, [candles, dailyCandles, history, timeframe]);
  const hasData = data.length > 0;

  // 차트 생성/해제
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const styles = getComputedStyle(document.documentElement);
    const muted = styles.getPropertyValue("--muted").trim() || "#8b95a1";
    const border = styles.getPropertyValue("--border").trim() || "#333d4b";

    const chart = createChart(el, {
      height: chartHeight,
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
      rightPriceScale: {
        borderColor: border,
        minimumWidth: 68,
        scaleMargins: { top: 0.06, bottom: 0.06 },
      },
      leftPriceScale: { visible: false },
      timeScale: {
        borderColor: border,
        timeVisible: timeframe === "minute",
        secondsVisible: false,
        rightOffset: 4,
        barSpacing: timeframe === "minute" ? 12 : 9,
        minBarSpacing: timeframe === "minute" ? 6 : 4,
      },
      localization: {
        priceFormatter:
          priceKind === "points"
            ? (p: number) => Math.round(p).toLocaleString("en-US")
            : (p: number) =>
                "$" +
                (p / 100).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                }),
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
      borderVisible: true,
      wickVisible: true,
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
  }, [chartHeight, hasData, priceKind, timeframe]);

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
  }, [averagePrice, prevDayClose, hasData]);

  if (!hasData) {
    return (
      <div
        data-testid="candlestick-chart"
        data-timeframe={timeframe}
        data-bar-count={data.length}
        className="rounded-2xl bg-[var(--surface)] p-2"
      >
        <TimeframeTabs value={timeframe} onChange={setTimeframe} />
        <div
          className="flex items-center justify-center text-sm text-[var(--muted)]"
          style={{ height: chartHeight }}
        >
          캔들 차트 수집 중...
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="candlestick-chart"
      data-timeframe={timeframe}
      data-bar-count={data.length}
      className="rounded-2xl bg-[var(--surface)] p-2"
    >
      <TimeframeTabs value={timeframe} onChange={setTimeframe} />
      <div ref={containerRef} style={{ height: chartHeight }} />
    </div>
  );
}

function TimeframeTabs({
  value,
  onChange,
}: {
  value: ChartTimeframe;
  onChange: (value: ChartTimeframe) => void;
}) {
  return (
    <div className="mb-1 flex gap-1 px-1 pt-1">
      {TIMEFRAMES.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`rounded-lg px-3 py-1.5 text-xs transition ${
            value === item.id
              ? "bg-[var(--surface-elevated)] font-semibold text-[var(--foreground)]"
              : "text-[var(--muted)] hover:text-[var(--foreground)]"
          }`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

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
  /** 30초봉 (없으면 history에서 임시 생성) */
  candles?: Candle[];
  /** 게임 거래일(1시간) 기준 일봉 */
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
type ChartTimeframe =
  | "30s"
  | "1m"
  | "3m"
  | "5m"
  | "10m"
  | "30m"
  | "1d"
  | "1w"
  | "1mo"
  | "1y";

const TIMEFRAMES: Array<{ id: ChartTimeframe; label: string }> = [
  { id: "30s", label: "30초" },
  { id: "1m", label: "1분" },
  { id: "3m", label: "3분" },
  { id: "5m", label: "5분" },
  { id: "10m", label: "10분" },
  { id: "30m", label: "30분" },
  { id: "1d", label: "1일" },
  { id: "1w", label: "1주" },
  { id: "1mo", label: "1달" },
  { id: "1y", label: "1년" },
];

const INTRADAY_INTERVAL_MS: Partial<Record<ChartTimeframe, number>> = {
  "30s": 30_000,
  "1m": 60_000,
  "3m": 3 * 60_000,
  "5m": 5 * 60_000,
  "10m": 10 * 60_000,
  "30m": 30 * 60_000,
};

function aggregateCandlesByTime(candles: Candle[], intervalMs: number): Candle[] {
  const buckets = new Map<number, Candle>();
  for (const candle of candles) {
    const timestamp = Math.floor(candle.timestamp / intervalMs) * intervalMs;
    const current = buckets.get(timestamp);
    if (!current) {
      buckets.set(timestamp, { ...candle, timestamp });
      continue;
    }
    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
  }
  return [...buckets.values()];
}

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
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1m");
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
    const intradaySource =
      candles && candles.length >= historyCandles.length
        ? candles
        : historyCandles;
    const daySource =
      dailyCandles && dailyCandles.length > 0
        ? dailyCandles
        : intradaySource;
    const intradayInterval = INTRADAY_INTERVAL_MS[timeframe];
    const source = intradayInterval
      ? aggregateCandlesByTime(intradaySource, intradayInterval)
      : timeframe === "1d"
        ? daySource
        : aggregateCandlesBySessions(
            daySource,
            timeframe === "1w" ? 5 : timeframe === "1mo" ? 20 : 240,
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
        timeVisible: Boolean(INTRADAY_INTERVAL_MS[timeframe]),
        secondsVisible: timeframe === "30s",
        rightOffset: 4,
        barSpacing: INTRADAY_INTERVAL_MS[timeframe] ? 12 : 9,
        minBarSpacing: INTRADAY_INTERVAL_MS[timeframe] ? 6 : 4,
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
    <div className="mb-1 flex gap-1 overflow-x-auto px-1 pt-1">
      {TIMEFRAMES.map((item) => (
        <button
          key={item.id}
          type="button"
          onClick={() => onChange(item.id)}
          className={`shrink-0 rounded-lg px-3 py-1.5 text-xs transition ${
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

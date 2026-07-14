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
import {
  relativeStrengthIndex,
  simpleMovingAverage,
} from "@/lib/market/chartIndicators";

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

/**
 * lightweight-charts 는 유한값·시간 오름차순·중복 없는 데이터만 허용하며, 하나라도
 * 어기면 setData 가 예외를 던져 페이지 전체가 죽는다(Application error). 결정론
 * 리플레이가 비정상값(NaN/Infinity)이나 순서 흐트러짐을 만들 수 있으므로 방어적으로 정제한다.
 */
function sanitizeCandles(candles: Candle[]): Candle[] {
  const finite = candles.filter(
    (c) =>
      Number.isFinite(c.timestamp) &&
      Number.isFinite(c.open) &&
      Number.isFinite(c.high) &&
      Number.isFinite(c.low) &&
      Number.isFinite(c.close),
  );
  finite.sort((a, b) => a.timestamp - b.timestamp);
  const out: Candle[] = [];
  for (const c of finite) {
    const last = out[out.length - 1];
    if (last && last.timestamp === c.timestamp) out[out.length - 1] = c;
    else out.push(c);
  }
  return out;
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
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("30s");
  const [showMa5, setShowMa5] = useState(true);
  const [showMa20, setShowMa20] = useState(false);
  const [showRsi, setShowRsi] = useState(false);
  const [trendMode, setTrendMode] = useState(false);
  const [trendPoints, setTrendPoints] = useState<Array<{ time: UTCTimestamp; price: number }>>([]);
  const [isMobile, setIsMobile] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const avgLineRef = useRef<IPriceLine | null>(null);
  const prevCloseLineRef = useRef<IPriceLine | null>(null);
  const ma5Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const ma20Ref = useRef<ISeriesApi<"Line"> | null>(null);
  const trendRef = useRef<ISeriesApi<"Line"> | null>(null);
  const trendModeRef = useRef(false);
  const initialFitDoneRef = useRef(false);
  const chartHeight = isMobile && mobileHeight ? mobileHeight : height;

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    trendModeRef.current = trendMode;
  }, [trendMode]);

  const visibleCandles = useMemo(() => {
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
    return sanitizeCandles(source);
  }, [candles, dailyCandles, history, timeframe]);
  const data = useMemo(() => toSeriesData(visibleCandles), [visibleCandles]);
  const rsiData = useMemo(
    () => relativeStrengthIndex(visibleCandles, 14),
    [visibleCandles],
  );
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
    const ma5 = chart.addLineSeries({
      color: "#f2b94b",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const ma20 = chart.addLineSeries({
      color: "#a78bfa",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: false,
    });
    const trend = chart.addLineSeries({
      color: "#22d3ee",
      lineWidth: 2,
      lineStyle: LineStyle.Dashed,
      priceLineVisible: false,
      lastValueVisible: false,
    });

    chart.subscribeClick((parameter) => {
      if (!trendModeRef.current || !parameter.point || parameter.time === undefined) return;
      const price = series.coordinateToPrice(parameter.point.y);
      if (price === null || typeof parameter.time !== "number") return;
      const point = { time: parameter.time as UTCTimestamp, price };
      setTrendPoints((current) =>
        current.length >= 2 ? [point] : [...current, point],
      );
    });

    chartRef.current = chart;
    seriesRef.current = series;
    ma5Ref.current = ma5;
    ma20Ref.current = ma20;
    trendRef.current = trend;
    initialFitDoneRef.current = false;

    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      avgLineRef.current = null;
      prevCloseLineRef.current = null;
      ma5Ref.current = null;
      ma20Ref.current = null;
      trendRef.current = null;
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

  useEffect(() => {
    const ma5 = ma5Ref.current;
    const ma20 = ma20Ref.current;
    if (!ma5 || !ma20) return;
    ma5.setData(
      showMa5
        ? simpleMovingAverage(visibleCandles, 5).map((point) => ({
            time: ((point.timestamp + TZ_OFFSET_MS) / 1000) as UTCTimestamp,
            value: point.value,
          }))
        : [],
    );
    ma20.setData(
      showMa20
        ? simpleMovingAverage(visibleCandles, 20).map((point) => ({
            time: ((point.timestamp + TZ_OFFSET_MS) / 1000) as UTCTimestamp,
            value: point.value,
          }))
        : [],
    );
  }, [showMa5, showMa20, visibleCandles, timeframe]);

  useEffect(() => {
    const trend = trendRef.current;
    if (!trend) return;
    trend.setData(
      trendPoints.length === 2
        ? [...trendPoints]
            .sort((left, right) => Number(left.time) - Number(right.time))
            .map((point) => ({ time: point.time, value: point.price }))
        : [],
    );
  }, [trendPoints, timeframe]);

  useEffect(() => {
    setTrendPoints([]);
  }, [timeframe]);

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
        <IndicatorToolbar
          showMa5={showMa5}
          showMa20={showMa20}
          showRsi={showRsi}
          trendMode={trendMode}
          onMa5={() => setShowMa5((value) => !value)}
          onMa20={() => setShowMa20((value) => !value)}
          onRsi={() => setShowRsi((value) => !value)}
          onTrend={() => setTrendMode((value) => !value)}
          onClearTrend={() => setTrendPoints([])}
        />
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
      <IndicatorToolbar
        showMa5={showMa5}
        showMa20={showMa20}
        showRsi={showRsi}
        trendMode={trendMode}
        onMa5={() => setShowMa5((value) => !value)}
        onMa20={() => setShowMa20((value) => !value)}
        onRsi={() => setShowRsi((value) => !value)}
        onTrend={() => setTrendMode((value) => !value)}
        onClearTrend={() => setTrendPoints([])}
      />
      <div ref={containerRef} style={{ height: chartHeight }} />
      {trendMode && (
        <p className="px-2 pb-1 text-[10px] text-cyan-300">
          차트에서 시작점과 끝점을 차례로 누르세요. 세 번째 점은 새 추세선을 시작합니다.
        </p>
      )}
      {showRsi && <RsiPanel points={rsiData} />}
    </div>
  );
}

function IndicatorToolbar({
  showMa5,
  showMa20,
  showRsi,
  trendMode,
  onMa5,
  onMa20,
  onRsi,
  onTrend,
  onClearTrend,
}: {
  showMa5: boolean;
  showMa20: boolean;
  showRsi: boolean;
  trendMode: boolean;
  onMa5: () => void;
  onMa20: () => void;
  onRsi: () => void;
  onTrend: () => void;
  onClearTrend: () => void;
}) {
  const button = (active: boolean) =>
    `min-h-9 rounded-lg border px-2.5 text-[11px] font-semibold ${active ? "border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]" : "border-[var(--border)] text-[var(--muted)]"}`;
  return (
    <div className="mb-1 flex flex-wrap gap-1 px-1">
      <button type="button" onClick={onMa5} className={button(showMa5)}>이평 5</button>
      <button type="button" onClick={onMa20} className={button(showMa20)}>이평 20</button>
      <button type="button" onClick={onRsi} className={button(showRsi)}>RSI 14</button>
      <button type="button" onClick={onTrend} className={button(trendMode)}>2점 추세선</button>
      <button type="button" onClick={onClearTrend} className={button(false)}>추세선 삭제</button>
    </div>
  );
}

function RsiPanel({ points }: { points: Array<{ timestamp: number; value: number }> }) {
  const width = 600;
  const height = 92;
  const path = points.length > 1
    ? points.map((point, index) => {
        const x = (index / (points.length - 1)) * width;
        const y = height - (point.value / 100) * height;
        return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ")
    : "";
  const latest = points[points.length - 1]?.value;
  return (
    <div className="mt-1 rounded-xl bg-[var(--background)] px-2 py-2">
      <div className="mb-1 flex justify-between text-[10px] text-[var(--muted)]">
        <span>RSI 14 · 과매수 70 / 과매도 30</span>
        <span className={latest !== undefined && latest >= 70 ? "text-[var(--up)]" : latest !== undefined && latest <= 30 ? "text-[var(--down)]" : ""}>
          {latest === undefined ? "수집 중" : latest.toFixed(1)}
        </span>
      </div>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-20 w-full" preserveAspectRatio="none" aria-label="RSI 14 차트">
        <line x1="0" y1={height * 0.3} x2={width} y2={height * 0.3} stroke="#f04452" strokeDasharray="4 4" opacity="0.45" />
        <line x1="0" y1={height * 0.7} x2={width} y2={height * 0.7} stroke="#3182f6" strokeDasharray="4 4" opacity="0.45" />
        {path && <path d={path} fill="none" stroke="#22d3ee" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
      </svg>
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

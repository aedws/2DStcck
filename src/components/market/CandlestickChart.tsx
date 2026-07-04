"use client";

import { useMemo } from "react";
import type { PricePoint } from "@/lib/types/market";
import { buildCandles } from "@/lib/market/engine";
import { getChangePercent } from "@/lib/market/engine";

interface CandlestickChartProps {
  history: PricePoint[];
  height?: number;
  averagePrice?: number;
  prevDayClose?: number;
}

export function CandlestickChart({
  history,
  height = 320,
  averagePrice,
  prevDayClose,
}: CandlestickChartProps) {
  const candles = useMemo(() => buildCandles(history), [history]);

  if (candles.length < 2) {
    return (
      <div
        className="flex items-center justify-center rounded-2xl bg-[var(--surface)] text-sm text-[var(--muted)]"
        style={{ height }}
      >
        캔들 차트 수집 중...
      </div>
    );
  }

  const width = 720;
  const padTop = 24;
  const padBottom = 28;
  const padLeft = 56;
  const padRight = 16;
  const chartH = height - padTop - padBottom;
  const chartW = width - padLeft - padRight;

  const allPrices = candles.flatMap((c) => [c.high, c.low]);
  if (averagePrice) allPrices.push(averagePrice);
  if (prevDayClose) allPrices.push(prevDayClose);

  const min = Math.min(...allPrices);
  const max = Math.max(...allPrices);
  const range = max - min || 1;

  const toY = (price: number) =>
    padTop + chartH - ((price - min) / range) * chartH;

  const candleW = Math.max(4, Math.min(14, chartW / candles.length - 2));
  const gap = chartW / candles.length;

  const avgY = averagePrice ? toY(averagePrice) : null;
  const avgPct =
    averagePrice && averagePrice > 0
      ? getChangePercent(
          candles[candles.length - 1].close,
          averagePrice,
        )
      : null;

  return (
    <div className="rounded-2xl bg-[var(--surface)] p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full">
        {/* grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((r) => {
          const y = padTop + chartH * r;
          const price = Math.round(max - range * r);
          return (
            <g key={r}>
              <line
                x1={padLeft}
                x2={width - padRight}
                y1={y}
                y2={y}
                stroke="var(--border)"
                strokeWidth="0.5"
              />
              <text
                x={padLeft - 6}
                y={y + 4}
                textAnchor="end"
                fill="var(--muted)"
                fontSize="10"
              >
                {price.toLocaleString()}
              </text>
            </g>
          );
        })}

        {/* prev day close reference */}
        {prevDayClose && (
          <line
            x1={padLeft}
            x2={width - padRight}
            y1={toY(prevDayClose)}
            y2={toY(prevDayClose)}
            stroke="var(--muted)"
            strokeWidth="1"
            strokeDasharray="4 3"
            opacity="0.5"
          />
        )}

        {/* average price line */}
        {avgY !== null && averagePrice && (
          <>
            <line
              x1={padLeft}
              x2={width - padRight}
              y1={avgY}
              y2={avgY}
              stroke="var(--accent)"
              strokeWidth="1.5"
              strokeDasharray="6 4"
            />
            <rect
              x={padLeft}
              y={avgY - 10}
              width={88}
              height={18}
              rx={4}
              fill="var(--accent)"
            />
            <text
              x={padLeft + 44}
              y={avgY + 3}
              textAnchor="middle"
              fill="white"
              fontSize="10"
              fontWeight="600"
            >
              내 평단 {avgPct !== null ? `${avgPct >= 0 ? "+" : ""}${avgPct.toFixed(2)}%` : ""}
            </text>
          </>
        )}

        {/* candles */}
        {candles.map((c, i) => {
          const x = padLeft + i * gap + gap / 2;
          const isUp = c.close >= c.open;
          const color = isUp ? "var(--up)" : "var(--down)";
          const bodyTop = toY(Math.max(c.open, c.close));
          const bodyBottom = toY(Math.min(c.open, c.close));
          const bodyH = Math.max(1, bodyBottom - bodyTop);
          const wickTop = toY(c.high);
          const wickBottom = toY(c.low);

          return (
            <g key={c.timestamp}>
              <line
                x1={x}
                x2={x}
                y1={wickTop}
                y2={wickBottom}
                stroke={color}
                strokeWidth="1"
              />
              <rect
                x={x - candleW / 2}
                y={bodyTop}
                width={candleW}
                height={bodyH}
                fill={color}
                rx="0.5"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

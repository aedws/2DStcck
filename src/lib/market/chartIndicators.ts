import type { Candle } from "@/lib/types/market";

export interface IndicatorPoint {
  timestamp: number;
  value: number;
}

export function simpleMovingAverage(
  candles: Candle[],
  period: number,
): IndicatorPoint[] {
  const window = Math.max(1, Math.floor(period));
  if (candles.length < window) return [];
  const points: IndicatorPoint[] = [];
  let sum = 0;
  for (let index = 0; index < candles.length; index++) {
    sum += candles[index].close;
    if (index >= window) sum -= candles[index - window].close;
    if (index >= window - 1) {
      points.push({ timestamp: candles[index].timestamp, value: sum / window });
    }
  }
  return points;
}

/** Wilder 방식 RSI. 첫 평균 이후에는 직전 평균을 완만하게 갱신한다. */
export function relativeStrengthIndex(
  candles: Candle[],
  period = 14,
): IndicatorPoint[] {
  const window = Math.max(2, Math.floor(period));
  if (candles.length <= window) return [];
  let gains = 0;
  let losses = 0;
  for (let index = 1; index <= window; index++) {
    const change = candles[index].close - candles[index - 1].close;
    gains += Math.max(0, change);
    losses += Math.max(0, -change);
  }
  let averageGain = gains / window;
  let averageLoss = losses / window;
  const points: IndicatorPoint[] = [];

  for (let index = window; index < candles.length; index++) {
    if (index > window) {
      const change = candles[index].close - candles[index - 1].close;
      averageGain = (averageGain * (window - 1) + Math.max(0, change)) / window;
      averageLoss = (averageLoss * (window - 1) + Math.max(0, -change)) / window;
    }
    const value =
      averageLoss === 0
        ? averageGain === 0
          ? 50
          : 100
        : 100 - 100 / (1 + averageGain / averageLoss);
    points.push({ timestamp: candles[index].timestamp, value });
  }
  return points;
}

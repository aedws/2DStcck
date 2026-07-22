import type { Candle } from "@/lib/types/market";

export interface IndicatorPoint {
  timestamp: number;
  value: number;
}

export interface BandPoint {
  timestamp: number;
  upper: number;
  middle: number;
  lower: number;
}

export interface VolumePoint {
  timestamp: number;
  volume: number;
  up: boolean;
}

/**
 * 가장 최근 거래일 봉은 장중 계속 움직이므로 그 직전 거래일의 마지막 종가만 반환한다.
 * 차트 주기가 30초여도 전일선은 거래일(sessionMs) 경계에서만 한 번 갱신된다.
 */
export function resolvePreviousSessionClose(
  dailyCandles: readonly Candle[],
  sessionMs: number,
  fallback?: number,
): number | undefined {
  if (!(sessionMs > 0)) return fallback;

  let latestSession = Number.NEGATIVE_INFINITY;
  const closes = new Map<number, { timestamp: number; close: number }>();
  for (const candle of dailyCandles) {
    if (
      !Number.isFinite(candle.timestamp) ||
      !Number.isFinite(candle.close) ||
      !(candle.close > 0)
    ) {
      continue;
    }
    const session = Math.floor(candle.timestamp / sessionMs);
    latestSession = Math.max(latestSession, session);
    const saved = closes.get(session);
    if (!saved || candle.timestamp >= saved.timestamp) {
      closes.set(session, { timestamp: candle.timestamp, close: candle.close });
    }
  }

  let previousSession = Number.NEGATIVE_INFINITY;
  for (const session of closes.keys()) {
    if (session < latestSession && session > previousSession) {
      previousSession = session;
    }
  }
  return closes.get(previousSession)?.close ?? fallback;
}

/** FNV-1a → [0,1). 캔들 타임스탬프로 재현 가능한 값을 뽑는다. */
function hashUnit(seed: number): number {
  let hash = 2166136261;
  const text = String(seed);
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
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

/** 지수이동평균(EMA) — SMA보다 최근값에 빠르게 반응해 단타·스켈핑에 적합. */
export function exponentialMovingAverage(
  candles: Candle[],
  period: number,
): IndicatorPoint[] {
  const window = Math.max(1, Math.floor(period));
  if (candles.length < window) return [];
  const multiplier = 2 / (window + 1);
  const points: IndicatorPoint[] = [];
  // 시드는 첫 window 구간 SMA로 잡아 초반 튐을 줄인다.
  let sum = 0;
  for (let index = 0; index < window; index++) sum += candles[index].close;
  let ema = sum / window;
  points.push({ timestamp: candles[window - 1].timestamp, value: ema });
  for (let index = window; index < candles.length; index++) {
    ema = (candles[index].close - ema) * multiplier + ema;
    points.push({ timestamp: candles[index].timestamp, value: ema });
  }
  return points;
}

/**
 * 결정론 가상 거래량 — 가격 엔진을 건드리지 않고 캔들의 몸통·범위와 시드
 * 노이즈로 재현 가능한 거래량을 만든다. 리플레이마다 동일하다. VWAP·거래량 바의
 * 가중치로만 쓰이며 실제 유동성이 아니라 '흐름의 세기' 표현이다.
 */
export function deterministicCandleVolume(candle: Candle): number {
  const bodyCents = Math.abs(candle.close - candle.open);
  const rangeCents = Math.max(0, candle.high - candle.low);
  const activity = bodyCents + rangeCents * 0.6; // 센트 단위 움직임
  const noise = 0.55 + hashUnit(candle.timestamp) * 0.9; // 0.55~1.45배
  const base = activity / 100 + 1; // $ 환산 + 최소 1
  return Math.max(1, Math.round(base * noise * 20));
}

/** 캔들별 결정론 거래량 바(상승/하락 색 구분용 플래그 포함). */
export function candleVolumes(candles: Candle[]): VolumePoint[] {
  return candles.map((candle) => ({
    timestamp: candle.timestamp,
    volume: deterministicCandleVolume(candle),
    up: candle.close >= candle.open,
  }));
}

/**
 * VWAP(거래량 가중 평균가). 거래일(세션) 경계에서 리셋한다 — 스켈핑의 1순위
 * 앵커로, 가격이 이 선 위/아래로 되돌아오는지를 본다. 거래량은 결정론 가상값.
 */
export function volumeWeightedAveragePrice(
  candles: Candle[],
  sessionMs: number,
): IndicatorPoint[] {
  const points: IndicatorPoint[] = [];
  let currentSession: number | null = null;
  let cumulativePV = 0;
  let cumulativeVolume = 0;
  for (const candle of candles) {
    const session = Math.floor(candle.timestamp / sessionMs);
    if (session !== currentSession) {
      currentSession = session;
      cumulativePV = 0;
      cumulativeVolume = 0;
    }
    const typical = (candle.high + candle.low + candle.close) / 3;
    const volume = deterministicCandleVolume(candle);
    cumulativePV += typical * volume;
    cumulativeVolume += volume;
    points.push({
      timestamp: candle.timestamp,
      value: cumulativeVolume > 0 ? cumulativePV / cumulativeVolume : typical,
    });
  }
  return points;
}

/** 볼린저 밴드(기본 20, 2σ). 밴드 태그 후 평균회귀 진입에 쓴다. */
export function bollingerBands(
  candles: Candle[],
  period = 20,
  multiplier = 2,
): BandPoint[] {
  const window = Math.max(2, Math.floor(period));
  if (candles.length < window) return [];
  const points: BandPoint[] = [];
  for (let index = window - 1; index < candles.length; index++) {
    let sum = 0;
    for (let offset = 0; offset < window; offset++) {
      sum += candles[index - offset].close;
    }
    const mean = sum / window;
    let variance = 0;
    for (let offset = 0; offset < window; offset++) {
      const diff = candles[index - offset].close - mean;
      variance += diff * diff;
    }
    const sd = Math.sqrt(variance / window);
    points.push({
      timestamp: candles[index].timestamp,
      upper: mean + multiplier * sd,
      middle: mean,
      lower: mean - multiplier * sd,
    });
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

import assert from "node:assert";
import {
  bollingerBands,
  candleVolumes,
  deterministicCandleVolume,
  exponentialMovingAverage,
  simpleMovingAverage,
  volumeWeightedAveragePrice,
} from "../src/lib/market/chartIndicators";
import type { Candle } from "../src/lib/types/market";

const SESSION_MS = 60 * 60 * 1000;

function candle(ts: number, o: number, h: number, l: number, c: number): Candle {
  return { timestamp: ts, open: o, high: h, low: l, close: c };
}

// ── 결정론 거래량: 같은 캔들 → 항상 같은 값, 항상 양수 ──
const c1 = candle(1_000, 10_000, 10_200, 9_900, 10_100);
assert.equal(deterministicCandleVolume(c1), deterministicCandleVolume(c1));
assert.ok(deterministicCandleVolume(c1) >= 1);
// 움직임이 큰 캔들이 더 큰 거래량(같은 시드가 아니어도 대체로) — 극단 비교로 검증
const calm = candle(2_000, 10_000, 10_010, 9_990, 10_000);
const wild = candle(2_000, 10_000, 12_000, 8_000, 11_500); // 같은 ts(같은 노이즈)
assert.ok(
  deterministicCandleVolume(wild) > deterministicCandleVolume(calm),
  "범위가 큰 캔들의 거래량이 더 커야 한다",
);

// candleVolumes: up 플래그 = 종가>=시가
const vols = candleVolumes([
  candle(1_000, 100, 110, 95, 108), // up
  candle(2_000, 108, 109, 100, 101), // down
]);
assert.equal(vols.length, 2);
assert.equal(vols[0].up, true);
assert.equal(vols[1].up, false);

// ── EMA: 상수열이면 EMA도 그 상수, 개수 = n - period + 1 ──
const flat: Candle[] = Array.from({ length: 10 }, (_, i) =>
  candle(i * 1000, 500, 500, 500, 500),
);
const ema = exponentialMovingAverage(flat, 5);
assert.equal(ema.length, 10 - 5 + 1);
for (const point of ema) assert.ok(Math.abs(point.value - 500) < 1e-9);
// 데이터가 기간보다 짧으면 빈 배열
assert.deepEqual(exponentialMovingAverage(flat.slice(0, 3), 5), []);
// EMA는 SMA보다 최근값에 빠르게 반응: 상승 계단에서 EMA 마지막 >= SMA 마지막
const rising: Candle[] = Array.from({ length: 12 }, (_, i) =>
  candle(i * 1000, 100 + i, 100 + i, 100 + i, 100 + i),
);
const emaR = exponentialMovingAverage(rising, 5);
const smaR = simpleMovingAverage(rising, 5);
assert.ok(
  emaR[emaR.length - 1].value >= smaR[smaR.length - 1].value,
  "상승 추세에서 EMA가 SMA보다 크거나 같아야 한다",
);

// ── VWAP: 상수 가격이면 VWAP도 그 값 ──
const vwapFlat = volumeWeightedAveragePrice(flat, SESSION_MS);
assert.equal(vwapFlat.length, flat.length);
for (const point of vwapFlat) assert.ok(Math.abs(point.value - 500) < 1e-9);
// 세션 경계에서 리셋: 두 세션에 걸친 캔들의 마지막 VWAP은 두 번째 세션만 반영
const twoSessions: Candle[] = [
  candle(10_000, 100, 100, 100, 100), // 세션 0
  candle(20_000, 100, 100, 100, 100), // 세션 0
  candle(SESSION_MS + 10_000, 200, 200, 200, 200), // 세션 1
];
const vwap2 = volumeWeightedAveragePrice(twoSessions, SESSION_MS);
assert.ok(
  Math.abs(vwap2[vwap2.length - 1].value - 200) < 1e-9,
  "세션 경계에서 VWAP이 리셋돼야 한다",
);

// ── 볼린저 밴드: 상수열이면 상·중·하 모두 동일(σ=0) ──
const boll = bollingerBands(flat, 5, 2);
assert.equal(boll.length, 10 - 5 + 1);
for (const point of boll) {
  assert.ok(Math.abs(point.upper - 500) < 1e-9);
  assert.ok(Math.abs(point.middle - 500) < 1e-9);
  assert.ok(Math.abs(point.lower - 500) < 1e-9);
}
// 변동이 있으면 상단>중앙>하단
const varied: Candle[] = [100, 102, 98, 105, 95, 110].map((p, i) =>
  candle(i * 1000, p, p, p, p),
);
const bollV = bollingerBands(varied, 5, 2);
const lastV = bollV[bollV.length - 1];
assert.ok(lastV.upper > lastV.middle && lastV.middle > lastV.lower);

console.log("✅ chart-indicators: EMA·VWAP·볼린저·결정론 거래량 통과");

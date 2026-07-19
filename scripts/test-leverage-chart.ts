/**
 * 레버리지 ETF 차트 분할조정 회귀 테스트. 표시가는 분할 때 ÷5로 튀어 차트에
 * 절벽이 생긴다. leverageAdjustedCandles는 기초자산에서 연속 시계열을 재구성해
 * 절벽을 없애고, 최신 값은 현재 표시가와 일치해야 한다.
 */
import assert from "node:assert";
import { createGenesisStocks } from "../src/lib/market/localSim";
import {
  computeLeveragedRawPrice,
  computeLeveragedPrice,
  leverageDisplayPrice,
  leverageAdjustedCandles,
} from "../src/lib/market/engine";
import { LEVERAGE_SPLIT_AT } from "../src/lib/market/constants";
import type { Candle, StockState } from "../src/lib/types/market";

const base = createGenesisStocks();
const etf = base.find((s) => s.id === "vnsl2")!; // 2x 레버리지 (기초 vnasdaq)
const under = base.find((s) => s.id === "vnasdaq")!;
const uInit = under.initialPrice;

// 기초자산가가 분할 경계를 관통하도록 완만히 상승하는 캔들열을 만든다.
// raw = etfInit*(u/uInit)^2 이 LEVERAGE_SPLIT_AT를 넘어가는 구간.
const uCross = uInit * Math.sqrt(LEVERAGE_SPLIT_AT / etf.initialPrice); // raw=SPLIT_AT
const uStart = uCross * 0.97;
const uEnd = uCross * 1.05;
const N = 40;
const underlyingCandles: Candle[] = [];
for (let i = 0; i < N; i++) {
  const u = uStart + ((uEnd - uStart) * i) / (N - 1);
  underlyingCandles.push({ timestamp: i * 30_000, open: u, high: u, low: u, close: u });
}
const uLatest = underlyingCandles[N - 1].close;
const underlyingLatest: StockState = { ...under, currentPrice: uLatest };

// 분할이 실제로 구간 안에서 일어나는지 확인 (naive 표시가에 절벽이 생김)
const naive = underlyingCandles.map(
  (c) => leverageDisplayPrice(computeLeveragedRawPrice(etf.initialPrice, c.close, uInit, 2)),
);
let naiveMinRatio = Infinity;
for (let i = 1; i < naive.length; i++) {
  naiveMinRatio = Math.min(naiveMinRatio, naive[i] / naive[i - 1]);
}
assert.ok(
  naiveMinRatio < 0.5,
  `분할 표시가에 절벽이 있어야(테스트 전제): minRatio=${naiveMinRatio}`,
);

// 분할조정 캔들: 절벽 없이 연속이어야 한다.
const adjusted = leverageAdjustedCandles(etf, underlyingLatest, underlyingCandles);
let maxRatio = 0;
let minRatio = Infinity;
for (let i = 1; i < adjusted.length; i++) {
  const r = adjusted[i].close / adjusted[i - 1].close;
  maxRatio = Math.max(maxRatio, r);
  minRatio = Math.min(minRatio, r);
}
assert.ok(
  maxRatio < 1.2 && minRatio > 0.83,
  `분할조정 시계열이 연속이어야: min=${minRatio} max=${maxRatio}`,
);

// 최신 조정값 ≈ 현재 표시가(호가와 일치).
const currentDisplay = computeLeveragedPrice(etf, underlyingLatest);
const lastAdjusted = adjusted[adjusted.length - 1].close;
assert.ok(
  Math.abs(lastAdjusted - currentDisplay) / currentDisplay < 0.01,
  `최신 조정값이 현재 표시가와 일치해야: adjusted=${lastAdjusted} display=${currentDisplay}`,
);

console.log(
  `✅ leverage-chart: 분할 절벽 제거 (naive minRatio ${naiveMinRatio.toFixed(2)} → 조정 [${minRatio.toFixed(2)}, ${maxRatio.toFixed(2)}]), 최신=현재표시가`,
);

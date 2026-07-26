/**
 * 변동성 감가로 원가격이 예전 1e-12 하한에 붙어 표시가·차트가 한 값에 고정되던
 * (미노리 2배 인버스) 문제의 회귀 테스트. 리베이스(감가분을 좌수 배수에 접어 넣고
 * 원가격 하한·분할 반복 상한을 넓힘)로,
 *  1) 극단 감가 상품도 표시가가 밴드에 안착하고(≠ $0.01 고정),
 *  2) 기초자산이 움직이면 표시가도 함께 움직이며(차트가 살아 있음),
 *  3) 감가 전후 보유 가치가 보존됨(가치 중립)
 * 을 확인한다.
 */
import assert from "node:assert";
import { createGenesisStocks } from "../src/lib/market/localSim";
import {
  computeLeveragedSnapshot,
  computeLeveragedRawPrice,
  leverageSplitMultiplier,
} from "../src/lib/market/engine";
import {
  LEVERAGE_MERGE_AT,
  LEVERAGE_SPLIT_AT,
} from "../src/lib/market/constants";
import type { StockState } from "../src/lib/types/market";

const base = createGenesisStocks();
const underlying = base.find((s) => s.id === "minori")!;
const etf = base.find((s) => s.id === "minori-inverse-2x")!;
assert.ok(underlying && etf, "minori/-2x 종목이 있어야 함");

// 누적계수를 극단으로 감가시킨 상태(예전 하한 1e-12보다 한참 아래)를 구성한다.
const decayedUnderlying: StockState = {
  ...underlying,
  leveragePathSessionBase: underlying.initialPrice,
  leveragePathSessionId: 0,
  daySessionId: 0,
  currentPrice: underlying.initialPrice,
  dayOpen: underlying.initialPrice,
  leveragePathFactors: { "-2": 1e-40, "-1": 1e-20, "2": 1e-20 },
};

// 1) 극단 감가 상태에서도 표시가가 밴드 안이어야 한다($0.01 고정 금지).
const snap0 = computeLeveragedSnapshot(etf, decayedUnderlying);
assert.ok(
  snap0.currentPrice >= 1 && snap0.currentPrice <= LEVERAGE_SPLIT_AT,
  `극단 감가 표시가가 밴드 안이어야: ${snap0.currentPrice}`,
);
assert.ok(
  snap0.currentPrice > 1,
  `표시가가 $0.01(1센트) 바닥에 고정되면 안 됨: ${snap0.currentPrice}`,
);
assert.ok(
  snap0.rawPrice < 1e-12,
  `테스트 전제: 원가격이 예전 하한 1e-12보다 작아야: ${snap0.rawPrice}`,
);

// 2) 기초자산을 여러 값으로 움직였을 때 표시가가 서로 달라야 한다(차트가 산다).
const displays = new Set<number>();
for (const ret of [-0.4, -0.2, 0, 0.2, 0.4]) {
  const u = { ...decayedUnderlying, currentPrice: underlying.initialPrice * (1 + ret) };
  displays.add(computeLeveragedSnapshot(etf, u).currentPrice);
}
// 예전엔 원가격이 1e-12 바닥에 붙어 모든 값이 한 값(예: $11.25)에 고정됐다.
// 이제 밴드 안에서 서로 다른 값으로 움직인다(밴드 경계에서 일부 버킷은 겹칠 수 있음).
assert.ok(
  displays.size >= 3,
  `기초자산이 움직이면 표시가도 달라져야(차트 살아있음): 서로 다른 값 ${displays.size}개`,
);

// 인버스 방향성: 기초 하락 → -2x 상승, 기초 상승 → -2x 하락.
const down = computeLeveragedSnapshot(
  etf,
  { ...decayedUnderlying, currentPrice: underlying.initialPrice * 0.8 },
).currentPrice;
const up = computeLeveragedSnapshot(
  etf,
  { ...decayedUnderlying, currentPrice: underlying.initialPrice * 1.2 },
).currentPrice;
assert.ok(down > up, `인버스: 기초 하락 표시가(${down}) > 기초 상승 표시가(${up})`);

// 3) 가치 보존: 좌수 × 표시가는 배수가 바뀌어도 (감가/분할과 무관하게) raw에 비례.
//    보유 1,000좌를 기준 배수에서 각인하고, 감가가 더 진행돼도 가치가 보존되는지 본다.
function heldValue(rawShares: number, uReturn: number): number {
  const u = { ...decayedUnderlying, currentPrice: underlying.initialPrice * (1 + uReturn) };
  const snap = computeLeveragedSnapshot(etf, u);
  // 실제 보유 좌수 = 원좌수 × 현재 배수, 가치 = 보유좌수 × 표시가 = 원좌수 × raw.
  const heldQty = rawShares * snap.splitMultiplier;
  return heldQty * snap.currentPrice;
}
const vA = heldValue(1000, -0.2);
const vRaw =
  1000 *
  computeLeveragedRawPrice(
    Math.max(etf.initialPrice * 1e-40, 0),
    underlying.initialPrice * 0.8,
    underlying.initialPrice,
    -2,
  );
// 표시가는 정수 센트로 반올림되므로 밴드 하단에서 최대 ~0.1% 오차가 난다.
// 가치가 복사/소멸되지 않고 보존됨을 확인하는 것이 목적이라 반올림 여유를 둔다.
assert.ok(
  Math.abs(vA - vRaw) / Math.max(vRaw, 1e-300) < 5e-3,
  `보유 가치(좌수×표시가)가 원가격 기준 가치와 일치해야: ${vA} vs ${vRaw}`,
);

// 병합 배수가 밴드로 되돌리는지: 임의의 극소 raw가 밴드 표시가를 만든다.
for (const raw of [1e-20, 1e-40, 1e-80, 1e-150]) {
  const m = leverageSplitMultiplier(raw);
  const disp = raw / m;
  assert.ok(
    disp >= LEVERAGE_MERGE_AT / 10 && disp < LEVERAGE_SPLIT_AT,
    `raw=${raw} 표시가 밴드 안이어야: disp=${disp} m=${m}`,
  );
}

console.log(
  `✅ leverage-decay-rebase: 극단 감가에도 표시가 밴드 안(${snap0.currentPrice}센트)·차트 살아있음(${displays.size} distinct)·가치 보존`,
);

/**
 * 레버리지 ETF 액면분할 ↔ 옵션 익스플로잇 회귀 테스트.
 * 버그: ETF가 올라 분할되면 표시가가 ÷5로 리셋되는데 옵션 행사가는 고정이라,
 * 풋이 공짜로 深-ITM이 되어 돈을 찍어냈다(계정 lakelucid: $10만 → $9.97조).
 * 수정: 평가 시 유효 기초자산가 = 표시가 × (현재배수/개시배수)로 밴딩을 제거한다.
 */
import assert from "node:assert";
import { createGenesisStocks } from "../src/lib/market/localSim";
import {
  computeLeveragedPrice,
  leverageMultiplierFor,
} from "../src/lib/market/engine";
import {
  effectiveOptionUnderlyingPrice,
  underlyingSplitMultiplier,
  intrinsic,
} from "../src/lib/market/options";
import type { OptionPosition, StockState } from "../src/lib/types/market";

const base = createGenesisStocks();
const etfDef = base.find((s) => s.id === "vnsl2")!; // 2x 레버리지 (기초 vnasdaq)
const underDef = base.find((s) => s.id === "vnasdaq")!;

function scenario(underlyingPrice: number) {
  const underlying: StockState = { ...underDef, currentPrice: underlyingPrice };
  const etfDisplay = computeLeveragedPrice({ ...etfDef }, underlying);
  const etf: StockState = { ...etfDef, currentPrice: etfDisplay };
  const stocks = [etf, underlying];
  return { etf, underlying, stocks, m: leverageMultiplierFor(etf, underlying), etfDisplay };
}

// 개시: 표시가 밴드 상단 근처($499), 분할 전이라 배수 1
const open = scenario(46910);
assert.equal(open.m, 1, "개시 시 배수 1 (분할 전)");
assert.ok(
  open.etfDisplay >= 48000 && open.etfDisplay < 50000,
  `개시 표시가 밴드 상단 근처여야: ${open.etfDisplay}`,
);

const strike = 48000; // $480 풋
const pos: OptionPosition = {
  id: "t",
  stockId: etfDef.id,
  kind: "put",
  side: "long",
  strike,
  expirySession: 999999,
  quantity: 1,
  openPremium: 1,
  openedAt: 0,
  openSplitMultiplier: underlyingSplitMultiplier(open.etf, open.stocks),
};
assert.equal(pos.openSplitMultiplier, 1, "개시 배수가 포지션에 1로 저장돼야");

// 기초자산 상승 → raw가 $500 돌파 → 5:1 분할 → 표시가 ÷5
const after = scenario(47200);
assert.ok(after.m > open.m, `상승 후 분할로 배수 증가해야: ${after.m}`);
assert.ok(
  after.etfDisplay < 20000,
  `분할로 표시가가 밴드 하단으로 리셋돼야: ${after.etfDisplay}`,
);

// 옛 방식(버그): 표시가로 바로 계산 → ETF가 올랐는데 풋이 폭발
const buggy = intrinsic("put", after.etf.currentPrice, strike);
assert.ok(buggy > 30000, `옛 방식은 분할로 풋이 공짜 ITM: ${buggy}`);

// 수정: 유효 기초자산가로 계산 → 상승장이므로 풋은 무가치(0)
const fixedPrice = effectiveOptionUnderlyingPrice(pos, after.etf, after.stocks);
const fixed = intrinsic("put", fixedPrice, strike);
assert.equal(
  fixed,
  0,
  `수정 후 상승장 풋은 0이어야: fixedPrice=${fixedPrice} intrinsic=${fixed}`,
);

// 불변식: 유효가 × 개시배수 ≈ raw(밴딩 제거 확인)
const raw = after.etf.currentPrice * after.m;
assert.ok(
  Math.abs(fixedPrice * (pos.openSplitMultiplier ?? 1) - raw) <= 5,
  `유효가×개시배수 ≈ raw: ${fixedPrice}×${pos.openSplitMultiplier} vs ${raw}`,
);

// 일반 종목(레버리지 아님)은 배수 1 — 아무 영향 없어야
const plain = base.find((s) => s.sector !== "ETF" && s.leverage == null)!;
assert.equal(underlyingSplitMultiplier(plain, base), 1, "일반 종목 배수는 1");
assert.equal(
  effectiveOptionUnderlyingPrice({ openSplitMultiplier: 1 }, plain, base),
  plain.currentPrice,
  "일반 종목은 유효가 = 표시가",
);

console.log(
  `✅ option-split: 분할 익스플로잇 차단 (옛 $${(buggy / 100).toFixed(0)}/계약 → 수정 $0), 일반 종목 무영향`,
);

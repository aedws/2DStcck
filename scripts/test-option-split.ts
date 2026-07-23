/**
 * 레버리지 ETF 액면분할 ↔ 옵션 익스플로잇 회귀 테스트.
 * 버그: ETF가 올라 분할되면 표시가가 ÷5로 리셋되는데 옵션 행사가는 고정이라,
 * 풋이 공짜로 深-ITM이 되어 돈을 찍어냈다(계정 lakelucid: $10만 → $9.97조).
 * 수정: 평가 시 유효 기초자산가 = 표시가 × (현재배수/개시배수)로 밴딩을 제거한다.
 */
import assert from "node:assert";
import { createGenesisStocks } from "../src/lib/market/localSim";
import {
  computeLeveragedSnapshot,
  normalizeStockSharePrice,
} from "../src/lib/market/engine";
import {
  effectiveOptionUnderlyingPrice,
  underlyingSplitMultiplier,
  intrinsic,
  optionsGrossExposure,
  positionMark,
  shortMarginPerContract,
} from "../src/lib/market/options";
import {
  LEVERAGE_SPLIT_AT,
  SESSION_DURATION_MS,
} from "../src/lib/market/constants";
import type { OptionPosition, StockState } from "../src/lib/types/market";

const base = createGenesisStocks();
const etfDef = base.find((s) => s.id === "vnsl2")!; // 2x 레버리지 (기초 vnasdaq)
const underDef = base.find((s) => s.id === "vnasdaq")!;

// 같은 거래일에 목표 raw 가격을 만드는 기초자산가:
// raw = etfSessionStart × (1 + lev × (u/uBase - 1)), lev=2.
const etfInit = etfDef.initialPrice;
const underInit = underDef.initialPrice;
const underlyingForRaw = (rawTarget: number) =>
  underInit * (1 + (rawTarget / etfInit - 1) / 2);

function scenario(underlyingPrice: number) {
  const underlying: StockState = { ...underDef, currentPrice: underlyingPrice };
  const snapshot = computeLeveragedSnapshot({ ...etfDef }, underlying);
  const etfDisplay = snapshot.currentPrice;
  const etf: StockState = {
    ...etfDef,
    currentPrice: etfDisplay,
    shareMultiplier: snapshot.splitMultiplier,
    lastShareAdjustmentSession: snapshot.lastShareAdjustmentSession,
  };
  const stocks = [etf, underlying];
  return {
    etf,
    underlying,
    stocks,
    m: snapshot.splitMultiplier,
    etfDisplay,
  };
}

// 개시: 표시가 밴드 상단 근처(분할 직전), 배수 1
const open = scenario(underlyingForRaw(LEVERAGE_SPLIT_AT * 0.99));
assert.equal(open.m, 1, "개시 시 배수 1 (분할 전)");
assert.ok(
  open.etfDisplay >= LEVERAGE_SPLIT_AT * 0.9 && open.etfDisplay < LEVERAGE_SPLIT_AT,
  `개시 표시가 밴드 상단 근처여야: ${open.etfDisplay}`,
);

const strike = Math.round(LEVERAGE_SPLIT_AT * 0.96); // 분할 직전 밴드의 ATM 근처 풋
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

// 기초자산 상승 → raw가 분할가 돌파 → 5:1 분할 → 표시가 ÷5
const after = scenario(underlyingForRaw(LEVERAGE_SPLIT_AT * 1.03));
assert.ok(after.m > open.m, `상승 후 분할로 배수 증가해야: ${after.m}`);
assert.ok(
  after.etfDisplay < LEVERAGE_SPLIT_AT * 0.5,
  `분할로 표시가가 밴드 하단으로 리셋돼야: ${after.etfDisplay}`,
);

// 옛 방식(버그): 표시가로 바로 계산 → ETF가 올랐는데 풋이 폭발
const buggy = intrinsic("put", after.etf.currentPrice, strike);
assert.ok(buggy > LEVERAGE_SPLIT_AT * 0.3, `옛 방식은 분할로 풋이 공짜 ITM: ${buggy}`);

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
const plain = base.find(
  (s) =>
    s.sector !== "ETF" &&
    s.sector !== "지수" &&
    s.sector !== "선물" &&
    s.sector !== "급등주" &&
    s.leverage == null,
)!;
assert.equal(underlyingSplitMultiplier(plain, base), 1, "일반 종목 배수는 1");
assert.equal(
  effectiveOptionUnderlyingPrice({ openSplitMultiplier: 1 }, plain, base),
  plain.currentPrice,
  "일반 종목은 유효가 = 표시가",
);

// 일반 종목 10:1 분할도 기존 옵션의 평가·노출·발행 증거금을 바꾸지 않는다.
const plainSession = 500;
const plainBefore: StockState = {
  ...plain,
  currentPrice: 120_000,
  prevDayClose: 120_000,
  dayOpen: 120_000,
  daySessionId: plainSession,
  shareMultiplier: 1,
};
const plainCall: OptionPosition = {
  id: "plain-call",
  stockId: plainBefore.id,
  kind: "call",
  side: "short",
  strike: 100_000,
  expirySession: plainSession + 10,
  quantity: 2,
  openPremium: 1_000,
  openedAt: plainSession * SESSION_DURATION_MS,
  openSplitMultiplier: 1,
};
const plainAfter = normalizeStockSharePrice(
  plainBefore,
  plainSession * SESSION_DURATION_MS,
);
assert.equal(plainAfter.currentPrice, 12_000);
assert.equal(plainAfter.shareMultiplier, 10);
assert.equal(
  effectiveOptionUnderlyingPrice(plainCall, plainAfter, [plainAfter]),
  plainBefore.currentPrice,
  "일반 종목 분할 뒤 옵션 유효 기초가는 분할 전과 같아야",
);
assert.equal(
  positionMark(plainCall, plainAfter, plainSession, 0.03, [plainAfter]),
  positionMark(plainCall, plainBefore, plainSession, 0.03, [plainBefore]),
  "일반 종목 분할 전후 옵션 마크가 같아야",
);
assert.equal(
  optionsGrossExposure(
    [plainCall],
    [plainAfter],
    plainSession,
    0.03,
  ),
  plainBefore.currentPrice * plainCall.quantity,
  "분할 전 옵션 콜 명목노출을 유지해야",
);
assert.equal(
  shortMarginPerContract(plainCall, plainAfter, [plainAfter]),
  plainBefore.currentPrice,
  "분할 전 발행 콜 유지증거금을 유지해야",
);

// 레버리지·인버스 ETF 옵션 변동성 = |배수| × 기초 (0DTE 스트래들 저평가 차단).
for (const [etfId, baseId, mult] of [
  ["wwmne-leverage-2x", "wwmne", 2],
  ["wwmne-inverse-2x", "wwmne", 2],
  ["wwmne-inverse", "wwmne", 1],
] as const) {
  const etf = base.find((s) => s.id === etfId)!;
  const under = base.find((s) => s.id === baseId)!;
  assert.ok(
    Math.abs(etf.volatility - under.volatility * mult) < 1e-9,
    `${etfId} 변동성은 기초×${mult}이어야: ${etf.volatility} vs ${under.volatility * mult}`,
  );
}

console.log(
  `✅ option-split: 분할 익스플로잇 차단 (옛 $${(buggy / 100).toFixed(0)}/계약 → 수정 $0), 레버리지 옵션 변동성 |배수|× 반영, 일반 종목 무영향`,
);

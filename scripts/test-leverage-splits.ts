import assert from "node:assert";
import {
  advanceDailyLeveragePath,
  computeLeveragedSnapshot,
  createInitialStockState,
  leverageSplitMultiplier,
  leverageDisplayPrice,
  computeLeveragedRawPrice,
} from "../src/lib/market/engine";
import {
  LEVERAGE_SPLIT_AT,
  LEVERAGE_MERGE_AT,
  SESSION_DURATION_MS,
} from "../src/lib/market/constants";
import type { StockDefinition } from "../src/lib/types/market";

// 1) 표시가는 항상 밴드 [MERGE_AT, SPLIT_AT) 안에 있어야 한다.
for (let raw = 1; raw <= 5_000_000; raw = Math.ceil(raw * 1.07)) {
  const disp = leverageDisplayPrice(raw);
  assert.ok(
    disp >= LEVERAGE_MERGE_AT - 1 && disp < LEVERAGE_SPLIT_AT,
    `밴드 이탈: raw=${raw} disp=${disp}`,
  );
}

// 2) 분할·병합 배수는 가치 보존: raw = disp * m 근사.
for (const raw of [4000, 5000, 9999, 10000, 50000, 50001, 250000, 1_250_000, 2500, 1250, 100, 10]) {
  const m = leverageSplitMultiplier(raw);
  const disp = leverageDisplayPrice(raw);
  const recovered = disp * m;
  const err = Math.abs(recovered - raw) / raw;
  assert.ok(err < 0.01, `가치 보존 실패: raw=${raw} disp=${disp} m=${m} recovered=${recovered}`);
}

// 3) 경계 동작: $1000 정확히 → 5:1 분할되어 $200.
assert.equal(leverageSplitMultiplier(100000), 5);
assert.equal(leverageDisplayPrice(100000), 20000);
// $999.99 → 분할 없음.
assert.equal(leverageSplitMultiplier(99999), 1);
// $9.99 → 2:1 병합되어 ~$19.98.
assert.equal(leverageSplitMultiplier(999), 0.5);
assert.equal(leverageDisplayPrice(999), 1998);

// 4) 보유분 가치 불변: 매수 시점 배수 m0에서 좌수 q0, 이후 배수 m1이면
//    좌수 q0*(m1/m0), 평단 avg0/(m1/m0), 표시가 raw/m1 → 포지션 가치 = rawQty*raw 불변.
function positionValue(q: number, price: number) {
  return q * price;
}
function assertClose(actual: number, expected: number, message: string) {
  assert.ok(
    Math.abs(actual - expected) < 1e-8,
    `${message}: actual=${actual} expected=${expected}`,
  );
}
// 본주 초기가 5000($50), 레버리지 2배, 초기 ETF가 10000.
const etfInit = 10000;
const u0 = 5000;
const lev = 2;
// 매수: 본주 +40% → raw 상승
const uAtBuy = 7000; // +40%
const rawBuy = computeLeveragedRawPrice(etfInit, uAtBuy, u0, lev);
const mBuy = leverageSplitMultiplier(rawBuy);
const dispBuy = leverageDisplayPrice(rawBuy);
// 표시가 밴드에서 100좌 매수
const dispQty = 100;
// 나중: 본주 +200% → raw 폭등, 여러 번 분할
const uLater = 30000; // +500% — raw가 분할선을 넘음
const rawLater = computeLeveragedRawPrice(etfInit, uLater, u0, lev);
const mLater = leverageSplitMultiplier(rawLater);
const dispLater = leverageDisplayPrice(rawLater);
// 정산: 좌수 scaling
const ratio = mLater / mBuy;
const qtyLater = dispQty * ratio;
const valBuy = positionValue(dispQty, dispBuy);
const valLater = positionValue(qtyLater, dispLater);
// raw 기준 실제 가치 비율과 표시 기준 가치 비율 일치.
const rawValueRatio = rawLater / rawBuy;
const dispValueRatio = valLater / valBuy;
assert.ok(
  Math.abs(rawValueRatio - dispValueRatio) / rawValueRatio < 0.02,
  `분할 후 가치 비율 불일치: raw=${rawValueRatio} disp=${dispValueRatio}`,
);

// 5) 60분 거래일마다 기준을 리셋하고, 완료된 일별 배율 수익률을 복리 누적한다.
const session0 = 100;
const underlyingDefinition: StockDefinition = {
  id: "daily-underlying",
  ticker: "DAY",
  name: "일일 추종 기초",
  sector: "테스트",
  initialPrice: 10_000,
  volatility: 0,
  drift: 0,
};
const derivativeDefinition = (
  leverage: number,
): StockDefinition => ({
  id: `daily-${leverage}`,
  ticker: `D${leverage}`,
  name: `일일 ${leverage}배`,
  sector: "ETF",
  initialPrice: 10_000,
  volatility: 0,
  drift: 0,
  leverage,
  leverageUnderlyingId: underlyingDefinition.id,
});
let dailyUnderlying = createInitialStockState(
  underlyingDefinition,
  session0 * SESSION_DURATION_MS,
);
const plus2 = createInitialStockState(
  derivativeDefinition(2),
  session0 * SESSION_DURATION_MS,
);
const inverse = createInitialStockState(
  derivativeDefinition(-1),
  session0 * SESSION_DURATION_MS,
);
const inverse2 = createInitialStockState(
  derivativeDefinition(-2),
  session0 * SESSION_DURATION_MS,
);

// 첫날 기초 +10%: 산술적으로 정확히 +20%, -10%, -20%.
dailyUnderlying = { ...dailyUnderlying, currentPrice: 11_000, dayOpen: 10_000 };
assertClose(
  computeLeveragedSnapshot(plus2, dailyUnderlying).rawPrice,
  12_000,
  "첫날 2배 레버리지가 +20%를 추종해야 함",
);
assertClose(
  computeLeveragedSnapshot(inverse, dailyUnderlying).rawPrice,
  9_000,
  "첫날 인버스가 -10%를 추종해야 함",
);
assertClose(
  computeLeveragedSnapshot(inverse2, dailyUnderlying).rawPrice,
  8_000,
  "첫날 곱버스가 -20%를 추종해야 함",
);

// 다음 거래일 시작에 첫날 결과를 확정한 뒤 기초가 원점으로 복귀한다.
const session1 = session0 + 1;
dailyUnderlying = {
  ...dailyUnderlying,
  ...advanceDailyLeveragePath(dailyUnderlying, session1),
  daySessionId: session1,
  prevDayClose: 11_000,
  dayOpen: 10_000,
  currentPrice: 10_000,
};
assertClose(dailyUnderlying.leveragePathFactors?.["2"] ?? 0, 1.2, "2배 첫날 확정계수");
assertClose(dailyUnderlying.leveragePathFactors?.["-1"] ?? 0, 0.9, "인버스 첫날 확정계수");
assertClose(dailyUnderlying.leveragePathFactors?.["-2"] ?? 0, 0.8, "곱버스 첫날 확정계수");
assertClose(
  computeLeveragedSnapshot(plus2, dailyUnderlying).rawPrice,
  9_818.181818181818,
  "왕복 변동 뒤 2배 레버리지의 변동성 손실",
);
assertClose(
  computeLeveragedSnapshot(inverse, dailyUnderlying).rawPrice,
  9_818.181818181818,
  "왕복 변동 뒤 인버스의 변동성 손실",
);
assertClose(
  computeLeveragedSnapshot(inverse2, dailyUnderlying).rawPrice,
  9_454.545454545454,
  "왕복 변동 뒤 곱버스의 변동성 손실",
);

console.log("leverage daily-reset · split/merge scenarios passed");

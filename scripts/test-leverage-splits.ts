import assert from "node:assert";
import {
  advanceDailyLeveragePath,
  computeLeveragedSnapshot,
  createInitialStockState,
  leverageSplitMultiplier,
  leverageDisplayPrice,
  computeLeveragedRawPrice,
  normalizeStockSharePrice,
} from "../src/lib/market/engine";
import {
  LEVERAGE_SPLIT_AT,
  LEVERAGE_MERGE_AT,
  SESSION_DURATION_MS,
} from "../src/lib/market/constants";
import type { ShortPosition, StockDefinition } from "../src/lib/types/market";
import {
  reconcileLeveragePositionSplits,
  reconcileSplitAdjustedOrders,
  stampLeveragePositionMultiplier,
} from "../src/lib/market/leveragePositionSplits";
import { executeBuy, isOrderSuccess } from "../src/lib/market/trading";

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

// 6) 공매도도 보유분과 같은 액면 배수를 적용해야 청산 증거금이 보존된다.
const shortUnderlying = {
  ...createInitialStockState(underlyingDefinition, session0 * SESSION_DURATION_MS),
  currentPrice: uLater,
  dayOpen: u0,
};
const shortEtf = {
  ...plus2,
  currentPrice: dispLater,
  shareMultiplier: mLater,
};
const freshShorts: ShortPosition[] = [
  { stockId: shortEtf.id, quantity: dispQty, averagePrice: dispLater },
];
const stampedShort = stampLeveragePositionMultiplier(
  freshShorts,
  shortEtf.id,
  [shortUnderlying, shortEtf],
)[0]!;
assert.ok((stampedShort.splitMultiplier ?? 0) > 0);
const currentShortMultiplier = stampedShort.splitMultiplier!;
const oldFaceShort: ShortPosition = {
  stockId: shortEtf.id,
  quantity: dispQty,
  averagePrice: dispBuy,
  splitMultiplier: currentShortMultiplier * 2,
};
const reconciledShort = reconcileLeveragePositionSplits(
  [oldFaceShort],
  [shortUnderlying, shortEtf],
).positions[0]!;
assertClose(
  reconciledShort.quantity,
  oldFaceShort.quantity / 2,
  "공매 수량 액면 정산",
);
assertClose(
  reconciledShort.quantity * reconciledShort.averagePrice,
  oldFaceShort.quantity * oldFaceShort.averagePrice,
  "공매 진입 원금 가치 보존",
);

// 7) 레버리지·인버스도 액면조정 뒤 5거래일 동안 반대 조정을 막는다.
const splitSession = 700;
const cooldownUnderlying = {
  ...createInitialStockState(
    underlyingDefinition,
    splitSession * SESSION_DURATION_MS,
  ),
  currentPrice: 55_000,
  dayOpen: 10_000,
  daySessionId: splitSession,
  leveragePathSessionBase: 10_000,
};
const cooldownEtf = createInitialStockState(
  derivativeDefinition(2),
  splitSession * SESSION_DURATION_MS,
);
const splitSnapshot = computeLeveragedSnapshot(
  cooldownEtf,
  cooldownUnderlying,
);
assert.equal(splitSnapshot.rawPrice, 100_000);
assert.equal(splitSnapshot.splitMultiplier, 5);
assert.equal(splitSnapshot.lastShareAdjustmentSession, splitSession);

const adjustedEtf = {
  ...cooldownEtf,
  currentPrice: splitSnapshot.currentPrice,
  shareMultiplier: splitSnapshot.splitMultiplier,
  lastShareAdjustmentSession: splitSnapshot.lastShareAdjustmentSession,
};
const crashedUnderlying = {
  ...cooldownUnderlying,
  currentPrice: 1,
  daySessionId: splitSession + 1,
};
const heldSnapshot = computeLeveragedSnapshot(
  adjustedEtf,
  crashedUnderlying,
);
assert.equal(
  heldSnapshot.splitMultiplier,
  splitSnapshot.splitMultiplier,
  "쿨타임 중 파생상품 역병합을 막아야",
);
assert.equal(
  heldSnapshot.lastShareAdjustmentSession,
  splitSession,
  "차단된 조정은 쿨타임을 다시 시작하면 안 됨",
);

const releasedSnapshot = computeLeveragedSnapshot(
  adjustedEtf,
  { ...crashedUnderlying, daySessionId: splitSession + 5 },
);
assert.notEqual(
  releasedSnapshot.splitMultiplier,
  splitSnapshot.splitMultiplier,
  "5거래일 뒤에는 필요한 파생상품 액면조정을 허용해야",
);
assert.equal(
  releasedSnapshot.lastShareAdjustmentSession,
  splitSession + 5,
);

// 8) Worker 체크포인트가 일반 종목 10:1 분할을 가져와도 보유·지정가를
//    다음 틱에 미루지 않고 같은 배수로 즉시 정산한다.
const plainBefore = {
  ...createInitialStockState(
    {
      id: "plain-split",
      ticker: "PLAIN",
      name: "일반 분할 테스트",
      sector: "테스트",
      initialPrice: 120_000,
      volatility: 0,
      drift: 0,
    },
    splitSession * SESSION_DURATION_MS,
  ),
  currentPrice: 120_000,
  prevDayClose: 120_000,
  dayOpen: 120_000,
};
const plainAfter = normalizeStockSharePrice(
  plainBefore,
  splitSession * SESSION_DURATION_MS,
);
const checkpointHolding = reconcileLeveragePositionSplits(
  [{
    stockId: plainBefore.id,
    quantity: 2,
    quantityExact: "2",
    averagePrice: 120_000,
    splitMultiplier: 1,
  }],
  [plainAfter],
).positions[0]!;
assert.equal(checkpointHolding.quantity, 20);
assert.equal(checkpointHolding.quantityExact, "20");
assert.equal(checkpointHolding.averagePrice, 12_000);
assert.equal(checkpointHolding.splitMultiplier, 10);
const checkpointOrder = reconcileSplitAdjustedOrders(
  [{
    stockId: plainBefore.id,
    price: 110_000,
    quantity: 3,
    splitMultiplier: 1,
  }],
  [plainAfter],
)[0]!;
assert.equal(checkpointOrder.price, 11_000);
assert.equal(checkpointOrder.quantity, 30);
assert.equal(checkpointOrder.splitMultiplier, 10);

// A trade must reconcile an old face-value position before merging and
// stamping it. Otherwise the stamp hides the missed 10:1 split forever.
const staleHolding = {
  stockId: plainBefore.id,
  quantity: 2,
  quantityExact: "2",
  averagePrice: 120_000,
  splitMultiplier: 1,
};
const preTradeHolding = reconcileLeveragePositionSplits(
  [staleHolding],
  [plainAfter],
).positions;
const buyAfterSplit = executeBuy(
  Number.POSITIVE_INFINITY,
  preTradeHolding,
  plainAfter.id,
  plainAfter.ticker,
  plainAfter.currentPrice,
  1,
  splitSession * SESSION_DURATION_MS,
);
assert.ok(isOrderSuccess(buyAfterSplit));
const stampedAfterBuy = stampLeveragePositionMultiplier(
  buyAfterSplit.holdings,
  plainAfter.id,
  [plainAfter],
)[0]!;
assert.equal(stampedAfterBuy.quantity, 21);
assert.equal(stampedAfterBuy.quantityExact, "21");
assert.equal(stampedAfterBuy.averagePrice, 12_000);
assert.equal(stampedAfterBuy.splitMultiplier, 10);

console.log("leverage daily-reset · split/merge scenarios passed");

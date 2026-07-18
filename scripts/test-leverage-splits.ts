import assert from "node:assert";
import {
  leverageSplitMultiplier,
  leverageDisplayPrice,
  computeLeveragedRawPrice,
} from "../src/lib/market/engine";
import {
  LEVERAGE_SPLIT_AT,
  LEVERAGE_MERGE_AT,
} from "../src/lib/market/constants";

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

// 3) 경계 동작: $500 정확히 → 5:1 분할되어 $100.
assert.equal(leverageSplitMultiplier(50000), 5);
assert.equal(leverageDisplayPrice(50000), 10000);
// $499.99 → 분할 없음.
assert.equal(leverageSplitMultiplier(49999), 1);
// $49.99 → 2:1 병합되어 ~$99.98.
assert.equal(leverageSplitMultiplier(4999), 0.5);
assert.equal(leverageDisplayPrice(4999), 9998);

// 4) 보유분 가치 불변: 매수 시점 배수 m0에서 좌수 q0, 이후 배수 m1이면
//    좌수 q0*(m1/m0), 평단 avg0/(m1/m0), 표시가 raw/m1 → 포지션 가치 = rawQty*raw 불변.
function positionValue(q: number, price: number) {
  return q * price;
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
const uLater = 15000; // +200%
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

console.log("leverage split/merge scenarios passed");

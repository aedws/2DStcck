import assert from "node:assert";
import { statSync } from "node:fs";
import { STOCK_DEFINITIONS } from "../src/data/stocks";
import {
  compactMarketCheckpoint,
  getBundledMarketCheckpoint,
  hydrateMarketCheckpoint,
  isCompatibleMarketCheckpoint,
} from "../src/lib/market/marketCheckpoint";
import { currentSimTick, replayMarket } from "../src/lib/market/localSim";
import { computeLeveragedSnapshot } from "../src/lib/market/engine";

function assertLeveragedPricesMatchUnderlying(
  stocks: ReturnType<typeof hydrateMarketCheckpoint>["stocks"],
) {
  const byId = new Map(stocks.map((stock) => [stock.id, stock]));
  for (const stock of stocks) {
    if (stock.leverage === undefined || !stock.leverageUnderlyingId) continue;
    const underlying = byId.get(stock.leverageUnderlyingId);
    assert.ok(underlying, `${stock.id} 기초자산이 없음`);
    assert.ok(
      underlying.leveragePathSessionBase !== undefined &&
        underlying.leveragePathFactors !== undefined,
      `${stock.id} 기초자산의 일일 누적 경로가 복원되지 않음`,
    );
    assert.equal(
      stock.currentPrice,
      computeLeveragedSnapshot(stock, underlying).currentPrice,
      `${stock.id} 복원 가격이 일일 누적 경로와 다름`,
    );
  }
}

const checkpoint = getBundledMarketCheckpoint();
assert.equal(isCompatibleMarketCheckpoint(checkpoint), true);
assert.ok(checkpoint.tick > 0, "번들 시장 체크포인트가 제네시스에 머물러 있음");
assert.ok(
  statSync("src/data/market-checkpoint.json").size < 1024 * 1024,
  "모바일 번들용 시장 체크포인트가 1MiB를 초과함",
);

const startedAt = performance.now();
const hydrated = hydrateMarketCheckpoint(checkpoint);
const hydrateMs = performance.now() - startedAt;
assert.equal(hydrated.stocks.length, STOCK_DEFINITIONS.length);
assert.equal(new Set(hydrated.stocks.map((stock) => stock.id)).size, STOCK_DEFINITIONS.length);
assertLeveragedPricesMatchUnderlying(hydrated.stocks);

const targetTick = currentSimTick();
const shortTarget = Math.min(targetTick, checkpoint.tick + 250);
const replayed = replayMarket(
  hydrated.stocks,
  hydrated.events,
  checkpoint.tick,
  shortTarget,
);
assert.equal(replayed.stocks.length, STOCK_DEFINITIONS.length);
assertLeveragedPricesMatchUnderlying(replayed.stocks);
const replayedCheckpoint = compactMarketCheckpoint(
  replayed.stocks,
  replayed.events,
  shortTarget,
);
for (const stock of replayed.stocks) {
  if (
    !stock.universalDerivative ||
    stock.coveredCallUnderlyingId ||
    ((stock.shareMultiplier ?? 1) === 1 &&
      stock.lastShareAdjustmentSession === undefined)
  ) {
    continue;
  }
  assert.deepEqual(
    replayedCheckpoint.shareAdjustments?.[stock.id],
    [
      stock.shareMultiplier ?? 1,
      stock.lastShareAdjustmentSession ?? null,
    ],
    `${stock.id} 자동 생성 파생 액면 쿨타임이 체크포인트에 보존되지 않음`,
  );
}
assert.equal(
  replayed.stocks.some((stock) => stock.candles.length > 1),
  true,
  "체크포인트 이후 캔들이 이어지지 않음",
);

console.log(
  `market bootstrap passed · checkpoint ${checkpoint.tick} · hydrate ${Math.round(hydrateMs)}ms`,
);

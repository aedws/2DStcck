import assert from "node:assert";
import { statSync } from "node:fs";
import { STOCK_DEFINITIONS } from "../src/data/stocks";
import {
  getBundledMarketCheckpoint,
  hydrateMarketCheckpoint,
  isCompatibleMarketCheckpoint,
} from "../src/lib/market/marketCheckpoint";
import { currentSimTick, replayMarket } from "../src/lib/market/localSim";

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

const targetTick = currentSimTick();
const shortTarget = Math.min(targetTick, checkpoint.tick + 250);
const replayed = replayMarket(
  hydrated.stocks,
  hydrated.events,
  checkpoint.tick,
  shortTarget,
);
assert.equal(replayed.stocks.length, STOCK_DEFINITIONS.length);
assert.equal(
  replayed.stocks.some((stock) => stock.candles.length > 1),
  true,
  "체크포인트 이후 캔들이 이어지지 않음",
);

console.log(
  `market bootstrap passed · checkpoint ${checkpoint.tick} · hydrate ${Math.round(hydrateMs)}ms`,
);

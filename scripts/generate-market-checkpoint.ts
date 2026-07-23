import { writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  compactMarketCheckpoint,
  getBundledMarketCheckpoint,
  hydrateMarketCheckpoint,
} from "../src/lib/market/marketCheckpoint";
import { currentSimTick, replayMarket } from "../src/lib/market/localSim";

const targetTick = currentSimTick();
const base = hydrateMarketCheckpoint(getBundledMarketCheckpoint());
let stocks = base.stocks;
let events = base.events;
let tick = base.tick;

while (tick < targetTick) {
  const nextTick = Math.min(targetTick, tick + 30_000);
  const replayed = replayMarket(stocks, events, tick, nextTick);
  stocks = replayed.stocks;
  events = replayed.events;
  tick = nextTick;
  console.log(`market checkpoint ${tick}/${targetTick}`);
}

// 앱 번들에는 부팅에 필요한 최근 구간만 싣는다. 런타임 체크포인트는
// compactMarketCheckpoint의 기본값(240거래일)을 유지해 장기 차트를 보존한다.
const checkpoint = compactMarketCheckpoint(stocks, events, tick, 43);
const outputPath = resolve(process.cwd(), "src/data/market-checkpoint.json");
writeFileSync(outputPath, `${JSON.stringify(checkpoint)}\n`, "utf8");
console.log(`wrote ${outputPath}`);

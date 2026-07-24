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

// 앱 번들에는 부팅에 필요한 최근 구간만 싣는다. 일봉 보존 구간은 모바일 번들
// 1MiB 예산에 맞춰 40거래일로 둔다(런타임은 이후 계속 누적).
const checkpoint = compactMarketCheckpoint(stocks, events, tick, 40);
const outputPath = resolve(process.cwd(), "src/data/market-checkpoint.json");
writeFileSync(outputPath, `${JSON.stringify(checkpoint)}\n`, "utf8");
console.log(`wrote ${outputPath}`);

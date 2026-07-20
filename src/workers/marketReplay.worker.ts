/// <reference lib="webworker" />

import {
  compactMarketCheckpoint,
  getBundledMarketCheckpoint,
  hydrateMarketCheckpoint,
} from "@/lib/market/marketCheckpoint";
import { replayMarket } from "@/lib/market/localSim";

const WORKER_BATCH_TICKS = 30_000;

self.onmessage = (event: MessageEvent<{ targetTick: number }>) => {
  const targetTick = Math.max(0, Math.floor(event.data.targetTick));
  const base = hydrateMarketCheckpoint(getBundledMarketCheckpoint());
  let stocks = base.stocks;
  let events = base.events;
  let tick = base.tick;

  while (tick < targetTick) {
    const nextTick = Math.min(targetTick, tick + WORKER_BATCH_TICKS);
    const replayed = replayMarket(stocks, events, tick, nextTick);
    stocks = replayed.stocks;
    events = replayed.events;
    tick = nextTick;
  }

  self.postMessage({
    type: "complete",
    checkpoint: compactMarketCheckpoint(stocks, events, tick),
  });
};

export {};

/// <reference lib="webworker" />

import {
  compactMarketCheckpoint,
  getBundledMarketCheckpoint,
  hydrateMarketCheckpoint,
} from "@/lib/market/marketCheckpoint";
import { replayMarket } from "@/lib/market/localSim";
import { setDynamicListingDefs, type StoredIpoListing } from "@/lib/market/dynamicListings";
import { BUNDLED_STOCK_IDS } from "@/data/stocks";
import {
  setPlayerCompanyMarketActions,
  type PlayerCompanyMarketAction,
} from "@/lib/market/playerCompanyMarketActions";

const WORKER_BATCH_TICKS = 30_000;

self.onmessage = (
  event: MessageEvent<{
    targetTick: number;
    dynamicListings?: StoredIpoListing[];
    playerCompanyActions?: PlayerCompanyMarketAction[];
  }>,
) => {
  const targetTick = Math.max(0, Math.floor(event.data.targetTick));
  // 워커는 별도 스레드라 레지스트리가 비어 있다. 관리자 즉시 IPO를 결정론적으로
  // 포함하려면 메인 스레드가 넘긴 활성 목록을 리플레이 전에 등록해야 한다.
  setDynamicListingDefs(event.data.dynamicListings ?? [], BUNDLED_STOCK_IDS);
  setPlayerCompanyMarketActions(event.data.playerCompanyActions ?? []);
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

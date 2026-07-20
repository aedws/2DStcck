"use client";

import { useEffect } from "react";
import { useMarketStore } from "@/store/marketStore";
import { TICK_INTERVAL_MS } from "@/lib/market/constants";
import { currentSimTick } from "@/lib/market/localSim";
import type { MarketCheckpoint } from "@/lib/market/marketCheckpoint";

const WORKER_CATCHUP_THRESHOLD = 250;

export function MarketRealtime() {
  const tickMarket = useMarketStore((s) => s.tickMarket);
  const applyMarketCheckpoint = useMarketStore(
    (s) => s.applyMarketCheckpoint,
  );

  useEffect(() => {
    let worker: Worker | null = null;
    let workerRunning = false;

    const advance = () => {
      if (workerRunning) return;
      const state = useMarketStore.getState();
      const targetTick = currentSimTick();
      const gap = targetTick - state.tick;
      if (gap <= 0) return;

      if (gap > WORKER_CATCHUP_THRESHOLD && typeof Worker !== "undefined") {
        worker ??= new Worker(
          new URL("../../workers/marketReplay.worker.ts", import.meta.url),
          { type: "module" },
        );
        workerRunning = true;
        worker.onmessage = (event: MessageEvent<{
          type: "complete";
          checkpoint: MarketCheckpoint;
        }>) => {
          if (event.data.type !== "complete") return;
          applyMarketCheckpoint(event.data.checkpoint);
          workerRunning = false;
          // Worker 계산 중 흐른 짧은 구간과 지갑 정산은 기존 1틱 경로로 마무리한다.
          tickMarket();
        };
        worker.onerror = () => {
          workerRunning = false;
          worker?.terminate();
          worker = null;
          // Worker가 막힌 브라우저에서는 메인 스레드 250틱 제한 경로로 폴백한다.
          tickMarket();
        };
        worker.postMessage({ targetTick });
        return;
      }

      tickMarket();
    };

    // 접속 즉시 공통 시장 시각까지 비차단 동기화하고, 이후 1초마다 전진한다.
    advance();
    const id = setInterval(advance, TICK_INTERVAL_MS);
    return () => {
      clearInterval(id);
      worker?.terminate();
    };
  }, [applyMarketCheckpoint, tickMarket]);

  return null;
}

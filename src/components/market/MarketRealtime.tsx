"use client";

import { useEffect } from "react";
import { useMarketStore } from "@/store/marketStore";
import { TICK_INTERVAL_MS } from "@/lib/market/constants";
import { currentSimTick } from "@/lib/market/localSim";
import type { MarketCheckpoint } from "@/lib/market/marketCheckpoint";
import { listActiveIpoListings } from "@/lib/supabase/ipoListings";
import type { StoredIpoListing } from "@/lib/market/dynamicListings";
import {
  listPlayerCompanyMarketActions,
} from "@/lib/supabase/playerCompanyMarketActions";
import { resolveDuePlayerCompanyGovernance } from "@/lib/supabase/playerCompanyGovernance";
import type { PlayerCompanyMarketAction } from "@/lib/market/playerCompanyMarketActions";

const WORKER_CATCHUP_THRESHOLD = 250;
/** 관리자 즉시 IPO 목록 폴링 주기(3분) — 새 상장이 곧 모든 클라이언트에 반영되게. */
const IPO_LISTING_POLL_MS = 180_000;
/** 기업행동은 최소 15초 뒤 실행되므로 5초 폴링으로 모든 활성 탭이 미리 받는다. */
const COMPANY_ACTION_POLL_MS = 5_000;

export function MarketRealtime() {
  const tickMarket = useMarketStore((s) => s.tickMarket);
  const applyMarketCheckpoint = useMarketStore(
    (s) => s.applyMarketCheckpoint,
  );

  useEffect(() => {
    let worker: Worker | null = null;
    let workerRunning = false;
    // 워커 리플레이에도 넘겨야 결정론이 유지되는 활성 동적 상장 목록.
    let dynamicListings: StoredIpoListing[] = [];
    let playerCompanyActions: PlayerCompanyMarketAction[] = [];
    let remoteInputsReady = false;

    const advance = () => {
      if (workerRunning || !remoteInputsReady) return;
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
          // 워커 체크포인트에는 동적 상장이 반영돼 있지 않을 수 있어 재조정한다.
          useMarketStore.getState().reconcileDynamicListings(dynamicListings);
        };
        worker.onerror = () => {
          workerRunning = false;
          worker?.terminate();
          worker = null;
          // Worker가 막힌 브라우저에서는 메인 스레드 250틱 제한 경로로 폴백한다.
          tickMarket();
        };
        worker.postMessage({
          targetTick,
          dynamicListings,
          playerCompanyActions,
        });
        return;
      }

      tickMarket();
    };

    const refreshListings = async () => {
      const listings = await listActiveIpoListings();
      dynamicListings = listings;
      useMarketStore.getState().reconcileDynamicListings(listings);
    };

    const refreshPlayerCompanyActions = async () => {
      await resolveDuePlayerCompanyGovernance();
      const actions = await listPlayerCompanyMarketActions();
      playerCompanyActions = actions;
      useMarketStore
        .getState()
        .reconcilePlayerCompanyMarketActions(actions);
    };

    // 서버 시장 입력을 먼저 받은 뒤 공통 시장 시각까지 따라잡는다. 기업행동 원장을
    // 받기 전에 틱을 넘겨 과거 행동을 놓치는 경로를 차단한다.
    void Promise.all([
      refreshListings(),
      refreshPlayerCompanyActions(),
    ]).finally(() => {
      remoteInputsReady = true;
      advance();
    });
    const id = setInterval(advance, TICK_INTERVAL_MS);
    const listingId = setInterval(() => void refreshListings(), IPO_LISTING_POLL_MS);
    const companyActionId = setInterval(
      () => void refreshPlayerCompanyActions(),
      COMPANY_ACTION_POLL_MS,
    );
    return () => {
      clearInterval(id);
      clearInterval(listingId);
      clearInterval(companyActionId);
      worker?.terminate();
    };
  }, [applyMarketCheckpoint, tickMarket]);

  return null;
}

"use client";

import { useEffect } from "react";
import { useMarketStore } from "@/store/marketStore";
import { TICK_INTERVAL_MS } from "@/lib/market/constants";

export function MarketRealtime() {
  const tickMarket = useMarketStore((s) => s.tickMarket);

  useEffect(() => {
    // 접속 즉시 공통 시장 시각까지 따라잡고, 이후 1초마다 전진
    tickMarket();
    const id = setInterval(() => tickMarket(), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [tickMarket]);

  return null;
}

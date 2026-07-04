"use client";

import { useEffect } from "react";
import { useMarketStore } from "@/store/marketStore";
import { TICK_INTERVAL_MS } from "@/lib/market/constants";

export function MarketRealtime() {
  const tickMarket = useMarketStore((s) => s.tickMarket);

  useEffect(() => {
    const id = setInterval(() => tickMarket(), TICK_INTERVAL_MS);
    return () => clearInterval(id);
  }, [tickMarket]);

  return null;
}

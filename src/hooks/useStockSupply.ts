"use client";

import { useCallback, useEffect, useState } from "react";
import {
  loadStockSupply,
  STOCK_SUPPLY_CHANGED_EVENT,
  type StockSupplySnapshot,
} from "@/lib/supabase/stockSupply";

export function useStockSupply(stockId: string, enabled: boolean) {
  const [supply, setSupply] = useState<StockSupplySnapshot | null>(null);
  const [loading, setLoading] = useState(enabled);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setSupply(null);
      setLoading(false);
      return;
    }
    const next = await loadStockSupply(stockId);
    setSupply(next);
    setLoading(false);
  }, [enabled, stockId]);

  useEffect(() => {
    void refresh();
    const onChanged = (event: Event) => {
      const changedId = (event as CustomEvent<{ stockId?: string }>).detail?.stockId;
      if (!changedId || changedId === stockId) void refresh();
    };
    window.addEventListener(STOCK_SUPPLY_CHANGED_EVENT, onChanged);
    const interval = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.removeEventListener(STOCK_SUPPLY_CHANGED_EVENT, onChanged);
      window.clearInterval(interval);
    };
  }, [refresh, stockId]);

  return { supply, loading, refresh };
}

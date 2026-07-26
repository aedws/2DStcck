"use client";

import { useEffect } from "react";
import { formatPrice } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useToastStore } from "@/store/toastStore";
import {
  amcFundStockId,
  computeAmcFundNavPerShare,
} from "@/lib/player/assetManager";
import { listedFundToAmcState } from "@/lib/supabase/amcListedFunds";
import { createAmcValuationPriceResolver } from "@/lib/player/amcPortfolio";

export function PriceAlertMonitor() {
  const stocks = useMarketStore((state) => state.stocks);
  const listedAmcFunds = useMarketStore((state) => state.listedAmcFunds);
  const alerts = useSettingsStore((state) => state.priceAlerts);

  useEffect(() => {
    if (alerts.length === 0) return;
    const byId = new Map(stocks.map((stock) => [stock.id, stock]));

    // 알림이 걸린 유저 ETF만 실시간 NAV(좌당 가격)를 계산해 대상 맵에 추가한다.
    // (일반 종목과 같은 targetPrice 비교. 없는 종목/펀드는 조용히 건너뛴다.)
    const priceByAlertId = (stockId: string): { name: string; price: number } | null => {
      const stock = byId.get(stockId);
      if (stock) return { name: stock.name, price: stock.currentPrice };
      const fund = listedAmcFunds.find(
        (item) => amcFundStockId(item.id) === stockId,
      );
      if (!fund) return null;
      const stockById = new Map(stocks.map((s) => [s.id, s]));
      const priceOf = (id: string) => stockById.get(id)?.currentPrice ?? 0;
      const initialPriceOf = (id: string) => stockById.get(id)?.initialPrice ?? 0;
      const valuationPriceOf = createAmcValuationPriceResolver(stocks);
      const nav = computeAmcFundNavPerShare(
        listedFundToAmcState(fund),
        priceOf,
        initialPriceOf,
        valuationPriceOf,
      );
      return { name: fund.name, price: nav };
    };

    for (const alert of alerts) {
      if (alert.triggeredAt !== undefined) continue;
      const target = priceByAlertId(alert.stockId);
      if (!target) continue;
      const reached =
        alert.direction === "above"
          ? target.price >= alert.targetPrice
          : target.price <= alert.targetPrice;
      if (!reached) continue;
      useSettingsStore.getState().triggerPriceAlert(alert.id, Date.now());
      useToastStore.getState().push(
        `🔔 ${target.name} ${alert.direction === "above" ? "상승" : "하락"} 알림 · ${formatPrice(target.price)}`,
        "info",
      );
    }
  }, [alerts, stocks, listedAmcFunds]);

  return null;
}

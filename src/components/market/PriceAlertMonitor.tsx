"use client";

import { useEffect } from "react";
import { formatPrice } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";
import { useToastStore } from "@/store/toastStore";

export function PriceAlertMonitor() {
  const stocks = useMarketStore((state) => state.stocks);
  const alerts = useSettingsStore((state) => state.priceAlerts);

  useEffect(() => {
    if (alerts.length === 0) return;
    const byId = new Map(stocks.map((stock) => [stock.id, stock]));
    for (const alert of alerts) {
      if (alert.triggeredAt !== undefined) continue;
      const stock = byId.get(alert.stockId);
      if (!stock) continue;
      const reached =
        alert.direction === "above"
          ? stock.currentPrice >= alert.targetPrice
          : stock.currentPrice <= alert.targetPrice;
      if (!reached) continue;
      useSettingsStore.getState().triggerPriceAlert(alert.id, Date.now());
      useToastStore.getState().push(
        `🔔 ${stock.name} ${alert.direction === "above" ? "상승" : "하락"} 알림 · ${formatPrice(stock.currentPrice)}`,
        "info",
      );
    }
  }, [alerts, stocks]);

  return null;
}

"use client";

import { useMemo } from "react";
import { AccountSidebar } from "@/components/home/AccountSidebar";
import { BottomTicker } from "@/components/home/BottomTicker";
import { StockDetailPanel } from "@/components/home/StockDetailPanel";
import { StockListPanel } from "@/components/home/StockListPanel";
import { getDayChangePercent } from "@/lib/market/engine";
import { isListed } from "@/lib/market/ipo";
import { isPumpStock } from "@/lib/market/pumpStocks";
import { useMarketStore } from "@/store/marketStore";

export default function TradePage() {
  const stocks = useMarketStore((state) => state.stocks);
  const events = useMarketStore((state) => state.events);
  const marketStocks = useMemo(
    () => stocks.filter((stock) => !isPumpStock(stock) && isListed(stock)),
    [stocks],
  );
  const topStock = useMemo(
    () =>
      [...marketStocks]
        .filter((stock) => stock.sector !== "지수" && stock.sector !== "선물")
        .sort(
          (left, right) =>
            getDayChangePercent(right) - getDayChangePercent(left),
        )[0],
    [marketStocks],
  );

  return (
    <div className="flex min-h-[calc(100vh-6.75rem)] min-w-0 flex-col">
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
        <StockListPanel stocks={marketStocks} events={events} />
        <StockDetailPanel stock={topStock} events={events} />
        <AccountSidebar />
      </div>
      <BottomTicker stocks={marketStocks} />
    </div>
  );
}

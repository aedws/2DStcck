"use client";

import { useEffect, useState } from "react";
import { AccountSidebar } from "@/components/home/AccountSidebar";
import { IndexTicker } from "@/components/home/IndexTicker";
import { StockDetailPanel } from "@/components/home/StockDetailPanel";
import { StockListPanel } from "@/components/home/StockListPanel";
import { useMarketStore } from "@/store/marketStore";

export default function MarketPage() {
  const stocks = useMarketStore((s) => s.stocks);
  const events = useMarketStore((s) => s.events);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedId && stocks.length > 0) {
      setSelectedId(stocks[0].id);
    }
  }, [stocks, selectedId]);

  const selectedStock = stocks.find((s) => s.id === selectedId);

  return (
    <>
      <IndexTicker stocks={stocks} />
      <div className="flex h-[calc(100vh-7rem)] overflow-hidden">
        <StockListPanel
          stocks={stocks}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
        <StockDetailPanel stock={selectedStock} events={events} />
        <AccountSidebar />
      </div>
    </>
  );
}

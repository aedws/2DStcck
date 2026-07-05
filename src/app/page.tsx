"use client";

import { useEffect, useState } from "react";
import { AccountSidebar } from "@/components/home/AccountSidebar";
import { IndexTicker } from "@/components/home/IndexTicker";
import { NewsTicker } from "@/components/home/NewsTicker";
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
      <div className="flex items-stretch gap-3 border-b border-[var(--border)] bg-[var(--background)] px-5 py-3">
        <IndexTicker stocks={stocks} />
        <NewsTicker events={events} />
      </div>
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

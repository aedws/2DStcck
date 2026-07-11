"use client";

import { AccountSidebar } from "@/components/home/AccountSidebar";
import { BottomTicker } from "@/components/home/BottomTicker";
import { MarketOverview } from "@/components/home/MarketOverview";
import { StockDetailPanel } from "@/components/home/StockDetailPanel";
import { StockListPanel } from "@/components/home/StockListPanel";
import { getDayChangePercent } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";

export default function MarketPage() {
  const stocks = useMarketStore((s) => s.stocks);
  const events = useMarketStore((s) => s.events);

  // 우측 미리보기: 등락률 1위 종목 (토스증권처럼 주도주를 보여준다)
  const topStock =
    stocks.length > 0
      ? [...stocks]
          .filter((s) => s.sector !== "지수" && s.sector !== "선물")
          .sort((a, b) => getDayChangePercent(b) - getDayChangePercent(a))[0]
      : undefined;

  return (
    <div className="flex h-[calc(100vh-3.5rem)] flex-col">
      <MarketOverview stocks={stocks} events={events} />
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <StockListPanel stocks={stocks} events={events} />
        <StockDetailPanel stock={topStock} events={events} />
        <AccountSidebar />
      </div>
      <BottomTicker stocks={stocks} />
    </div>
  );
}

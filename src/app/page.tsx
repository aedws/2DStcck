"use client";

import { useMemo } from "react";
import { AccountSidebar } from "@/components/home/AccountSidebar";
import { BottomTicker } from "@/components/home/BottomTicker";
import { MarketOverview } from "@/components/home/MarketOverview";
import { StockDetailPanel } from "@/components/home/StockDetailPanel";
import { StockListPanel } from "@/components/home/StockListPanel";
import { PumpBanner } from "@/components/home/PumpBanner";
import { getDayChangePercent } from "@/lib/market/engine";
import { isPumpStock } from "@/lib/market/pumpStocks";
import { useMarketStore } from "@/store/marketStore";

export default function MarketPage() {
  const stocks = useMarketStore((s) => s.stocks);
  const events = useMarketStore((s) => s.events);

  // 급등주는 정적 상세 페이지가 없으므로 목록에서 분리해 인라인 배너로 노출한다
  const pumpStocks = useMemo(() => stocks.filter(isPumpStock), [stocks]);
  const marketStocks = useMemo(
    () => stocks.filter((s) => !isPumpStock(s)),
    [stocks],
  );

  // 우측 미리보기: 등락률 1위 종목 (토스증권처럼 주도주를 보여준다)
  const topStock =
    marketStocks.length > 0
      ? [...marketStocks]
          .filter((s) => s.sector !== "지수" && s.sector !== "선물")
          .sort((a, b) => getDayChangePercent(b) - getDayChangePercent(a))[0]
      : undefined;

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col lg:h-[calc(100vh-3.5rem)]">
      <MarketOverview stocks={marketStocks} events={events} />
      <PumpBanner pumps={pumpStocks} />
      <div className="flex min-h-0 flex-1 flex-col lg:flex-row lg:overflow-hidden">
        <StockListPanel stocks={marketStocks} events={events} />
        <StockDetailPanel stock={topStock} events={events} />
        <AccountSidebar />
      </div>
      <BottomTicker stocks={marketStocks} />
    </div>
  );
}

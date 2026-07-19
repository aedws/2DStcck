"use client";

import { useEffect, useMemo, useState } from "react";
import { AccountSidebar } from "@/components/home/AccountSidebar";
import { BottomTicker } from "@/components/home/BottomTicker";
import { MarketOverview } from "@/components/home/MarketOverview";
import { StockDetailPanel } from "@/components/home/StockDetailPanel";
import { StockListPanel } from "@/components/home/StockListPanel";
import { PumpBanner } from "@/components/home/PumpBanner";
import { AttendanceBanner } from "@/components/home/AttendanceBanner";
import { OperationBriefing } from "@/components/home/OperationBriefing";
import { HomeIpoBanner } from "@/components/home/HomeIpoBanner";
import { BugReportForm } from "@/components/market/BugReportForm";
import { LearningJourneyCard } from "@/components/home/LearningJourneyCard";
import { MarketEraBanner } from "@/components/market/MarketEraBanner";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import { MARKET_ERA_TUTORIAL_STEPS } from "@/data/featureTutorials";
import { getDayChangePercent } from "@/lib/market/engine";
import { isPumpStock } from "@/lib/market/pumpStocks";
import { isListed } from "@/lib/market/ipo";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";

export default function MarketPage() {
  const stocks = useMarketStore((s) => s.stocks);
  const events = useMarketStore((s) => s.events);
  const trades = useMarketStore((s) => s.trades);
  const [mounted, setMounted] = useState(false);
  const onboarded = useSettingsStore((s) => s.onboarded);
  const eraTutorialSeen = useSettingsStore((s) => s.marketEraTutorialSeen);
  const setEraTutorialSeen = useSettingsStore((s) => s.setMarketEraTutorialSeen);
  useEffect(() => setMounted(true), []);

  // 급등주는 정적 상세 페이지가 없으므로 목록에서 분리해 인라인 배너로 노출한다
  const pumpStocks = useMemo(() => stocks.filter(isPumpStock), [stocks]);
  const marketStocks = useMemo(
    () => stocks.filter((s) => !isPumpStock(s) && isListed(s)),
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
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      {mounted && onboarded && !eraTutorialSeen && (
        <FeatureTutorialModal
          steps={MARKET_ERA_TUTORIAL_STEPS}
          onFinish={() => setEraTutorialSeen(true)}
        />
      )}
      <MarketOverview stocks={marketStocks} events={events} />
      <div className="px-4 pt-3 md:px-5">
        <MarketEraBanner />
      </div>
      <AttendanceBanner />
      <HomeIpoBanner />
      <LearningJourneyCard />
      {/* 새내기(거래 3건 미만)에겐 시즌·연속사건·라이벌까지 담긴 작전 브리핑이
          과부하다. 학습 여정 카드가 '첫 매수' 한 가지에 집중하도록 잠시 감춘다.
          마운트 전엔 렌더하지 않아 새내기 화면에 깜빡임이 남지 않게 한다. */}
      {mounted && trades.length >= 3 && <OperationBriefing />}
      <PumpBanner pumps={pumpStocks} />
      <div className="px-4 pt-3 md:px-5">
        <BugReportForm />
      </div>
      {/* 데스크톱: 상단 개요가 화면을 채워 종목 목록이 안 보이던 문제를 막기 위해
          페이지 전체가 스크롤되도록 두고, 이 행에만 한 화면 높이를 줘 각 패널이
          내부 스크롤을 유지하게 한다. */}
      <div className="flex min-h-0 flex-1 flex-col lg:h-[calc(100vh-3.5rem)] lg:flex-row lg:overflow-hidden">
        <StockListPanel stocks={marketStocks} events={events} />
        <StockDetailPanel stock={topStock} events={events} />
        <AccountSidebar />
      </div>
      <BottomTicker stocks={marketStocks} />
    </div>
  );
}

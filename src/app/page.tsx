"use client";

import { useEffect, useMemo, useState } from "react";
import { MarketOverview } from "@/components/home/MarketOverview";
import { PumpBanner } from "@/components/home/PumpBanner";
import { AttendanceBanner } from "@/components/home/AttendanceBanner";
import { OperationBriefing } from "@/components/home/OperationBriefing";
import { HomeIpoBanner } from "@/components/home/HomeIpoBanner";
import { InvestorCalendarCountdown } from "@/components/home/InvestorCalendarCountdown";
import { ReturnInvestmentReport } from "@/components/home/ReturnInvestmentReport";
import { SupportForms } from "@/components/market/SupportForms";
import { LearningJourneyCard } from "@/components/home/LearningJourneyCard";
import { MarketEraBanner } from "@/components/market/MarketEraBanner";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import { MODAL_PRIORITY, useModalSlot } from "@/components/layout/ModalQueue";
import { MARKET_ERA_TUTORIAL_STEPS } from "@/data/featureTutorials";
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

  const showEraTutorial = useModalSlot(
    "era-tutorial",
    MODAL_PRIORITY.eraTutorial,
    mounted && onboarded && !eraTutorialSeen,
  );

  // 급등주는 정적 상세 페이지가 없으므로 목록에서 분리해 인라인 배너로 노출한다
  const pumpStocks = useMemo(() => stocks.filter(isPumpStock), [stocks]);
  const marketStocks = useMemo(
    () => stocks.filter((s) => !isPumpStock(s) && isListed(s)),
    [stocks],
  );

  const currentSession =
    stocks[0]?.daySessionId ?? Math.floor(Date.now() / (60 * 60 * 1000));

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col">
      {showEraTutorial && (
        <FeatureTutorialModal
          steps={MARKET_ERA_TUTORIAL_STEPS}
          onFinish={() => setEraTutorialSeen(true)}
        />
      )}
      <ReturnInvestmentReport />
      <MarketOverview stocks={marketStocks} events={events} />
      {/* 국면과 출석을 먼저 보여주고, 작전 브리핑을 출석판 바로 아래에 둔다. */}
      <div className="space-y-2 px-4 pt-3 md:px-5">
        <MarketEraBanner />
        <AttendanceBanner />
      </div>
      {/* 새내기(거래 3건 미만)에겐 시즌·연속사건·라이벌까지 담긴 작전 브리핑이
          과부하다. 학습 여정 카드가 '첫 매수' 한 가지에 집중하도록 잠시 감춘다.
          마운트 전엔 렌더하지 않아 새내기 화면에 깜빡임이 남지 않게 한다. */}
      {mounted && trades.length >= 3 && <OperationBriefing />}
      {/* IPO와 캘린더는 오늘의 작전 다음 순서에서 필요한 일정만 촘촘히 보여준다. */}
      <div className="space-y-2 px-4 pt-2 md:px-5">
        <HomeIpoBanner />
        {mounted && (
          <InvestorCalendarCountdown currentSession={currentSession} />
        )}
      </div>
      <LearningJourneyCard />
      <PumpBanner pumps={pumpStocks} />
      {/* 운영용 문의·버그·건의는 항상 펼쳐두면 홈이 과밀해지므로 하단 접기로
          내려 필요할 때만 펼치게 한다. 개발자 상태 배너도 이 안에서 확인한다. */}
      <details className="mx-4 mb-4 mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)]/40 md:mx-5">
        <summary className="cursor-pointer select-none px-4 py-3 text-sm font-semibold text-[var(--muted)]">
          🛠️ 문의·버그·건의 · 개발자 상태
        </summary>
        <div className="px-4 pb-4">
          <SupportForms />
        </div>
      </details>
    </div>
  );
}

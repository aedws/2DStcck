"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CandlestickChart } from "@/components/market/CandlestickChart";
import { OrderBook } from "@/components/market/OrderBook";
import { QuickOrderPanel } from "@/components/market/QuickOrderPanel";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import {
  PUMP_TUTORIAL_STEPS,
  PUMP_TUTORIAL_VERSION,
} from "@/data/featureTutorials";
import { StockLogo } from "@/components/ui/StockLogo";
import { FlashValue } from "@/components/ui/FlashValue";
import { formatPrice, getChangePercent } from "@/lib/market/engine";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";
import { isPumpStock } from "@/lib/market/pumpStocks";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";

/**
 * 급등주 전용 상세 화면. 급등주는 시각의 순함수라 정적 상세 페이지(/stock/[id])를
 * 미리 생성할 수 없으므로, 활성 급등주(항상 최대 1개)를 스토어에서 찾아 렌더한다.
 */
export default function PumpDetailPage() {
  useMarketStore((s) => s.tick); // 가격·상장폐지 진행에 맞춰 갱신
  const stocks = useMarketStore((s) => s.stocks);
  const holding = useMarketStore((s) =>
    s.holdings.find((h) => h.stockId.startsWith("pump-")),
  );
  const pump = stocks.find(isPumpStock);

  const [mounted, setMounted] = useState(false);
  const onboarded = useSettingsStore((s) => s.onboarded);
  const tutorialSeen = useSettingsStore((s) => s.pumpTutorialSeen);
  const setTutorialSeen = useSettingsStore((s) => s.setPumpTutorialSeen);
  const tutorialVersion = useSettingsStore((s) => s.pumpTutorialVersion);
  const setTutorialVersion = useSettingsStore((s) => s.setPumpTutorialVersion);
  useEffect(() => setMounted(true), []);
  const tutorial =
    mounted &&
    onboarded &&
    (!tutorialSeen || tutorialVersion < PUMP_TUTORIAL_VERSION) ? (
      <FeatureTutorialModal
        steps={PUMP_TUTORIAL_STEPS}
        onFinish={() => {
          setTutorialSeen(true);
          setTutorialVersion(PUMP_TUTORIAL_VERSION);
        }}
      />
    ) : null;

  if (!pump) {
    return (
      <div className="py-20 text-center text-[var(--muted)]">
        {tutorial}
        <p className="text-4xl">🚀</p>
        <p className="mt-3">현재 상장 중인 급등주가 없습니다.</p>
        <Link
          href="/"
          className="mt-2 inline-block text-[var(--accent)] hover:underline"
        >
          시장으로 돌아가기
        </Link>
      </div>
    );
  }

  const change = getChangePercent(pump.currentPrice, pump.initialPrice);
  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:h-[calc(100vh-3.5rem)]">
      {tutorial}
      <div className="flex shrink-0 items-center gap-3 border-b border-amber-500/30 bg-amber-500/[0.06] px-3 py-3 md:px-5">
        <Link
          href="/"
          className="shrink-0 rounded-lg px-1.5 py-1 text-[var(--muted)] transition hover:text-[var(--foreground)]"
          aria-label="시장으로"
        >
          ←
        </Link>
        <StockLogo stock={pump} size={36} />
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
              급등주 · 최대 2거래일 · 조기 상폐 주의
            </span>
            <span className="truncate text-sm font-semibold">{pump.name}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {pump.ticker}
            </span>
          </p>
          <p className="mt-0.5 flex items-baseline gap-2">
            <FlashValue
              value={pump.currentPrice}
              className="text-xl font-bold tabular-nums"
            >
              {formatPrice(pump.currentPrice)}
            </FlashValue>
            <span className={`text-xs tabular-nums ${upDownClass(change)}`}>
              상장가 대비 {formatSignedPercent(change)}
            </span>
          </p>
        </div>
      </div>

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row md:overflow-hidden">
        <main className="min-w-0 flex-1 space-y-4 px-4 py-4 md:overflow-y-auto md:px-5">
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs leading-relaxed text-amber-200">
            <p className="font-semibold">⚠️ 초고위험 펌프-앤-덤프 · 타이밍 싸움</p>
            <p className="mt-1">
              편하게 언제든 돈을 빼는 종목이 아니라, 정점을 노려 사고파는
              하이리스크·하이리턴 게임입니다. 최대 2거래일 안에서 예고 없이
              무작위 상장폐지되며, 상승 중이라도 보유분이 폭락가로 강제 정산될
              수 있습니다.
            </p>
            <p className="mt-1 font-medium">
              🚫 급등주는 공매도(하락 베팅)가 불가합니다 — 매수 후 정점에서
              매도하는 방향만 열려 있습니다.
            </p>
          </div>
          <CandlestickChart
            candles={pump.candles}
            dailyCandles={pump.dailyCandles}
            history={pump.priceHistory}
            height={360}
            mobileHeight={260}
            averagePrice={holding?.averagePrice}
            prevDayClose={pump.prevDayClose}
          />
          <OrderBook stock={pump} />
        </main>

        <div className="w-full shrink-0 border-t border-[var(--border)] md:w-[320px] md:border-l md:border-t-0">
          <QuickOrderPanel stock={pump} />
        </div>
      </div>
    </div>
  );
}

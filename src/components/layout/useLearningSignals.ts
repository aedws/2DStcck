"use client";

import { useMemo } from "react";
import {
  deriveLearningSignals,
  type LearningSignals,
} from "@/lib/player/learningProgress";
import {
  getAmcCharacterLinkedHoldings,
  mergeAmcPortfolioFunds,
} from "@/lib/player/amcPortfolio";
import { listedFundToAmcState } from "@/lib/supabase/amcListedFunds";
import { useMarketStore } from "@/store/marketStore";

/** 스토어 구독을 한 곳으로 모아 학습 진척 신호를 반환한다. */
export function useLearningSignals(): LearningSignals {
  const trades = useMarketStore((s) => s.trades);
  const holdings = useMarketStore((s) => s.holdings);
  const stocks = useMarketStore((s) => s.stocks);
  const assetManager = useMarketStore((s) => s.assetManager);
  const listedAmcFunds = useMarketStore((s) => s.listedAmcFunds);
  const options = useMarketStore((s) => s.options);
  const shorts = useMarketStore((s) => s.shorts);
  const cash = useMarketStore((s) => s.cash);
  const marginEnabled = useMarketStore((s) => s.marginEnabled);
  const characterProgress = useMarketStore((s) => s.characterProgress);
  const missionHistory = useMarketStore((s) => s.missionHistory);
  const investmentSeason = useMarketStore((s) => s.investmentSeason);
  const reputation = useMarketStore((s) => s.reputation);
  const netWorthHistory = useMarketStore((s) => s.netWorthHistory);
  const initialCash = useMarketStore((s) => s.initialCash);

  return useMemo(
    () => {
      const userEtfHoldings = getAmcCharacterLinkedHoldings(
        holdings,
        mergeAmcPortfolioFunds(
          assetManager?.funds ?? [],
          listedAmcFunds.map(listedFundToAmcState),
        ),
        stocks,
      );
      return deriveLearningSignals({
        trades,
        holdings,
        stocks,
        userEtfHoldings,
        options,
        shorts,
        cash,
        marginEnabled,
        characterProgress,
        missionHistory,
        investmentSeason,
        reputation,
        netWorthHistory,
        initialCash,
      });
    },
    [
      trades,
      holdings,
      stocks,
      assetManager,
      listedAmcFunds,
      options,
      shorts,
      cash,
      marginEnabled,
      characterProgress,
      missionHistory,
      investmentSeason,
      reputation,
      netWorthHistory,
      initialCash,
    ],
  );
}

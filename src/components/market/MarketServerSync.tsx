"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMarketStore } from "@/store/marketStore";
import { MarketRealtime } from "@/components/market/MarketRealtime";
import { PriceAlertMonitor } from "@/components/market/PriceAlertMonitor";

/**
 * 클라우드 계정 동기화 (선택적):
 * - 로그인 상태를 추적하고, 로그인 시 저장된 지갑을 불러온다.
 * - 지갑이 바뀌면 디바운스로 클라우드에 저장한다.
 * 시장 자체는 MarketRealtime의 로컬 결정론 틱이 담당한다.
 */
function CloudSaveSync() {
  const setUserId = useMarketStore((s) => s.setUserId);
  const loadCloudSave = useMarketStore((s) => s.loadCloudSave);
  const saveCloud = useMarketStore((s) => s.saveCloud);

  // 로그인 상태 추적 + 로그인 시 저장분 로드.
  // onAuthStateChange는 구독 즉시 INITIAL_SESSION을 한 번 발생시키므로 별도의
  // getSession() 초기 로드는 필요 없다(중복 왕복 제거 → 초기 로딩 단축).
  useEffect(() => {
    const supabase = createClient();
    let loadedFor: string | null = null;

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const user = session?.user ?? null;
        if (!user) {
          loadedFor = null;
          setUserId(null);
          return;
        }
        setUserId(user.id);
        // 같은 세션의 반복 이벤트(토큰 갱신 등)에는 재로딩하지 않는다.
        // 매번 로드하면 클라우드 지갑이 진행 중인 로컬 매매를 덮어쓸 수 있다.
        if (loadedFor === user.id) return;
        loadedFor = user.id;
        // supabase-js는 이 콜백 실행 중 내부 auth 락을 잡고 있어, 여기서 곧바로
        // 다른 supabase 호출(getSession·DB)을 await 하면 락 경합으로 로그인이
        // 수 초간 멈춘다. 락이 풀린 뒤 실행되도록 마이크로태스크 밖으로 미룬다.
        setTimeout(() => {
          void (async () => {
            await loadCloudSave();
            await saveCloud();
          })();
        }, 0);
      },
    );

    return () => listener.subscription.unsubscribe();
  }, [setUserId, loadCloudSave, saveCloud]);

  // 지갑 변경 시 디바운스 저장 (로그인 상태에서만).
  // 매매 직후 탭을 닫으면 디바운스가 날아가 거래내역이 유실되므로,
  // 숨김/종료 시점에 대기 중인 저장을 즉시 flush 한다.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let pending = false;

    const flush = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
      if (!pending) return;
      pending = false;
      if (useMarketStore.getState().userId) void saveCloud();
    };

    const unsub = useMarketStore.subscribe((state, prev) => {
      if (!state.userId) return;
      const tradesChanged = state.trades !== prev.trades;
      const walletChanged =
        tradesChanged ||
        state.cash !== prev.cash ||
        state.holdings !== prev.holdings ||
        state.openOrders !== prev.openOrders ||
        state.cashPayments !== prev.cashPayments ||
        state.ownedLuxuries !== prev.ownedLuxuries ||
        state.shorts !== prev.shorts ||
        state.options !== prev.options ||
        state.investmentMission !== prev.investmentMission ||
        state.missionHistory !== prev.missionHistory ||
        state.reputation !== prev.reputation ||
        state.characterProgress !== prev.characterProgress ||
        state.readCharacterMessageIds !== prev.readCharacterMessageIds ||
        state.investmentMastery !== prev.investmentMastery ||
        state.investmentSeason !== prev.investmentSeason ||
        state.storyDecision !== prev.storyDecision ||
        state.storyDecisionHistory !== prev.storyDecisionHistory ||
        state.marginEnabled !== prev.marginEnabled ||
        state.marginLeverage !== prev.marginLeverage ||
        state.recurringInvestments !== prev.recurringInvestments ||
        state.attendance !== prev.attendance ||
        state.selectedTitleId !== prev.selectedTitleId ||
        state.dailyOperation !== prev.dailyOperation ||
        state.dailyOperationHistory !== prev.dailyOperationHistory ||
        state.selectedPortfolioStrategyId !== prev.selectedPortfolioStrategyId ||
        state.portfolioStrategySelectedAt !== prev.portfolioStrategySelectedAt ||
        state.unlockedSeasonRewardIds !== prev.unlockedSeasonRewardIds ||
        state.selectedSeasonFrameId !== prev.selectedSeasonFrameId;
      if (!walletChanged) return;
      pending = true;
      if (timer) clearTimeout(timer);
      // 거래내역은 유실 비용이 크므로 짧게, 그 외는 2초.
      timer = setTimeout(() => flush(), tradesChanged ? 400 : 2000);
    });

    const onHide = () => {
      if (document.visibilityState === "hidden") flush();
    };
    window.addEventListener("pagehide", flush);
    document.addEventListener("visibilitychange", onHide);

    return () => {
      flush();
      window.removeEventListener("pagehide", flush);
      document.removeEventListener("visibilitychange", onHide);
      unsub();
    };
  }, [saveCloud]);

  // 거래가 없어도 공개 랭킹 스냅샷과 주간 수익률을 10분마다 갱신한다.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (useMarketStore.getState().userId) void saveCloud();
    }, 10 * 60 * 1_000);
    return () => window.clearInterval(id);
  }, [saveCloud]);

  return null;
}

export function MarketSyncRouter() {
  return (
    <>
      <MarketRealtime />
      <PriceAlertMonitor />
      <CloudSaveSync />
    </>
  );
}

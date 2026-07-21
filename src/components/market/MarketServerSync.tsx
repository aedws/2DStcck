"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMarketStore } from "@/store/marketStore";
import { MarketRealtime } from "@/components/market/MarketRealtime";
import { PriceAlertMonitor } from "@/components/market/PriceAlertMonitor";
import {
  marketStorageKey,
  safeMarketStorage,
} from "@/lib/storage/safeLocalStorage";

/**
 * 클라우드 계정 동기화 (선택적):
 * - 로그인 상태를 추적하고, 로그인 시 저장된 지갑을 불러온다.
 * - 지갑이 바뀌면 디바운스로 클라우드에 저장한다.
 * 시장 자체는 MarketRealtime의 로컬 결정론 틱이 담당한다.
 */
function CloudSaveSync() {
  const setUserId = useMarketStore((s) => s.setUserId);
  const setCloudSyncReady = useMarketStore((s) => s.setCloudSyncReady);
  const loadCloudSave = useMarketStore((s) => s.loadCloudSave);
  const applyTargetedAccountReset = useMarketStore(
    (s) => s.applyTargetedAccountReset,
  );
  const saveCloud = useMarketStore((s) => s.saveCloud);
  const settleCashflows = useMarketStore((s) => s.settleCashflows);

  // 로그인 상태 추적 + 로그인 시 저장분 로드.
  // onAuthStateChange는 구독 즉시 INITIAL_SESSION을 한 번 발생시키므로 별도의
  // getSession() 초기 로드는 필요 없다(중복 왕복 제거 → 초기 로딩 단축).
  useEffect(() => {
    const supabase = createClient();
    let loadedFor: string | null = null;
    const switchLocalCache = async (userId: string | null) => {
      const name = marketStorageKey(userId);
      const hasCachedState = Boolean(safeMarketStorage.getItem(name));
      useMarketStore.persist.setOptions({ name });
      if (hasCachedState) {
        await useMarketStore.persist.rehydrate();
      } else {
        // 다른 계정의 메모리 지갑을 새 계정·게스트 캐시로 복사하지 않는다.
        useMarketStore.getState().reset();
      }
    };

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        const user = session?.user ?? null;
        if (!user) {
          loadedFor = null;
          setTimeout(() => {
            void (async () => {
              await switchLocalCache(null);
              setUserId(null);
              settleCashflows();
            })();
          }, 0);
          return;
        }
        // 같은 세션의 반복 이벤트(토큰 갱신 등)에는 재로딩하지 않는다.
        // 매번 로드하면 클라우드 지갑이 진행 중인 로컬 매매를 덮어쓸 수 있다.
        if (loadedFor === user.id) return;
        loadedFor = user.id;
        // supabase-js는 이 콜백 실행 중 내부 auth 락을 잡고 있어, 여기서 곧바로
        // 다른 supabase 호출(getSession·DB)을 await 하면 락 경합으로 로그인이
        // 수 초간 멈춘다. 락이 풀린 뒤 실행되도록 마이크로태스크 밖으로 미룬다.
        setTimeout(() => {
          void (async () => {
            const previousUserId = useMarketStore.getState().userId;
            setCloudSyncReady(false);
            if (previousUserId !== user.id) {
              await switchLocalCache(user.id);
            }
            setUserId(user.id);
            const loadResult = await loadCloudSave();
            if (loadResult === "offline") return;
            // 대상 계정이면 클라우드 지갑을 적용한 뒤 클라이언트가 스스로
            // 초기화한다(재로그인해도 리셋이 유지됨).
            applyTargetedAccountReset();
            settleCashflows();
            setCloudSyncReady(true);
            await saveCloud();
          })();
        }, 0);
      },
    );

    return () => listener.subscription.unsubscribe();
  }, [
    setUserId,
    setCloudSyncReady,
    loadCloudSave,
    saveCloud,
    settleCashflows,
    applyTargetedAccountReset,
  ]);

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
      const state = useMarketStore.getState();
      if (!state.userId || !state.cloudSyncReady) return;
      void saveCloud().then((saved) => {
        // 오프라인 등으로 실패한 저장은 버리지 않고 5초 뒤 재시도한다.
        // 실패를 그냥 삼키면 다음 리로드 때 낡은 클라우드가 최신 매매를 덮는다.
        if (!saved && useMarketStore.getState().userId) {
          pending = true;
          if (!timer) timer = setTimeout(() => flush(), 5_000);
        }
      });
    };

    const unsub = useMarketStore.subscribe((state, prev) => {
      if (!state.userId || !state.cloudSyncReady) return;
      const tradesChanged = state.trades !== prev.trades;
      const walletChanged =
        tradesChanged ||
        state.cash !== prev.cash ||
        state.holdings !== prev.holdings ||
        state.openOrders !== prev.openOrders ||
        state.cashPayments !== prev.cashPayments ||
        state.lastSalarySession !== prev.lastSalarySession ||
        state.lastMonthlyDistributionSession !==
          prev.lastMonthlyDistributionSession ||
        state.lastSingleCoveredCallDistributionSession !==
          prev.lastSingleCoveredCallDistributionSession ||
        state.lastQuarterlyDividendSession !== prev.lastQuarterlyDividendSession ||
        state.lastInterestSession !== prev.lastInterestSession ||
        state.ownedLuxuries !== prev.ownedLuxuries ||
        state.myRoomItems !== prev.myRoomItems ||
        state.myRoomLevel !== prev.myRoomLevel ||
        state.myRoomTheme !== prev.myRoomTheme ||
        state.myRoomOwnedThemes !== prev.myRoomOwnedThemes ||
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
      const state = useMarketStore.getState();
      if (state.userId && state.cloudSyncReady) void saveCloud();
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

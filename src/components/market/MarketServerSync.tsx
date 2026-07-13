"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { useMarketStore } from "@/store/marketStore";
import { MarketRealtime } from "@/components/market/MarketRealtime";

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

  // 로그인 상태 추적 + 로그인 시 저장분 로드
  useEffect(() => {
    const supabase = createClient();
    let cancelled = false;

    supabase.auth.getUser().then(async ({ data }) => {
      if (cancelled || !data.user) return;
      setUserId(data.user.id);
      await loadCloudSave();
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUserId(session.user.id);
          await loadCloudSave();
        } else {
          setUserId(null);
        }
      },
    );

    return () => {
      cancelled = true;
      listener.subscription.unsubscribe();
    };
  }, [setUserId, loadCloudSave]);

  // 지갑 변경 시 디바운스 저장 (로그인 상태에서만)
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const unsub = useMarketStore.subscribe((state, prev) => {
      if (!state.userId) return;
      const walletChanged =
        state.cash !== prev.cash ||
        state.holdings !== prev.holdings ||
        state.trades !== prev.trades ||
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
        state.recurringInvestments !== prev.recurringInvestments;
      if (!walletChanged) return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => saveCloud(), 2000);
    });

    return () => {
      if (timer) clearTimeout(timer);
      unsub();
    };
  }, [saveCloud]);

  return null;
}

export function MarketSyncRouter() {
  return (
    <>
      <MarketRealtime />
      <CloudSaveSync />
    </>
  );
}

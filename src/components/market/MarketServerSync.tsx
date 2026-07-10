"use client";

import { useEffect } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { IS_SERVER_MODE, useMarketStore } from "@/store/marketStore";
import type { ServerMarketState } from "@/lib/market/serverState";
import { MarketRealtime } from "@/components/market/MarketRealtime";
import { fetchMarketState, fetchPortfolio } from "@/lib/supabase/queries";

export function MarketServerSync() {
  const syncMarket = useMarketStore((s) => s.syncMarketFromServer);
  const microTick = useMarketStore((s) => s.microTick);
  const syncUser = useMarketStore((s) => s.syncUserFromServer);
  const setUserId = useMarketStore((s) => s.setUserId);

  useEffect(() => {
    if (!IS_SERVER_MODE || !isSupabaseConfigured()) return;

    let cancelled = false;

    async function load() {
      const market = await fetchMarketState();
      if (!cancelled && market) syncMarket(market);

      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        setUserId(user.id);
        const portfolio = await fetchPortfolio();
        if (!cancelled && portfolio) {
          syncUser(portfolio);
        }
      }
    }

    load();

    const supabase = createClient();

    const marketChannel = supabase
      .channel("market-global")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "market_global" },
        (payload) => {
          const row = payload.new as {
            tick: number;
            market_started_at: number;
            stocks: ServerMarketState["stocks"];
            events: ServerMarketState["events"];
          };
          if (row?.stocks) {
            syncMarket({
              tick: row.tick,
              marketStartedAt: row.market_started_at,
              stocks: row.stocks,
              events: row.events ?? [],
            });
          }
        },
      )
      .subscribe();

    const authListener = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (session?.user) {
        setUserId(session.user.id);
        const portfolio = await fetchPortfolio();
        if (portfolio) {
          syncUser(portfolio);
        }
      } else {
        setUserId(null);
      }
    });

    // 서버 확정 틱(10초) 사이를 살아있게: 0.25초마다 표시용 미세 틱
    const microTimer = setInterval(() => microTick(), 250);

    // 지정가 자동 체결 반영: 로그인 상태면 15초마다 포트폴리오·대기주문 갱신
    const pollTimer = setInterval(async () => {
      const store = useMarketStore.getState();
      if (!store.userId) return;
      const portfolio = await fetchPortfolio();
      if (portfolio) store.syncUserFromServer(portfolio);
      await store.refreshOpenOrders();
    }, 15_000);

    return () => {
      cancelled = true;
      clearInterval(microTimer);
      clearInterval(pollTimer);
      supabase.removeChannel(marketChannel);
      authListener.data.subscription.unsubscribe();
    };
  }, [syncMarket, syncUser, setUserId, microTick]);

  return null;
}

export function MarketSyncRouter() {
  if (IS_SERVER_MODE) {
    return <MarketServerSync />;
  }
  return <MarketRealtime />;
}

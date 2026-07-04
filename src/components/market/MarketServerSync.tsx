"use client";

import { useEffect } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { IS_SERVER_MODE, useMarketStore } from "@/store/marketStore";
import type { ServerMarketState } from "@/lib/market/serverState";
import { MarketRealtime } from "@/components/market/MarketRealtime";

async function fetchMarketState(): Promise<ServerMarketState | null> {
  const res = await fetch("/api/market/state");
  if (!res.ok) return null;
  return res.json();
}

async function fetchPortfolio() {
  const res = await fetch("/api/user/portfolio");
  if (!res.ok) return null;
  return res.json();
}

export function MarketServerSync() {
  const syncMarket = useMarketStore((s) => s.syncMarketFromServer);
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
        if (!cancelled && portfolio?.authenticated && portfolio.profile) {
          syncUser({
            cash: portfolio.profile.cash,
            initialCash: portfolio.profile.initial_cash,
            holdings: portfolio.holdings ?? [],
            trades: portfolio.trades ?? [],
          });
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
        if (portfolio?.authenticated && portfolio.profile) {
          syncUser({
            cash: portfolio.profile.cash,
            initialCash: portfolio.profile.initial_cash,
            holdings: portfolio.holdings ?? [],
            trades: portfolio.trades ?? [],
          });
        }
      } else {
        setUserId(null);
      }
    });

    return () => {
      cancelled = true;
      supabase.removeChannel(marketChannel);
      authListener.data.subscription.unsubscribe();
    };
  }, [syncMarket, syncUser, setUserId]);

  return null;
}

export function MarketSyncRouter() {
  if (IS_SERVER_MODE) {
    return <MarketServerSync />;
  }
  return <MarketRealtime />;
}

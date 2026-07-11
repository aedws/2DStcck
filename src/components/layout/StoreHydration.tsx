"use client";

import { useEffect, useState, type ReactNode } from "react";
import { IS_SERVER_MODE, useMarketStore } from "@/store/marketStore";
import { MarketSyncRouter } from "@/components/market/MarketServerSync";

export function StoreHydration({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(IS_SERVER_MODE);
  const setStoreReady = useMarketStore((s) => s.setReady);
  const settleCashflows = useMarketStore((s) => s.settleCashflows);

  useEffect(() => {
    if (IS_SERVER_MODE) {
      setStoreReady(true);
      setReady(true);
      return;
    }

    const unsub = useMarketStore.persist.onFinishHydration(() => {
      settleCashflows();
      setStoreReady(true);
      setReady(true);
    });

    useMarketStore.persist.rehydrate();

    if (useMarketStore.persist.hasHydrated()) {
      settleCashflows();
      setStoreReady(true);
      setReady(true);
    }

    return unsub;
  }, [setStoreReady, settleCashflows]);

  if (!ready) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-[var(--muted)]">
        데이터 불러오는 중...
      </div>
    );
  }

  return (
    <>
      <MarketSyncRouter />
      {children}
    </>
  );
}

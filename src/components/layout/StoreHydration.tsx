"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useMarketStore } from "@/store/marketStore";
import { MarketSyncRouter } from "@/components/market/MarketServerSync";
import {
  clearLegacyMarketStorage,
  marketStorageKey,
} from "@/lib/storage/safeLocalStorage";
import { createClient } from "@/lib/supabase/client";

export function StoreHydration({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const setStoreReady = useMarketStore((s) => s.setReady);
  const setUserId = useMarketStore((s) => s.setUserId);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // 세션을 먼저 알아야 다른 계정의 로컬 지갑을 읽지 않는다.
      const supabase = createClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      const userId = session?.user?.id ?? null;

      clearLegacyMarketStorage();
      useMarketStore.persist.setOptions({ name: marketStorageKey(userId) });
      await useMarketStore.persist.rehydrate();
      if (cancelled) return;

      setUserId(userId);
      // 급여·배당 정산은 로그인 계정의 클라우드 지갑 적용 뒤에 수행한다.
      setStoreReady(true);
      setReady(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [setStoreReady, setUserId]);

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

import { Suspense } from "react";
import { AmcTradeClient } from "./AmcTradeClient";

export default function AmcTradePage() {
  return (
    <Suspense
      fallback={
        <div className="py-20 text-center text-sm text-[var(--muted)]">
          유저 ETF 정보를 불러오는 중…
        </div>
      }
    >
      <AmcTradeClient />
    </Suspense>
  );
}

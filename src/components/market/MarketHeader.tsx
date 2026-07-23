"use client";

import type { ReactNode } from "react";
import { useMarketStore } from "@/store/marketStore";
import { formatMarketTime } from "@/lib/market/engine";
import { calculateAccountInvestmentPerformance } from "@/lib/market/investmentSeasons";
import {
  exactPercentChange,
  formatExactMoney,
  formatExactPercent,
} from "@/lib/market/exactAmount";

export function MarketHeader() {
  const tick = useMarketStore((s) => s.tick);
  const marketStartedAt = useMarketStore((s) => s.marketStartedAt);
  const cash = useMarketStore((s) => s.cash);
  const cashExact = useMarketStore((s) => s.cashExact);
  const cashPayments = useMarketStore((s) => s.cashPayments);
  const getTotalAssets = useMarketStore((s) => s.getTotalAssets);
  const getTotalAssetsExact = useMarketStore((s) => s.getTotalAssetsExact);
  const reset = useMarketStore((s) => s.reset);

  const total = getTotalAssets();
  const totalExact = getTotalAssetsExact();
  const initialCash = useMarketStore((s) => s.initialCash);
  const initialCashExact = useMarketStore((s) => s.initialCashExact);
  const { returnRate } = calculateAccountInvestmentPerformance(
    total,
    initialCash,
    cashPayments,
  );

  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        label="시장 상태"
        value={
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            실시간
          </span>
        }
      />
      <StatCard
        label="장 운영 시간"
        value={formatMarketTime(marketStartedAt, tick)}
      />
      <StatCard label="보유 현금" value={formatExactMoney(cashExact ?? cash)} />
      <StatCard label="총 자산" value={formatExactMoney(totalExact)} />
      <StatCard
        label="투자 수익률"
        value={formatExactPercent(
          exactPercentChange(totalExact, initialCashExact ?? initialCash),
        )}
        highlight={returnRate >= 0 ? "up" : "down"}
      />

      <div className="flex gap-2 sm:col-span-2 lg:col-span-4">
        <button
          onClick={() => {
            if (
              confirm("게임을 초기화하시겠습니까? 모든 데이터가 삭제됩니다.")
            ) {
              reset();
            }
          }}
          className="rounded-lg border border-zinc-700 px-4 py-2 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200"
        >
          초기화
        </button>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  highlight,
}: {
  label: string;
  value: ReactNode;
  highlight?: "up" | "down";
}) {
  const color =
    highlight === "up"
      ? "text-emerald-400"
      : highlight === "down"
        ? "text-red-400"
        : "text-zinc-100";

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

"use client";

import { use } from "react";
import Link from "next/link";
import { CandlestickChart } from "@/components/market/CandlestickChart";
import { OrderBook } from "@/components/market/OrderBook";
import { QuickOrderPanel } from "@/components/market/QuickOrderPanel";
import {
  formatPrice,
  getDayChangeAmount,
  getDayChangePercent,
} from "@/lib/market/engine";
import {
  formatSignedPercent,
  formatSignedPrice,
  upDownClass,
} from "@/lib/ui/marketColors";
import { useMarketStore } from "@/store/marketStore";

export default function StockPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const stock = useMarketStore((s) => s.getStockById(id));
  const holding = useMarketStore((s) =>
    s.holdings.find((h) => h.stockId === id),
  );

  if (!stock) {
    return (
      <div className="text-center text-[var(--muted)]">
        <p>종목을 찾을 수 없습니다.</p>
        <Link
          href="/"
          className="mt-2 inline-block text-[var(--accent)] hover:underline"
        >
          시장으로 돌아가기
        </Link>
      </div>
    );
  }

  const change = getDayChangePercent(stock);
  const priceDiff = getDayChangeAmount(stock);

  return (
    <>
      <Link
        href="/"
        className="mb-4 inline-block text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        ← 시장으로
      </Link>

      <div className="mb-4">
        <h1 className="text-2xl font-bold">{stock.name}</h1>
        <p className="text-3xl font-bold tabular-nums">
          {formatPrice(stock.currentPrice)}
        </p>
        <p className={`text-sm tabular-nums ${upDownClass(change)}`}>
          {formatSignedPrice(priceDiff)} {formatSignedPercent(change)}
          <span className="ml-2 text-[var(--muted)]">전일 종가 기준</span>
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <CandlestickChart
            history={stock.priceHistory}
            averagePrice={holding?.averagePrice}
            prevDayClose={stock.prevDayClose}
          />
          <OrderBook stock={stock} />
        </div>
        <QuickOrderPanel stock={stock} />
      </div>
    </>
  );
}

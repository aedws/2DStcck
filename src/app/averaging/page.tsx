"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AveragingCalculator } from "@/components/market/AveragingCalculator";
import { formatPrice } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";

export default function AveragingPage() {
  const holdings = useMarketStore((state) => state.holdings);
  const stocks = useMarketStore((state) => state.stocks);
  const [selectedId, setSelectedId] = useState<string>("");

  const holdingOptions = useMemo(
    () =>
      holdings
        .filter((holding) => holding.quantity > 0)
        .map((holding) => {
          const stock = stocks.find((item) => item.id === holding.stockId);
          return {
            id: holding.stockId,
            label: stock
              ? `${stock.name} (${stock.ticker})`
              : holding.stockId,
            quantity: holding.quantity,
            averagePrice: holding.averagePrice,
            markPrice: stock?.currentPrice ?? 0,
          };
        })
        .sort((a, b) => a.label.localeCompare(b.label, "ko")),
    [holdings, stocks],
  );

  const selected =
    holdingOptions.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="mx-auto max-w-3xl pb-24">
      <header className="mb-6">
        <p className="text-sm font-semibold text-sky-300">TRADE HELPER</p>
        <h1 className="mt-1 text-2xl font-black">🧮 물타기 / 불타기 계산기</h1>
        <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
          추가 매수 후 새 평단과 필요 수량을 미리 계산합니다. 실제 주문은
          실행되지 않으며, 종목 상세의 주문 패널에서도 같은 계산기를 열 수
          있습니다.
        </p>
      </header>

      <section className="mb-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">
            보유 종목에서 채우기 (선택)
          </span>
          <select
            value={selectedId}
            onChange={(event) => setSelectedId(event.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)]"
          >
            <option value="">직접 입력</option>
            {holdingOptions.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label} · {item.quantity.toLocaleString("ko-KR")}주 · 평단{" "}
                {formatPrice(item.averagePrice)}
              </option>
            ))}
          </select>
        </label>
        {holdingOptions.length === 0 && (
          <p className="mt-2 text-xs text-[var(--muted)]">
            보유 종목이 없으면 수량을 직접 입력해 계산할 수 있습니다.
          </p>
        )}
      </section>

      <section className="rounded-3xl border border-sky-400/30 bg-sky-400/5 p-5">
        <AveragingCalculator
          key={selected?.id ?? "manual"}
          initialQuantity={selected?.quantity}
          initialAveragePrice={selected?.averagePrice}
          initialAddPrice={selected?.markPrice}
          markPrice={selected?.markPrice}
          stockLabel={selected?.label}
        />
      </section>

      <p className="mt-5 text-center text-xs text-[var(--muted)]">
        매매 화면에서도 바로 쓸 수 있습니다.{" "}
        <Link href="/portfolio" className="font-semibold text-[var(--accent)]">
          내 계좌 →
        </Link>
      </p>
    </div>
  );
}

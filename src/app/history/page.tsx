"use client";

import { formatPrice, formatTradeTime } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";

export default function HistoryPage() {
  const trades = useMarketStore((s) => s.trades);

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">거래 내역</h1>

      {trades.length === 0 ? (
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-[var(--muted)]">
          아직 거래 내역이 없습니다.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-left text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">체결 시각</th>
                <th className="px-4 py-3 font-medium">종목</th>
                <th className="px-4 py-3 font-medium">구분</th>
                <th className="px-4 py-3 font-medium text-right">수량</th>
                <th className="px-4 py-3 font-medium text-right">단가</th>
                <th className="px-4 py-3 font-medium text-right">총액</th>
              </tr>
            </thead>
            <tbody>
              {trades.map((trade) => (
                <tr
                  key={trade.id}
                  className="border-b border-[var(--border)]/50 hover:bg-[var(--surface)]/50"
                >
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {formatTradeTime(trade.timestamp)}
                  </td>
                  <td className="px-4 py-3 font-medium">{trade.ticker}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        trade.type === "buy"
                          ? "text-[var(--up)]"
                          : "text-[var(--down)]"
                      }
                    >
                      {trade.type === "buy" ? "매수" : "매도"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {trade.quantity.toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatPrice(trade.price)}
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {formatPrice(trade.total)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

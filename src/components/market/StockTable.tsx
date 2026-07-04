"use client";

import Link from "next/link";
import type { StockState } from "@/lib/types/market";
import { formatPercent, formatPrice, getDayChangePercent } from "@/lib/market/engine";

export function StockTable({ stocks }: { stocks: StockState[] }) {
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-800">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-800 bg-zinc-900/50 text-left text-zinc-500">
            <th className="px-4 py-3 font-medium">종목</th>
            <th className="px-4 py-3 font-medium">섹터</th>
            <th className="px-4 py-3 font-medium text-right">현재가</th>
            <th className="px-4 py-3 font-medium text-right">등락률</th>
          </tr>
        </thead>
        <tbody>
          {stocks.map((stock) => {
            const change = getDayChangePercent(stock);
            const isUp = change >= 0;

            return (
              <tr
                key={stock.id}
                className="border-b border-zinc-800/50 transition hover:bg-zinc-900/50"
              >
                <td className="px-4 py-3">
                  <Link href={`/stock/${stock.id}`} className="block">
                    <span className="font-medium text-zinc-100">
                      {stock.name}
                    </span>
                    <span className="ml-2 text-xs text-zinc-500">
                      {stock.ticker}
                    </span>
                  </Link>
                </td>
                <td className="px-4 py-3 text-zinc-400">{stock.sector}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {formatPrice(stock.currentPrice)}
                </td>
                <td
                  className={`px-4 py-3 text-right font-mono ${
                    isUp ? "text-emerald-400" : "text-red-400"
                  }`}
                >
                  {formatPercent(change)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

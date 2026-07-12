"use client";

import Link from "next/link";
import { formatPercent, formatPrice } from "@/lib/market/engine";
import {
  getSalaryDaysRemaining,
  SALARY_AMOUNT,
} from "@/lib/market/salary";
import {
  calculateCoveredCallDistribution,
  COVERED_CALL_INTERVAL_DAYS,
  getDistributionDaysRemaining,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
} from "@/lib/market/distributions";
import { useMarketStore } from "@/store/marketStore";

export default function PortfolioPage() {
  const cash = useMarketStore((s) => s.cash);
  const holdings = useMarketStore((s) => s.holdings);
  const stocks = useMarketStore((s) => s.stocks);
  const getTotalAssets = useMarketStore((s) => s.getTotalAssets);
  const initialCash = useMarketStore((s) => s.initialCash);
  const lastSalarySession = useMarketStore((s) => s.lastSalarySession);
  const lastMonthlyDistributionSession = useMarketStore(
    (s) => s.lastMonthlyDistributionSession,
  );
  const lastQuarterlyDividendSession = useMarketStore(
    (s) => s.lastQuarterlyDividendSession,
  );

  const total = getTotalAssets();
  const stockValue = total - cash;
  const returnRate = ((total - initialCash) / initialCash) * 100;
  const currentSession = stocks[0]?.daySessionId ?? lastSalarySession;
  const salaryDays = getSalaryDaysRemaining(
    lastSalarySession,
    currentSession,
  );

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">포트폴리오</h1>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="총 자산" value={formatPrice(total)} />
        <SummaryCard label="주식 평가액" value={formatPrice(stockValue)} />
        <SummaryCard
          label="수익률"
          value={`${returnRate >= 0 ? "+" : ""}${returnRate.toFixed(2)}%`}
          color={returnRate >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <SummaryCard
          label={`다음 고정급 (${formatPrice(SALARY_AMOUNT)})`}
          value={`${salaryDays}거래일 후`}
          color="text-emerald-400"
        />
      </div>

      {holdings.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-500">
          보유 종목이 없습니다.{" "}
          <Link href="/" className="text-emerald-400 hover:underline">
            시장
          </Link>
          에서 매수해 보세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-left text-zinc-500">
                <th className="px-4 py-3 font-medium">종목</th>
                <th className="px-4 py-3 font-medium text-right">보유</th>
                <th className="px-4 py-3 font-medium text-right">평단</th>
                <th className="px-4 py-3 font-medium text-right">현재가</th>
                <th className="px-4 py-3 font-medium text-right">평가액</th>
                <th className="px-4 py-3 font-medium text-right">현금 지급</th>
                <th className="px-4 py-3 font-medium text-right">수익률</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((h) => {
                const stock = stocks.find((s) => s.id === h.stockId);
                if (!stock) return null;

                const evalAmount = h.quantity * stock.currentPrice;
                const cost = h.quantity * h.averagePrice;
                const profit = ((evalAmount - cost) / cost) * 100;
                const coveredCallPerShare = stock.coveredCallAnnualYield
                  ? calculateCoveredCallDistribution(
                      stock.prevDayClose || stock.currentPrice,
                      stock.coveredCallAnnualYield,
                      stock.id,
                      lastMonthlyDistributionSession +
                        COVERED_CALL_INTERVAL_DAYS,
                    )
                  : 0;
                const payoutPerShare =
                  coveredCallPerShare || stock.quarterlyDividend || 0;
                const payoutDays = coveredCallPerShare
                  ? getDistributionDaysRemaining(
                      lastMonthlyDistributionSession,
                      currentSession,
                      COVERED_CALL_INTERVAL_DAYS,
                    )
                  : stock.quarterlyDividend
                    ? getDistributionDaysRemaining(
                        lastQuarterlyDividendSession,
                        currentSession,
                        QUARTERLY_DIVIDEND_INTERVAL_DAYS,
                      )
                    : null;

                return (
                  <tr
                    key={h.stockId}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/stock/${h.stockId}`}
                        className="font-medium hover:text-emerald-400"
                      >
                        {stock.name}
                        <span className="ml-2 text-xs text-zinc-500">
                          {stock.ticker}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {h.quantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatPrice(h.averagePrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatPrice(stock.currentPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatPrice(evalAmount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {payoutDays === null ? (
                        <span className="text-zinc-600">-</span>
                      ) : (
                        <>
                          <p className="font-mono text-emerald-400">
                            {formatPrice(h.quantity * payoutPerShare)}
                          </p>
                          <p className="text-[10px] text-zinc-500">
                            {payoutDays}거래일 후
                          </p>
                        </>
                      )}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        profit >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {formatPercent(profit)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function SummaryCard({
  label,
  value,
  color = "text-zinc-100",
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-4">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-1 text-xl font-semibold ${color}`}>{value}</p>
    </div>
  );
}

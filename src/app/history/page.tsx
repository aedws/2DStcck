"use client";

import { formatPrice, formatTradeTime } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";

export default function HistoryPage() {
  const trades = useMarketStore((s) => s.trades);
  const cashPayments = useMarketStore((s) => s.cashPayments);

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">거래·지급 내역</h1>

      <h2 className="mb-3 text-base font-semibold">현금 지급</h2>
      {cashPayments.length === 0 ? (
        <div className="mb-8 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center text-sm text-[var(--muted)]">
          아직 현금 지급 내역이 없습니다.
        </div>
      ) : (
        <div className="mb-8 overflow-hidden rounded-xl border border-[var(--border)]">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)] text-left text-[var(--muted)]">
                <th className="px-4 py-3 font-medium">지급 시각</th>
                <th className="px-4 py-3 font-medium">구분</th>
                <th className="px-4 py-3 font-medium">대상</th>
                <th className="px-4 py-3 font-medium text-right">지급 기준</th>
                <th className="px-4 py-3 font-medium text-right">금액</th>
              </tr>
            </thead>
            <tbody>
              {cashPayments.map((payment) => (
                <tr
                  key={payment.id}
                  className="border-b border-[var(--border)]/50 hover:bg-[var(--surface)]/50"
                >
                  <td className="px-4 py-3 text-[var(--muted)]">
                    {formatTradeTime(payment.timestamp)}
                  </td>
                  <td className="px-4 py-3 font-medium">
                    {payment.kind === "salary"
                      ? "고정급"
                      : payment.kind === "covered_call"
                        ? "월 분배"
                        : payment.kind === "interest"
                          ? "마진 이자"
                          : payment.kind === "lottery"
                            ? "복권"
                            : "분기 배당"}
                  </td>
                  <td className="px-4 py-3">
                    {payment.ticker ?? "계정"}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--muted)]">
                    {payment.quantity && payment.amountPerShare
                      ? `${payment.quantity.toLocaleString()}주 × ${formatPrice(payment.amountPerShare)}`
                      : `거래일 ${payment.dueSession}`}
                  </td>
                  <td
                    className={`px-4 py-3 text-right font-mono ${
                      payment.amount >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"
                    }`}
                  >
                    {payment.amount >= 0 ? "+" : "-"}
                    {formatPrice(Math.abs(payment.amount))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mb-3 text-base font-semibold">주문 체결</h2>

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
                        trade.type === "buy" || trade.type === "cover"
                          ? "text-[var(--up)]"
                          : "text-[var(--down)]"
                      }
                    >
                      {trade.type === "buy"
                        ? "매수"
                        : trade.type === "sell"
                          ? "매도"
                          : trade.type === "short"
                            ? "공매도"
                            : "공매도 청산"}
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

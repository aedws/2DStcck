"use client";

import { formatPrice, formatTradeTime } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";
import type { Trade } from "@/lib/types/market";

function tradeLabel(trade: Trade): string {
  switch (trade.type) {
    case "buy": return "매수";
    case "sell": return "매도";
    case "short": return "공매도";
    case "cover": return "공매도 청산";
    case "option_buy": return `${trade.optionKind === "put" ? "풋" : "콜"} 매수`;
    case "option_write": return `${trade.optionKind === "put" ? "풋" : "콜"} 발행`;
    case "option_close": return "옵션 청산";
    case "option_expire": return "옵션 만기";
  }
}

function isCashOutflow(trade: Trade): boolean {
  if (trade.type === "buy" || trade.type === "cover" || trade.type === "option_buy") return true;
  if (trade.type === "option_close") return trade.optionSide === "short";
  if (trade.type === "option_expire") return trade.optionSide === "short";
  return false;
}

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
        <div className="mb-8 overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--border)] [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[720px] text-sm">
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
                            : payment.kind === "minigame"
                              ? "현금 채굴"
                              : payment.kind === "attendance"
                                ? "출석"
                                : payment.kind === "compensation"
                                  ? "운영 보상"
                                  : payment.kind === "company_capital"
                                    ? "회사 출자 소각"
                                    : payment.kind === "amc_capital"
                                      ? "운용사 소각"
                                      : payment.kind === "management_fee"
                                        ? "ETF 운용료"
                                        : payment.kind === "exchange_tax"
                                          ? "거래소 거래세"
                                          : payment.kind === "capital_gains_tax"
                                            ? "거래세·양도소득세"
                                            : payment.kind === "financial_investment_tax"
                                              ? "금융투자소득세"
                                              : payment.kind === "corporate_tax"
                                                ? "법인세"
                                        : payment.kind === "amc_dividend"
                                          ? "유저 ETF 배당"
                                          : payment.kind === "amc_redemption"
                                            ? "ETF 상장폐지 환급"
                                  : "분기 배당"}
                  </td>
                  <td className="px-4 py-3">
                    {payment.ticker ?? "계정"}
                  </td>
                  <td className="px-4 py-3 text-right text-[var(--muted)]">
                    {payment.quantity && payment.amountPerShare
                      ? `${payment.quantity.toLocaleString("ko-KR", { maximumFractionDigits: 6 })}주 × ${formatPrice(payment.amountPerShare)}`
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
        <div className="overflow-x-auto overscroll-x-contain rounded-xl border border-[var(--border)] [-webkit-overflow-scrolling:touch]">
          <table className="w-full min-w-[720px] text-sm">
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
                        isCashOutflow(trade)
                          ? "text-[var(--up)]"
                          : "text-[var(--down)]"
                      }
                    >
                      {tradeLabel(trade)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right font-mono">
                    {trade.quantity.toLocaleString("ko-KR", {
                      maximumFractionDigits: 6,
                    })}
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

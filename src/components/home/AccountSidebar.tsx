"use client";

import { useState } from "react";
import Link from "next/link";
import { useMarketStore } from "@/store/marketStore";
import {
  formatPrice,
  formatSignedMoney,
  formatTradeTime,
} from "@/lib/market/engine";
import {
  formatSignedPercent,
  upDownClass,
} from "@/lib/ui/marketColors";
import {
  getSalaryDaysRemaining,
  SALARY_AMOUNT,
} from "@/lib/market/salary";
import { computePrestige } from "@/lib/player/prestige";

const ORDER_TABS = ["대기", "완료", "조건주문"];

export function AccountSidebar() {
  const [orderTab, setOrderTab] = useState(1);
  const cash = useMarketStore((s) => s.cash);
  const holdings = useMarketStore((s) => s.holdings);
  const stocks = useMarketStore((s) => s.stocks);
  const trades = useMarketStore((s) => s.trades);
  const cashPayments = useMarketStore((s) => s.cashPayments);
  const getTotalAssets = useMarketStore((s) => s.getTotalAssets);
  const initialCash = useMarketStore((s) => s.initialCash);
  const lastSalarySession = useMarketStore((s) => s.lastSalarySession);
  const reset = useMarketStore((s) => s.reset);
  const achievements = useMarketStore((s) => s.achievements);
  const characterProgress = useMarketStore((s) => s.characterProgress);
  const unlockedSeasonRewardIds = useMarketStore((s) => s.unlockedSeasonRewardIds);
  const investmentMastery = useMarketStore((s) => s.investmentMastery);
  const investmentSeason = useMarketStore((s) => s.investmentSeason);
  const reputation = useMarketStore((s) => s.reputation);
  const ownedLuxuries = useMarketStore((s) => s.ownedLuxuries);

  const prestige = computePrestige({
    achievements,
    characterProgress,
    unlockedSeasonRewardIds,
    investmentMastery,
    investmentSeason,
    ownedLuxuries,
    reputation,
  });
  const total = getTotalAssets();
  const profit = total - initialCash;
  const returnRate = (profit / initialCash) * 100;
  const currentSession = stocks[0]?.daySessionId ?? lastSalarySession;
  const salaryDays = getSalaryDaysRemaining(
    lastSalarySession,
    currentSession,
  );
  // 시장은 항상 로컬 결정론 — 급여는 늘 활성 (로그인은 저장용일 뿐)
  const salaryActive = true;

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--background)] lg:flex">
      <div className="border-b border-[var(--border)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">내 투자</h2>
          <Link
            href="/portfolio"
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            상세 →
          </Link>
        </div>
        <p className="mt-3 text-2xl font-bold tabular-nums">
          {formatPrice(total)}
        </p>
        <p className={`mt-1 text-sm tabular-nums ${upDownClass(profit)}`}>
          {formatSignedMoney(profit)} {formatSignedPercent(returnRate)}
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          가용 현금 {formatPrice(cash)}
        </p>
        <Link
          href="/profile"
          className="mt-3 flex items-center justify-between rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2.5 transition hover:border-violet-400/50"
        >
          <div>
            <p className="text-xs font-medium text-violet-200">✨ 프레스티지</p>
            <p className="mt-0.5 text-[10px] text-[var(--muted)]">
              수집·경쟁 종합 · 유대 {prestige.bondedCharacters}명
            </p>
          </div>
          <span className="text-lg font-black tabular-nums text-violet-200">
            {prestige.total.toLocaleString()}
          </span>
        </Link>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-[var(--surface)] px-3 py-2.5">
          <div>
            <p className="text-xs font-medium">20거래일 고정급</p>
            <p className="mt-0.5 text-[10px] text-[var(--muted)]">
              {salaryActive
                ? `다음 지급까지 ${salaryDays}거래일`
                : "로그인 후 지급 주기 시작"}
            </p>
          </div>
          <span className="text-xs font-semibold tabular-nums text-[var(--up)]">
            +{formatPrice(SALARY_AMOUNT)}
          </span>
        </div>
        {cashPayments[0] && (
          <p className="mt-2 text-[10px] text-[var(--muted)]">
            최근 지급 · {cashPayments[0].ticker ?? "고정급"}{" "}
            <span className="font-medium text-[var(--up)]">
              +{formatPrice(cashPayments[0].amount)}
            </span>
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {holdings.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--muted)]">
            보유 종목이 없어요
          </p>
        ) : (
          <ul className="space-y-2">
            {holdings.map((h) => {
              const stock = stocks.find((s) => s.id === h.stockId);
              if (!stock) return null;
              const evalAmount = h.quantity * stock.currentPrice;
              const cost = h.quantity * h.averagePrice;
              const pnl = ((evalAmount - cost) / cost) * 100;

              return (
                <li
                  key={h.stockId}
                  className="rounded-xl bg-[var(--surface)] px-3 py-3"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{stock.name}</span>
                    <span className="text-sm tabular-nums">
                      {formatPrice(evalAmount)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-[var(--muted)]">
                      {h.quantity.toLocaleString("ko-KR", {
                        maximumFractionDigits: 6,
                      })}주
                    </span>
                    <span className={`tabular-nums ${upDownClass(pnl)}`}>
                      {formatSignedPercent(pnl)}
                    </span>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-[var(--border)] p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">주문내역</h3>
          <Link
            href="/history"
            className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            전체보기
          </Link>
        </div>
        <div className="mb-3 flex gap-3">
          {ORDER_TABS.map((label, i) => (
            <button
              key={label}
              onClick={() => setOrderTab(i)}
              className={`text-xs transition ${
                orderTab === i
                  ? "font-semibold text-[var(--foreground)]"
                  : "text-[var(--muted)]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {orderTab === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--muted)]">
            대기중인 주문이 없어요
          </p>
        ) : orderTab === 2 ? (
          <p className="py-4 text-center text-xs text-[var(--muted)]">
            조건주문은 준비 중이에요
          </p>
        ) : trades.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--muted)]">
            완료된 주문이 없어요
          </p>
        ) : (
          <ul className="max-h-48 space-y-2 overflow-y-auto">
            {trades.slice(0, 8).map((trade) => (
              <li
                key={trade.id}
                className="flex items-center justify-between text-xs"
              >
                <div>
                  <span
                    className={
                      trade.type === "buy"
                        ? "text-[var(--up)]"
                        : "text-[var(--down)]"
                    }
                  >
                    {trade.type === "buy" ? "매수" : "매도"}
                  </span>
                  <span className="ml-1.5 text-[var(--muted)]">
                    {trade.ticker}
                  </span>
                </div>
                <div className="text-right tabular-nums">
                  <p>{formatPrice(trade.total)}</p>
                  <p className="text-[10px] text-[var(--muted)]">
                    {formatTradeTime(trade.timestamp)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}

        <button
          onClick={() => {
            if (confirm("게임을 초기화하시겠습니까?")) reset();
          }}
          className="mt-4 w-full rounded-xl border border-[var(--border)] py-2 text-xs text-[var(--muted)] transition hover:text-[var(--foreground)]"
        >
          초기화
        </button>
      </div>
    </aside>
  );
}

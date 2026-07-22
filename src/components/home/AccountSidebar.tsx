"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMarketStore } from "@/store/marketStore";
import {
  formatPrice,
  formatCompactMoney,
  formatSignedCompact,
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
import { getBenchmark } from "@/lib/market/interestRate";
import {
  calculateSeasonPerformance,
  seasonExternalCashTotal,
} from "@/lib/market/investmentSeasons";
import {
  getAmcPortfolioPositions,
  mergeAmcPortfolioFunds,
} from "@/lib/player/amcPortfolio";
import { listedFundToAmcState } from "@/lib/supabase/amcListedFunds";

const ORDER_TABS = ["대기", "완료", "조건주문"];

export function AccountSidebar() {
  const [orderTab, setOrderTab] = useState(1);
  const cash = useMarketStore((s) => s.cash);
  const holdings = useMarketStore((s) => s.holdings);
  const stocks = useMarketStore((s) => s.stocks);
  const assetManager = useMarketStore((s) => s.assetManager);
  const listedAmcFunds = useMarketStore((s) => s.listedAmcFunds);
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
  const playerCompany = useMarketStore((s) => s.playerCompany);

  const accountPositions = useMemo(() => {
    const regular = holdings.flatMap((holding) => {
      const stock = stocks.find((item) => item.id === holding.stockId);
      if (!stock) return [];
      const evaluation = holding.quantity * stock.currentPrice;
      const cost = holding.quantity * holding.averagePrice;
      return [{
        id: holding.stockId,
        name: stock.name,
        ticker: stock.ticker,
        quantity: holding.quantity,
        evaluation,
        pnl: cost > 0 ? ((evaluation - cost) / cost) * 100 : 0,
        href: `/stock/${holding.stockId}`,
        userEtf: false,
      }];
    });
    const funds = mergeAmcPortfolioFunds(
      assetManager?.funds ?? [],
      listedAmcFunds.map(listedFundToAmcState),
    );
    const userEtfs = getAmcPortfolioPositions(holdings, funds, stocks).map(
      (position) => {
        const cost =
          position.holding.quantity * position.holding.averagePrice;
        return {
          id: position.holding.stockId,
          name: position.fund.name,
          ticker: position.fund.ticker,
          quantity: position.holding.quantity,
          evaluation: position.evaluation,
          pnl:
            cost > 0
              ? ((position.evaluation - cost) / cost) * 100
              : 0,
          href: `/amc/trade?id=${encodeURIComponent(position.fund.id)}`,
          userEtf: true,
        };
      },
    );
    return [...regular, ...userEtfs];
  }, [assetManager, holdings, listedAmcFunds, stocks]);

  const prestige = computePrestige({
    achievements,
    characterProgress,
    unlockedSeasonRewardIds,
    investmentMastery,
    investmentSeason,
    ownedLuxuries,
    reputation,
    playerCompany,
  });
  const total = getTotalAssets();
  const profit = total - initialCash;
  const returnRate = (profit / initialCash) * 100;
  // 노동·외부수입(고정급·복권·출석·현금 채굴)을 뺀 순수 투자 성과 — 판단이
  // 지수를 이겼는지(알파)만 뽑아 보여준다. 시즌 창을 기준 구간으로 재사용한다.
  const benchmarkPrice = getBenchmark(stocks)?.currentPrice ?? 0;
  const skillPerf =
    investmentSeason.current && benchmarkPrice > 0
      ? calculateSeasonPerformance(
          investmentSeason.current,
          total,
          benchmarkPrice,
          seasonExternalCashTotal(cashPayments),
        )
      : null;
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
        <p className="mt-3 text-2xl font-bold tabular-nums" title={formatPrice(total)}>
          {formatCompactMoney(total)}
        </p>
        <p className={`mt-1 text-sm tabular-nums ${upDownClass(profit)}`}>
          {formatSignedCompact(profit)} {formatSignedPercent(returnRate)}
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          가용 현금 {formatCompactMoney(cash)}
        </p>
        {skillPerf && (
          <div className="mt-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium">지수 대비 (알파)</p>
              <span
                className={`text-sm font-bold tabular-nums ${upDownClass(
                  skillPerf.alpha,
                )}`}
              >
                {formatSignedPercent(skillPerf.alpha * 100)}p
              </span>
            </div>
            <div className="mt-1.5 flex items-center justify-between text-[10px] text-[var(--muted)]">
              <span>
                내 투자{" "}
                <span className={`tabular-nums ${upDownClass(skillPerf.playerReturn)}`}>
                  {formatSignedPercent(skillPerf.playerReturn * 100)}
                </span>
              </span>
              <span>
                지수{" "}
                <span className={`tabular-nums ${upDownClass(skillPerf.benchmarkReturn)}`}>
                  {formatSignedPercent(skillPerf.benchmarkReturn * 100)}
                </span>
              </span>
            </div>
            <p className="mt-1 text-[10px] text-[var(--muted)]">
              고정급·복권·채굴 수입 제외 · 순수 매매 실력
            </p>
          </div>
        )}
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
        {accountPositions.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--muted)]">
            보유 종목이 없어요
          </p>
        ) : (
          <ul className="space-y-2">
            {accountPositions.map((position) => {
              return (
                <li
                  key={position.id}
                  className="rounded-xl bg-[var(--surface)] px-3 py-3"
                >
                  <div className="flex items-center justify-between">
                    <Link
                      href={position.href}
                      className="text-sm font-medium hover:text-[var(--up)]"
                    >
                      {position.name}
                      <span className="ml-1 text-[10px] text-[var(--muted)]">
                        {position.ticker}
                      </span>
                      {position.userEtf && (
                        <span className="ml-1 rounded bg-emerald-500/15 px-1 py-0.5 text-[9px] text-emerald-300">
                          유저 ETF
                        </span>
                      )}
                    </Link>
                    <span className="text-sm tabular-nums">
                      {formatPrice(position.evaluation)}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs">
                    <span className="text-[var(--muted)]">
                      {position.quantity.toLocaleString("ko-KR", {
                        maximumFractionDigits: 6,
                      })}주
                    </span>
                    <span className={`tabular-nums ${upDownClass(position.pnl)}`}>
                      {formatSignedPercent(position.pnl)}
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

"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatPercent, formatPrice, formatCompactMoney } from "@/lib/market/engine";
import {
  getSalaryDaysRemaining,
  SALARY_AMOUNT,
} from "@/lib/market/salary";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { stockHref } from "@/lib/ui/stockLink";
import {
  calculateCoveredCallDistribution,
  COVERED_CALL_INTERVAL_DAYS,
  getDistributionDaysRemaining,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
} from "@/lib/market/distributions";
import { useMarketStore } from "@/store/marketStore";
import { LUXURY_BY_ID } from "@/data/luxuries";
import { getLuxuryValue } from "@/lib/market/luxury";
import {
  getActivePreferredShares,
  getPreferredShareValue,
} from "@/lib/player/preferredShares";
import { computeCharacterConcentration } from "@/lib/market/characterConcentration";
import {
  computeRealizedPnl,
  computeUnrealizedPnl,
  computeShortUnrealizedPnl,
  computeOptionUnrealizedPnl,
} from "@/lib/market/portfolioStats";
import {
  longValue as computeLongValue,
  shortLiability,
  marginDebit,
} from "@/lib/market/margin";
import {
  getAnnualRatePercent,
  RATE_LABEL,
} from "@/lib/market/interestRate";
import { EquityCurve } from "@/components/ui/EquityCurve";
import {
  positionMark,
  optionLabel,
  isZeroDteExpiry,
} from "@/lib/market/options";

type HoldingSortKey =
  | "stock"
  | "quantity"
  | "averagePrice"
  | "currentPrice"
  | "evaluation"
  | "payout"
  | "returnRate";
type SortDirection = "asc" | "desc";

export default function PortfolioPage() {
  const [holdingSort, setHoldingSort] = useState<{
    key: HoldingSortKey | null;
    direction: SortDirection;
  }>({ key: null, direction: "desc" });
  const cash = useMarketStore((s) => s.cash);
  const holdings = useMarketStore((s) => s.holdings);
  const shorts = useMarketStore((s) => s.shorts);
  const options = useMarketStore((s) => s.options);
  const stocks = useMarketStore((s) => s.stocks);
  const trades = useMarketStore((s) => s.trades);
  const ownedLuxuries = useMarketStore((s) => s.ownedLuxuries);
  const preferredShares = useMarketStore((s) => s.preferredShares);
  const netWorthHistory = useMarketStore((s) => s.netWorthHistory);
  const getTotalAssets = useMarketStore((s) => s.getTotalAssets);
  const getEquity = useMarketStore((s) => s.getEquity);
  const getRateLevel = useMarketStore((s) => s.getRateLevel);
  const marginCallAt = useMarketStore((s) => s.marginCallAt);
  const initialCash = useMarketStore((s) => s.initialCash);
  const lastSalarySession = useMarketStore((s) => s.lastSalarySession);
  const lastMonthlyDistributionSession = useMarketStore(
    (s) => s.lastMonthlyDistributionSession,
  );
  const lastSingleCoveredCallDistributionSession = useMarketStore(
    (s) => s.lastSingleCoveredCallDistributionSession,
  );
  const lastQuarterlyDividendSession = useMarketStore(
    (s) => s.lastQuarterlyDividendSession,
  );

  const total = getTotalAssets();
  const luxuryValue = getLuxuryValue(ownedLuxuries);
  // 우선주는 집중 유지 중인 활성분만 자산 반영 — 총자산과 일치시킨다.
  const preferredConcentration = computeCharacterConcentration(
    holdings,
    stocks,
    getEquity(),
  );
  const activePreferredShares = getActivePreferredShares(
    preferredShares,
    preferredConcentration,
  );
  const activePreferredIds = new Set(
    activePreferredShares.map((share) => share.characterId),
  );
  const preferredValue = getPreferredShareValue(activePreferredShares);
  const priceById = Object.fromEntries(
    stocks.map((s) => [s.id, s.currentPrice]),
  );
  const longVal = computeLongValue(holdings, priceById);
  const shortLiab = shortLiability(shorts, priceById);
  const debit = marginDebit(cash);
  const stockValue = longVal;
  const rateLevel = getRateLevel();
  const returnRate = ((total - initialCash) / initialCash) * 100;
  const recentMarginCall =
    marginCallAt !== null && Date.now() - marginCallAt < 5 * 60 * 1000;
  const currentSession = stocks[0]?.daySessionId ?? lastSalarySession;
  const realizedPnl = computeRealizedPnl(trades);
  const unrealizedPnl =
    computeUnrealizedPnl(holdings, priceById) +
    computeShortUnrealizedPnl(shorts, priceById) +
    computeOptionUnrealizedPnl(
      options,
      stocks,
      // 옵션은 장중 잔존만기(소수 거래일)로 평가해 0DTE 시간가치 소멸을 반영한다.
      Date.now() / SESSION_DURATION_MS,
      getAnnualRatePercent(rateLevel) / 100,
    );
  const salaryDays = getSalaryDaysRemaining(
    lastSalarySession,
    currentSession,
  );

  const toggleHoldingSort = (key: HoldingSortKey) => {
    setHoldingSort((current) =>
      current.key === key
        ? {
            key,
            direction: current.direction === "asc" ? "desc" : "asc",
          }
        : { key, direction: key === "stock" ? "asc" : "desc" },
    );
  };

  const sortedHoldingRows = useMemo(() => {
    const rows = holdings.flatMap((holding) => {
      const stock = stocks.find((item) => item.id === holding.stockId);
      if (!stock) return [];
      const evaluation = holding.quantity * stock.currentPrice;
      const cost = holding.quantity * holding.averagePrice;
      const returnRate = cost > 0 ? ((evaluation - cost) / cost) * 100 : 0;
      const coveredCallInterval =
        stock.coveredCallDistributionIntervalDays ?? COVERED_CALL_INTERVAL_DAYS;
      const coveredCallCheckpoint =
        coveredCallInterval === 5
          ? lastSingleCoveredCallDistributionSession
          : lastMonthlyDistributionSession;
      const coveredCallPerShare = stock.coveredCallAnnualYield
        ? calculateCoveredCallDistribution(
            stock.prevDayClose || stock.currentPrice,
            stock.coveredCallAnnualYield,
            stock.id,
            coveredCallCheckpoint + coveredCallInterval,
            coveredCallInterval,
          )
        : 0;
      const payoutPerShare =
        coveredCallPerShare || stock.quarterlyDividend || 0;
      const payoutDays = coveredCallPerShare
        ? getDistributionDaysRemaining(
            coveredCallCheckpoint,
            currentSession,
            coveredCallInterval,
          )
        : stock.quarterlyDividend
          ? getDistributionDaysRemaining(
              lastQuarterlyDividendSession,
              currentSession,
              QUARTERLY_DIVIDEND_INTERVAL_DAYS,
            )
          : null;
      return [
        {
          holding,
          stock,
          evaluation,
          returnRate,
          payoutAmount: holding.quantity * payoutPerShare,
          payoutDays,
        },
      ];
    });
    if (!holdingSort.key) return rows;

    const valueOf = (row: (typeof rows)[number]): string | number => {
      switch (holdingSort.key) {
        case "stock":
          return `${row.stock.name} ${row.stock.ticker}`;
        case "quantity":
          return row.holding.quantity;
        case "averagePrice":
          return row.holding.averagePrice;
        case "currentPrice":
          return row.stock.currentPrice;
        case "evaluation":
          return row.evaluation;
        case "payout":
          return row.payoutAmount;
        case "returnRate":
          return row.returnRate;
        default:
          return 0;
      }
    };
    return [...rows].sort((left, right) => {
      const leftValue = valueOf(left);
      const rightValue = valueOf(right);
      const compared =
        typeof leftValue === "string" && typeof rightValue === "string"
          ? leftValue.localeCompare(rightValue, "ko")
          : Number(leftValue) - Number(rightValue);
      return holdingSort.direction === "asc" ? compared : -compared;
    });
  }, [
    currentSession,
    holdingSort,
    holdings,
    lastMonthlyDistributionSession,
    lastQuarterlyDividendSession,
    lastSingleCoveredCallDistributionSession,
    stocks,
  ]);

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">포트폴리오</h1>

      {recentMarginCall && (
        <div className="mb-6 rounded-xl border border-red-500/40 bg-red-500/10 p-4 text-sm text-red-300">
          ⚠️ <b>마진콜 발생</b> — 유지증거금 미달로 보유·공매도 포지션이 강제
          청산되었습니다. 레버리지를 낮춰 다시 도전해 보세요.
        </div>
      )}

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard label="총 자산" value={formatCompactMoney(total)} />
        <SummaryCard label="주식 평가액" value={formatCompactMoney(stockValue)} />
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

      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <SummaryCard
          label={`기준금리 (${rateLevel}단계·${RATE_LABEL[rateLevel]})`}
          value={`연 ${getAnnualRatePercent(rateLevel)}%`}
          color={
            rateLevel === 3
              ? "text-red-400"
              : rateLevel === 1
                ? "text-emerald-400"
                : "text-zinc-100"
          }
        />
        <SummaryCard
          label="마진 대출"
          value={debit > 0 ? formatCompactMoney(debit) : "-"}
          color={debit > 0 ? "text-amber-400" : "text-zinc-100"}
        />
        <SummaryCard
          label="공매도 부채"
          value={shortLiab > 0 ? formatCompactMoney(shortLiab) : "-"}
          color={shortLiab > 0 ? "text-amber-400" : "text-zinc-100"}
        />
        <SummaryCard label="현금" value={formatCompactMoney(cash)} />
      </div>

      {shorts.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-left text-zinc-500">
                <th className="px-4 py-3 font-medium">공매도 종목</th>
                <th className="px-4 py-3 font-medium text-right">수량</th>
                <th className="px-4 py-3 font-medium text-right">진입가</th>
                <th className="px-4 py-3 font-medium text-right">현재가</th>
                <th className="px-4 py-3 font-medium text-right">손익</th>
              </tr>
            </thead>
            <tbody>
              {shorts.map((sh) => {
                const stock = stocks.find((s) => s.id === sh.stockId);
                if (!stock) return null;
                const pnl =
                  (sh.averagePrice - stock.currentPrice) * sh.quantity;
                return (
                  <tr
                    key={sh.stockId}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/stock/${sh.stockId}`}
                        className="font-medium hover:text-emerald-400"
                      >
                        {stock.name}
                        <span className="ml-2 text-xs text-zinc-500">
                          {stock.ticker}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {sh.quantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatPrice(sh.averagePrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatPrice(stock.currentPrice)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        pnl >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {pnl >= 0 ? "+" : ""}
                      {formatPrice(pnl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {options.length > 0 && (
        <div className="mb-6 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 bg-zinc-900/50 text-left text-zinc-500">
                <th className="px-4 py-3 font-medium">보유 옵션</th>
                <th className="px-4 py-3 font-medium text-right">계약</th>
                <th className="px-4 py-3 font-medium text-right">진입</th>
                <th className="px-4 py-3 font-medium text-right">현재 마크</th>
                <th className="px-4 py-3 font-medium text-right">평가손익</th>
              </tr>
            </thead>
            <tbody>
              {options.map((pos) => {
                const stock = stocks.find((s) => s.id === pos.stockId);
                if (!stock) return null;
                const sessionExact = Date.now() / SESSION_DURATION_MS;
                const rate = getAnnualRatePercent(rateLevel) / 100;
                const mark = positionMark(pos, stock, sessionExact, rate, stocks);
                const pnl =
                  (pos.side === "long"
                    ? mark - pos.openPremium
                    : pos.openPremium - mark) * pos.quantity;
                const zeroDte = isZeroDteExpiry(pos.expirySession, sessionExact);
                return (
                  <tr
                    key={pos.id}
                    className="border-b border-zinc-800/50 hover:bg-zinc-900/50"
                  >
                    <td className="px-4 py-3">
                      <Link
                        href={`/stock/${pos.stockId}`}
                        className="font-medium hover:text-emerald-400"
                      >
                        {stock.name}
                        <span className="ml-2 text-xs text-zinc-500">
                          {optionLabel(pos.kind, pos.side)} · {formatPrice(pos.strike)}
                          {zeroDte && (
                            <span className="ml-1 text-amber-400">0DTE</span>
                          )}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {pos.quantity.toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatPrice(pos.openPremium)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatPrice(mark)}
                    </td>
                    <td
                      className={`px-4 py-3 text-right font-mono ${
                        pnl >= 0 ? "text-emerald-400" : "text-red-400"
                      }`}
                    >
                      {pnl >= 0 ? "+" : ""}
                      {formatPrice(pnl)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h2 className="text-sm font-semibold">순자산 추이</h2>
          <div className="flex gap-4 text-xs">
            <span className="text-zinc-500">
              실현{" "}
              <span
                className={
                  realizedPnl >= 0 ? "text-emerald-400" : "text-red-400"
                }
              >
                {realizedPnl >= 0 ? "+" : ""}
                {formatPrice(realizedPnl)}
              </span>
            </span>
            <span className="text-zinc-500">
              미실현{" "}
              <span
                className={
                  unrealizedPnl >= 0 ? "text-emerald-400" : "text-red-400"
                }
              >
                {unrealizedPnl >= 0 ? "+" : ""}
                {formatPrice(unrealizedPnl)}
              </span>
            </span>
          </div>
        </div>
        <EquityCurve data={netWorthHistory} />
      </div>

      {ownedLuxuries.length > 0 && (
        <div className="mb-6 rounded-xl border border-zinc-800 bg-zinc-900 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">
              🛍️ 보유 사치재{" "}
              <span className="text-zinc-500">
                {ownedLuxuries.length}점 · {formatPrice(luxuryValue)}
              </span>
            </h2>
            <Link href="/shop" className="text-xs text-emerald-400 hover:underline">
              상점
            </Link>
          </div>
          <div className="flex flex-wrap gap-2">
            {ownedLuxuries
              .map((o) => LUXURY_BY_ID.get(o.id))
              .filter((d): d is NonNullable<typeof d> => d !== undefined)
              .sort((a, b) => b.tier - a.tier || b.price - a.price)
              .map((d) => (
                <span
                  key={d.id}
                  className="flex items-center gap-1.5 rounded-full bg-zinc-800 px-3 py-1.5 text-xs"
                  title={`${d.name} · ${formatPrice(d.price)}`}
                >
                  <span className="text-base leading-none">{d.emoji}</span>
                  {d.name}
                </span>
              ))}
          </div>
        </div>
      )}

      {preferredShares.length > 0 && (
        <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">
              🎖️ 관계 보상 우선주{" "}
              <span className="text-zinc-500">
                활성 {activePreferredShares.length}/{preferredShares.length}종 ·{" "}
                {formatPrice(preferredValue)}
              </span>
            </h2>
            <Link href="/characters" className="text-xs text-amber-400 hover:underline">
              도감
            </Link>
          </div>
          <p className="mb-2 text-[11px] text-zinc-500">
            집중(원 앤 온리·트윈 스타·트리플 하르모니아) 유지 중인 우선주만 자산·배당에
            반영됩니다. 집중이 풀리면 휴면(재집중 시 부활)되고, 5캐릭터 이상으로 5거래일
            넘게 분산하면 액면가로 매각·재발행 불가.
          </p>
          <div className="flex flex-wrap gap-2">
            {preferredShares.map((share) => {
              const active = activePreferredIds.has(share.characterId);
              return (
                <Link
                  key={share.characterId}
                  href={`/characters/${share.companyId}`}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs ${active ? "bg-amber-500/15 text-amber-200 hover:bg-amber-500/25" : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"}`}
                  title={`${share.companyName} 우선주 · 분기 배당 ${formatPrice(share.dividendPerShare * share.shares)}${active ? "" : " · 💤 휴면"}`}
                >
                  <span className="text-base leading-none">{share.emoji}</span>
                  {share.companyName}
                  {!active && <span className="text-[10px]">💤</span>}
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {holdings.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900 p-8 text-center text-zinc-500">
          보유 종목이 없습니다.{" "}
          <Link href="/" className="text-emerald-400 hover:underline">
            시장
          </Link>
          에서 매수해 보세요.
        </div>
      ) : (
        <div className="rounded-xl border border-zinc-800">
          <div className="flex items-center justify-between border-b border-zinc-800 bg-zinc-900/50 px-4 py-2 text-xs text-zinc-500">
            <span>열 제목을 눌러 오름차순·내림차순으로 정렬할 수 있습니다.</span>
            {holdingSort.key && (
              <button
                type="button"
                onClick={() => setHoldingSort({ key: null, direction: "desc" })}
                className="shrink-0 rounded-lg px-2.5 py-1 font-semibold text-emerald-400 hover:bg-zinc-800"
              >
                기본 순서
              </button>
            )}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 bg-zinc-900/50 text-left text-zinc-500">
                  <SortableHoldingHeader
                    label="종목"
                    sortKey="stock"
                    activeKey={holdingSort.key}
                    direction={holdingSort.direction}
                    onSort={toggleHoldingSort}
                  />
                  <SortableHoldingHeader
                    label="보유"
                    sortKey="quantity"
                    activeKey={holdingSort.key}
                    direction={holdingSort.direction}
                    onSort={toggleHoldingSort}
                    align="right"
                  />
                  <SortableHoldingHeader
                    label="평단"
                    sortKey="averagePrice"
                    activeKey={holdingSort.key}
                    direction={holdingSort.direction}
                    onSort={toggleHoldingSort}
                    align="right"
                  />
                  <SortableHoldingHeader
                    label="현재가"
                    sortKey="currentPrice"
                    activeKey={holdingSort.key}
                    direction={holdingSort.direction}
                    onSort={toggleHoldingSort}
                    align="right"
                  />
                  <SortableHoldingHeader
                    label="평가액"
                    sortKey="evaluation"
                    activeKey={holdingSort.key}
                    direction={holdingSort.direction}
                    onSort={toggleHoldingSort}
                    align="right"
                  />
                  <SortableHoldingHeader
                    label="현금 지급"
                    sortKey="payout"
                    activeKey={holdingSort.key}
                    direction={holdingSort.direction}
                    onSort={toggleHoldingSort}
                    align="right"
                  />
                  <SortableHoldingHeader
                    label="수익률"
                    sortKey="returnRate"
                    activeKey={holdingSort.key}
                    direction={holdingSort.direction}
                    onSort={toggleHoldingSort}
                    align="right"
                  />
                </tr>
              </thead>
              <tbody>
                {sortedHoldingRows.map(({
                  holding: h,
                  stock,
                  evaluation,
                  returnRate: profit,
                  payoutAmount,
                  payoutDays,
                }) => {
                  return (
                    <tr
                      key={h.stockId}
                      className="border-b border-zinc-800/50 hover:bg-zinc-900/50"
                    >
                    <td className="px-4 py-3">
                      <Link
                        href={stockHref(h.stockId)}
                        className="font-medium hover:text-emerald-400"
                      >
                        {stock.name}
                        <span className="ml-2 text-xs text-zinc-500">
                          {stock.ticker}
                        </span>
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {h.quantity.toLocaleString("ko-KR", {
                        maximumFractionDigits: 6,
                      })}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatPrice(h.averagePrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatPrice(stock.currentPrice)}
                    </td>
                    <td className="px-4 py-3 text-right font-mono">
                      {formatPrice(evaluation)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {payoutDays === null ? (
                        <span className="text-zinc-600">-</span>
                      ) : (
                        <>
                          <p className="font-mono text-emerald-400">
                            {formatPrice(payoutAmount)}
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
        </div>
      )}
    </>
  );
}

function SortableHoldingHeader({
  label,
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: HoldingSortKey;
  activeKey: HoldingSortKey | null;
  direction: SortDirection;
  onSort: (key: HoldingSortKey) => void;
  align?: "left" | "right";
}) {
  const active = activeKey === sortKey;
  return (
    <th
      className="px-2 py-1 font-medium"
      aria-sort={
        active ? (direction === "asc" ? "ascending" : "descending") : undefined
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`flex w-full items-center gap-1 rounded-lg px-2 py-2 hover:bg-zinc-800 hover:text-zinc-200 ${
          align === "right" ? "justify-end" : "justify-start"
        } ${active ? "text-emerald-400" : ""}`}
      >
        <span>{label}</span>
        <span aria-hidden="true" className="text-[10px]">
          {active ? (direction === "asc" ? "▲" : "▼") : "↕"}
        </span>
      </button>
    </th>
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

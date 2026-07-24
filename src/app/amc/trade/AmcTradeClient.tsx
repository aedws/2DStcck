"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AccountSidebar } from "@/components/home/AccountSidebar";
import { BottomTicker } from "@/components/home/BottomTicker";
import { AveragingCalculator } from "@/components/market/AveragingCalculator";
import { CandlestickChart } from "@/components/market/CandlestickChart";
import {
  formatPrice,
  formatSignedMoney,
  formatTradeTime,
} from "@/lib/market/engine";
import { instrumentTypeOf } from "@/lib/market/taxonomy";
import { isListed } from "@/lib/market/ipo";
import { MARGIN_LEVERAGE_OPTIONS } from "@/lib/market/margin";
import {
  AMC_TRADING_SESSIONS_PER_YEAR,
  amcFundStockId,
  classifyAmcFundExposure,
  computePassiveAmcAnnualDividendYield,
  computeAmcFundNavPerShare,
  resolveAmcDividendPeriodRate,
  type AmcFundState,
  type AmcHoldingWeight,
} from "@/lib/player/assetManager";
import {
  createAmcValuationPriceResolver,
  getAmcFundChartSeries,
  getAmcFundPerformanceComparison,
  mergeAmcPortfolioFunds,
  type AmcPerformanceComparison,
} from "@/lib/player/amcPortfolio";
import { listedFundToAmcState } from "@/lib/supabase/amcListedFunds";
import type { PricePoint, StockState } from "@/lib/types/market";
import {
  formatCompactUSD,
  formatSignedPercent,
  upDownClass,
} from "@/lib/ui/marketColors";
import { useMarketStore } from "@/store/marketStore";

const TABS = ["차트 · 종목정보", "펀드정보", "거래내역"] as const;

const HOLDING_COLORS = [
  "#3182f6",
  "#f04452",
  "#f2b94b",
  "#2dd4bf",
  "#a78bfa",
  "#fb923c",
  "#4ade80",
  "#f472b6",
  "#94a3b8",
  "#38bdf8",
  "#facc15",
  "#c084fc",
] as const;

function validQuantity(value: string): number {
  const quantity = Number(value);
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 0;
}

function HeaderStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      <span className="text-xs font-medium tabular-nums">{value}</span>
    </div>
  );
}

function AmcFundHeader({
  fund,
  nav,
  previousPrice,
  history,
  managerName,
  annualDividendRate,
  profileLabel,
}: {
  fund: AmcFundState;
  nav: number;
  previousPrice: number;
  history: PricePoint[];
  managerName: string;
  annualDividendRate: number;
  profileLabel: string;
}) {
  const diff = nav - previousPrice;
  const change = previousPrice > 0 ? (diff / previousPrice) * 100 : 0;
  const prices = history.map((point) => point.price).filter((price) => price > 0);
  const low = prices.length ? Math.min(...prices) : nav;
  const high = prices.length ? Math.max(...prices) : nav;
  const aum = nav * fund.totalShares;

  return (
    <div className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-3 py-3 md:gap-6 md:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <Link
          href="/amc"
          className="shrink-0 rounded-lg px-1.5 py-1 text-[var(--muted)] transition hover:text-[var(--foreground)]"
          aria-label="자산운용사로"
        >
          ←
        </Link>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] text-[11px] font-bold text-[var(--muted)]">
          {fund.ticker.slice(0, 2)}
        </div>
        <div className="min-w-0">
          <p className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold">{fund.name}</span>
            <span className="shrink-0 text-xs text-[var(--muted)]">
              {fund.ticker}
            </span>
          </p>
          <p className="flex items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums">
              {formatPrice(nav)}
            </span>
            <span className={`text-xs tabular-nums ${upDownClass(change)}`}>
              전일보다 {formatSignedMoney(diff)} ({formatSignedPercent(change)})
            </span>
          </p>
        </div>
      </div>

      <div className="ml-auto hidden items-center gap-6 md:flex">
        <HeaderStat
          label="차트 범위"
          value={`${formatPrice(low)} ~ ${formatPrice(high)}`}
        />
        <HeaderStat label="전일 NAV" value={formatPrice(previousPrice)} />
        <HeaderStat label="순자산" value={formatCompactUSD(aum)} />
        <HeaderStat
          label="예상 연 배당"
          value={formatRate(annualDividendRate)}
        />
        <HeaderStat
          label="운용 보수"
          value={`${(fund.feeRate * 100).toFixed(2)}%`}
        />
        <HeaderStat label="운용 성향" value={profileLabel} />
        <HeaderStat label="운용사" value={managerName} />
      </div>
    </div>
  );
}

export function AmcTradeClient() {
  const searchParams = useSearchParams();
  const fundId = searchParams.get("id") ?? "";
  const [tab, setTab] = useState(0);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showAveraging, setShowAveraging] = useState(false);
  const [comparisonDraft, setComparisonDraft] = useState("");
  const [comparisonSaving, setComparisonSaving] = useState(false);

  const assetManager = useMarketStore((state) => state.assetManager);
  const listedAmcFunds = useMarketStore((state) => state.listedAmcFunds);
  const refreshing = useMarketStore((state) => state.refreshingAmcLedger);
  const stocks = useMarketStore((state) => state.stocks);
  const holdings = useMarketStore((state) => state.holdings);
  const trades = useMarketStore((state) => state.trades);
  const cash = useMarketStore((state) => state.cash);
  const marginEnabled = useMarketStore((state) => state.marginEnabled);
  const marginLeverage = useMarketStore((state) => state.marginLeverage);
  const getBuyingPower = useMarketStore((state) => state.getBuyingPower);
  const setMarginEnabled = useMarketStore((state) => state.setMarginEnabled);
  const setMarginLeverage = useMarketStore((state) => state.setMarginLeverage);
  const userId = useMarketStore((state) => state.userId);
  const cloudSyncReady = useMarketStore((state) => state.cloudSyncReady);
  const refreshListedAmcFunds = useMarketStore(
    (state) => state.refreshListedAmcFunds,
  );
  const buyAmcFund = useMarketStore((state) => state.buyAmcFund);
  const sellAmcFund = useMarketStore((state) => state.sellAmcFund);
  const updateAmcFundComparisonStock = useMarketStore(
    (state) => state.updateAmcFundComparisonStock,
  );

  useEffect(() => {
    if (userId) void refreshListedAmcFunds();
  }, [userId, refreshListedAmcFunds]);

  const funds = useMemo(
    () =>
      mergeAmcPortfolioFunds(
        assetManager?.funds ?? [],
        listedAmcFunds.map(listedFundToAmcState),
      ),
    [assetManager, listedAmcFunds],
  );
  const fund = funds.find((item) => item.id === fundId);
  const listed = listedAmcFunds.find((item) => item.id === fundId);
  const canEditFund = Boolean(
    userId &&
      (listed?.managerUserId === userId ||
        assetManager?.funds.some((item) => item.id === fundId)),
  );
  const holding = holdings.find(
    (item) => item.stockId === amcFundStockId(fundId),
  );
  const stockById = useMemo(
    () => new Map(stocks.map((stock) => [stock.id, stock])),
    [stocks],
  );
  const priceOf = (stockId: string) => stockById.get(stockId)?.currentPrice ?? 0;
  const initialPriceOf = (stockId: string) =>
    stockById.get(stockId)?.initialPrice ?? 0;
  const valuationPriceOf = useMemo(
    () => createAmcValuationPriceResolver(stocks),
    [stocks],
  );
  const nav = fund
    ? computeAmcFundNavPerShare(
        fund,
        priceOf,
        initialPriceOf,
        valuationPriceOf,
      )
    : 0;
  const stockOf = (stockId: string) => stockById.get(stockId);
  const exposureProfile = fund
    ? classifyAmcFundExposure(fund, stockOf)
    : null;
  const periodDividendRate = fund
    ? resolveAmcDividendPeriodRate(fund, priceOf, stockOf)
    : 0;
  const annualDividendRate = fund
    ? fund.style === "active"
      ? periodDividendRate *
        (AMC_TRADING_SESSIONS_PER_YEAR /
          Math.max(1, fund.dividendIntervalDays))
      : computePassiveAmcAnnualDividendYield(
          fund.holdings,
          priceOf,
          stockOf,
        )
    : 0;
  const chartSeries = useMemo(
    () =>
      fund
        ? getAmcFundChartSeries(fund, stocks)
        : {
            candles: [],
            dailyCandles: [],
            history: [],
            previousSessionClose: 0,
          },
    [fund, stocks],
  );
  const performanceComparison = useMemo(
    () => (fund ? getAmcFundPerformanceComparison(fund, stocks) : null),
    [fund, stocks],
  );
  const comparisonStockOptions = useMemo(
    () =>
      stocks.filter(
        (stock) =>
          instrumentTypeOf(stock) === "company" &&
          isListed(stock) &&
          stock.currentPrice > 0,
      ),
    [stocks],
  );
  const comparisonStock = fund?.comparisonStockId
    ? stockById.get(fund.comparisonStockId)
    : undefined;
  const hasCoveredCallIncome = Boolean(
    fund?.holdings.some(
      (row) => (stockById.get(row.stockId)?.coveredCallAnnualYield ?? 0) > 0,
    ),
  );

  useEffect(() => {
    setComparisonDraft(fund?.comparisonStockId ?? "");
  }, [fund?.id, fund?.comparisonStockId]);
  const history = chartSeries.history;
  const previousPrice = chartSeries.previousSessionClose;
  const fundTrades = trades.filter(
    (trade) => trade.stockId === amcFundStockId(fundId),
  );
  const quantityNumber = validQuantity(quantity);
  const estimatedTotal = Math.round(nav * quantityNumber);
  const buyingPower = marginEnabled ? getBuyingPower() : Math.max(0, cash);
  const maxQuantity = side === "buy"
    ? nav > 0
      ? Math.floor((buyingPower / nav) * 1_000_000) / 1_000_000
      : 0
    : holding?.quantity ?? 0;
  const canTrade = Boolean(
    userId &&
      cloudSyncReady &&
      listed &&
      fund &&
      fund.status !== "delisted" &&
      quantityNumber > 0 &&
      (side === "sell" || fund.status !== "grace") &&
      quantityNumber <= maxQuantity + 1e-9,
  );
  const holdingProfit = holding
    ? (nav - holding.averagePrice) * holding.quantity
    : 0;
  const holdingProfitRate = holding && holding.averagePrice > 0
    ? ((nav - holding.averagePrice) / holding.averagePrice) * 100
    : 0;

  const setRatio = (ratio: number) => {
    const next = Math.floor(maxQuantity * ratio * 1_000_000) / 1_000_000;
    setQuantity(next > 0 ? String(next) : "0");
  };

  const submit = async () => {
    if (!fund || !canTrade) return;
    setBusy(true);
    setMessage("");
    const result = side === "buy"
      ? await buyAmcFund(fund.id, quantityNumber)
      : await sellAmcFund(fund.id, quantityNumber);
    setMessage(result.message);
    setBusy(false);
  };

  const saveComparisonStock = async () => {
    if (!fund || !comparisonDraft || comparisonSaving) return;
    setComparisonSaving(true);
    setMessage("");
    const result = await updateAmcFundComparisonStock(fund.id, {
      comparisonStockId: comparisonDraft,
    });
    setMessage(result.message);
    setComparisonSaving(false);
  };

  if (!fundId) {
    return <MissingFund message="ETF 식별자가 없습니다." />;
  }
  if (!fund) {
    return (
      <MissingFund
        message={refreshing ? "ETF 정보를 불러오는 중입니다…" : "ETF를 찾을 수 없습니다."}
      />
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-3.5rem)] flex-col md:h-[calc(100vh-3.5rem)]">
      <AmcFundHeader
        fund={fund}
        nav={nav}
        previousPrice={previousPrice}
        history={history}
        managerName={listed?.managerName ?? assetManager?.name ?? "유저 운용사"}
        annualDividendRate={annualDividendRate}
        profileLabel={exposureProfile?.label ?? "일반형"}
      />

      <nav className="flex shrink-0 items-center gap-4 border-b border-[var(--border)] px-3 md:gap-5 md:px-5">
        {TABS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(index)}
            className={`min-h-11 py-2.5 text-sm transition ${
              tab === index
                ? "border-b-2 border-[var(--foreground)] font-semibold text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            {label}
          </button>
        ))}
        <a
          href="#quick-order"
          className="ml-auto flex min-h-11 items-center text-xs font-semibold text-[var(--accent)] md:hidden"
        >
          주문하기 ↓
        </a>
      </nav>

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row md:overflow-hidden">
        <main className="min-w-0 flex-1 px-4 py-4 md:overflow-y-auto md:px-5">
          {tab === 0 && (
            <div className="space-y-4">
              <CandlestickChart
                candles={chartSeries.candles}
                dailyCandles={chartSeries.dailyCandles}
                history={history}
                height={360}
                mobileHeight={260}
                averagePrice={holding?.averagePrice}
                prevDayClose={previousPrice}
              />
              <AmcPerformanceComparisonCard
                comparison={performanceComparison}
                comparisonName={
                  comparisonStock
                    ? `${comparisonStock.ticker} · ${comparisonStock.name}`
                    : "목표 주식 미설정"
                }
                hasCoveredCallIncome={hasCoveredCallIncome}
              />
              {canEditFund && (
                <section className="rounded-2xl bg-[var(--surface)] p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
                    <label className="min-w-0 flex-1 text-xs font-semibold">
                      성과 비교 목표 주식
                      <select
                        value={comparisonDraft}
                        onChange={(event) => setComparisonDraft(event.target.value)}
                        className="mt-2 w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
                      >
                        <option value="">주식 선택</option>
                        {comparisonStockOptions.map((stock) => (
                          <option key={stock.id} value={stock.id}>
                            {stock.ticker} · {stock.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={!comparisonDraft || comparisonSaving}
                      onClick={() => void saveComparisonStock()}
                      className="min-h-10 rounded-xl bg-[var(--accent)] px-4 text-xs font-bold text-white disabled:opacity-40"
                    >
                      {comparisonSaving ? "저장 중" : "비교 기준 저장"}
                    </button>
                  </div>
                </section>
              )}
              <section
                aria-labelledby="amc-stock-info-title"
                className="rounded-2xl bg-[var(--surface)] p-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h2 id="amc-stock-info-title" className="text-sm font-bold">
                      종목 정보
                    </h2>
                    <p className="text-[11px] text-[var(--muted)]">
                      배당과 구성 종목 목표 비중을 현재 시세 기준으로 표시합니다.
                    </p>
                  </div>
                  <span className="text-xs text-[var(--muted)]">{fund.holdings.length}종목</span>
                </div>
                <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
                  <div className="rounded-xl bg-[var(--background)] p-4">
                    <p className="text-xs font-semibold text-[var(--muted)]">배당 정보</p>
                    <div className="mt-3 grid grid-cols-2 gap-3">
                      <DividendStat
                        label="예상 연 배당률"
                        value={formatRate(annualDividendRate)}
                      />
                      <DividendStat
                        label="회차 지급률"
                        value={formatRate(periodDividendRate)}
                      />
                    </div>
                    <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-3 text-xs">
                      <InfoRow
                        label="지급 주기"
                        value={`${fund.dividendIntervalDays}거래일`}
                      />
                      <InfoRow
                        label="산정 방식"
                        value={fund.style === "active" ? "운용사 설정" : "구성 종목 가중"}
                      />
                    </div>
                    <p className="mt-3 text-[11px] leading-relaxed text-[var(--muted)]">
                      {fund.style === "active"
                        ? "예상 연 배당률은 회차 설정률을 연간 거래일 기준으로 단순 환산한 값입니다."
                        : "예상 연 배당률은 구성 종목의 배당·인컴 수익률을 목표 비중으로 가중한 값입니다."}
                    </p>
                  </div>
                  <AmcHoldingsDonut
                    holdings={fund.holdings}
                    stockById={stockById}
                  />
                </div>
              </section>
            </div>
          )}
          {tab === 1 && (
            <div className="max-w-2xl space-y-4">
              <section className="rounded-2xl bg-[var(--surface)] p-4">
                <h3 className="mb-3 text-sm font-semibold">펀드 개요</h3>
                <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm md:grid-cols-3">
                  <FundMetric label="운용 방식" value={fund.style === "active" ? "액티브" : "패시브"} />
                  <FundMetric
                    label="운용 성향"
                    value={
                      exposureProfile
                        ? `${exposureProfile.label} · 인컴 ${(exposureProfile.incomeWeight * 100).toFixed(0)}% · 레버리지 ${(exposureProfile.leverageWeight * 100).toFixed(0)}%`
                        : "일반형"
                    }
                  />
                  <FundMetric label="상태" value={fund.status === "active" ? "정상 거래" : fund.status === "grace" ? "유예 기간" : "상장폐지"} />
                  <FundMetric label="운용사" value={listed?.managerName ?? assetManager?.name ?? "유저 운용사"} />
                  <FundMetric label="운용 보수" value={`20거래일당 ${(fund.feeRate * 100).toFixed(2)}%`} />
                  <FundMetric label="배당 주기" value={`${fund.dividendIntervalDays}거래일`} />
                  <FundMetric label="예상 연 배당률" value={formatRate(annualDividendRate)} />
                  <FundMetric label="회차 지급률" value={formatRate(periodDividendRate)} />
                  <FundMetric label="유통 좌수" value={`${fund.totalShares.toLocaleString("ko-KR")}좌`} />
                  <FundMetric label="내 보유" value={`${(holding?.quantity ?? 0).toLocaleString("ko-KR")}좌`} />
                </dl>
              </section>
              <section className="rounded-2xl bg-[var(--surface)] p-4">
                <h3 className="mb-2 text-sm font-semibold">거래 방식</h3>
                <p className="text-xs leading-relaxed text-[var(--muted)]">
                  유저 ETF 주문은 호가 매칭이 아닌 현재 NAV 기준의 설정·환매 방식으로
                  서버 원장에서 즉시 처리됩니다. 매수·매도 결과와 현금은 같은 거래로 확정됩니다.
                </p>
              </section>
            </div>
          )}
          {tab === 2 && (
            <section className="max-w-2xl">
              {fundTrades.length ? (
                <ul className="space-y-2">
                  {fundTrades.map((trade) => (
                    <li key={trade.id} className="flex items-center justify-between rounded-2xl bg-[var(--surface)] p-4 text-xs">
                      <div>
                        <p className={`font-bold ${trade.type === "buy" ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                          {trade.type === "buy" ? "매수" : "매도"} · {trade.quantity.toLocaleString("ko-KR")}좌
                        </p>
                        <p className="text-[var(--muted)]">{formatTradeTime(trade.timestamp)}</p>
                      </div>
                      <div className="text-right tabular-nums">
                        <p>{formatPrice(trade.price)}/좌</p>
                        <p className="font-semibold">{formatPrice(trade.total)}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="py-12 text-center text-sm text-[var(--muted)]">아직 거래 내역이 없습니다.</p>
              )}
            </section>
          )}
        </main>

        <div
          id="quick-order"
          className="w-full scroll-mt-28 shrink-0 border-t border-[var(--border)] md:w-[320px] md:border-l md:border-t-0"
        >
          <div className="flex h-full flex-col bg-[var(--background)]">
            <div className="flex border-b border-[var(--border)]">
              {(["buy", "sell"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setSide(value)}
                  className={`min-h-12 flex-1 px-2 py-3 text-xs transition ${
                    side === value
                      ? "border-b-2 border-[var(--foreground)] font-semibold"
                      : "text-[var(--muted)]"
                  }`}
                >
                  {value === "buy" ? "빠른 매수" : "빠른 매도"}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-4">
              <section className={`mb-4 rounded-xl border p-3 ${
                marginEnabled
                  ? "border-amber-400/50 bg-amber-400/10"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}>
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold">미수 거래</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      {marginEnabled
                        ? `총노출 한도 ${marginLeverage * 100}% · 이자 및 마진콜 적용`
                        : "기본 꺼짐 · 현금 범위에서만 매수"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const result = setMarginEnabled(!marginEnabled);
                      setMessage(result.message);
                    }}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      marginEnabled
                        ? "bg-amber-400 text-black"
                        : "bg-[var(--surface-elevated)] text-[var(--muted)]"
                    }`}
                  >
                    {marginEnabled ? "켜짐" : "켜기"}
                  </button>
                </div>
                <div className="mt-2 grid grid-cols-4 gap-1">
                  {MARGIN_LEVERAGE_OPTIONS.map((leverage) => (
                    <button
                      key={leverage}
                      type="button"
                      onClick={() => {
                        const result = setMarginLeverage(leverage);
                        setMessage(result.message);
                      }}
                      className={`rounded-lg py-1.5 text-[11px] ${
                        marginLeverage === leverage
                          ? "bg-amber-400/20 font-semibold text-amber-300 ring-1 ring-amber-400/50"
                          : "bg-[var(--background)] text-[var(--muted)]"
                      }`}
                    >
                      {leverage * 100}%
                    </button>
                  ))}
                </div>
              </section>

              <div className="flex items-center justify-between">
                <label className="text-xs text-[var(--muted)]">주문 수량</label>
                <span className="rounded-full bg-[var(--accent)]/15 px-2.5 py-1 text-[11px] text-[var(--accent)]">
                  소수점 가능
                </span>
              </div>
              <input
                value={quantity}
                onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                className="mt-3 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm tabular-nums outline-none focus:border-[var(--accent)]"
              />
              <div className="mt-2 grid grid-cols-4 gap-1.5">
                {[0.1, 0.25, 0.5, 1].map((ratio) => (
                  <button
                    key={ratio}
                    type="button"
                    onClick={() => setRatio(ratio)}
                    className="min-h-10 rounded-lg bg-[var(--surface)] text-xs text-[var(--muted)]"
                  >
                    {ratio === 1 ? "최대" : `${ratio * 100}%`}
                  </button>
                ))}
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <InfoRow label="현재 NAV" value={formatPrice(nav)} />
                <InfoRow label="예상 금액" value={formatPrice(estimatedTotal)} />
                <InfoRow
                  label={side === "buy" ? "주문 가능" : "보유 좌수"}
                  value={`${maxQuantity.toLocaleString("ko-KR", { maximumFractionDigits: 6 })}좌`}
                />
              </div>

              <button
                type="button"
                disabled={!canTrade || busy}
                onClick={() => void submit()}
                className={`mt-4 flex min-h-16 w-full flex-col items-center justify-center rounded-2xl px-2 py-3 text-white disabled:opacity-40 ${
                  side === "buy" ? "bg-[var(--up)]" : "bg-[var(--down)]"
                }`}
              >
                <span className="text-sm font-semibold">
                  {busy ? "처리 중…" : `NAV ${side === "buy" ? "매수" : "매도"}`}
                </span>
                <span className="mt-1 text-xs opacity-80">{formatPrice(nav)}</span>
              </button>

              {!listed && <p className="mt-3 text-xs text-amber-300">상장 허가 후 거래할 수 있습니다.</p>}
              {fund.status === "grace" && side === "buy" && <p className="mt-3 text-xs text-amber-300">유예 기간에는 신규 매수할 수 없습니다.</p>}
              {!userId && <p className="mt-3 text-xs text-amber-300">로그인 후 거래할 수 있습니다.</p>}
              {message && <p className="mt-3 text-center text-xs text-[var(--muted)]">{message}</p>}

              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <p className="text-xs font-semibold">내 ETF</p>
                <div className="mt-3 space-y-2 text-sm">
                  <InfoRow
                    label="보유 수량"
                    value={`${(holding?.quantity ?? 0).toLocaleString("ko-KR", { maximumFractionDigits: 6 })}좌`}
                  />
                  {holding && holding.quantity > 0 && (
                    <>
                      <InfoRow label="평균 매수가" value={formatPrice(holding.averagePrice)} />
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-[var(--muted)]">평가 손익</span>
                        <span className={`text-right font-semibold tabular-nums ${upDownClass(holdingProfit)}`}>
                          {formatSignedMoney(holdingProfit)} {formatSignedPercent(holdingProfitRate)}
                        </span>
                      </div>
                    </>
                  )}
                </div>
                <p className="mt-4 text-center text-[11px] text-[var(--muted)]">
                  현금 {formatPrice(cash)} · 서버 원장 즉시 체결
                </p>
              </div>

              <div className="mt-5 border-t border-[var(--border)] pt-4">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-xs font-semibold">물타기 / 불타기</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      추가 매수 전 새 평단을 미리 계산
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowAveraging((open) => !open)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition ${
                      showAveraging
                        ? "bg-sky-400 text-black"
                        : "bg-[var(--surface)] text-[var(--muted)]"
                    }`}
                  >
                    {showAveraging ? "닫기" : "계산기"}
                  </button>
                </div>

                {showAveraging && (
                  <div className="mt-3 rounded-2xl border border-sky-400/30 bg-sky-400/5 p-3">
                    <AveragingCalculator
                      compact
                      initialQuantity={holding?.quantity}
                      initialAveragePrice={holding?.averagePrice}
                      initialAddPrice={nav}
                      markPrice={nav}
                      stockLabel={`${fund.name} (${fund.ticker})`}
                      quantityUnit="좌"
                    />
                    <Link
                      href="/averaging"
                      className="mt-3 block text-center text-[11px] font-semibold text-sky-300"
                    >
                      전체 화면 계산기 →
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <AccountSidebar />
      </div>
      <BottomTicker stocks={stocks} />
    </div>
  );
}

function formatRate(rate: number): string {
  return `${(Math.max(0, Number.isFinite(rate) ? rate : 0) * 100).toFixed(2)}%`;
}

function AmcPerformanceComparisonCard({
  comparison,
  comparisonName,
  hasCoveredCallIncome,
}: {
  comparison: AmcPerformanceComparison | null;
  comparisonName: string;
  hasCoveredCallIncome: boolean;
}) {
  const width = 640;
  const height = 220;
  const paddingX = 24;
  const paddingY = 22;
  const points = comparison?.points ?? [];
  const values = points.flatMap((point) => [
    point.fundTotalReturn,
    point.comparisonReturn,
    0,
  ]);
  const min = values.length ? Math.min(...values) : -1;
  const max = values.length ? Math.max(...values) : 1;
  const range = Math.max(0.01, max - min);
  const toPolyline = (
    key: "fundTotalReturn" | "comparisonReturn",
  ): string =>
    points
      .map((point, index) => {
        const x =
          paddingX +
          (index / Math.max(1, points.length - 1)) * (width - paddingX * 2);
        const y =
          paddingY +
          (1 - (point[key] - min) / range) * (height - paddingY * 2);
        return `${x},${y}`;
      })
      .join(" ");
  const zeroY =
    paddingY + (1 - (0 - min) / range) * (height - paddingY * 2);

  return (
    <section className="rounded-2xl bg-[var(--surface)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold">목표 주식 대비 성과</h2>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            ETF는 배당락 후 가격에 실제 지급된 분배·배당 인컴을 더한 총수익률입니다.
          </p>
        </div>
        {hasCoveredCallIncome && (
          <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-300">
            커버드콜 인컴 포함
          </span>
        )}
      </div>

      {comparison ? (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
            <PerformanceStat
              label="ETF 총수익률"
              value={formatSignedPercent(comparison.fundTotalReturn)}
              valueClass={upDownClass(comparison.fundTotalReturn)}
            />
            <PerformanceStat
              label="인컴 기여"
              value={formatSignedPercent(comparison.fundIncomeReturn)}
              valueClass="text-cyan-300"
            />
            <PerformanceStat
              label={comparisonName}
              value={formatSignedPercent(comparison.comparisonReturn)}
              valueClass={upDownClass(comparison.comparisonReturn)}
            />
            <PerformanceStat
              label="목표 대비 초과"
              value={formatSignedPercent(
                comparison.fundTotalReturn - comparison.comparisonReturn,
              )}
              valueClass={upDownClass(
                comparison.fundTotalReturn - comparison.comparisonReturn,
              )}
            />
          </div>
          {points.length >= 2 ? (
            <div className="mt-4 overflow-hidden rounded-xl bg-[var(--background)] p-2">
              <svg
                viewBox={`0 0 ${width} ${height}`}
                className="h-[220px] w-full"
                preserveAspectRatio="none"
                role="img"
                aria-label={`유저 ETF 인컴 포함 총수익률과 ${comparisonName} 가격수익률 비교`}
              >
                <line
                  x1={paddingX}
                  x2={width - paddingX}
                  y1={zeroY}
                  y2={zeroY}
                  stroke="var(--border)"
                  strokeDasharray="4 4"
                />
                <polyline
                  fill="none"
                  stroke="#22d3ee"
                  strokeWidth="3"
                  vectorEffect="non-scaling-stroke"
                  points={toPolyline("fundTotalReturn")}
                />
                <polyline
                  fill="none"
                  stroke="#a78bfa"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                  vectorEffect="non-scaling-stroke"
                  points={toPolyline("comparisonReturn")}
                />
              </svg>
              <div className="flex flex-wrap gap-4 px-2 pb-1 text-[11px] text-[var(--muted)]">
                <span><i className="mr-1.5 inline-block h-0.5 w-4 bg-cyan-400 align-middle" />ETF 총수익</span>
                <span><i className="mr-1.5 inline-block h-0.5 w-4 bg-violet-400 align-middle" />{comparisonName}</span>
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-xl bg-[var(--background)] p-5 text-center text-xs text-[var(--muted)]">
              다음 거래일 데이터부터 비교 곡선이 표시됩니다.
            </p>
          )}
        </>
      ) : (
        <p className="mt-4 rounded-xl bg-[var(--background)] p-5 text-center text-xs text-[var(--muted)]">
          목표 주식 1개를 설정하면 같은 시작점의 성과를 비교할 수 있습니다.
        </p>
      )}
    </section>
  );
}

function PerformanceStat({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string;
  valueClass: string;
}) {
  return (
    <div className="rounded-xl bg-[var(--background)] p-3">
      <p className="truncate text-[11px] text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-lg font-black tabular-nums ${valueClass}`}>
        {value}
      </p>
    </div>
  );
}

function DividendStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-xl font-black tabular-nums text-cyan-300">
        {value}
      </p>
    </div>
  );
}

function FundMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[11px] text-[var(--muted)]">{label}</dt>
      <dd className="truncate tabular-nums">{value}</dd>
    </div>
  );
}

function AmcHoldingsDonut({
  holdings,
  stockById,
}: {
  holdings: AmcHoldingWeight[];
  stockById: ReadonlyMap<string, StockState>;
}) {
  const items = [...holdings]
    .filter((holding) => Number.isFinite(holding.weight) && holding.weight > 0)
    .sort((a, b) => b.weight - a.weight)
    .map((holding, index) => ({
      ...holding,
      stock: stockById.get(holding.stockId),
      color: HOLDING_COLORS[index % HOLDING_COLORS.length],
    }));
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  const radius = 44;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = items.map((item) => {
    const normalizedWeight = totalWeight > 0 ? item.weight / totalWeight : 0;
    const segment = {
      ...item,
      dash: normalizedWeight * circumference,
      offset,
    };
    offset += segment.dash;
    return segment;
  });

  return (
    <div className="rounded-xl bg-[var(--background)] p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-semibold text-[var(--muted)]">보유 비중</p>
        <p className="text-[11px] text-[var(--muted)]">목표 비중 · 합계 100%</p>
      </div>
      <div className="@container mt-3">
       <div className="flex flex-col items-center gap-4 @lg:flex-row @lg:items-start">
        <svg
          width="144"
          height="144"
          viewBox="0 0 144 144"
          role="img"
          aria-label={`ETF 구성 종목 ${items.length}개의 목표 보유 비중 도넛 차트`}
          className="shrink-0"
        >
          <circle
            cx="72"
            cy="72"
            r={radius}
            fill="none"
            stroke="var(--border)"
            strokeWidth="18"
          />
          <g transform="rotate(-90 72 72)">
            {segments.map((segment) => (
              <circle
                key={segment.stockId}
                cx="72"
                cy="72"
                r={radius}
                fill="none"
                stroke={segment.color}
                strokeWidth="18"
                strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
                strokeDashoffset={-segment.offset}
              />
            ))}
          </g>
          <text
            x="72"
            y="69"
            textAnchor="middle"
            className="fill-[var(--foreground)] text-[18px] font-black"
          >
            {items.length}
          </text>
          <text
            x="72"
            y="87"
            textAnchor="middle"
            className="fill-[var(--muted)] text-[10px]"
          >
            구성 종목
          </text>
        </svg>
        <div className="@container min-w-0 flex-1 self-stretch">
          <ul className="grid gap-1.5 @xs:grid-cols-2">
            {items.map((item) => (
              <li key={item.stockId}>
                <Link
                  href={`/stock/${item.stockId}`}
                  className="flex min-h-8 items-center gap-2 rounded-lg px-2 text-xs hover:bg-[var(--surface)]"
                >
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: item.color }}
                  />
                  <span className="min-w-0 flex-1 truncate font-semibold">
                    {item.stock?.name ?? item.stockId}
                    <span className="ml-1 font-normal text-[var(--muted)]">
                      {item.stock?.ticker ?? item.stockId}
                    </span>
                  </span>
                  <span className="shrink-0 pl-1 tabular-nums text-cyan-300">
                    {(item.weight * 100).toFixed(1)}%
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
       </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[var(--muted)]">{label}</span>
      <span className="text-right font-semibold tabular-nums">{value}</span>
    </div>
  );
}

function MissingFund({ message }: { message: string }) {
  return (
    <div className="py-20 text-center text-sm text-[var(--muted)]">
      <p>{message}</p>
      <Link href="/amc" className="mt-3 inline-block font-semibold text-cyan-400">
        자산운용사로 돌아가기
      </Link>
    </div>
  );
}

"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AccountSidebar } from "@/components/home/AccountSidebar";
import { BottomTicker } from "@/components/home/BottomTicker";
import { CandlestickChart } from "@/components/market/CandlestickChart";
import { formatPrice, formatTradeTime } from "@/lib/market/engine";
import {
  AMC_TRADING_SESSIONS_PER_YEAR,
  amcFundStockId,
  computePassiveAmcAnnualDividendYield,
  computeAmcFundNavPerShare,
  resolveAmcDividendPeriodRate,
  type AmcHoldingWeight,
} from "@/lib/player/assetManager";
import {
  getAmcFundPriceHistory,
  mergeAmcPortfolioFunds,
} from "@/lib/player/amcPortfolio";
import { listedFundToAmcState } from "@/lib/supabase/amcListedFunds";
import type { StockState } from "@/lib/types/market";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";
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

export function AmcTradeClient() {
  const searchParams = useSearchParams();
  const fundId = searchParams.get("id") ?? "";
  const [tab, setTab] = useState(0);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const [quantity, setQuantity] = useState("1");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const assetManager = useMarketStore((state) => state.assetManager);
  const listedAmcFunds = useMarketStore((state) => state.listedAmcFunds);
  const refreshing = useMarketStore((state) => state.refreshingAmcLedger);
  const stocks = useMarketStore((state) => state.stocks);
  const holdings = useMarketStore((state) => state.holdings);
  const trades = useMarketStore((state) => state.trades);
  const cash = useMarketStore((state) => state.cash);
  const userId = useMarketStore((state) => state.userId);
  const cloudSyncReady = useMarketStore((state) => state.cloudSyncReady);
  const refreshListedAmcFunds = useMarketStore(
    (state) => state.refreshListedAmcFunds,
  );
  const buyAmcFund = useMarketStore((state) => state.buyAmcFund);
  const sellAmcFund = useMarketStore((state) => state.sellAmcFund);

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
  const nav = fund
    ? computeAmcFundNavPerShare(fund, priceOf, initialPriceOf)
    : 0;
  const stockOf = (stockId: string) => stockById.get(stockId);
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
  const history = useMemo(
    () => (fund ? getAmcFundPriceHistory(fund, stocks) : []),
    [fund, stocks],
  );
  const previousPrice = history.length > 1
    ? history[history.length - 2]!.price
    : history[0]?.price ?? nav;
  const change = previousPrice > 0 ? ((nav - previousPrice) / previousPrice) * 100 : 0;
  const fundTrades = trades.filter(
    (trade) => trade.stockId === amcFundStockId(fundId),
  );
  const quantityNumber = validQuantity(quantity);
  const estimatedTotal = Math.round(nav * quantityNumber);
  const maxQuantity = side === "buy"
    ? nav > 0
      ? Math.floor((cash / nav) * 1_000_000) / 1_000_000
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
      <header className="flex shrink-0 items-center gap-3 border-b border-[var(--border)] px-3 py-3 md:px-5">
        <Link
          href="/amc"
          className="rounded-lg px-1.5 py-1 text-[var(--muted)] hover:text-[var(--foreground)]"
          aria-label="자산운용사로"
        >
          ←
        </Link>
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-500/15 text-xl">
          🏦
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">
            {fund.name} <span className="text-xs text-[var(--muted)]">{fund.ticker}</span>
          </p>
          <p className="flex items-baseline gap-2">
            <span className="text-xl font-bold tabular-nums">{formatPrice(nav)}</span>
            <span className={`text-xs tabular-nums ${upDownClass(change)}`}>
              {formatSignedPercent(change)}
            </span>
          </p>
        </div>
        <div className="ml-auto hidden text-right text-xs md:block">
          <p className="text-[var(--muted)]">운용사</p>
          <p className="font-semibold">{listed?.managerName ?? assetManager?.name ?? "유저 운용사"}</p>
        </div>
      </header>

      <nav className="flex shrink-0 items-center gap-5 border-b border-[var(--border)] px-4 md:px-5">
        {TABS.map((label, index) => (
          <button
            key={label}
            type="button"
            onClick={() => setTab(index)}
            className={`min-h-11 py-2.5 text-sm ${tab === index ? "border-b-2 border-[var(--foreground)] font-semibold" : "text-[var(--muted)]"}`}
          >
            {label}
          </button>
        ))}
        <a href="#amc-order" className="ml-auto text-xs font-semibold text-cyan-400 md:hidden">
          주문하기 ↓
        </a>
      </nav>

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row md:overflow-hidden">
        <main className="min-w-0 flex-1 px-4 py-4 md:overflow-y-auto md:px-5">
          {tab === 0 && (
            <div className="space-y-4">
              <CandlestickChart
                history={history}
                height={360}
                mobileHeight={260}
                averagePrice={holding?.averagePrice}
                prevDayClose={previousPrice}
              />
              <section
                aria-labelledby="amc-stock-info-title"
                className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4"
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
            <section className="max-w-2xl space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-sm">
              <InfoRow label="운용 방식" value={fund.style === "active" ? "액티브" : "패시브"} />
              <InfoRow label="상태" value={fund.status === "active" ? "정상 거래" : fund.status === "grace" ? "유예 기간" : "상장폐지"} />
              <InfoRow label="운용 보수" value={`20거래일당 ${(fund.feeRate * 100).toFixed(2)}%`} />
              <InfoRow label="배당 주기" value={`${fund.dividendIntervalDays}거래일`} />
              <InfoRow label="예상 연 배당률" value={formatRate(annualDividendRate)} />
              <InfoRow label="회차 지급률" value={formatRate(periodDividendRate)} />
              <InfoRow label="유통 좌수" value={`${fund.totalShares.toLocaleString("ko-KR")}좌`} />
              <InfoRow label="내 보유" value={`${(holding?.quantity ?? 0).toLocaleString("ko-KR")}좌`} />
              <p className="border-t border-[var(--border)] pt-3 text-xs leading-relaxed text-[var(--muted)]">
                유저 ETF 주문은 호가 매칭이 아닌 현재 NAV 기준의 설정·환매 방식으로
                서버 원장에서 즉시 처리됩니다. 매수·매도 결과와 현금은 같은 거래로 확정됩니다.
              </p>
            </section>
          )}
          {tab === 2 && (
            <section className="max-w-2xl">
              {fundTrades.length ? (
                <ul className="space-y-2">
                  {fundTrades.map((trade) => (
                    <li key={trade.id} className="flex items-center justify-between rounded-xl bg-[var(--surface)] p-3 text-xs">
                      <div>
                        <p className={trade.type === "buy" ? "font-bold text-emerald-400" : "font-bold text-blue-400"}>
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

        <aside id="amc-order" className="w-full scroll-mt-28 border-t border-[var(--border)] p-4 md:w-[320px] md:border-l md:border-t-0">
          <div className="grid grid-cols-2 rounded-xl bg-[var(--surface)] p-1">
            {(["buy", "sell"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setSide(value)}
                className={`rounded-lg py-2 text-sm font-bold ${side === value ? value === "buy" ? "bg-emerald-500 text-white" : "bg-blue-500 text-white" : "text-[var(--muted)]"}`}
              >
                {value === "buy" ? "매수" : "매도"}
              </button>
            ))}
          </div>
          <div className="mt-4 flex items-center justify-between text-xs">
            <span className="text-[var(--muted)]">{side === "buy" ? "주문 가능" : "보유 좌수"}</span>
            <span className="font-semibold tabular-nums">{maxQuantity.toLocaleString("ko-KR", { maximumFractionDigits: 6 })}좌</span>
          </div>
          <label className="mt-3 block text-xs text-[var(--muted)]">수량</label>
          <input
            value={quantity}
            onChange={(event) => setQuantity(event.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal"
            className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-right font-bold tabular-nums"
          />
          <div className="mt-2 grid grid-cols-4 gap-1.5">
            {[0.1, 0.25, 0.5, 1].map((ratio) => (
              <button key={ratio} type="button" onClick={() => setRatio(ratio)} className="rounded-lg border border-[var(--border)] py-1.5 text-[11px]">
                {ratio === 1 ? "최대" : `${ratio * 100}%`}
              </button>
            ))}
          </div>
          <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-xs">
            <InfoRow label="예상 NAV" value={formatPrice(nav)} />
            <InfoRow label="예상 금액" value={formatPrice(estimatedTotal)} />
            <InfoRow label="보유 현금" value={formatPrice(cash)} />
          </div>
          <button
            type="button"
            disabled={!canTrade || busy}
            onClick={() => void submit()}
            className={`mt-4 min-h-12 w-full rounded-xl text-sm font-black text-white disabled:bg-[var(--border)] disabled:text-[var(--muted)] ${side === "buy" ? "bg-emerald-500" : "bg-blue-500"}`}
          >
            {busy ? "처리 중…" : `${side === "buy" ? "매수" : "매도"} 주문`}
          </button>
          {!listed && <p className="mt-2 text-xs text-amber-300">상장 허가 후 거래할 수 있습니다.</p>}
          {fund.status === "grace" && side === "buy" && <p className="mt-2 text-xs text-amber-300">유예 기간에는 신규 매수할 수 없습니다.</p>}
          {!userId && <p className="mt-2 text-xs text-amber-300">로그인 후 거래할 수 있습니다.</p>}
          {message && <p className="mt-3 rounded-xl bg-[var(--surface)] p-3 text-xs">{message}</p>}
        </aside>
        <AccountSidebar />
      </div>
      <BottomTicker stocks={stocks} />
    </div>
  );
}

function formatRate(rate: number): string {
  return `${(Math.max(0, Number.isFinite(rate) ? rate : 0) * 100).toFixed(2)}%`;
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
      <div className="mt-3 flex flex-col items-center gap-4 xl:flex-row xl:items-start">
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
        <ul className="grid min-w-0 flex-1 gap-1.5 self-stretch sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
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
                <span className="shrink-0 tabular-nums text-cyan-300">
                  {(item.weight * 100).toFixed(1)}%
                </span>
              </Link>
            </li>
          ))}
        </ul>
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

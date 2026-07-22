"use client";

import { useMemo, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import type { MarginLeverage, OrderType, StockState } from "@/lib/types/market";
import {
  formatPrice,
  formatSignedMoney,
  getChangePercent,
  getMarketBuyPrice,
  getMarketSellPrice,
} from "@/lib/market/engine";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";
import { toastResult } from "@/store/toastStore";
import { playResultSound } from "@/lib/ui/sound";
import { AveragingCalculator } from "@/components/market/AveragingCalculator";
import Link from "next/link";

const TABS = ["빠른주문", "지정가", "모으기", "주문내역"] as const;
const LEVERAGES: MarginLeverage[] = [2, 3, 4, 5];
const RECURRING_INTERVALS = [
  { value: 1 as const, label: "매 거래일" },
  { value: 5 as const, label: "5거래일" },
  { value: 20 as const, label: "20거래일" },
];

function cleanDecimal(value: string): string {
  return value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");
}

function formatQuantity(quantity: number): string {
  return quantity.toLocaleString("ko-KR", { maximumFractionDigits: 6 });
}

export function QuickOrderPanel({ stock }: { stock: StockState }) {
  const [activeTab, setActiveTab] = useState(0);
  const [fractional, setFractional] = useState(false);
  const [quantityInput, setQuantityInput] = useState("1");
  const [limitPrice, setLimitPrice] = useState("");
  const [recurringAmount, setRecurringAmount] = useState("100");
  const [recurringInterval, setRecurringInterval] = useState<1 | 5 | 20>(5);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAveraging, setShowAveraging] = useState(false);

  const buyMarket = useMarketStore((s) => s.buyMarket);
  const sellMarket = useMarketStore((s) => s.sellMarket);
  const buyCurrent = useMarketStore((s) => s.buyCurrent);
  const sellCurrent = useMarketStore((s) => s.sellCurrent);
  const cash = useMarketStore((s) => s.cash);
  const openOrders = useMarketStore((s) => s.openOrders);
  const placeLimitOrder = useMarketStore((s) => s.placeLimitOrder);
  const cancelOrder = useMarketStore((s) => s.cancelOrder);
  const openShortPosition = useMarketStore((s) => s.openShortPosition);
  const coverShortPosition = useMarketStore((s) => s.coverShortPosition);
  const getBuyingPower = useMarketStore((s) => s.getBuyingPower);
  const marginEnabled = useMarketStore((s) => s.marginEnabled);
  const marginLeverage = useMarketStore((s) => s.marginLeverage);
  const setMarginEnabled = useMarketStore((s) => s.setMarginEnabled);
  const setMarginLeverage = useMarketStore((s) => s.setMarginLeverage);
  const recurringPlans = useMarketStore((s) => s.recurringInvestments);
  const createRecurringInvestment = useMarketStore(
    (s) => s.createRecurringInvestment,
  );
  const toggleRecurringInvestment = useMarketStore(
    (s) => s.toggleRecurringInvestment,
  );
  const cancelRecurringInvestment = useMarketStore(
    (s) => s.cancelRecurringInvestment,
  );
  const liveStock = useMarketStore((s) => s.getStockById(stock.id)) ?? stock;
  const holding = useMarketStore((s) =>
    s.holdings.find((item) => item.stockId === stock.id),
  );
  const shortPos = useMarketStore((s) =>
    s.shorts.find((item) => item.stockId === stock.id),
  );

  const quantity = Number(quantityInput);
  const validQuantity =
    Number.isFinite(quantity) && quantity >= (fractional ? 0.001 : 1) &&
    (fractional || Number.isInteger(quantity));
  const bestAsk = getMarketBuyPrice(liveStock.currentPrice);
  const bestBid = getMarketSellPrice(liveStock.currentPrice);
  const buyingPower = getBuyingPower();
  const maxBuy = bestAsk > 0
    ? fractional
      ? Math.floor((buyingPower / bestAsk) * 1_000) / 1_000
      : Math.floor(buyingPower / bestAsk)
    : 0;
  const maxSell = holding?.quantity ?? 0;
  const isIndexLike = liveStock.sector === "선물" || liveStock.sector === "지수";
  const isPump = liveStock.sector === "급등주";
  const stockPlan = recurringPlans.find((plan) => plan.stockId === stock.id);
  const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
  const presets = fractional ? [0.1, 0.5, 1] : [1, 10, 100];

  const profit = holding
    ? (liveStock.currentPrice - holding.averagePrice) * holding.quantity
    : 0;
  const profitPct = holding
    ? getChangePercent(liveStock.currentPrice, holding.averagePrice)
    : 0;
  const shortProfit = shortPos
    ? (shortPos.averagePrice - liveStock.currentPrice) * shortPos.quantity
    : 0;

  const currentStockOrders = useMemo(
    () => openOrders.filter((order) => order.stockId === stock.id),
    [openOrders, stock.id],
  );

  function report(result: { success: boolean; message: string }) {
    setMessage(result.message);
    toastResult(result);
  }

  function toggleMargin() {
    report(setMarginEnabled(!marginEnabled));
  }

  function chooseLeverage(leverage: MarginLeverage) {
    report(setMarginLeverage(leverage));
  }

  function toggleFractional() {
    const next = !fractional;
    setFractional(next);
    const parsed = Number(quantityInput);
    setQuantityInput(
      next
        ? String(Number.isFinite(parsed) ? Math.max(0.001, parsed) : 0.1)
        : String(Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed)) : 1),
    );
  }

  function setMaximum() {
    if (maxBuy > 0) setQuantityInput(String(maxBuy));
  }

  function order(orderType: OrderType) {
    if (!validQuantity) {
      setMessage(fractional ? "0.001주 이상 입력해 주세요." : "1주 이상의 정수를 입력해 주세요.");
      return;
    }
    setLoading(true);
    const localMap = {
      buy_market: buyMarket,
      sell_market: sellMarket,
      buy_current: buyCurrent,
      sell_current: sellCurrent,
    };
    const result = localMap[orderType](stock.id, quantity);
    report(result);
    playResultSound(result, orderType.startsWith("buy") ? "buy" : "sell");
    setLoading(false);
  }

  async function orderLimit(side: "buy" | "sell") {
    const price = Math.round(Number(limitPrice) * 100);
    if (!Number.isFinite(price) || price <= 0 || !validQuantity) {
      setMessage("가격과 수량을 확인해 주세요.");
      return;
    }
    setLoading(true);
    const result = await placeLimitOrder(stock.id, price, quantity, side);
    report(result);
    setLoading(false);
  }

  function shortOrder(kind: "open" | "cover") {
    if (!validQuantity || !Number.isInteger(quantity)) {
      setMessage("공매도는 1주 단위로만 거래할 수 있습니다.");
      return;
    }
    const result = kind === "open"
      ? openShortPosition(stock.id, quantity)
      : coverShortPosition(stock.id, quantity);
    report(result);
    playResultSound(result, kind === "open" ? "sell" : "buy");
  }

  function createPlan() {
    const dollars = Number(recurringAmount);
    const result = createRecurringInvestment(
      stock.id,
      Math.round(dollars * 100),
      recurringInterval,
    );
    report(result);
  }

  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      <div className="flex overflow-x-auto border-b border-[var(--border)]">
        {TABS.map((tab, index) => (
          <button
            key={tab}
            type="button"
            onClick={() => {
              setActiveTab(index);
              setMessage(null);
              if (index === 1 && !limitPrice) {
                setLimitPrice((liveStock.currentPrice / 100).toFixed(2));
              }
            }}
            className={`min-h-12 min-w-[76px] flex-1 px-2 py-3 text-xs transition ${
              activeTab === index
                ? "border-b-2 border-[var(--foreground)] font-semibold"
                : "text-[var(--muted)]"
            }`}
          >
            {tab}
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
                  : "꺼짐 · 현금 범위에서만 매수"}
              </p>
            </div>
            <button
              type="button"
              onClick={toggleMargin}
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
            {LEVERAGES.map((leverage) => (
              <button
                key={leverage}
                type="button"
                onClick={() => chooseLeverage(leverage)}
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

        {(activeTab === 0 || activeTab === 1) && (
          <div className="space-y-3">
            {activeTab === 1 && (
              <div>
                <label className="mb-1 block text-xs text-[var(--muted)]">지정가 ($)</label>
                <input
                  inputMode="decimal"
                  value={limitPrice}
                  onChange={(event) => setLimitPrice(cleanDecimal(event.target.value))}
                  className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm tabular-nums outline-none focus:border-[var(--accent)]"
                />
              </div>
            )}

            <div className="flex items-center justify-between">
              <label className="text-xs text-[var(--muted)]">주문 수량</label>
              <button
                type="button"
                onClick={toggleFractional}
                className={`rounded-full px-2.5 py-1 text-[11px] ${
                  fractional
                    ? "bg-[var(--accent)]/20 text-[var(--accent)]"
                    : "bg-[var(--surface)] text-[var(--muted)]"
                }`}
              >
                소수점 {fractional ? "켜짐" : "켜기"}
              </button>
            </div>
            <input
              inputMode="decimal"
              value={quantityInput}
              onChange={(event) => setQuantityInput(cleanDecimal(event.target.value))}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm tabular-nums outline-none focus:border-[var(--accent)]"
            />
            <div className="grid grid-cols-4 gap-1.5">
              {presets.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setQuantityInput(String(preset))}
                  className="min-h-10 rounded-lg bg-[var(--surface)] text-xs text-[var(--muted)]"
                >
                  {preset}주
                </button>
              ))}
              <button
                type="button"
                onClick={setMaximum}
                disabled={maxBuy <= 0}
                className="min-h-10 rounded-lg bg-[var(--surface)] text-xs text-[var(--muted)] disabled:opacity-40"
              >
                최대
              </button>
            </div>

            {activeTab === 0 ? (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <OrderButton
                    label="현재가 매도"
                    sub={formatPrice(liveStock.currentPrice)}
                    variant="sell-current"
                    disabled={loading || !validQuantity || quantity > maxSell + 1e-9}
                    onClick={() => order("sell_current")}
                  />
                  <OrderButton
                    label="현재가 매수"
                    sub={formatPrice(liveStock.currentPrice)}
                    variant="buy-current"
                    disabled={loading || !validQuantity || quantity > maxBuy + 1e-9}
                    onClick={() => order("buy_current")}
                  />
                  <OrderButton
                    label="시장가 매도"
                    sub={formatPrice(bestBid)}
                    variant="sell-market"
                    disabled={loading || !validQuantity || quantity > maxSell + 1e-9}
                    onClick={() => order("sell_market")}
                  />
                  <OrderButton
                    label="시장가 매수"
                    sub={formatPrice(bestAsk)}
                    variant="buy-market"
                    disabled={loading || !validQuantity || quantity > maxBuy + 1e-9}
                    onClick={() => order("buy_market")}
                  />
                </div>

                {isPump && (
                  <div className="border-t border-[var(--border)] pt-3">
                    <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-relaxed text-amber-200">
                      🚫 급등주는 공매도(하락 베팅) 불가 — 매수 후 정점에서
                      매도만 가능한 타이밍 싸움입니다.
                    </p>
                  </div>
                )}
                {!isIndexLike && !isPump && (
                  <div className="border-t border-[var(--border)] pt-3">
                    <div className="mb-2 flex items-center justify-between text-xs text-[var(--muted)]">
                      <span>공매도</span>
                      <span>정수 수량만 가능</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => shortOrder("open")}
                        disabled={loading || !validQuantity || !Number.isInteger(quantity)}
                        className="rounded-xl bg-[var(--down)]/10 py-3 text-xs font-semibold text-[var(--down)] disabled:opacity-40"
                      >
                        공매도
                      </button>
                      <button
                        type="button"
                        onClick={() => shortOrder("cover")}
                        disabled={!shortPos || !validQuantity || !Number.isInteger(quantity) || quantity > (shortPos?.quantity ?? 0)}
                        className="rounded-xl bg-[var(--up)]/10 py-3 text-xs font-semibold text-[var(--up)] disabled:opacity-40"
                      >
                        공매도 청산
                      </button>
                    </div>
                    {shortPos && (
                      <p className={`mt-2 text-right text-xs ${upDownClass(shortProfit)}`}>
                        {formatQuantity(shortPos.quantity)}주 · {formatSignedMoney(shortProfit)}
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => orderLimit("sell")}
                  disabled={loading || !validQuantity || quantity > maxSell + 1e-9}
                  className="rounded-2xl bg-[var(--down)] px-2 py-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  지정가 매도
                </button>
                <button
                  type="button"
                  onClick={() => orderLimit("buy")}
                  disabled={loading || !validQuantity}
                  className="rounded-2xl bg-[var(--up)] px-2 py-4 text-sm font-semibold text-white disabled:opacity-40"
                >
                  지정가 매수
                </button>
              </div>
            )}
          </div>
        )}

        {activeTab === 2 && (
          <div className="space-y-3">
            <div className="rounded-xl bg-[var(--surface)] p-3 text-xs leading-relaxed text-[var(--muted)]">
              정한 거래일마다 현재가로 소수점 매수합니다. 현금이 부족하면 해당 회차를 건너뛰며 미수는 사용하지 않습니다.
            </div>
            {stockPlan ? (
              <div className="rounded-xl border border-[var(--border)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold">
                      {formatPrice(stockPlan.amount)} · {stockPlan.intervalSessions}거래일마다
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {stockPlan.enabled
                        ? `${Math.max(0, stockPlan.nextSession - currentSession)}거래일 후 다음 매수`
                        : "일시정지됨"}
                    </p>
                    {stockPlan.lastStatus && (
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        최근 결과 · {stockPlan.lastStatus === "filled" ? "체결" : stockPlan.lastStatus === "insufficient_cash" ? "현금 부족" : "종목 거래 불가"}
                      </p>
                    )}
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] ${
                    stockPlan.enabled
                      ? "bg-emerald-500/15 text-emerald-300"
                      : "bg-[var(--surface)] text-[var(--muted)]"
                  }`}>
                    {stockPlan.enabled ? "진행 중" : "정지"}
                  </span>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => toggleRecurringInvestment(stockPlan.id)}
                    className="rounded-lg bg-[var(--surface)] py-2 text-xs"
                  >
                    {stockPlan.enabled ? "일시정지" : "다시 시작"}
                  </button>
                  <button
                    type="button"
                    onClick={() => cancelRecurringInvestment(stockPlan.id)}
                    className="rounded-lg bg-red-500/10 py-2 text-xs text-red-300"
                  >
                    계획 삭제
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs text-[var(--muted)]">회차당 금액 ($)</label>
                  <input
                    inputMode="decimal"
                    value={recurringAmount}
                    onChange={(event) => setRecurringAmount(cleanDecimal(event.target.value))}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm tabular-nums outline-none"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {RECURRING_INTERVALS.map((interval) => (
                    <button
                      key={interval.value}
                      type="button"
                      onClick={() => setRecurringInterval(interval.value)}
                      className={`rounded-lg py-2 text-xs ${
                        recurringInterval === interval.value
                          ? "bg-[var(--accent)]/20 text-[var(--accent)] ring-1 ring-[var(--accent)]/40"
                          : "bg-[var(--surface)] text-[var(--muted)]"
                      }`}
                    >
                      {interval.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={createPlan}
                  className="w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white"
                >
                  모으기 시작
                </button>
              </>
            )}
          </div>
        )}

        {activeTab === 3 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[var(--muted)]">
              이 종목 미체결 주문 {currentStockOrders.length}건
            </p>
            {currentStockOrders.length === 0 ? (
              <p className="py-8 text-center text-xs text-[var(--muted)]">대기 중인 주문이 없습니다.</p>
            ) : (
              currentStockOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between rounded-xl bg-[var(--surface)] p-3">
                  <div>
                    <p className={`text-xs font-semibold ${order.side === "buy" ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
                      {order.side === "buy" ? "매수" : "매도"}
                    </p>
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {formatPrice(order.price)} × {formatQuantity(order.quantity)}주
                    </p>
                  </div>
                  <button type="button" onClick={() => cancelOrder(order.id)} className="rounded-lg px-2 py-1 text-xs text-[var(--muted)]">
                    취소
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {message && <p className="mt-3 text-center text-xs text-[var(--muted)]">{message}</p>}

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

          {holding && holding.quantity > 0 && (
            <div className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">보유 수량</span>
                <span>{formatQuantity(holding.quantity)}주</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">평균 매수가</span>
                <span>{formatPrice(holding.averagePrice)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--muted)]">평가 손익</span>
                <span className={upDownClass(profit)}>
                  {formatSignedMoney(profit)} {formatSignedPercent(profitPct)}
                </span>
              </div>
            </div>
          )}

          {showAveraging && (
            <div className="mt-3 rounded-2xl border border-sky-400/30 bg-sky-400/5 p-3">
              <AveragingCalculator
                compact
                initialQuantity={holding?.quantity}
                initialAveragePrice={holding?.averagePrice}
                initialAddPrice={liveStock.currentPrice}
                markPrice={liveStock.currentPrice}
                stockLabel={`${liveStock.name} (${liveStock.ticker})`}
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

        <p className="mt-4 text-center text-[11px] text-[var(--muted)]">
          현금 {formatPrice(cash)} · 매수여력 {formatPrice(buyingPower)}
        </p>
      </div>
    </div>
  );
}

function OrderButton({
  label,
  sub,
  variant,
  disabled,
  onClick,
}: {
  label: string;
  sub: string;
  variant: "buy-current" | "buy-market" | "sell-current" | "sell-market";
  disabled?: boolean;
  onClick: () => void;
}) {
  const styles = {
    "buy-current": "bg-[var(--up)]/15 text-[var(--up)]",
    "buy-market": "bg-[var(--up)] text-white",
    "sell-current": "bg-[var(--down)]/15 text-[var(--down)]",
    "sell-market": "bg-[var(--down)] text-white",
  };
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center rounded-2xl px-2 py-4 disabled:opacity-40 ${styles[variant]}`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-1 text-xs opacity-80">{sub}</span>
    </button>
  );
}

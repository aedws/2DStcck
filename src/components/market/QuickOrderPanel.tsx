"use client";

import Link from "next/link";
import { useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import type { OrderType, StockState } from "@/lib/types/market";
import {
  formatPrice,
  formatSignedMoney,
  getChangePercent,
} from "@/lib/market/engine";
import {
  getMarketBuyPrice,
  getMarketSellPrice,
} from "@/lib/market/engine";
import {
  formatSignedPercent,
  upDownClass,
} from "@/lib/ui/marketColors";
import { IS_SERVER_MODE } from "@/store/marketStore";

const QTY_PRESETS = [1, 10, 100] as const;

const TABS = ["간편주문", "빠른주문", "일반주문"] as const;

export function QuickOrderPanel({ stock }: { stock: StockState }) {
  const [activeTab, setActiveTab] = useState(1);
  const [quantity, setQuantity] = useState(1);
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const placeOrder = useMarketStore((s) => s.placeOrder);
  const buyMarket = useMarketStore((s) => s.buyMarket);
  const sellMarket = useMarketStore((s) => s.sellMarket);
  const buyCurrent = useMarketStore((s) => s.buyCurrent);
  const sellCurrent = useMarketStore((s) => s.sellCurrent);
  const userId = useMarketStore((s) => s.userId);
  const cash = useMarketStore((s) => s.cash);
  const openOrders = useMarketStore((s) => s.openOrders);
  const refreshOpenOrders = useMarketStore((s) => s.refreshOpenOrders);
  const placeLimitOrder = useMarketStore((s) => s.placeLimitOrder);
  const cancelOrder = useMarketStore((s) => s.cancelOrder);
  const liveStock = useMarketStore((s) => s.getStockById(stock.id)) ?? stock;
  const holding = useMarketStore((s) =>
    s.holdings.find((h) => h.stockId === stock.id),
  );

  // 시장가 = 현재가 ± 0.005% (표시가 = 체결가)
  const bestAsk = getMarketBuyPrice(liveStock.currentPrice);
  const bestBid = getMarketSellPrice(liveStock.currentPrice);
  const maxBuy = bestAsk > 0 ? Math.floor(cash / bestAsk) : 0;
  const maxSell = holding?.quantity ?? 0;

  const profit =
    holding && holding.quantity > 0
      ? (liveStock.currentPrice - holding.averagePrice) * holding.quantity
      : 0;
  const profitPct = holding
    ? getChangePercent(liveStock.currentPrice, holding.averagePrice)
    : 0;

  async function order(orderType: OrderType) {
    if (IS_SERVER_MODE && !userId) {
      setMessage("로그인 후 주문할 수 있습니다.");
      return;
    }

    setLoading(true);
    let result;

    if (IS_SERVER_MODE) {
      result = await placeOrder(stock.id, quantity, orderType);
    } else {
      const localMap = {
        buy_market: buyMarket,
        sell_market: sellMarket,
        buy_current: buyCurrent,
        sell_current: sellCurrent,
      };
      result = localMap[orderType](stock.id, quantity);
    }

    setMessage(result.message);
    setLoading(false);
  }

  async function orderLimit(side: "buy" | "sell") {
    // 달러 입력 → 센트 변환
    const price = Math.round(parseFloat(limitPrice) * 100);
    if (!Number.isFinite(price) || price <= 0) {
      setMessage("지정가를 입력해 주세요.");
      return;
    }
    setLoading(true);
    const result = await placeLimitOrder(stock.id, price, quantity, side);
    setMessage(result.message);
    setLoading(false);
  }

  return (
    <div className="flex h-full flex-col bg-[var(--background)]">
      <div className="flex border-b border-[var(--border)]">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => {
              setActiveTab(i);
              setMessage(null);
              if (i === 2) refreshOpenOrders();
              if (i === 0 && !limitPrice) {
                setLimitPrice((liveStock.currentPrice / 100).toFixed(2));
              }
            }}
            className={`min-h-12 flex-1 py-3 text-xs transition ${
              i === activeTab
                ? "border-b-2 border-[var(--foreground)] font-semibold text-[var(--foreground)]"
                : "text-[var(--muted)]"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {IS_SERVER_MODE && !userId && (
          <p className="mb-3 rounded-xl bg-[var(--surface)] px-3 py-2 text-center text-xs text-[var(--muted)]">
            <Link href="/login" className="text-[var(--accent)] hover:underline">
              로그인
            </Link>
            하면 주문·포트폴리오가 저장됩니다.
          </p>
        )}

        {activeTab === 0 && (
          <div className="space-y-3">
            <div>
              <label className="mb-1 block text-xs text-[var(--muted)]">
                지정가 ($)
              </label>
              <input
                inputMode="decimal"
                value={limitPrice}
                onChange={(e) =>
                  setLimitPrice(
                    e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"),
                  )
                }
                placeholder={(liveStock.currentPrice / 100).toFixed(2)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm tabular-nums outline-none focus:border-[var(--accent)]"
              />
              <div className="mt-1 flex gap-1">
                {[-2, -1, 1, 2].map((pct) => (
                  <button
                    key={pct}
                    onClick={() =>
                      setLimitPrice(
                        (
                          Math.max(
                            100,
                            Math.round(
                              liveStock.currentPrice * (1 + pct / 100),
                            ),
                          ) / 100
                        ).toFixed(2),
                      )
                    }
                    className="min-h-10 flex-1 rounded-lg bg-[var(--surface)] py-1.5 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    {pct > 0 ? `+${pct}%` : `${pct}%`}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-2">
              {QTY_PRESETS.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuantity(q)}
                  className={`min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium transition ${
                    quantity === q
                      ? "bg-[var(--surface-elevated)] text-[var(--foreground)] ring-1 ring-[var(--border)]"
                      : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
                  }`}
                >
                  {q}주
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => orderLimit("sell")}
                disabled={loading || quantity > maxSell}
                className="rounded-2xl bg-[var(--down)] px-2 py-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                지정가 판매
              </button>
              <button
                onClick={() => orderLimit("buy")}
                disabled={loading}
                className="rounded-2xl bg-[var(--up)] px-2 py-5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-40"
              >
                지정가 구매
              </button>
            </div>

            <p className="text-center text-[11px] leading-relaxed text-[var(--muted)]">
              가격이 지정가에 도달하면 서버가 자동 체결합니다 (10초 주기 확인).
              대기 주문은 일반주문 탭에서 관리하세요.
            </p>
          </div>
        )}

        {activeTab === 2 && (
          <div className="space-y-2">
            <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
              미체결 지정가 주문 {openOrders.length}건
            </p>
            {openOrders.length === 0 ? (
              <p className="py-6 text-center text-xs text-[var(--muted)]">
                대기 중인 주문이 없어요.
                <br />
                간편주문 탭에서 지정가 주문을 등록해 보세요.
              </p>
            ) : (
              openOrders.map((o) => (
                <div
                  key={o.id}
                  className="flex items-center justify-between rounded-xl bg-[var(--surface)] px-3 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">
                      <span
                        className={
                          o.side === "buy"
                            ? "text-[var(--up)]"
                            : "text-[var(--down)]"
                        }
                      >
                        {o.side === "buy" ? "매수" : "매도"}
                      </span>{" "}
                      {o.ticker}
                    </p>
                    <p className="text-[11px] tabular-nums text-[var(--muted)]">
                      {formatPrice(o.price)} × {o.quantity}주
                    </p>
                  </div>
                  <button
                    onClick={() => cancelOrder(o.id)}
                    className="shrink-0 rounded-lg px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
                  >
                    취소
                  </button>
                </div>
              ))
            )}
          </div>
        )}

        {activeTab === 1 && (
        <>
        <div className="mb-4 flex gap-2">
          {QTY_PRESETS.map((q) => (
            <button
              key={q}
              onClick={() => setQuantity(q)}
              className={`min-h-11 flex-1 rounded-xl py-2.5 text-sm font-medium transition ${
                quantity === q
                  ? "bg-[var(--surface-elevated)] text-[var(--foreground)] ring-1 ring-[var(--border)]"
                  : "bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--foreground)]"
              }`}
            >
              {q}주
            </button>
          ))}
          <button
            onClick={() => setQuantity(Math.max(1, maxBuy))}
            disabled={maxBuy <= 0}
            className="min-h-11 flex-1 rounded-xl bg-[var(--surface)] py-2.5 text-sm text-[var(--muted)] disabled:opacity-40"
          >
            최대
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <OrderButton
            label="현재가 판매"
            sub={formatPrice(liveStock.currentPrice)}
            variant="sell-current"
            disabled={loading || quantity > maxSell}
            onClick={() => order("sell_current")}
          />
          <OrderButton
            label="현재가 구매"
            sub={formatPrice(liveStock.currentPrice)}
            variant="buy-current"
            disabled={loading || quantity > maxBuy}
            onClick={() => order("buy_current")}
          />
          <OrderButton
            label="시장가 판매"
            sub={bestBid > 0 ? formatPrice(bestBid) : "-"}
            variant="sell-market"
            disabled={loading || quantity > maxSell || bestBid <= 0}
            onClick={() => order("sell_market")}
          />
          <OrderButton
            label="시장가 구매"
            sub={bestAsk > 0 ? formatPrice(bestAsk) : "-"}
            variant="buy-market"
            disabled={loading || quantity > maxBuy || bestAsk <= 0}
            onClick={() => order("buy_market")}
          />
        </div>
        </>
        )}

        {message && (
          <p className="mt-3 text-center text-xs text-[var(--muted)]">
            {message}
          </p>
        )}

        {holding && holding.quantity > 0 && (
          <div className="mt-6 space-y-3 border-t border-[var(--border)] pt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">내 주식 평균</span>
              <span className="font-semibold tabular-nums">
                {formatPrice(holding.averagePrice)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">현재 수익</span>
              <span className={`font-semibold tabular-nums ${upDownClass(profit)}`}>
                {formatSignedMoney(profit)} {formatSignedPercent(profitPct)}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-[var(--muted)]">보유 수량</span>
              <span className="tabular-nums">
                {holding.quantity.toLocaleString()}주
              </span>
            </div>
          </div>
        )}

        <p className="mt-4 text-center text-xs text-[var(--muted)]">
          가용 현금 {formatPrice(cash)}
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
    "buy-current": "bg-[var(--up)]/15 text-[var(--up)] hover:bg-[var(--up)]/25",
    "buy-market": "bg-[var(--up)] text-white hover:opacity-90",
    "sell-current": "bg-[var(--down)]/15 text-[var(--down)] hover:bg-[var(--down)]/25",
    "sell-market": "bg-[var(--down)] text-white hover:opacity-90",
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center justify-center rounded-2xl px-2 py-5 transition disabled:opacity-40 ${styles[variant]}`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="mt-1 text-xs opacity-80">{sub}</span>
    </button>
  );
}

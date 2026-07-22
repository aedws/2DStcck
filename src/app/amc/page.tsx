"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AMC_ACTIVE_MAX_FEE_RATE,
  AMC_FOUNDING_BURN,
  AMC_GRACE_DAYS,
  AMC_MIN_HOLDINGS,
  AMC_MIN_NET_WORTH,
  AMC_PASSIVE_MAX_FEE_RATE,
  AMC_REBALANCE_WINDOW_DAYS,
  amcFundStockId,
  computeAmcFundNavPerShare,
  maxFeeRateForStyle,
  type AmcFundStyle,
} from "@/lib/player/assetManager";
import {
  AMC_FOUNDATION_STATUS_LABEL,
  listMyAmcFoundationRequests,
  submitAmcFoundationRequest,
  type AmcFoundationRequest,
} from "@/lib/supabase/amcFoundationRequests";
import { formatCompactMoney, formatPrice } from "@/lib/market/engine";
import { instrumentTypeOf } from "@/lib/market/taxonomy";
import { isListed } from "@/lib/market/ipo";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { useMarketStore } from "@/store/marketStore";

const fieldClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-70";

export default function AssetManagerPage() {
  const assetManager = useMarketStore((state) => state.assetManager);
  const cash = useMarketStore((state) => state.cash);
  const stocks = useMarketStore((state) => state.stocks);
  const holdings = useMarketStore((state) => state.holdings);
  const userId = useMarketStore((state) => state.userId);
  const cloudSyncReady = useMarketStore((state) => state.cloudSyncReady);
  const getTotalAssets = useMarketStore((state) => state.getTotalAssets);
  const foundAssetManager = useMarketStore((state) => state.foundAssetManager);
  const createAmcFund = useMarketStore((state) => state.createAmcFund);
  const rebalanceAmcFund = useMarketStore((state) => state.rebalanceAmcFund);
  const buyAmcFund = useMarketStore((state) => state.buyAmcFund);
  const sellAmcFund = useMarketStore((state) => state.sellAmcFund);

  const [requests, setRequests] = useState<AmcFoundationRequest[] | null>(null);
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [detail, setDetail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [founding, setFounding] = useState(false);

  const [fundName, setFundName] = useState("");
  const [fundTicker, setFundTicker] = useState("");
  const [fundStyle, setFundStyle] = useState<AmcFundStyle>("passive");
  const [feeRatePct, setFeeRatePct] = useState("0.5");
  const [benchmarkId, setBenchmarkId] = useState("");
  const [seedDollars, setSeedDollars] = useState("1000");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [tradeQty, setTradeQty] = useState<Record<string, string>>({});

  const netWorth = getTotalAssets();
  const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);

  const companyStocks = useMemo(
    () =>
      stocks.filter(
        (stock) =>
          instrumentTypeOf(stock) === "company" &&
          stock.currentPrice > 0 &&
          isListed(stock),
      ),
    [stocks],
  );

  const benchmarkOptions = useMemo(
    () =>
      stocks.filter(
        (stock) =>
          (instrumentTypeOf(stock) === "etf" ||
            instrumentTypeOf(stock) === "index") &&
          stock.currentPrice > 0,
      ),
    [stocks],
  );

  const priceOf = (stockId: string) =>
    stocks.find((stock) => stock.id === stockId)?.currentPrice ?? 0;
  const initialPriceOf = (stockId: string) =>
    stocks.find((stock) => stock.id === stockId)?.initialPrice ?? 0;

  const refreshRequests = async () => {
    setRequests(await listMyAmcFoundationRequests());
  };

  useEffect(() => {
    if (!userId || !cloudSyncReady) {
      setRequests([]);
      return;
    }
    void refreshRequests();
  }, [userId, cloudSyncReady]);

  const activeRequest = useMemo(() => {
    if (!requests?.length) return null;
    return (
      requests.find((request) =>
        ["pending", "reviewing", "accepted"].includes(request.status),
      ) ?? null
    );
  }, [requests]);

  useEffect(() => {
    if (!activeRequest) return;
    setName(activeRequest.company.name);
    setTagline(activeRequest.company.tagline);
    setDetail(activeRequest.company.detail ?? "");
  }, [activeRequest?.id]);

  const chartPoints = useMemo(() => {
    if (!assetManager?.funds.length) return [];
    const merged = new Map<number, { nav: number; count: number }>();
    for (const fund of assetManager.funds) {
      for (const point of fund.navHistory) {
        const bucket = Math.floor(point.t / 60_000) * 60_000;
        const prev = merged.get(bucket) ?? { nav: 0, count: 0 };
        merged.set(bucket, {
          nav: prev.nav + point.nav,
          count: prev.count + 1,
        });
      }
    }
    return [...merged.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, value]) => ({
        t,
        nav: Math.round(value.nav / Math.max(1, value.count)),
      }))
      .slice(-48);
  }, [assetManager]);

  const handleSubmitRequest = async () => {
    setSubmitting(true);
    setMessage("");
    const result = await submitAmcFoundationRequest({ name, tagline, detail });
    setMessage(result.message);
    if (result.success) await refreshRequests();
    setSubmitting(false);
  };

  const handleFound = async () => {
    if (!activeRequest || activeRequest.status !== "accepted") return;
    if (
      !window.confirm(
        `설립 소각 ${formatPrice(AMC_FOUNDING_BURN)}를 영구 소각하고 자산운용사를 설립할까요?`,
      )
    ) {
      return;
    }
    setFounding(true);
    const result = await foundAssetManager(
      { name, tagline, detail },
      activeRequest.id,
    );
    setMessage(result.message);
    if (result.success) await refreshRequests();
    setFounding(false);
  };

  const toggleHolding = (stockId: string) => {
    setSelectedIds((prev) =>
      prev.includes(stockId)
        ? prev.filter((id) => id !== stockId)
        : prev.length >= 12
          ? prev
          : [...prev, stockId],
    );
  };

  const handleCreateFund = () => {
    const feeRate = Number(feeRatePct) / 100;
    const equal = 1 / Math.max(selectedIds.length, 1);
    const result = createAmcFund({
      name: fundName,
      ticker: fundTicker,
      style: fundStyle,
      feeRate,
      benchmarkStockId: fundStyle === "active" ? benchmarkId : undefined,
      holdings: selectedIds.map((stockId) => ({ stockId, weight: equal })),
      seedCash: Math.round(Number(seedDollars) * 100),
    });
    setMessage(result.message);
    if (result.success) {
      setFundName("");
      setFundTicker("");
      setSelectedIds([]);
    }
  };

  if (!assetManager) {
    const eligible = netWorth >= AMC_MIN_NET_WORTH;
    const formLocked = Boolean(activeRequest);
    return (
      <div className="mx-auto max-w-3xl pb-24">
        <header className="mb-6 rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-6">
          <p className="text-xs font-bold text-emerald-300">유저 ETF · 운용료 인컴</p>
          <h1 className="mt-1 text-3xl font-black">📕 자산운용사</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            순자산 $10,000 이상이면 허가 후 자산운용사를 설립할 수 있습니다.
            설립 즉시 $10,000가 소각되며, 이후 유저 ETF는 이 탭에서만 보이고
            거래됩니다.
          </p>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <Summary label="순자산" value={formatCompactMoney(netWorth)} />
          <Summary label="설립 소각" value={formatPrice(AMC_FOUNDING_BURN)} />
          <Summary label="보유 현금" value={formatCompactMoney(cash)} />
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          {!userId || !cloudSyncReady ? (
            <p className="text-center text-sm text-[var(--muted)]">
              로그인 계정이 필요합니다.
            </p>
          ) : !eligible ? (
            <p className="text-center text-sm text-[var(--muted)]">
              순자산 $10,000부터 설립 가능합니다.
            </p>
          ) : requests === null ? (
            <p className="text-center text-sm text-[var(--muted)]">불러오는 중…</p>
          ) : (
            <div className="space-y-4">
              {activeRequest && (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-sm">
                  <div className="flex justify-between gap-2">
                    <p className="font-bold">설립 허가 신청</p>
                    <span className="text-xs font-semibold text-emerald-300">
                      {AMC_FOUNDATION_STATUS_LABEL[activeRequest.status]}
                    </span>
                  </div>
                </div>
              )}
              <Field label="운용사명 *">
                <input
                  value={name}
                  disabled={formLocked}
                  onChange={(event) => setName(event.target.value.slice(0, 40))}
                  className={fieldClass}
                  placeholder="2~40자"
                />
              </Field>
              <Field label="한 줄 소개 *">
                <input
                  value={tagline}
                  disabled={formLocked}
                  onChange={(event) => setTagline(event.target.value.slice(0, 80))}
                  className={fieldClass}
                  placeholder="필수 · 최대 80자"
                />
              </Field>
              <Field label="세부 소개 (자유)">
                <textarea
                  value={detail}
                  disabled={formLocked}
                  onChange={(event) => setDetail(event.target.value.slice(0, 500))}
                  rows={4}
                  className={`${fieldClass} resize-none`}
                  placeholder="선택 · 최대 500자"
                />
              </Field>
              {activeRequest?.status === "accepted" ? (
                <button
                  type="button"
                  disabled={founding || cash < AMC_FOUNDING_BURN}
                  onClick={() => void handleFound()}
                  className="min-h-12 w-full rounded-2xl bg-emerald-400 px-5 text-sm font-black text-black disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
                >
                  {founding ? "설립 중…" : `${formatPrice(AMC_FOUNDING_BURN)} 소각 후 설립`}
                </button>
              ) : !activeRequest ? (
                <button
                  type="button"
                  disabled={
                    submitting || name.trim().length < 2 || tagline.trim().length < 2
                  }
                  onClick={() => void handleSubmitRequest()}
                  className="min-h-12 w-full rounded-2xl bg-cyan-500 px-5 text-sm font-black text-white disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
                >
                  {submitting ? "신청 중…" : "관리자 허가 신청"}
                </button>
              ) : (
                <p className="text-center text-xs text-[var(--muted)]">
                  허가 완료 후 설립할 수 있습니다.
                </p>
              )}
            </div>
          )}
          {message && (
            <p className="mt-4 rounded-xl bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
              {message}
            </p>
          )}
        </section>
      </div>
    );
  }

  const maxFeePct =
    maxFeeRateForStyle(fundStyle) === AMC_ACTIVE_MAX_FEE_RATE ? 3 : 0.5;

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <header className="mb-5 rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 to-sky-500/5 p-6">
        <p className="text-xs font-bold text-emerald-300">ASSET MANAGER</p>
        <h1 className="mt-1 text-3xl font-black">{assetManager.name}</h1>
        <p className="mt-2 text-sm font-semibold">{assetManager.tagline}</p>
        {assetManager.detail && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            {assetManager.detail}
          </p>
        )}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary
            label="누적 소각"
            value={formatCompactMoney(assetManager.cumulativeBurned)}
          />
          <Summary label="운용 펀드" value={`${assetManager.funds.length}개`} />
          <Summary
            label="누적 운용료"
            value={formatCompactMoney(
              assetManager.funds.reduce(
                (sum, fund) => sum + fund.cumulativeFeesPaid,
                0,
              ),
            )}
          />
          <Summary
            label="설립일"
            value={new Date(assetManager.foundedAt).toLocaleDateString("ko-KR")}
          />
        </div>
      </header>

      <section className="mb-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-bold">운용사 실적</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          운용 중 펀드의 좌당 NAV 평균 추이입니다. 유저 ETF는 이 탭에서만 확인할 수
          있습니다.
        </p>
        <NavSparkline points={chartPoints} />
      </section>

      <section className="mb-5 space-y-3">
        <h2 className="text-lg font-bold">유저 ETF</h2>
        {assetManager.funds.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
            아직 설정한 ETF가 없습니다. 아래에서 첫 펀드를 만드세요.
          </p>
        ) : (
          assetManager.funds.map((fund) => {
            const nav = computeAmcFundNavPerShare(fund, priceOf, initialPriceOf);
            const held =
              holdings.find((item) => item.stockId === amcFundStockId(fund.id))
                ?.quantity ?? 0;
            const sessionsLeft = Math.max(
              0,
              AMC_REBALANCE_WINDOW_DAYS -
                (currentSession - fund.lastRebalanceSession),
            );
            const graceLeft =
              fund.status === "grace" && fund.graceStartedSession != null
                ? Math.max(
                    0,
                    AMC_GRACE_DAYS - (currentSession - fund.graceStartedSession),
                  )
                : null;
            return (
              <div
                key={fund.id}
                className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--muted)]">
                      {fund.style === "active" ? "액티브" : "패시브"} · 회차{" "}
                      {(fund.feeRate * 100).toFixed(2)}%
                    </p>
                    <h3 className="text-xl font-black">
                      {fund.name}{" "}
                      <span className="text-sm font-semibold text-[var(--muted)]">
                        {fund.ticker}
                      </span>
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      상태 {fund.status}
                      {fund.style === "active" && fund.status === "active"
                        ? ` · 손바꿈 잔여 ${sessionsLeft}거래일`
                        : ""}
                      {graceLeft != null ? ` · 유예 ${graceLeft}거래일` : ""}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--muted)]">좌당 NAV</p>
                    <p className="text-lg font-black tabular-nums">
                      {formatPrice(nav)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      보유 {held.toLocaleString("ko-KR")}좌
                    </p>
                  </div>
                </div>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  구성{" "}
                  {fund.holdings
                    .map((row) => {
                      const stock = stocks.find((item) => item.id === row.stockId);
                      return `${stock?.ticker ?? row.stockId} ${(row.weight * 100).toFixed(0)}%`;
                    })
                    .join(" · ")}
                </p>
                {fund.status !== "delisted" && (
                  <div className="mt-4 flex flex-wrap items-end gap-2">
                    <input
                      value={tradeQty[fund.id] ?? "1"}
                      onChange={(event) =>
                        setTradeQty((prev) => ({
                          ...prev,
                          [fund.id]: event.target.value.replace(/[^0-9.]/g, ""),
                        }))
                      }
                      className="w-28 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                      placeholder="수량"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setMessage(
                          buyAmcFund(
                            fund.id,
                            Number(tradeQty[fund.id] ?? "1"),
                          ).message,
                        )
                      }
                      className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white"
                    >
                      매수
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setMessage(
                          sellAmcFund(
                            fund.id,
                            Number(tradeQty[fund.id] ?? "1"),
                          ).message,
                        )
                      }
                      className="rounded-xl bg-[var(--background)] px-4 py-2 text-sm font-bold"
                    >
                      매도
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const rotated = [...fund.holdings];
                        if (rotated.length >= 2) {
                          const first = rotated[0]!;
                          rotated[0] = {
                            ...first,
                            weight: Math.max(0.05, first.weight - 0.05),
                          };
                          rotated[1] = {
                            ...rotated[1]!,
                            weight: rotated[1]!.weight + 0.05,
                          };
                        }
                        setMessage(rebalanceAmcFund(fund.id, rotated).message);
                      }}
                      className="rounded-xl border border-cyan-400/40 px-4 py-2 text-sm font-bold text-cyan-200"
                    >
                      5%p 손바꿈
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <section className="rounded-3xl border border-cyan-400/30 bg-cyan-400/5 p-5">
        <h2 className="text-lg font-bold">새 ETF 설정</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          기업 종목 {AMC_MIN_HOLDINGS}개 이상 · 시드 10% 소각 / 90% NAV · 개수 제한 없음
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="펀드명">
            <input
              value={fundName}
              onChange={(event) => setFundName(event.target.value.slice(0, 40))}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="티커">
            <input
              value={fundTicker}
              onChange={(event) =>
                setFundTicker(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 6),
                )
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="유형">
            <select
              value={fundStyle}
              onChange={(event) => {
                const style = event.target.value as AmcFundStyle;
                setFundStyle(style);
                setFeeRatePct(style === "active" ? "3" : "0.5");
              }}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            >
              <option value="passive">패시브 (최대 0.5%)</option>
              <option value="active">액티브 (최대 3%)</option>
            </select>
          </Field>
          <Field label={`회차 운용료 % (≤${maxFeePct})`}>
            <input
              value={feeRatePct}
              onChange={(event) => setFeeRatePct(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            />
          </Field>
          {fundStyle === "active" && (
            <Field label="벤치마크">
              <select
                value={benchmarkId}
                onChange={(event) => setBenchmarkId(event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
              >
                <option value="">선택</option>
                {benchmarkOptions.map((stock) => (
                  <option key={stock.id} value={stock.id}>
                    {stock.ticker} · {stock.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="시드 ($)">
            <input
              value={seedDollars}
              onChange={(event) =>
                setSeedDollars(event.target.value.replace(/[^0-9.]/g, ""))
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            />
          </Field>
        </div>
        <div className="mt-4">
          <p className="mb-2 text-xs font-semibold text-[var(--muted)]">
            구성 종목 선택 ({selectedIds.length} · 동일가중)
          </p>
          <div className="grid max-h-48 grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3">
            {companyStocks.slice(0, 60).map((stock) => {
              const on = selectedIds.includes(stock.id);
              return (
                <button
                  key={stock.id}
                  type="button"
                  onClick={() => toggleHolding(stock.id)}
                  className={`rounded-xl border px-2 py-2 text-left text-xs ${
                    on
                      ? "border-cyan-400 bg-cyan-400/15 font-bold"
                      : "border-[var(--border)] bg-[var(--background)]"
                  }`}
                >
                  {stock.ticker}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={handleCreateFund}
          disabled={selectedIds.length < AMC_MIN_HOLDINGS}
          className="mt-4 min-h-12 w-full rounded-2xl bg-cyan-500 px-5 text-sm font-black text-white disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
        >
          ETF 설정 (시드 10% 소각)
        </button>
      </section>

      {message && (
        <p className="mt-4 rounded-xl bg-[var(--surface)] p-3 text-xs text-[var(--muted)]">
          {message}
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-black tabular-nums">{value}</p>
    </div>
  );
}

function NavSparkline({
  points,
}: {
  points: { t: number; nav: number }[];
}) {
  if (points.length < 2) {
    return (
      <div className="mt-4 flex h-40 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-xs text-[var(--muted)]">
        운용 데이터가 쌓이면 차트가 표시됩니다.
      </div>
    );
  }
  const min = Math.min(...points.map((point) => point.nav));
  const max = Math.max(...points.map((point) => point.nav));
  const span = Math.max(1, max - min);
  const width = 320;
  const height = 120;
  const d = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.nav - min) / span) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
        <path d={d} fill="none" stroke="rgb(52 211 153)" strokeWidth="2.5" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]">
        <span>{formatPrice(points[0]!.nav)}</span>
        <span>{formatPrice(points[points.length - 1]!.nav)}</span>
      </div>
    </div>
  );
}

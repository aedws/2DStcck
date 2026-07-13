"use client";

import Link from "next/link";
import { useState } from "react";
import {
  PORTFOLIO_STRATEGIES,
  backtestPortfolioStrategy,
  calculateStrategyAllocation,
  getPortfolioStrategy,
} from "@/lib/market/portfolioStrategies";
import { useMarketStore } from "@/store/marketStore";

function percent(value: number, digits = 1): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(digits)}%`;
}

let backtestCacheKey = "";
let backtestCache = new Map<
  string,
  ReturnType<typeof backtestPortfolioStrategy>
>();

function strategyStats(stocks: ReturnType<typeof useMarketStore.getState>["stocks"]) {
  const key = stocks
    .map((stock) => `${stock.id}:${stock.dailyCandles.length}:${stock.dailyCandles.at(-1)?.timestamp ?? 0}`)
    .join("|");
  if (key === backtestCacheKey) return backtestCache;
  backtestCacheKey = key;
  backtestCache = new Map(
    PORTFOLIO_STRATEGIES.map((strategy) => [
      strategy.id,
      backtestPortfolioStrategy(strategy, stocks),
    ]),
  );
  return backtestCache;
}

export default function PortfolioStrategyPage() {
  useMarketStore((state) => state.tick);
  const selectedId = useMarketStore((state) => state.selectedPortfolioStrategyId);
  const selectedAt = useMarketStore((state) => state.portfolioStrategySelectedAt);
  const selectStrategy = useMarketStore((state) => state.selectPortfolioStrategy);
  const holdings = useMarketStore((state) => state.holdings);
  const stocks = useMarketStore((state) => state.stocks);
  const cash = useMarketStore((state) => state.cash);
  const equity = useMarketStore((state) => state.getTotalAssets());
  const [message, setMessage] = useState<string | null>(null);
  const selected = getPortfolioStrategy(selectedId);
  const allocation = calculateStrategyAllocation(
    selected,
    holdings,
    stocks,
    cash,
    equity,
  );
  const stats = strategyStats(stocks);

  return (
    <div className="mx-auto max-w-6xl pb-20">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-cyan-300">PORTFOLIO LAB</p>
          <h1 className="mt-1 text-2xl font-black">🧭 포트폴리오 전략</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            운용 기준을 하나 선택하고 현재 비중과 전략별 20거래일 성과를 비교합니다.
          </p>
        </div>
        <Link
          href="/stress-test"
          className="rounded-xl border border-red-400/40 bg-red-400/10 px-4 py-2.5 text-sm font-bold text-red-300 hover:bg-red-400/15"
        >
          🚨 독립 위기 스트레스 테스트 →
        </Link>
      </div>

      <section className="mt-6 rounded-3xl border border-cyan-400/30 bg-cyan-400/[0.05] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs text-[var(--muted)]">현재 선언 전략</p>
            <h2 className="mt-1 text-xl font-black">{selected.emoji} {selected.name}</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">{selected.description}</p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-black text-cyan-300">
              {(allocation.compliance * 100).toFixed(0)}%
            </p>
            <p className="text-xs text-[var(--muted)]">목표 비중 충족도</p>
            {selectedAt > 0 && (
              <p className="mt-1 text-[10px] text-[var(--muted)]">
                {new Date(selectedAt).toLocaleString("ko-KR")} 선택
              </p>
            )}
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {allocation.rows.map((row) => (
            <div key={row.id} className="rounded-xl bg-[var(--surface)] p-3">
              <div className="flex items-center justify-between gap-2 text-xs">
                <span className="font-bold">{row.emoji} {row.label}</span>
                <span className={row.actualWeight + 1e-9 >= row.targetWeight ? "text-[var(--up)]" : "text-amber-300"}>
                  {(row.actualWeight * 100).toFixed(1)}% / {(row.targetWeight * 100).toFixed(0)}%
                </span>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--background)]">
                <div
                  className={`h-full rounded-full ${row.actualWeight >= row.targetWeight ? "bg-[var(--up)]" : "bg-cyan-400"}`}
                  style={{ width: `${Math.min(100, row.actualWeight / row.targetWeight * 100)}%` }}
                />
              </div>
              <p className="mt-1.5 text-[10px] text-[var(--muted)]">{row.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">전략 선택 및 밸런스 통계</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              성공은 같은 20거래일의 V-NASDAQ 수익률 이상, 파산은 모형 순자산 0 이하입니다.
            </p>
          </div>
          <p className="text-[10px] text-[var(--muted)]">
            최근 공통 시장 일봉 · 최대 240개 롤링 구간
          </p>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {PORTFOLIO_STRATEGIES.map((strategy) => {
            const stat = stats.get(strategy.id)!;
            const active = selected.id === strategy.id;
            return (
              <article
                key={strategy.id}
                className={`rounded-2xl border p-4 ${active ? "border-cyan-300 bg-cyan-400/[0.06] ring-1 ring-cyan-300" : "border-[var(--border)] bg-[var(--surface)]"}`}
              >
                <div className="flex items-start gap-3">
                  <span className="text-3xl">{strategy.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold">{strategy.name}</h3>
                      <span className="rounded-full bg-[var(--background)] px-2 py-0.5 text-[10px] text-[var(--muted)]">
                        위험 {strategy.risk} · 총노출 ×{strategy.grossExposure.toFixed(2)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">{strategy.description}</p>
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Metric label="성공률" value={stat.samples ? `${(stat.successRate * 100).toFixed(1)}%` : "집계 중"} positive />
                  <Metric label="파산율" value={stat.samples ? `${(stat.bankruptcyRate * 100).toFixed(2)}%` : "-"} negative={stat.bankruptcyRate > 0} />
                  <Metric label="평균 낙폭" value={stat.samples ? `${(stat.averageMaxDrawdown * 100).toFixed(1)}%` : "-"} />
                </div>
                <div className="mt-3 flex items-center justify-between text-[10px] text-[var(--muted)]">
                  <span>평균 {stat.samples ? percent(stat.averageReturn) : "-"}</span>
                  <span>최악 {stat.samples ? percent(stat.worstReturn) : "-"}</span>
                  <span>{stat.samples}개 구간</span>
                </div>
                <button
                  type="button"
                  disabled={active}
                  onClick={() => {
                    const result = selectStrategy(strategy.id);
                    setMessage(result.message);
                  }}
                  className="mt-4 min-h-11 w-full rounded-xl bg-cyan-400 text-sm font-black text-black disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
                >
                  {active ? "현재 운용 전략" : "이 전략을 운용 기준으로 선택"}
                </button>
              </article>
            );
          })}
        </div>
        {message && <p className="mt-3 text-sm text-[var(--muted)]">{message}</p>}
      </section>

      <p className="mt-6 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs leading-relaxed text-[var(--muted)]">
        전략 선택은 종목을 자동 매매하거나 미수를 켜지 않습니다. 목표 비중과 통계는 운용 기준이며 실제 결과는 매수 시점, 개별 사건, 수수료와 직접 선택한 레버리지에 따라 달라집니다.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  positive = false,
  negative = false,
}: {
  label: string;
  value: string;
  positive?: boolean;
  negative?: boolean;
}) {
  return (
    <div className="rounded-xl bg-[var(--background)] p-2.5">
      <p className="text-[10px] text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-sm font-black ${negative ? "text-[var(--down)]" : positive ? "text-[var(--up)]" : ""}`}>
        {value}
      </p>
    </div>
  );
}

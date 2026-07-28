"use client";

import { useEffect, useState } from "react";
import { MODAL_PRIORITY, useModalSlot } from "@/components/layout/ModalQueue";
import { formatCompactMoney } from "@/lib/market/engine";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  getAmcPortfolioPositions,
  mergeAmcPortfolioFunds,
} from "@/lib/player/amcPortfolio";
import { listedFundToAmcState } from "@/lib/supabase/amcListedFunds";
import { useMarketStore } from "@/store/marketStore";

const RETURN_REPORT_MIN_SESSIONS = 24;
const SNAPSHOT_VERSION = 1;

interface PositionSnapshot {
  id: string;
  name: string;
  ticker: string;
  quantity: number;
  price: number;
}

interface ReturnSnapshot {
  version: number;
  timestamp: number;
  session: number;
  positions: PositionSnapshot[];
  paymentIds: string[];
}

interface ReturnReport {
  awaySessions: number;
  dividendIncome: number;
  events: Array<{ id: string; title: string; description: string }>;
  contributions: Array<{
    id: string;
    name: string;
    ticker: string;
    amount: number;
  }>;
}

function snapshotKey(userId: string | null): string {
  return `2dstock:return-report:v${SNAPSHOT_VERSION}:${userId ?? "guest"}`;
}

function readSnapshot(key: string): ReturnSnapshot | null {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) ?? "null") as
      | ReturnSnapshot
      | null;
    return parsed?.version === SNAPSHOT_VERSION ? parsed : null;
  } catch {
    return null;
  }
}

function buildSnapshot(): ReturnSnapshot {
  const state = useMarketStore.getState();
  const funds = mergeAmcPortfolioFunds(
    state.assetManager?.funds ?? [],
    state.listedAmcFunds.map(listedFundToAmcState),
  );
  const amcPositions = getAmcPortfolioPositions(
    state.holdings,
    funds,
    state.stocks,
  );
  const amcHoldingIds = new Set(amcPositions.map((item) => item.holding.stockId));
  const positions: PositionSnapshot[] = state.holdings.flatMap((holding) => {
    if (!(holding.quantity > 0) || amcHoldingIds.has(holding.stockId)) return [];
    const stock = state.stocks.find((item) => item.id === holding.stockId);
    if (!stock) return [];
    return [{
      id: stock.id,
      name: stock.name,
      ticker: stock.ticker,
      quantity: holding.quantity,
      price: stock.currentPrice,
    }];
  });
  for (const position of amcPositions) {
    positions.push({
      id: position.holding.stockId,
      name: position.fund.name,
      ticker: position.fund.ticker,
      quantity: position.holding.quantity,
      price: position.navPerShare,
    });
  }
  const session =
    state.stocks[0]?.daySessionId ??
    Math.floor(Date.now() / SESSION_DURATION_MS);
  return {
    version: SNAPSHOT_VERSION,
    timestamp: Date.now(),
    session,
    positions,
    paymentIds: state.cashPayments.map((payment) => payment.id),
  };
}

function buildReport(previous: ReturnSnapshot, current: ReturnSnapshot): ReturnReport {
  const state = useMarketStore.getState();
  const oldPaymentIds = new Set(previous.paymentIds);
  const dividendIncome = state.cashPayments
    .filter(
      (payment) =>
        !oldPaymentIds.has(payment.id) &&
        payment.dueSession > previous.session &&
        (payment.kind === "dividend" ||
          payment.kind === "amc_dividend" ||
          payment.kind === "preferred_dividend"),
    )
    .reduce((sum, payment) => sum + payment.amount, 0);

  const events = state.events
    .filter(
      (event) =>
        event.timestamp > previous.timestamp && event.category === "company",
    )
    .sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact))
    .slice(0, 5)
    .map((event) => ({
      id: event.id,
      title: event.title,
      description: event.description,
    }));

  const currentById = new Map(current.positions.map((position) => [position.id, position]));
  const contributions = previous.positions
    .map((oldPosition) => {
      const latest = currentById.get(oldPosition.id);
      const currentPrice = latest?.price ?? 0;
      return {
        id: oldPosition.id,
        name: oldPosition.name,
        ticker: oldPosition.ticker,
        amount: oldPosition.quantity * (currentPrice - oldPosition.price),
      };
    })
    .filter((item) => Math.abs(item.amount) >= 1)
    .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount))
    .slice(0, 6);

  return {
    awaySessions: Math.max(0, current.session - previous.session),
    dividendIncome,
    events,
    contributions,
  };
}

export function ReturnInvestmentReport() {
  const userId = useMarketStore((state) => state.userId);
  const [report, setReport] = useState<ReturnReport | null>(null);
  const show = useModalSlot(
    "return-investment-report",
    MODAL_PRIORITY.returnInvestmentReport,
    report !== null,
  );

  useEffect(() => {
    const key = snapshotKey(userId);
    const previous = readSnapshot(key);
    const current = buildSnapshot();
    if (
      previous &&
      current.session - previous.session >= RETURN_REPORT_MIN_SESSIONS
    ) {
      setReport(buildReport(previous, current));
    }
    window.localStorage.setItem(key, JSON.stringify(current));
    const persistLatest = () => {
      window.localStorage.setItem(key, JSON.stringify(buildSnapshot()));
    };
    window.addEventListener("beforeunload", persistLatest);
    return () => {
      persistLatest();
      window.removeEventListener("beforeunload", persistLatest);
    };
  }, [userId]);

  if (!show || !report) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <section className="max-h-[90vh] w-full max-w-3xl overflow-y-auto rounded-3xl border border-emerald-400/30 bg-[var(--surface)] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-emerald-300">WELCOME BACK</p>
            <h2 className="mt-1 text-2xl font-black">복귀 투자 리포트</h2>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {report.awaySessions}거래일 동안 계좌에 있었던 핵심 변화입니다.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setReport(null)}
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-xs font-bold"
          >
            닫기
          </button>
        </div>

        <div className="mt-5 rounded-2xl bg-emerald-400/10 p-4">
          <p className="text-xs font-bold text-emerald-300">미접속 중 배당 수익</p>
          <p className="mt-1 text-2xl font-black">
            {formatCompactMoney(report.dividendIncome)}
          </p>
        </div>

        <div className="mt-5 grid gap-5 md:grid-cols-2">
          <div>
            <h3 className="font-black">종목별 손익 기여도</h3>
            <div className="mt-2 space-y-2">
              {report.contributions.length ? (
                report.contributions.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-xl bg-[var(--background)] px-3 py-3 text-sm"
                  >
                    <span className="min-w-0 truncate font-bold">
                      {item.name}{" "}
                      <span className="text-xs text-[var(--muted)]">{item.ticker}</span>
                    </span>
                    <span
                      className={`shrink-0 font-black ${
                        item.amount >= 0 ? "text-emerald-300" : "text-rose-300"
                      }`}
                    >
                      {item.amount >= 0 ? "+" : ""}
                      {formatCompactMoney(item.amount)}
                    </span>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-xs text-[var(--muted)]">
                  보유 종목의 유의미한 가격 변화가 없습니다.
                </p>
              )}
            </div>
          </div>
          <div>
            <h3 className="font-black">주요 기업 사건</h3>
            <div className="mt-2 space-y-2">
              {report.events.length ? (
                report.events.map((event) => (
                  <div
                    key={event.id}
                    className="rounded-xl bg-[var(--background)] px-3 py-3"
                  >
                    <p className="text-sm font-bold">{event.title}</p>
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                      {event.description}
                    </p>
                  </div>
                ))
              ) : (
                <p className="rounded-xl border border-dashed border-[var(--border)] p-4 text-xs text-[var(--muted)]">
                  미접속 기간에 기록된 주요 기업 사건이 없습니다.
                </p>
              )}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setReport(null)}
          className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-sm font-black text-white"
        >
          시장으로 돌아가기
        </button>
      </section>
    </div>
  );
}

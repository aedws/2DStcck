"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  burryForecast,
  pensionFund13F,
  wallStreetForecast,
} from "@/lib/market/institutionalPositions";
import { getLiquidityCrisisOpportunity } from "@/lib/market/liquidityCrisis";
import {
  getLiquidityInterventionStatus,
  type LiquidityInterventionStatus,
} from "@/lib/supabase/liquidityInterventions";
import {
  decimalToScaledInteger,
  formatExactMoney,
} from "@/lib/market/exactAmount";
import { useMarketStore } from "@/store/marketStore";

type PanelTab = "positions" | "news";

function centsAsMoney(cents: string | undefined): string {
  if (!cents) return "-";
  return formatExactMoney((BigInt(cents) / 100n).toString());
}

function progressOf(status: LiquidityInterventionStatus | null): number {
  if (!status?.totalCentsExact || !status.targetCentsExact) return 0;
  const total = BigInt(status.totalCentsExact);
  const target = BigInt(status.targetCentsExact);
  return target > 0n
    ? Number((total * 10_000n) / target) / 100
    : 0;
}

export function InstitutionalLiquidityPanel() {
  const stocks = useMarketStore((state) => state.stocks);
  const events = useMarketStore((state) => state.events);
  const userId = useMarketStore((state) => state.userId);
  const contribute = useMarketStore(
    (state) => state.contributeLiquidityCapital,
  );
  const interventions = useMarketStore(
    (state) => state.liquidityInterventions,
  );
  const [tab, setTab] = useState<PanelTab>("positions");
  const [status, setStatus] =
    useState<LiquidityInterventionStatus | null>(null);
  const [statusMessage, setStatusMessage] = useState("");
  const [amount, setAmount] = useState("1000000000");
  const [submitting, setSubmitting] = useState(false);
  const [resultMessage, setResultMessage] = useState("");

  const session = Math.floor(Date.now() / SESSION_DURATION_MS);
  const opportunity = useMemo(
    () => getLiquidityCrisisOpportunity(session),
    [session],
  );
  const pension = useMemo(() => pensionFund13F(stocks), [stocks]);
  const wallStreet = useMemo(
    () => wallStreetForecast(session, stocks),
    [session, stocks],
  );
  const burry = useMemo(() => burryForecast(session), [session]);
  const stockById = useMemo(
    () => new Map(stocks.map((stock) => [stock.id, stock])),
    [stocks],
  );

  useEffect(() => {
    let active = true;
    if (!opportunity) {
      setStatus(null);
      setStatusMessage("");
      return () => {
        active = false;
      };
    }
    const refresh = async () => {
      const response = await getLiquidityInterventionStatus(opportunity);
      if (!active) return;
      if (response.success) {
        setStatus(response.status);
        setStatusMessage("");
      } else {
        setStatusMessage(response.message);
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5_000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [opportunity, interventions]);

  const submit = async () => {
    if (!opportunity || submitting) return;
    let amountCents: bigint;
    try {
      amountCents = decimalToScaledInteger(amount.replaceAll(",", ""), 2);
    } catch {
      setResultMessage("투입할 금액을 숫자로 입력해 주세요.");
      return;
    }
    if (amountCents < 100_000_000_000n) {
      setResultMessage("최소 투입액은 $1,000,000,000입니다.");
      return;
    }
    setSubmitting(true);
    setResultMessage("");
    const response = await contribute(opportunity, amountCents.toString());
    setSubmitting(false);
    setResultMessage(response.message);
    if (response.success) {
      const refreshed = await getLiquidityInterventionStatus(opportunity);
      if (refreshed.success) setStatus(refreshed.status);
    }
  };

  const recentNews = [...events]
    .sort((left, right) => right.timestamp - left.timestamp)
    .slice(0, 5);
  const progress = Math.min(100, Math.max(0, progressOf(status)));

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]/75">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-blue-400">
            Capital Intelligence
          </p>
          <h2 className="mt-0.5 text-base font-bold text-[var(--foreground)]">
            기관 포지션·유동성 관제
          </h2>
        </div>
        <div className="flex rounded-xl border border-[var(--border)] bg-black/20 p-1 text-xs">
          <button
            type="button"
            onClick={() => setTab("positions")}
            className={`rounded-lg px-3 py-1.5 font-semibold transition ${
              tab === "positions"
                ? "bg-blue-500/20 text-blue-300"
                : "text-[var(--muted)]"
            }`}
          >
            포지션
          </button>
          <button
            type="button"
            onClick={() => setTab("news")}
            className={`rounded-lg px-3 py-1.5 font-semibold transition ${
              tab === "news"
                ? "bg-blue-500/20 text-blue-300"
                : "text-[var(--muted)]"
            }`}
          >
            뉴스
          </button>
        </div>
      </div>

      {tab === "news" ? (
        <div className="divide-y divide-[var(--border)]">
          {recentNews.map((event) => (
            <article key={event.id} className="px-4 py-3">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-[var(--foreground)]">
                    {event.title}
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-[var(--muted)]">
                    {event.description}
                  </p>
                </div>
                <span className="shrink-0 text-[10px] text-[var(--muted)]">
                  {new Date(event.timestamp).toLocaleTimeString("ko-KR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
              </div>
            </article>
          ))}
          {recentNews.length === 0 && (
            <p className="px-4 py-8 text-center text-sm text-[var(--muted)]">
              아직 집계된 시장 뉴스가 없습니다.
            </p>
          )}
          <div className="px-4 py-3 text-right">
            <Link href="/news" className="text-xs font-semibold text-blue-400">
              전체 뉴스 보기 →
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-3 p-3 md:p-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <article className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.05] p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-emerald-300">🏦 연기금 13F</h3>
                <span className="text-[10px] text-emerald-400">전량 공개</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                유동성 위기 목표액의 12%를 자동 투입
              </p>
              <div className="mt-3 grid grid-cols-2 gap-1.5">
                {pension.map((holding) => {
                  const stock = stockById.get(holding.stockId);
                  return (
                    <div
                      key={holding.stockId}
                      className="flex justify-between rounded-lg bg-black/20 px-2 py-1.5 text-xs"
                    >
                      <span className="truncate text-[var(--foreground)]">
                        {stock?.ticker ?? holding.stockId.toUpperCase()}
                      </span>
                      <span className="font-mono text-emerald-300">
                        {(holding.weight * 100).toFixed(0)}%
                      </span>
                    </div>
                  );
                })}
              </div>
            </article>

            <article className="rounded-xl border border-blue-500/20 bg-blue-500/[0.05] p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-blue-300">🏙️ 월가</h3>
                <span className="text-[10px] text-blue-400">적중률 80%</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                유동성 위기 목표액의 18%를 자동 투입
              </p>
              <div className="mt-3 rounded-lg bg-black/20 p-2.5">
                <p className="text-xs text-[var(--muted)]">
                  향후 {wallStreet.horizonSessions}거래일
                </p>
                <p
                  className={`mt-1 text-sm font-bold ${
                    wallStreet.direction === "up"
                      ? "text-emerald-400"
                      : "text-red-400"
                  }`}
                >
                  {wallStreet.direction === "up" ? "강세 전망 ↑" : "약세 전망 ↓"}
                  {" · "}
                  {wallStreet.warning ? "위기 경고" : "위기 신호 없음"}
                </p>
                <p className="mt-2 truncate text-[11px] text-blue-300">
                  관심:{" "}
                  {wallStreet.featuredStockIds
                    .map((id) => stockById.get(id)?.ticker ?? id)
                    .join(" · ")}
                </p>
              </div>
            </article>

            <article className="rounded-xl border border-amber-500/20 bg-amber-500/[0.05] p-3">
              <div className="flex items-center justify-between">
                <h3 className="font-bold text-amber-300">🐻 버리</h3>
                <span className="text-[10px] text-amber-400">적중률 1%</span>
              </div>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                개발자 편향 · 버리 헤이터 설정
              </p>
              <div className="mt-3 rounded-lg bg-black/20 p-2.5">
                <p className="text-xs text-[var(--muted)]">
                  향후 {burry.horizonSessions}거래일
                </p>
                <p className="mt-1 text-sm font-bold text-amber-300">
                  {burry.warning
                    ? "대형 위기 경고 ⚠"
                    : "이번에는 위기 경고 없음"}
                </p>
                <p className="mt-2 text-[11px] leading-4 text-[var(--muted)]">
                  신호는 100회 중 1회만 실제 미래와 일치합니다.
                </p>
              </div>
            </article>
          </div>

          <article className="rounded-xl border border-violet-500/25 bg-violet-500/[0.05] p-3 md:p-4">
            {opportunity ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-400">
                      Capital Rescue Open
                    </p>
                    <h3 className="mt-1 text-sm font-bold text-[var(--foreground)]">
                      🚨 {opportunity.publicLabel}
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      종료까지 {Math.max(0, opportunity.endSession - session)}거래일
                      {" · "}연기금 12% + 월가 18% 선투입
                    </p>
                  </div>
                  {status?.resolved && (
                    <span className="rounded-full bg-emerald-500/15 px-2.5 py-1 text-xs font-bold text-emerald-300">
                      진화 완료
                    </span>
                  )}
                </div>

                {status?.contributed ? (
                  <div className="mt-3">
                    <div className="flex justify-between text-xs">
                      <span className="text-[var(--muted)]">
                        {centsAsMoney(status.totalCentsExact)} 모임
                      </span>
                      <span className="font-mono text-violet-300">
                        목표 {centsAsMoney(status.targetCentsExact)}
                      </span>
                    </div>
                    <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/30">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-blue-500 to-violet-400"
                        style={{ width: `${progress}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[11px] text-violet-300">
                      내 투입액 {centsAsMoney(status.myCentsExact)}
                    </p>
                  </div>
                ) : (
                  <div className="mt-3 rounded-lg border border-dashed border-violet-500/25 bg-black/15 px-3 py-2 text-xs text-[var(--muted)]">
                    목표액과 현재 모금액은 자본을 투입한 참여자에게만 공개됩니다.
                  </div>
                )}

                {!status?.resolved && (
                  <div className="mt-3 flex flex-col gap-2 md:flex-row">
                    <div className="flex min-w-0 flex-1 gap-1.5">
                      <span className="flex items-center rounded-lg border border-[var(--border)] bg-black/20 px-2 text-sm text-[var(--muted)]">
                        $
                      </span>
                      <input
                        value={amount}
                        onChange={(event) => setAmount(event.target.value)}
                        inputMode="decimal"
                        aria-label="유동성 위기 자본 투입액"
                        className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-black/20 px-3 py-2 text-sm text-[var(--foreground)] outline-none focus:border-violet-400"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      {[
                        ["$1B", "1000000000"],
                        ["$100B", "100000000000"],
                        ["$10T", "10000000000000"],
                      ].map(([label, value]) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => setAmount(value)}
                          className="rounded-lg border border-[var(--border)] px-2 py-2 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
                        >
                          {label}
                        </button>
                      ))}
                      <button
                        type="button"
                        disabled={submitting || !userId}
                        onClick={() => void submit()}
                        className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {submitting ? "투입 중…" : "자본 투입"}
                      </button>
                    </div>
                  </div>
                )}
                {!userId && (
                  <p className="mt-2 text-[11px] text-amber-300">
                    로그인 후 공동 진화에 참여할 수 있습니다.
                  </p>
                )}
                {(resultMessage || statusMessage) && (
                  <p className="mt-2 text-xs text-[var(--muted)]">
                    {resultMessage || statusMessage}
                  </p>
                )}
                <p className="mt-3 text-[10px] leading-4 text-[var(--muted)]">
                  성공 시 참여자 전원은 ‘시장의 소방수’, 최대 기여자는
                  ‘위대한 자본가’ 칭호를 받습니다.
                </p>
              </>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-sm font-bold text-[var(--foreground)]">
                    🛡️ 현재 진화 가능한 유동성 위기 없음
                  </h3>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    글로벌 신용 경색 · 은행 유동성 위기 · 유동성 가뭄 ·
                    갑작스러운 뱅크런 발생 시 개인 자본 투입이 열립니다.
                  </p>
                </div>
                <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs text-emerald-300">
                  관제 중
                </span>
              </div>
            )}
          </article>
        </div>
      )}
    </section>
  );
}

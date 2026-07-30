"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { formatCompactMoney } from "@/lib/market/engine";
import {
  getAnnualRatePercent,
  getBenchmark,
  getRateLevel,
  RATE_LABEL,
} from "@/lib/market/interestRate";
import { getActiveMarketCrisis } from "@/lib/market/marketCrises";
import { getActiveScheduledWar } from "@/lib/market/scheduledWar";
import type { PlayerCompanyState } from "@/lib/player/playerCompany";
import {
  playerCompanyStrategyEventType,
  recordPlayerCompanyStrategyEvent,
} from "@/lib/supabase/playerCompanyStrategyEvents";
import {
  advancePlayerCompanyManagement,
  announcePlayerCompanyGuidance,
  choosePlayerCompanyCrisisStrategy,
  crisisStrategyLabel,
  issuePlayerCompanyBond,
  playerCompanyBondCouponRate,
  playerCompanyCreditRating,
  playerCompanyCreditScore,
  playerCompanyHallOfFameScore,
  setPlayerCompanyRegularDividendPolicy,
  setPlayerCompanyStockOptionPolicy,
  signPlayerCompanySupplyContract,
  supplyTypeLabel,
  type PlayerCompanyCrisisStrategy,
  type PlayerCompanyManagementResult,
  type PlayerCompanySupplyType,
} from "@/lib/player/playerCompanyManagement";
import { useMarketStore } from "@/store/marketStore";

const CRISIS_STRATEGIES: Array<{
  id: PlayerCompanyCrisisStrategy;
  icon: string;
  description: string;
}> = [
  {
    id: "restructuring",
    icon: "✂️",
    description: "현금을 확보하고 신용을 지키지만 인재와 명성이 손상됩니다.",
  },
  {
    id: "cash-defense",
    icon: "🛡️",
    description: "유동성과 등급을 우선해 생존 확률을 높입니다.",
  },
  {
    id: "aggressive-investment",
    icon: "⚡",
    description: "회사 자본 12%를 투입해 불황기 점유율 확대를 노립니다.",
  },
  {
    id: "supply-diversification",
    icon: "🔗",
    description: "회사 자본 7%로 조달처를 분산해 위기 충격을 줄입니다.",
  },
];

const SUPPLY_TYPES: PlayerCompanySupplyType[] = [
  "energy",
  "food",
  "logistics",
  "semiconductor",
];

const RATING_STYLE: Record<string, string> = {
  AAA: "text-emerald-300",
  AA: "text-emerald-300",
  A: "text-cyan-300",
  BBB: "text-cyan-300",
  BB: "text-amber-300",
  B: "text-orange-300",
  CCC: "text-rose-300",
  정크: "text-red-400",
};

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-lg font-black tabular-nums">{value}</p>
      {detail && <p className="mt-1 text-[10px] text-[var(--muted)]">{detail}</p>}
    </div>
  );
}

export function PlayerCompanyStrategyPanel({
  company,
  currentSession,
}: {
  company: PlayerCompanyState;
  currentSession: number;
}) {
  const updateManagement = useMarketStore(
    (state) => state.updatePlayerCompanyManagement,
  );
  const saveCloud = useMarketStore((state) => state.saveCloud);
  const benchmark = useMarketStore((state) => getBenchmark(state.stocks));
  const management = company.management;
  const [revenueTarget, setRevenueTarget] = useState("10");
  const [marginTarget, setMarginTarget] = useState("12");
  const [regularRate, setRegularRate] = useState(() =>
    ((management?.regularDividendRate ?? 0.01) * 100).toFixed(2),
  );
  const [optionRate, setOptionRate] = useState(() =>
    ((management?.stockOptionPoolRate ?? 0) * 100).toFixed(1),
  );
  const [message, setMessage] = useState("");
  const registeredMarketEvents = useRef(new Set<string>());

  const context = useMemo(
    () => ({
      companyId: company.id,
      ticker: company.ticker,
      sector: company.sector,
      capital: company.cumulativeCapitalBurned,
      reputation: company.governanceReputation ?? 0,
      currentSession,
    }),
    [
      company.id,
      company.ticker,
      company.sector,
      company.cumulativeCapitalBurned,
      company.governanceReputation,
      currentSession,
    ],
  );
  const rateLevel = getRateLevel(benchmark);
  const benchmarkRate = getAnnualRatePercent(rateLevel);
  const activeCrisis = getActiveMarketCrisis(currentSession);
  const activeWar = getActiveScheduledWar(currentSession);
  const crisis = activeCrisis
    ? {
        key: `crisis-${activeCrisis.crisisNumber}`,
        label: `${activeCrisis.theme.emoji} ${activeCrisis.theme.name}`,
        detail: `${activeCrisis.phase.name} · ${activeCrisis.sessionsLeft}거래일 남음`,
      }
    : activeWar?.phase.wartime
      ? {
          key: "gehenna-trinity-war",
          label: "⚔️ 게-트 대전쟁",
          detail: `${activeWar.phase.name} · ${activeWar.sessionsLeft}거래일 남음`,
        }
      : null;
  const crisisHandled = Boolean(
    crisis &&
      management?.crisisDecisions.some(
        (decision) => decision.crisisKey === crisis.key,
      ),
  );

  useEffect(() => {
    if (!management || currentSession <= management.lastAdvancedSession) return;
    const result = advancePlayerCompanyManagement(management, context);
    if (result.success) {
      updateManagement(result.management, result.reputationDelta);
    }
  }, [management, currentSession, context, updateManagement]);

  useEffect(() => {
    if (company.status !== "listed" || !company.ipoListingStockId) return;
    const pending = management?.history.filter(
      (entry) =>
        playerCompanyStrategyEventType(entry) &&
        !registeredMarketEvents.current.has(entry.id),
    );
    if (!pending?.length) return;
    void (async () => {
      // 서버가 저장된 회사 경영 기록과 대조하므로 최신 지갑을 먼저 올린다.
      if (!(await saveCloud())) return;
      for (const entry of pending) {
        const recorded = await recordPlayerCompanyStrategyEvent({
          stockId: company.ipoListingStockId!,
          event: entry,
        });
        if (recorded) registeredMarketEvents.current.add(entry.id);
      }
    })();
  }, [
    company.status,
    company.ipoListingStockId,
    management?.history,
    saveCloud,
  ]);

  if (!management) return null;

  const creditScore = playerCompanyCreditScore(management, context);
  const rating = playerCompanyCreditRating(creditScore);
  const coupon = playerCompanyBondCouponRate(rating, benchmarkRate);
  const debtRatio =
    management.debt /
    Math.max(1, company.cumulativeCapitalBurned + management.treasury);
  const hallScore = playerCompanyHallOfFameScore(management, context);
  const pendingGuidance =
    management.guidance?.status === "pending" ? management.guidance : null;
  const latestGuidance =
    management.guidance?.status !== "pending" ? management.guidance : null;
  const activeContracts = management.supplyContracts.filter(
    (contract) => contract.expiresSession > currentSession,
  );

  const apply = (result: PlayerCompanyManagementResult) => {
    setMessage(result.message);
    if (result.success) {
      updateManagement(result.management, result.reputationDelta);
    }
  };

  return (
    <section className="mb-5 rounded-3xl border border-indigo-400/30 bg-indigo-500/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-indigo-300">CEO 경영실</p>
          <h2 className="mt-1 text-xl font-black">재무·위기·인재 전략</h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            회사 고유 현금과 부채가 분리됩니다. 선택 결과는 신용등급, 다음 분기
            실적, 회사 명성과 주주 신뢰에 이어집니다.
          </p>
        </div>
        <div className="rounded-2xl bg-[var(--background)] px-4 py-2 text-right">
          <p className="text-[10px] text-[var(--muted)]">신용등급</p>
          <p className={`text-xl font-black ${RATING_STYLE[rating]}`}>
            {rating}
          </p>
          <p className="text-[10px] text-[var(--muted)]">{creditScore}/100</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-5">
        <Metric label="회사 현금" value={formatCompactMoney(management.treasury)} />
        <Metric
          label="회사채 부채"
          value={formatCompactMoney(management.debt)}
          detail={`부채비율 ${(debtRatio * 100).toFixed(1)}%`}
        />
        <Metric
          label="가이던스 신뢰"
          value={`${management.guidanceCredibility}%`}
        />
        <Metric label="인재 유지율" value={`${management.talentRetention}%`} />
        <Metric
          label={`${company.sector} 명예 점수`}
          value={hallScore.toLocaleString("ko-KR")}
          detail="업종별 명예의 전당 산정값"
        />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-black">📊 실적 가이던스 발표</p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                목표를 직접 제시하고 24거래일 뒤 실제 실적과 비교합니다.
              </p>
            </div>
            {pendingGuidance && (
              <span className="rounded-lg bg-amber-400/15 px-2 py-1 text-[10px] font-bold text-amber-300">
                D-{Math.max(0, pendingGuidance.resolveSession - currentSession)}
              </span>
            )}
          </div>
          {pendingGuidance ? (
            <div className="mt-3 rounded-xl bg-[var(--surface)] p-3 text-xs">
              매출 성장{" "}
              <b>{pendingGuidance.revenueGrowthTarget.toFixed(1)}%</b> ·
              영업이익률{" "}
              <b>{pendingGuidance.operatingMarginTarget.toFixed(1)}%</b>
            </div>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <label className="text-[11px] text-[var(--muted)]">
                  매출 성장 목표 %
                  <input
                    type="number"
                    min={-20}
                    max={100}
                    value={revenueTarget}
                    onChange={(event) => setRevenueTarget(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]"
                  />
                </label>
                <label className="text-[11px] text-[var(--muted)]">
                  영업이익률 목표 %
                  <input
                    type="number"
                    min={-30}
                    max={80}
                    value={marginTarget}
                    onChange={(event) => setMarginTarget(event.target.value)}
                    className="mt-1 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm text-[var(--foreground)]"
                  />
                </label>
              </div>
              <button
                type="button"
                onClick={() =>
                  apply(
                    announcePlayerCompanyGuidance(
                      management,
                      context,
                      Number(revenueTarget),
                      Number(marginTarget),
                    ),
                  )
                }
                className="mt-2 w-full rounded-xl bg-indigo-500 py-2 text-xs font-black text-white"
              >
                시장에 가이던스 발표
              </button>
            </>
          )}
          {latestGuidance && (
            <p
              className={`mt-2 rounded-xl p-2 text-[11px] ${
                latestGuidance.status === "met"
                  ? "bg-emerald-400/10 text-emerald-300"
                  : "bg-rose-400/10 text-rose-300"
              }`}
            >
              최근 결과 · 실제 매출 성장{" "}
              {latestGuidance.actualRevenueGrowth?.toFixed(1)}%, 영업이익률{" "}
              {latestGuidance.actualOperatingMargin?.toFixed(1)}% ·{" "}
              {latestGuidance.status === "met" ? "달성" : "미달"}
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <p className="text-sm font-black">🚨 위기 대응 이사회</p>
          {crisis ? (
            <>
              <p className="mt-1 text-xs font-bold text-amber-300">
                {crisis.label} · {crisis.detail}
              </p>
              {crisisHandled ? (
                <p className="mt-3 rounded-xl bg-emerald-400/10 p-3 text-xs text-emerald-300">
                  이번 위기의 대응안이 확정되었습니다.
                </p>
              ) : (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {CRISIS_STRATEGIES.map((strategy) => (
                    <button
                      key={strategy.id}
                      type="button"
                      title={strategy.description}
                      onClick={() =>
                        apply(
                          choosePlayerCompanyCrisisStrategy(
                            management,
                            context,
                            crisis.key,
                            crisis.label,
                            strategy.id,
                          ),
                        )
                      }
                      className="rounded-xl border border-[var(--border)] p-2 text-left text-xs hover:border-amber-400/50"
                    >
                      <b>
                        {strategy.icon} {crisisStrategyLabel(strategy.id)}
                      </b>
                      <span className="mt-1 block text-[10px] leading-relaxed text-[var(--muted)]">
                        {strategy.description}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="mt-3 rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
              현재 금융위기·전쟁 국면이 아닙니다. 위기 발생 시 이곳에서 1회
              대응안을 선택합니다.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-black">🏦 회사채·신용등급</p>
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                기준금리 {benchmarkRate.toFixed(1)}% ({RATE_LABEL[rateLevel]}) ·
                현재 예상 조달금리 연 {(coupon * 100).toFixed(2)}%
              </p>
            </div>
            <span className={`text-lg font-black ${RATING_STYLE[rating]}`}>
              {rating}
            </span>
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {[0.05, 0.1, 0.2].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() =>
                  apply(
                    issuePlayerCompanyBond(
                      management,
                      context,
                      rate,
                      benchmarkRate,
                    ),
                  )
                }
                className="rounded-xl border border-[var(--border)] py-2 text-xs font-bold hover:border-cyan-400/50"
              >
                자본의 {rate * 100}%
              </button>
            ))}
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">
            발행 즉시 회사 현금이 늘고 96거래일 뒤 원금과 이자를 상환합니다.
            미상환 시 신용등급과 회사 명성이 크게 하락합니다.
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <p className="text-sm font-black">💵 특별배당·정기배당 정책</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
            아래 자본 관리의 1회 배당은 <b>특별배당</b>입니다. 정기배당은
            24거래일마다 설정 비율로 자동 예약하며, 현금 부족으로 실패하면
            주주 신뢰가 하락합니다.
          </p>
          <div className="mt-3 flex gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs">
              <input
                type="number"
                min={0.01}
                max={10}
                step={0.01}
                value={regularRate}
                onChange={(event) => setRegularRate(event.target.value)}
                className="min-w-0 flex-1 bg-transparent outline-none"
              />
              %
            </label>
            <button
              type="button"
              onClick={() =>
                apply(
                  setPlayerCompanyRegularDividendPolicy(
                    management,
                    context,
                    true,
                    Number(regularRate) / 100,
                  ),
                )
              }
              className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-black text-white"
            >
              정기배당 켜기
            </button>
            {management.regularDividendEnabled && (
              <button
                type="button"
                onClick={() =>
                  apply(
                    setPlayerCompanyRegularDividendPolicy(
                      management,
                      context,
                      false,
                      0,
                    ),
                  )
                }
                className="rounded-xl border border-rose-400/40 px-3 py-2 text-xs font-bold text-rose-300"
              >
                중단
              </button>
            )}
          </div>
          <p className="mt-2 text-[10px] text-[var(--muted)]">
            {management.regularDividendEnabled
              ? `다음 자동 예약까지 ${Math.max(0, management.nextRegularDividendSession - currentSession)}거래일 · 총자산의 ${(management.regularDividendRate * 100).toFixed(2)}%`
              : "현재 정기배당 없음 · 특별배당은 아래에서 필요할 때 1회 실행"}
          </p>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <p className="text-sm font-black">🔗 장기 공급망 계약</p>
          <p className="mt-1 text-[11px] text-[var(--muted)]">
            회복력 {management.supplyResilience}/100 · 계약 보증금은 회사 자본의
            3%이며 96거래일 동안 유지됩니다.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            {SUPPLY_TYPES.map((type) => {
              const active = activeContracts.find(
                (contract) => contract.type === type,
              );
              return (
                <button
                  key={type}
                  type="button"
                  disabled={Boolean(active)}
                  onClick={() =>
                    apply(
                      signPlayerCompanySupplyContract(
                        management,
                        context,
                        type,
                      ),
                    )
                  }
                  className="rounded-xl border border-[var(--border)] p-2 text-xs font-bold disabled:border-emerald-400/30 disabled:text-emerald-300"
                >
                  {supplyTypeLabel(type)}
                  <span className="block text-[10px] font-normal text-[var(--muted)]">
                    {active
                      ? `${active.expiresSession - currentSession}거래일 남음`
                      : "계약 체결"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <p className="text-sm font-black">🧑‍💻 임직원 스톡옵션·인재 이탈</p>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
            옵션 풀을 늘리면 유지율과 사기가 개선되지만 향후 주식 희석 부담이
            커집니다. 낮은 사기와 옵션 보상 부족은 분기마다 이탈을 만듭니다.
          </p>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Metric label="사기" value={`${management.employeeMorale}%`} />
            <Metric
              label="누적 이탈"
              value={`${management.cumulativeTalentDepartures}명`}
            />
            <Metric
              label="옵션 풀"
              value={`${(management.stockOptionPoolRate * 100).toFixed(1)}%`}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <label className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-[var(--border)] px-3 py-2 text-xs">
              총주식의
              <input
                type="number"
                min={0}
                max={10}
                step={0.5}
                value={optionRate}
                onChange={(event) => setOptionRate(event.target.value)}
                className="min-w-0 flex-1 bg-transparent text-right outline-none"
              />
              %
            </label>
            <button
              type="button"
              onClick={() =>
                apply(
                  setPlayerCompanyStockOptionPolicy(
                    management,
                    context,
                    Number(optionRate) / 100,
                  ),
                )
              }
              className="rounded-xl bg-violet-500 px-3 py-2 text-xs font-black text-white"
            >
              정책 적용
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-400/20 bg-amber-400/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black">🏆 업종별 기업 명예의 전당</p>
            <p className="mt-1 text-[11px] text-[var(--muted)]">
              {company.sector} 업종 · 재무 건전성, 가이던스 신뢰, 장기주주 정책,
              공급망, 인재 유지율을 합산합니다.
            </p>
          </div>
          <span className="rounded-xl bg-amber-400/15 px-3 py-2 text-sm font-black text-amber-300">
            {hallScore >= 1400
              ? "전설 기업"
              : hallScore >= 1100
                ? "명예의 전당"
                : hallScore >= 850
                  ? "후보 기업"
                  : "성장 기업"}{" "}
            · {hallScore.toLocaleString("ko-KR")}점
          </span>
        </div>
      </div>

      {management.history.length > 0 && (
        <details className="mt-4 rounded-2xl bg-[var(--background)] p-4">
          <summary className="cursor-pointer text-xs font-bold">
            최근 회사 경영 기록 {management.history.length}건
          </summary>
          <div className="mt-3 space-y-2">
            {management.history.slice(0, 8).map((entry) => (
              <div
                key={entry.id}
                className="flex flex-wrap justify-between gap-2 border-b border-[var(--border)] pb-2 text-xs last:border-0"
              >
                <span>
                  <b>{entry.title}</b>
                  <span className="ml-2 text-[var(--muted)]">
                    {entry.description}
                  </span>
                </span>
                <span className="text-[10px] text-[var(--muted)]">
                  {entry.session.toLocaleString()}회차
                </span>
              </div>
            ))}
          </div>
        </details>
      )}
      {message && (
        <p className="mt-3 rounded-xl bg-indigo-400/10 p-3 text-xs text-indigo-200">
          {message}
        </p>
      )}
    </section>
  );
}

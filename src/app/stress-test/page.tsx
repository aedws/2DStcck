"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import { STRESS_TEST_TUTORIAL_STEPS } from "@/data/featureTutorials";
import { useSettingsStore } from "@/store/settingsStore";
import { formatPrice } from "@/lib/market/engine";
import {
  MARKET_CRISIS_THEMES,
  type MarketCrisisThemeId,
} from "@/lib/market/marketCrises";
import {
  PORTFOLIO_STRATEGIES,
  type PortfolioStrategyId,
} from "@/lib/market/portfolioStrategies";
import {
  runCrisisStressTest,
  type StressTestResult,
} from "@/lib/market/stressTest";

const GRADE_STYLE = {
  S: "border-amber-300 bg-amber-400/10 text-amber-300",
  A: "border-emerald-300 bg-emerald-400/10 text-emerald-300",
  B: "border-sky-300 bg-sky-400/10 text-sky-300",
  C: "border-orange-300 bg-orange-400/10 text-orange-300",
  F: "border-red-400 bg-red-500/10 text-red-300",
} as const;

function percent(value: number): string {
  return `${value >= 0 ? "+" : ""}${(value * 100).toFixed(1)}%`;
}

export default function StressTestPage() {
  const [strategyId, setStrategyId] = useState<PortfolioStrategyId>("index_core");
  const [themeId, setThemeId] = useState<MarketCrisisThemeId>("credit-crunch");
  const [result, setResult] = useState<StressTestResult | null>(null);
  const [mounted, setMounted] = useState(false);
  const onboarded = useSettingsStore((state) => state.onboarded);
  const tutorialSeen = useSettingsStore((state) => state.stressTestTutorialSeen);
  const setTutorialSeen = useSettingsStore(
    (state) => state.setStressTestTutorialSeen,
  );
  useEffect(() => setMounted(true), []);
  const strategy = PORTFOLIO_STRATEGIES.find((item) => item.id === strategyId)!;
  const theme = MARKET_CRISIS_THEMES.find((item) => item.id === themeId)!;

  return (
    <div className="mx-auto max-w-5xl pb-20">
      {mounted && onboarded && !tutorialSeen && (
        <FeatureTutorialModal
          steps={STRESS_TEST_TUTORIAL_STEPS}
          onFinish={() => setTutorialSeen(true)}
        />
      )}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-red-300">ISOLATED CRISIS SESSION</p>
          <h1 className="mt-1 text-2xl font-black">🚨 대형 위기 스트레스 테스트</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">
            20거래일 대형 위기를 조기 체험하고 선택 전략의 생존력을 확인합니다.
          </p>
        </div>
        <Link
          href="/strategy"
          className="rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold hover:border-[var(--accent)]"
        >
          ← 포트폴리오 전략으로
        </Link>
      </div>

      <div className="mt-5 rounded-2xl border border-emerald-400/30 bg-emerald-400/[0.06] p-4 text-sm">
        <p className="font-bold text-emerald-300">🔒 메인 세션과 완전히 분리됨</p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
          가상 자기자본으로만 계산합니다. 메인 계좌의 현금·보유 종목·미수·시즌·랭킹·클라우드 저장은 읽거나 변경하지 않습니다.
        </p>
      </div>

      {!result ? (
        <section className="mt-6 space-y-6">
          <div>
            <h2 className="text-lg font-bold">1. 테스트 포트폴리오</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PORTFOLIO_STRATEGIES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setStrategyId(item.id)}
                  className={`rounded-2xl border p-4 text-left ${strategyId === item.id ? "border-red-300 bg-red-400/[0.06] ring-1 ring-red-300" : "border-[var(--border)] bg-[var(--surface)]"}`}
                >
                  <p className="font-bold">{item.emoji} {item.name}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">위험 {item.risk} · 총노출 ×{item.grossExposure.toFixed(2)}</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{item.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div>
            <h2 className="text-lg font-bold">2. 위기 시나리오</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {MARKET_CRISIS_THEMES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setThemeId(item.id)}
                  className={`rounded-2xl border p-4 text-left ${themeId === item.id ? "border-red-300 bg-red-400/[0.06] ring-1 ring-red-300" : "border-[var(--border)] bg-[var(--surface)]"}`}
                >
                  <p className="font-bold">{item.emoji} {item.name}</p>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">{item.summary}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-3xl border border-red-400/30 bg-gradient-to-br from-red-500/10 to-transparent p-5">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-4xl">{strategy.emoji}</span>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{strategy.name} × {theme.name}</p>
                <p className="mt-1 text-xs text-[var(--muted)]">가상 시작 자기자본 {formatPrice(10_000_000)} · 총 20거래일</p>
              </div>
              <button
                type="button"
                onClick={() => setResult(runCrisisStressTest(strategyId, themeId))}
                className="min-h-12 rounded-xl bg-red-500 px-5 text-sm font-black text-white hover:bg-red-400"
              >
                독립 위기 세션 시작
              </button>
            </div>
          </div>
        </section>
      ) : (
        <StressResult
          result={result}
          onReset={() => setResult(null)}
        />
      )}
    </div>
  );
}

function StressResult({
  result,
  onReset,
}: {
  result: StressTestResult;
  onReset: () => void;
}) {
  const strategy = PORTFOLIO_STRATEGIES.find((item) => item.id === result.strategyId)!;
  const theme = MARKET_CRISIS_THEMES.find((item) => item.id === result.themeId)!;
  return (
    <section className="mt-6">
      <div className={`rounded-3xl border p-6 ${GRADE_STYLE[result.grade]}`}>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-black/20 text-4xl font-black">
            {result.grade}
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold tracking-[0.2em]">STRESS TEST COMPLETE</p>
            <h2 className="mt-1 text-2xl font-black">{strategy.emoji} {strategy.name} · {theme.emoji} {theme.name}</h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">{result.verdict}</p>
          </div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <ResultMetric label="최종 자기자본" value={formatPrice(result.endingEquity)} tone={result.totalReturn} />
        <ResultMetric label="총수익률" value={percent(result.totalReturn)} tone={result.totalReturn} />
        <ResultMetric label="최대 낙폭" value={`${(result.maximumDrawdown * 100).toFixed(1)}%`} tone={-result.maximumDrawdown} />
        <ResultMetric label="파산 판정" value={result.bankrupt ? `${result.bankruptAtSession}일차` : "생존"} tone={result.bankrupt ? -1 : 1} />
      </div>

      <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <h3 className="font-bold">가상 자기자본 경로</h3>
        <EquityChart result={result} />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        {result.phases.map((phase) => (
          <div key={phase.phaseId} className="rounded-2xl bg-[var(--surface)] p-4">
            <p className="text-xs font-bold">{phase.phaseEmoji} {phase.phaseName}</p>
            <p className={`mt-2 text-lg font-black ${phase.returnRate >= 0 ? "text-[var(--up)]" : "text-[var(--down)]"}`}>
              {percent(phase.returnRate)}
            </p>
            <p className="mt-1 text-[10px] text-[var(--muted)]">{formatPrice(phase.startEquity)} → {formatPrice(phase.endEquity)}</p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <Link href="/strategy" className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-semibold">
          전략 통계 보기
        </Link>
        <button type="button" onClick={onReset} className="rounded-xl bg-[var(--accent)] px-4 py-3 text-sm font-bold text-white">
          다른 독립 세션 시작
        </button>
      </div>
    </section>
  );
}

function EquityChart({ result }: { result: StressTestResult }) {
  const width = 760;
  const height = 220;
  const padding = 20;
  const maximum = Math.max(result.startingEquity, ...result.points.map((point) => point.equity));
  const minimum = Math.min(0, ...result.points.map((point) => point.equity));
  const range = Math.max(1, maximum - minimum);
  const path = result.points.map((point, index) => {
    const x = padding + index / Math.max(1, result.points.length - 1) * (width - padding * 2);
    const y = padding + (maximum - point.equity) / range * (height - padding * 2);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  const startY = padding + (maximum - result.startingEquity) / range * (height - padding * 2);

  return (
    <div className="mt-3 overflow-hidden rounded-xl bg-[var(--background)]">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-56 w-full" role="img" aria-label="스트레스 테스트 가상 자기자본 추이">
        <line x1={padding} y1={startY} x2={width - padding} y2={startY} stroke="currentColor" strokeOpacity="0.18" strokeDasharray="5 5" />
        <path d={path} fill="none" stroke={result.bankrupt ? "#ef4444" : "#22d3ee"} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {result.points.map((point, index) => {
          if (index === 0 || result.points[index - 1]?.phaseId === point.phaseId) return null;
          const x = padding + index / Math.max(1, result.points.length - 1) * (width - padding * 2);
          return <line key={`${point.phaseId}-${index}`} x1={x} y1={padding} x2={x} y2={height - padding} stroke="currentColor" strokeOpacity="0.12" />;
        })}
      </svg>
    </div>
  );
}

function ResultMetric({ label, value, tone }: { label: string; value: string; tone: number }) {
  return (
    <div className="rounded-2xl bg-[var(--surface)] p-4">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className={`mt-1 text-lg font-black ${tone > 0 ? "text-[var(--up)]" : tone < 0 ? "text-[var(--down)]" : ""}`}>{value}</p>
    </div>
  );
}

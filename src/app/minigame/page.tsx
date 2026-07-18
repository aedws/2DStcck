"use client";

import { useCallback, useState } from "react";
import { SwipeBrickBreaker } from "@/components/minigame/SwipeBrickBreaker";
import { formatPrice } from "@/lib/market/engine";
import {
  computeBrickBreakerCash,
  COIN_PER_ROUND,
  COIN_PER_BRICK,
  MINIGAME_CASH_DIVISOR,
} from "@/lib/market/minigame";
import { useMarketStore } from "@/store/marketStore";

type Phase = "menu" | "playing" | "result";

interface Result {
  rounds: number;
  bricks: number;
  score: number;
  reward: number;
}

export default function MinigamePage() {
  const cash = useMarketStore((s) => s.cash);
  const awardMinigameCash = useMarketStore((s) => s.awardMinigameCash);
  const saveCloud = useMarketStore((s) => s.saveCloud);

  const [phase, setPhase] = useState<Phase>("menu");
  const [result, setResult] = useState<Result | null>(null);
  const [earnedTotal, setEarnedTotal] = useState(0);

  const handleGameOver = useCallback(
    ({ rounds, bricks, score }: { rounds: number; bricks: number; score: number }) => {
      const reward = computeBrickBreakerCash(score);
      awardMinigameCash(reward, "벽돌깨기");
      void saveCloud();
      setEarnedTotal((t) => t + reward);
      setResult({ rounds, bricks, score, reward });
      setPhase("result");
    },
    [awardMinigameCash, saveCloud],
  );

  return (
    <div className="mx-auto max-w-md pb-20">
      <div className="mb-4">
        <h1 className="text-2xl font-bold">🎮 미니게임</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          게임으로 <b>노동 소득</b>을 법니다. 횟수 제한 없이 실력만큼 벌 수 있고,
          이 소득은 시즌·랭킹(투자 실력)에는 반영되지 않아요 — 번 돈은 투자
          ‘연료’로 쓰세요.
        </p>
        <p className="mt-2 text-xs text-[var(--muted)]">
          보유 현금 {formatPrice(cash)}
          {earnedTotal > 0 && (
            <span className="ml-2 text-[var(--up)]">
              · 이번 방문에 +{formatPrice(earnedTotal)}
            </span>
          )}
        </p>
      </div>

      {phase === "menu" && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => {
              setResult(null);
              setPhase("playing");
            }}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">🧱 스와이프 벽돌깨기</span>
              <span className="text-[var(--accent)]">▶</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              스와이프로 조준해 공을 발사, 벽돌을 깨서 코인을 모으고 그 코인으로
              N(단일)·S(광역)·SS(십자) 공을 사서 화력을 키우세요. 벽돌당{" "}
              {COIN_PER_BRICK.toLocaleString()}·라운드당{" "}
              {COIN_PER_ROUND.toLocaleString()} 점수 → 게임오버 시 최종 점수의 1/
              {MINIGAME_CASH_DIVISOR}이 현금으로.
            </p>
          </button>

          <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
            더 많은 미니게임이 곧 추가됩니다.
          </div>
        </div>
      )}

      {phase === "playing" && (
        <SwipeBrickBreaker running onGameOver={handleGameOver} />
      )}

      {phase === "result" && result && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <p className="text-4xl">🧱</p>
          <h2 className="mt-2 text-lg font-bold">게임 종료!</h2>
          <div className="mt-3 flex justify-center gap-5 text-sm">
            <div>
              <p className="text-[var(--muted)]">라운드</p>
              <p className="text-xl font-bold tabular-nums">{result.rounds}</p>
            </div>
            <div>
              <p className="text-[var(--muted)]">깬 벽돌</p>
              <p className="text-xl font-bold tabular-nums">{result.bricks}</p>
            </div>
            <div>
              <p className="text-[var(--muted)]">점수</p>
              <p className="text-xl font-bold tabular-nums">
                {result.score.toLocaleString()}
              </p>
            </div>
          </div>
          <p className="mt-4 text-2xl font-bold text-[var(--up)]">
            +{formatPrice(result.reward)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            최종 점수 {result.score.toLocaleString()}의 1/{MINIGAME_CASH_DIVISOR} ·
            노동 소득으로 지급됨
          </p>
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              onClick={() => setPhase("menu")}
              className="rounded-xl border border-[var(--border)] px-4 py-3 text-sm font-medium text-[var(--muted)]"
            >
              메뉴
            </button>
            <button
              type="button"
              onClick={() => {
                setResult(null);
                setPhase("playing");
              }}
              className="flex-1 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white transition hover:opacity-90"
            >
              다시 하기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

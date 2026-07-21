"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SwipeBrickBreaker } from "@/components/minigame/SwipeBrickBreaker";
import { Game2048 } from "@/components/minigame/Game2048";
import { Tetris } from "@/components/minigame/Tetris";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import { MINIGAME_TUTORIAL_STEPS } from "@/data/featureTutorials";
import { formatPrice } from "@/lib/market/engine";
import {
  computeBrickBreakerCash,
  compute2048Cash,
  computeTetrisCash,
  COIN_PER_ROUND,
  COIN_PER_BRICK,
} from "@/lib/market/minigame";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";

type GameId = "brick" | "g2048" | "tetris";
type Phase = "menu" | "playing" | "result";

interface ResultStat {
  name: string;
  value: string;
}
interface Result {
  emoji: string;
  stats: ResultStat[];
  reward: number;
}

type ExitMode = "settle" | "back";

const GAME_LABEL: Record<GameId, string> = {
  brick: "코인 브레이커",
  g2048: "골드 2048",
  tetris: "골드 테트리스",
};

function brickResult({
  rounds,
  bricks,
  score,
}: {
  rounds: number;
  bricks: number;
  score: number;
}): Result {
  return {
    emoji: "🪙",
    stats: [
      { name: "라운드", value: String(rounds) },
      { name: "깬 벽돌", value: String(bricks) },
      { name: "점수", value: score.toLocaleString() },
    ],
    reward: computeBrickBreakerCash(score),
  };
}

function game2048Result({ score, best }: { score: number; best: number }): Result {
  return {
    emoji: "💰",
    stats: [
      { name: "점수", value: score.toLocaleString() },
      { name: "최고 타일", value: best.toLocaleString() },
    ],
    reward: compute2048Cash(score),
  };
}

function tetrisResult({ score, lines }: { score: number; lines: number }): Result {
  return {
    emoji: "🧊",
    stats: [
      { name: "점수", value: score.toLocaleString() },
      { name: "지운 줄", value: String(lines) },
    ],
    reward: computeTetrisCash(score),
  };
}

function emptyResult(game: GameId): Result {
  if (game === "g2048") return game2048Result({ score: 0, best: 2 });
  if (game === "tetris") return tetrisResult({ score: 0, lines: 0 });
  return brickResult({ rounds: 1, bricks: 0, score: 0 });
}

export default function MinigamePage() {
  const cash = useMarketStore((s) => s.cash);
  const awardMinigameCash = useMarketStore((s) => s.awardMinigameCash);
  const saveCloud = useMarketStore((s) => s.saveCloud);

  const onboarded = useSettingsStore((s) => s.onboarded);
  const tutorialSeen = useSettingsStore((s) => s.minigameTutorialSeen);
  const setTutorialSeen = useSettingsStore((s) => s.setMinigameTutorialSeen);
  const [mounted, setMounted] = useState(false);
  const [manualTutorial, setManualTutorial] = useState(false);
  useEffect(() => setMounted(true), []);

  const [phase, setPhase] = useState<Phase>("menu");
  const [game, setGame] = useState<GameId>("brick");
  const [result, setResult] = useState<Result | null>(null);
  const [liveResult, setLiveResult] = useState<Result>(() => emptyResult("brick"));
  const [exitRequest, setExitRequest] = useState<{
    mode: ExitMode;
    result: Result;
  } | null>(null);
  const [earnedTotal, setEarnedTotal] = useState(0);
  const liveResultRef = useRef(liveResult);
  const settledRef = useRef(false);
  const allowNavigationRef = useRef(false);
  const guardActiveRef = useRef(false);

  useEffect(() => {
    liveResultRef.current = liveResult;
  }, [liveResult]);

  const showTutorial = manualTutorial || (mounted && onboarded && !tutorialSeen);

  const award = useCallback(
    (reward: number, label: string) => {
      awardMinigameCash(reward, label);
      void saveCloud();
      setEarnedTotal((t) => t + reward);
    },
    [awardMinigameCash, saveCloud],
  );

  const releaseBackGuard = useCallback(() => {
    if (!guardActiveRef.current) return;
    guardActiveRef.current = false;
    allowNavigationRef.current = true;
    window.history.back();
    window.setTimeout(() => {
      allowNavigationRef.current = false;
    }, 0);
  }, []);

  const finishGame = useCallback(
    (finished: Result, releaseGuard = true) => {
      if (settledRef.current) return;
      settledRef.current = true;
      award(finished.reward, GAME_LABEL[game]);
      setResult(finished);
      setExitRequest(null);
      setPhase("result");
      if (releaseGuard) releaseBackGuard();
    },
    [award, game, releaseBackGuard],
  );

  const onBrickOver = useCallback(
    ({ rounds, bricks, score }: { rounds: number; bricks: number; score: number }) => {
      finishGame(brickResult({ rounds, bricks, score }));
    },
    [finishGame],
  );

  const on2048Over = useCallback(
    ({ score, best }: { score: number; best: number }) => {
      finishGame(game2048Result({ score, best }));
    },
    [finishGame],
  );

  const onTetrisOver = useCallback(
    ({ score, lines }: { score: number; lines: number }) => {
      finishGame(tetrisResult({ score, lines }));
    },
    [finishGame],
  );

  const onBrickProgress = useCallback(
    (progress: { rounds: number; bricks: number; score: number }) =>
      setLiveResult(brickResult(progress)),
    [],
  );
  const on2048Progress = useCallback(
    (progress: { score: number; best: number }) =>
      setLiveResult(game2048Result(progress)),
    [],
  );
  const onTetrisProgress = useCallback(
    (progress: { score: number; lines: number }) =>
      setLiveResult(tetrisResult(progress)),
    [],
  );

  useEffect(() => {
    if (phase !== "playing") return;

    const guardState = { minigameGuard: Date.now() };
    window.history.pushState(guardState, "", window.location.href);
    guardActiveRef.current = true;

    const onPopState = () => {
      if (allowNavigationRef.current) return;
      window.history.pushState(guardState, "", window.location.href);
      guardActiveRef.current = true;
      setExitRequest({ mode: "back", result: liveResultRef.current });
    };
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [phase]);

  function play(id: GameId) {
    setGame(id);
    setResult(null);
    const initial = emptyResult(id);
    liveResultRef.current = initial;
    setLiveResult(initial);
    setExitRequest(null);
    settledRef.current = false;
    setPhase("playing");
  }

  function confirmExit() {
    if (!exitRequest) return;
    const { mode, result: exitResult } = exitRequest;
    finishGame(exitResult, mode !== "back");
    if (mode === "back") {
      allowNavigationRef.current = true;
      guardActiveRef.current = false;
      window.history.go(-2);
    }
  }

  return (
    <div className="mx-auto max-w-md pb-20">
      {showTutorial && (
        <FeatureTutorialModal
          steps={MINIGAME_TUTORIAL_STEPS}
          onFinish={() => {
            setTutorialSeen(true);
            setManualTutorial(false);
          }}
        />
      )}
      {exitRequest && (
        <div
          className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="minigame-exit-title"
        >
          <div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 shadow-2xl">
            <h2 id="minigame-exit-title" className="text-lg font-bold">
              지금 정산하고 나갈까요?
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              현재까지 번 금액을 지급하고 진행 중인 게임을 종료합니다.
            </p>
            <div className="mt-4 rounded-2xl bg-[var(--background)] p-4 text-center">
              <p className="text-xs text-[var(--muted)]">예상 정산액</p>
              <p className="mt-1 text-2xl font-bold text-[var(--up)]">
                +{formatPrice(exitRequest.result.reward)}
              </p>
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setExitRequest(null)}
                className="flex-1 rounded-xl border border-[var(--border)] py-3 text-sm font-semibold text-[var(--muted)]"
              >
                계속하기
              </button>
              <button
                type="button"
                onClick={confirmExit}
                className="flex-1 rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white"
              >
                정산 후 나가기
              </button>
            </div>
          </div>
        </div>
      )}
      <div className="mb-4">
        <div className="flex items-start justify-between gap-2">
          <h1 className="text-2xl font-bold">⛏️ 현금 채굴</h1>
          <button
            type="button"
            onClick={() => setManualTutorial(true)}
            className="shrink-0 rounded-lg border border-[var(--border)] px-2 py-1 text-[11px] text-[var(--muted)] hover:text-[var(--foreground)]"
          >
            ⓘ 안내
          </button>
        </div>
        <p className="mt-1 text-sm text-[var(--muted)]">
          게임으로 <b className="text-[var(--foreground)]">실제 현금($)</b>을 법니다.
          횟수 제한 없이 실력만큼 벌 수 있어요. 단, 이 <b>노동 소득</b>은
          시즌·랭킹(투자 실력)에는 반영되지 않으니 번 돈은 투자 ‘연료’로 쓰세요.
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
            onClick={() => play("brick")}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">🪙 코인 브레이커</span>
              <span className="text-[var(--accent)]">▶</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              스와이프로 조준해 공을 발사, 벽돌을 깨서 코인을 모으고 N(단일)·S(광역)·
              SS(십자) 공을 사서 화력을 키우세요. 벽돌당{" "}
              {COIN_PER_BRICK.toLocaleString()}·라운드당{" "}
              {COIN_PER_ROUND.toLocaleString()} 점수 → 최종 점수에 비례한 현금.
            </p>
          </button>

          <button
            type="button"
            onClick={() => play("g2048")}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">💰 골드 2048</span>
              <span className="text-[var(--accent)]">▶</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              스와이프·방향키로 타일을 밀어 같은 수를 합치세요. 큰 수를 만들수록
              점수가 오르고, 게임오버 시 점수에 비례한 현금을 받습니다.
            </p>
          </button>

          <button
            type="button"
            onClick={() => play("tetris")}
            className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-left transition hover:border-[var(--accent)]"
          >
            <div className="flex items-center justify-between">
              <span className="text-lg font-bold">🧊 골드 테트리스</span>
              <span className="text-[var(--accent)]">▶</span>
            </div>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              떨어지는 조각을 옮기고 회전해 가로줄을 꽉 채워 지우세요. 한 번에
              여러 줄을 지울수록 점수가 크고, 그만큼 더 많은 현금을 캡니다.
            </p>
          </button>

          <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
            더 많은 채굴 게임이 곧 추가됩니다.
          </div>
        </div>
      )}

      {phase === "playing" && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2">
          <p className="text-xs text-[var(--muted)]">
            지금 정산하면{" "}
            <b className="text-[var(--up)]">+{formatPrice(liveResult.reward)}</b>
          </p>
          <button
            type="button"
            onClick={() =>
              setExitRequest({ mode: "settle", result: liveResultRef.current })
            }
            className="shrink-0 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--accent)]"
          >
            정산(나가기)
          </button>
        </div>
      )}

      {phase === "playing" && game === "brick" && (
        <SwipeBrickBreaker
          running
          paused={Boolean(exitRequest)}
          onProgress={onBrickProgress}
          onGameOver={onBrickOver}
        />
      )}
      {phase === "playing" && game === "g2048" && (
        <Game2048
          paused={Boolean(exitRequest)}
          onProgress={on2048Progress}
          onGameOver={on2048Over}
        />
      )}
      {phase === "playing" && game === "tetris" && (
        <Tetris
          paused={Boolean(exitRequest)}
          onProgress={onTetrisProgress}
          onGameOver={onTetrisOver}
        />
      )}

      {phase === "result" && result && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 text-center">
          <p className="text-4xl">{result.emoji}</p>
          <h2 className="mt-2 text-lg font-bold">게임 종료!</h2>
          <div className="mt-3 flex justify-center gap-5 text-sm">
            {result.stats.map((st) => (
              <div key={st.name}>
                <p className="text-[var(--muted)]">{st.name}</p>
                <p className="text-xl font-bold tabular-nums">{st.value}</p>
              </div>
            ))}
          </div>
          <p className="mt-4 text-2xl font-bold text-[var(--up)]">
            +{formatPrice(result.reward)}
          </p>
          <p className="mt-1 text-xs text-[var(--muted)]">노동 소득으로 지급됨</p>
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
              onClick={() => play(game)}
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

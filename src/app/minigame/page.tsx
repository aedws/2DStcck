"use client";

import { useCallback, useEffect, useState } from "react";
import { SwipeBrickBreaker } from "@/components/minigame/SwipeBrickBreaker";
import { Game2048 } from "@/components/minigame/Game2048";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import { MINIGAME_TUTORIAL_STEPS } from "@/data/featureTutorials";
import { formatPrice } from "@/lib/market/engine";
import {
  computeBrickBreakerCash,
  compute2048Cash,
  COIN_PER_ROUND,
  COIN_PER_BRICK,
} from "@/lib/market/minigame";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";

type GameId = "brick" | "g2048";
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
  const [earnedTotal, setEarnedTotal] = useState(0);

  const showTutorial = manualTutorial || (mounted && onboarded && !tutorialSeen);

  const award = useCallback(
    (reward: number, label: string) => {
      awardMinigameCash(reward, label);
      void saveCloud();
      setEarnedTotal((t) => t + reward);
    },
    [awardMinigameCash, saveCloud],
  );

  const onBrickOver = useCallback(
    ({ rounds, bricks, score }: { rounds: number; bricks: number; score: number }) => {
      const reward = computeBrickBreakerCash(score);
      award(reward, "코인 브레이커");
      setResult({
        emoji: "🪙",
        stats: [
          { name: "라운드", value: String(rounds) },
          { name: "깬 벽돌", value: String(bricks) },
          { name: "점수", value: score.toLocaleString() },
        ],
        reward,
      });
      setPhase("result");
    },
    [award],
  );

  const on2048Over = useCallback(
    ({ score, best }: { score: number; best: number }) => {
      const reward = compute2048Cash(score);
      award(reward, "골드 2048");
      setResult({
        emoji: "💰",
        stats: [
          { name: "점수", value: score.toLocaleString() },
          { name: "최고 타일", value: best.toLocaleString() },
        ],
        reward,
      });
      setPhase("result");
    },
    [award],
  );

  function play(id: GameId) {
    setGame(id);
    setResult(null);
    setPhase("playing");
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

          <div className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
            더 많은 채굴 게임이 곧 추가됩니다.
          </div>
        </div>
      )}

      {phase === "playing" && game === "brick" && (
        <SwipeBrickBreaker running onGameOver={onBrickOver} />
      )}
      {phase === "playing" && game === "g2048" && (
        <Game2048 onGameOver={on2048Over} />
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

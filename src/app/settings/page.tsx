"use client";

import Link from "next/link";
import { useState } from "react";
import { AuthButton } from "@/components/auth/AuthButton";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import {
  MISSION_TUTORIAL_STEPS,
  MISSION_TUTORIAL_VERSION,
  OPTIONS_TUTORIAL_STEPS,
  SEASON_TUTORIAL_STEPS,
  SEASON_TUTORIAL_VERSION,
} from "@/data/featureTutorials";
import { useSettingsStore } from "@/store/settingsStore";

type TutorialKind = "mission" | "options" | "season";

export default function SettingsPage() {
  const [openTutorial, setOpenTutorial] = useState<TutorialKind | null>(null);
  const groupDerivatives = useSettingsStore((state) => state.groupDerivatives);
  const setGroupDerivatives = useSettingsStore(
    (state) => state.setGroupDerivatives,
  );
  const setOnboarded = useSettingsStore((state) => state.setOnboarded);
  const setMissionTutorialSeen = useSettingsStore(
    (state) => state.setMissionTutorialSeen,
  );
  const setMissionTutorialVersion = useSettingsStore(
    (state) => state.setMissionTutorialVersion,
  );
  const setOptionsTutorialSeen = useSettingsStore(
    (state) => state.setOptionsTutorialSeen,
  );
  const setSeasonTutorialSeen = useSettingsStore(
    (state) => state.setSeasonTutorialSeen,
  );
  const setSeasonTutorialVersion = useSettingsStore(
    (state) => state.setSeasonTutorialVersion,
  );
  const soundEnabled = useSettingsStore((state) => state.soundEnabled);
  const setSoundEnabled = useSettingsStore((state) => state.setSoundEnabled);

  const tutorialSteps =
    openTutorial === "mission"
      ? MISSION_TUTORIAL_STEPS
      : openTutorial === "options"
        ? OPTIONS_TUTORIAL_STEPS
        : openTutorial === "season"
          ? SEASON_TUTORIAL_STEPS
          : null;

  function showTutorial(kind: TutorialKind) {
    if (kind === "mission") {
      setMissionTutorialSeen(false);
      setMissionTutorialVersion(0);
    } else if (kind === "options") {
      setOptionsTutorialSeen(false);
    } else {
      setSeasonTutorialSeen(false);
      setSeasonTutorialVersion(0);
    }
    setOpenTutorial(kind);
  }

  function finishTutorial() {
    if (openTutorial === "mission") {
      setMissionTutorialSeen(true);
      setMissionTutorialVersion(MISSION_TUTORIAL_VERSION);
    } else if (openTutorial === "options") {
      setOptionsTutorialSeen(true);
    } else if (openTutorial === "season") {
      setSeasonTutorialSeen(true);
      setSeasonTutorialVersion(SEASON_TUTORIAL_VERSION);
    }
    setOpenTutorial(null);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {tutorialSteps && (
        <FeatureTutorialModal steps={tutorialSteps} onFinish={finishTutorial} />
      )}
      <div>
        <h1 className="text-2xl font-bold">설정</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          이 설정은 현재 브라우저에 저장됩니다.
        </p>
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">계정 관리</h2>
        </div>
        <div className="flex min-h-20 flex-col items-stretch justify-between gap-4 px-4 py-4 sm:flex-row sm:items-center sm:py-3">
          <div className="min-w-0">
            <p className="text-sm font-medium">로그인·로그아웃</p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
              로그인하면 현재 지갑과 진행 기록이 Supabase 계정에 동기화됩니다.
            </p>
          </div>
          <div className="w-full shrink-0 sm:w-auto sm:min-w-44">
            <AuthButton wide />
          </div>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">종목 목록</h2>
        </div>
        <label className="flex min-h-20 cursor-pointer items-center gap-4 px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">
              파생상품을 기초종목 아래에 묶기
            </span>
            <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">
              커버드콜·인버스·곱버스·레버리지를 기초자산 아래 접어 목록을 간결하게 표시합니다.
            </span>
          </span>
          <input
            type="checkbox"
            checked={groupDerivatives}
            onChange={(event) => setGroupDerivatives(event.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
        </label>
        <label className="flex min-h-20 cursor-pointer items-center gap-4 border-t border-[var(--border)] px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-medium">체결 효과음</span>
            <span className="mt-1 block text-xs leading-relaxed text-[var(--muted)]">
              매매·구매 시 짧은 효과음을 재생합니다.
            </span>
          </span>
          <input
            type="checkbox"
            checked={soundEnabled}
            onChange={(event) => setSoundEnabled(event.target.checked)}
            className="h-5 w-5 accent-[var(--accent)]"
          />
        </label>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">튜토리얼 다시 보기</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            필요한 기능의 안내만 따로 초기화할 수 있습니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOnboarded(false)}
          className="relative z-10 flex min-h-16 w-full touch-manipulation items-center justify-between border-b border-[var(--border)] px-4 py-3 text-left"
        >
          <span className="flex items-center gap-3">
            <span className="text-xl" aria-hidden>🎮</span>
            <span>
            <span className="block text-sm font-medium">기본 게임 튜토리얼</span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              매매·뉴스·고정급·순자산 목표를 다시 안내합니다.
            </span>
            </span>
          </span>
          <span className="text-[var(--muted)]">›</span>
        </button>
        <button
          type="button"
          onClick={() => showTutorial("mission")}
          className="relative z-10 flex min-h-16 w-full touch-manipulation items-center justify-between border-b border-[var(--border)] px-4 py-3 text-left"
        >
          <span className="flex items-center gap-3">
            <span className="text-xl" aria-hidden>📋</span>
            <span>
            <span className="block text-sm font-medium">의뢰·관계 튜토리얼</span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              의뢰 진행 방법과 신뢰도·호감도를 다시 안내합니다.
            </span>
            </span>
          </span>
          <span className="text-[var(--muted)]">›</span>
        </button>
        <button
          type="button"
          onClick={() => showTutorial("options")}
          className="relative z-10 flex min-h-16 w-full touch-manipulation items-center justify-between border-b border-[var(--border)] px-4 py-3 text-left"
        >
          <span className="flex items-center gap-3">
            <span className="text-xl" aria-hidden>🎟️</span>
            <span>
            <span className="block text-sm font-medium">옵션 거래 튜토리얼</span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              콜·풋·매수·발행·만기 정산을 다시 안내합니다.
            </span>
            </span>
          </span>
          <span className="text-[var(--muted)]">›</span>
        </button>
        <button
          type="button"
          onClick={() => showTutorial("season")}
          className="relative z-10 flex min-h-16 w-full touch-manipulation items-center justify-between px-4 py-3 text-left"
        >
          <span className="flex items-center gap-3">
            <span className="text-xl" aria-hidden>🏆</span>
            <span>
            <span className="block text-sm font-medium">투자 시즌·티어 튜토리얼</span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              20거래일 진행과 지수 대비 티어 평가를 다시 안내합니다.
            </span>
            </span>
          </span>
          <span className="text-[var(--muted)]">›</span>
        </button>
      </section>

      <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
        <div className="border-b border-[var(--border)] px-4 py-3">
          <h2 className="text-sm font-semibold">도움말</h2>
        </div>
        <Link
          href="/achievements"
          className="flex min-h-16 w-full items-center justify-between border-b border-[var(--border)] px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-medium">🏆 업적</span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              달성한 업적을 확인합니다.
            </span>
          </span>
          <span className="text-[var(--muted)]">›</span>
        </Link>
        <Link
          href="/characters"
          className="flex min-h-16 w-full items-center justify-between border-b border-[var(--border)] px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-medium">🎭 캐릭터 도감</span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              상장 회사 경영진 도감을 봅니다.
            </span>
          </span>
          <span className="text-[var(--muted)]">›</span>
        </Link>
        <Link
          href="/updates"
          className="flex min-h-16 w-full items-center justify-between px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-medium">업데이트 내역</span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              그동안의 변경 사항을 확인합니다.
            </span>
          </span>
          <span className="text-[var(--muted)]">›</span>
        </Link>
      </section>

      <section className="rounded-2xl border border-[var(--border)] px-4 py-4">
        <h2 className="text-sm font-semibold">계정 안내</h2>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          게임 아이디와 6자리 PIN은 이메일 없이 사용합니다. 분실 시 복구할 수
          없으므로 안전한 곳에 따로 기록해 주세요.
        </p>
      </section>
    </div>
  );
}

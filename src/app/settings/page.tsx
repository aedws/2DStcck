"use client";

import Link from "next/link";
import { useSettingsStore } from "@/store/settingsStore";

export default function SettingsPage() {
  const groupDerivatives = useSettingsStore((state) => state.groupDerivatives);
  const setGroupDerivatives = useSettingsStore(
    (state) => state.setGroupDerivatives,
  );
  const setOnboarded = useSettingsStore((state) => state.setOnboarded);
  const soundEnabled = useSettingsStore((state) => state.soundEnabled);
  const setSoundEnabled = useSettingsStore((state) => state.setSoundEnabled);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">설정</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          이 설정은 현재 브라우저에 저장됩니다.
        </p>
      </div>

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
              인버스·곱버스·레버리지를 기본으로 접어 목록을 간결하게 표시합니다.
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
          <h2 className="text-sm font-semibold">도움말</h2>
        </div>
        <button
          onClick={() => setOnboarded(false)}
          className="flex min-h-16 w-full items-center justify-between border-b border-[var(--border)] px-4 py-3 text-left"
        >
          <span>
            <span className="block text-sm font-medium">튜토리얼 다시 보기</span>
            <span className="mt-1 block text-xs text-[var(--muted)]">
              게임 방법 안내를 처음부터 다시 봅니다.
            </span>
          </span>
          <span className="text-[var(--muted)]">›</span>
        </button>
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

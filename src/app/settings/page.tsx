"use client";

import { useSettingsStore } from "@/store/settingsStore";

export default function SettingsPage() {
  const groupDerivatives = useSettingsStore((state) => state.groupDerivatives);
  const setGroupDerivatives = useSettingsStore(
    (state) => state.setGroupDerivatives,
  );

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

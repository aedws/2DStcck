"use client";

import Link from "next/link";

/**
 * 종목 상세 라우트의 에러 경계. 차트 등에서 예외가 나도 앱 전체가
 * "Application error"로 죽지 않고 이 화면만 복구 가능한 상태로 표시한다.
 */
export default function StockError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="py-20 text-center text-[var(--muted)]">
      <p className="text-sm">종목 화면을 불러오는 중 문제가 발생했어요.</p>
      <div className="mt-3 flex items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold hover:border-[var(--accent)]"
        >
          다시 시도
        </button>
        <Link
          href="/"
          className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--accent)] hover:underline"
        >
          시장으로
        </Link>
      </div>
    </div>
  );
}

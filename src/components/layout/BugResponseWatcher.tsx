"use client";

import { useCallback, useEffect, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import {
  listMyBugResponses,
  BUG_REPORT_STATUS_LABEL,
} from "@/lib/supabase/bugReports";
import {
  listMyFeedbackResponses,
  FEEDBACK_STATUS_LABEL,
} from "@/lib/supabase/feedback";
import { formatPrice } from "@/lib/market/engine";

/** 모달 큐에 쌓이는 통합 회신 아이템(버그·피드백 공통). */
interface QueuedResponse {
  source: "bug" | "feedback";
  id: string;
  title: string;
  statusLabel: string;
  reward: boolean; // 보상 지급 여부
  rewardCents: number;
  message: string | null;
}

/**
 * 로그인한 유저의 버그 리포트·피드백 중 운영자가 처리한 건을 감지해, 채택(수정
 * 완료·반영 완료)엔 보상을 지급하고 운영자 회신을 모달로 전달한다. 처리 id 는
 * 지갑에 기록돼(멱등) 다시 뜨지 않는다.
 */
export function BugResponseWatcher() {
  const userId = useMarketStore((s) => s.userId);
  const isReady = useMarketStore((s) => s.isReady);
  const resolveBugReports = useMarketStore((s) => s.resolveBugReports);
  const resolveFeedbackResponses = useMarketStore(
    (s) => s.resolveFeedbackResponses,
  );
  const [queue, setQueue] = useState<QueuedResponse[]>([]);

  const check = useCallback(async () => {
    if (!userId) return;
    const [bugs, feedback] = await Promise.all([
      listMyBugResponses(),
      listMyFeedbackResponses(),
    ]);

    const queued: QueuedResponse[] = [];
    if (bugs.length > 0) {
      for (const r of resolveBugReports(bugs)) {
        queued.push({
          source: "bug",
          id: r.id,
          title: r.title,
          statusLabel: BUG_REPORT_STATUS_LABEL[r.status],
          reward: r.status === "fixed",
          rewardCents: r.rewardCents,
          message: r.message,
        });
      }
    }
    if (feedback.length > 0) {
      for (const r of resolveFeedbackResponses(feedback)) {
        queued.push({
          source: "feedback",
          id: r.id,
          title: r.title,
          statusLabel: FEEDBACK_STATUS_LABEL[r.status],
          reward: r.status === "done",
          rewardCents: r.rewardCents,
          message: r.message,
        });
      }
    }
    if (queued.length > 0) setQueue((prev) => [...prev, ...queued]);
  }, [userId, resolveBugReports, resolveFeedbackResponses]);

  useEffect(() => {
    if (!userId || !isReady) return;
    // 로그인·클라우드 로드 직후 한 번, 이후 주기적으로 확인한다.
    const t = window.setTimeout(() => void check(), 2_500);
    const interval = window.setInterval(() => void check(), 90_000);
    return () => {
      window.clearTimeout(t);
      window.clearInterval(interval);
    };
  }, [userId, isReady, check]);

  if (queue.length === 0) return null;

  const current = queue[0];
  const isBug = current.source === "bug";
  const rewarded = current.reward && current.rewardCents > 0;
  const dismiss = () => setQueue((prev) => prev.slice(1));

  const heading = rewarded
    ? isBug
      ? "버그 수정 완료 — 보상 지급"
      : "피드백 반영 — 보상 지급"
    : isBug
      ? "버그 리포트 회신"
      : "피드백 회신";
  const emoji = rewarded ? (isBug ? "🛠️" : "💡") : "📮";
  const closing = rewarded
    ? isBug
      ? "제보해 주셔서 고맙습니다. 여러분의 제보가 게임을 더 단단하게 만듭니다."
      : "제안해 주셔서 고맙습니다. 여러분의 아이디어가 게임을 키웁니다."
    : "소중한 의견 고맙습니다. 다음에 더 좋은 소식으로 찾아뵐게요.";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--background)] p-6 text-center shadow-2xl">
        <p className="text-4xl">{emoji}</p>
        <h2 className="mt-3 text-lg font-bold">{heading}</h2>
        <span
          className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            rewarded
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-rose-500/15 text-rose-400"
          }`}
        >
          {isBug ? "🐞 버그" : "💡 피드백"} · {current.statusLabel}
        </span>

        <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
          “{current.title}”
        </p>

        {rewarded && (
          <div className="mt-4 rounded-2xl bg-emerald-500/10 px-5 py-3">
            <p className="text-[11px] text-[var(--muted)]">
              {isBug ? "제보 보상" : "제안 보상"}
            </p>
            <p className="text-xl font-black tabular-nums text-emerald-400">
              +{formatPrice(current.rewardCents)}
            </p>
          </div>
        )}

        {current.message && (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-left">
            <p className="mb-1 text-[11px] font-semibold text-[var(--muted)]">
              운영자 회신
            </p>
            <p className="whitespace-pre-wrap text-sm leading-relaxed">
              {current.message}
            </p>
          </div>
        )}

        <p className="mt-4 text-xs leading-relaxed text-[var(--muted)]">
          {closing}
        </p>

        <button
          type="button"
          onClick={dismiss}
          className="mt-5 w-full rounded-xl bg-[var(--accent)] py-3 text-sm font-semibold text-white"
        >
          확인{queue.length > 1 ? ` (${queue.length - 1}건 더)` : ""}
        </button>
      </div>
    </div>
  );
}

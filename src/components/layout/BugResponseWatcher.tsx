"use client";

import { useCallback, useEffect, useState } from "react";
import { useMarketStore } from "@/store/marketStore";
import { MODAL_PRIORITY, useModalSlot } from "@/components/layout/ModalQueue";
import {
  listMyBugResponses,
  BUG_REPORT_STATUS_LABEL,
} from "@/lib/supabase/bugReports";
import {
  listMyFeedbackResponses,
  FEEDBACK_STATUS_LABEL,
  MARKET_PHASE_CATEGORY,
  CHARACTER_DIALOGUE_CATEGORY,
} from "@/lib/supabase/feedback";
import {
  listMyStockRequestResponses,
  STOCK_REQUEST_STATUS_LABEL,
} from "@/lib/supabase/stockRequests";
import {
  COMPANY_FOUNDATION_STATUS_LABEL,
  listMyCompanyFoundationResponses,
} from "@/lib/supabase/companyFoundationRequests";
import { claimPlayerCompanyDividends } from "@/lib/supabase/playerCompanyDividends";
import { formatPrice } from "@/lib/market/engine";

/** 모달 큐에 쌓이는 통합 회신 아이템(버그·피드백·IPO·회사 설립 공통). */
interface QueuedResponse {
  source: "bug" | "feedback" | "stock" | "company";
  id: string;
  title: string;
  statusLabel: string;
  reward: boolean; // 보상 지급 여부
  rewardCents: number;
  category: string | null; // 피드백 특수 요청 구분용
  message: string | null;
}

/**
 * 로그인한 유저의 버그 리포트·피드백·IPO·회사 설립 허가 중 운영자가 처리한 건을
 * 감지해, 보상 또는 IPO 반려 환불을 지급하고 운영자 회신을 모달로 전달한다.
 * 처리 id 는 지갑에 기록돼 다시 뜨거나 중복 지급되지 않는다.
 */
export function BugResponseWatcher() {
  const userId = useMarketStore((s) => s.userId);
  const isReady = useMarketStore((s) => s.isReady);
  const resolveBugReports = useMarketStore((s) => s.resolveBugReports);
  const resolveFeedbackResponses = useMarketStore(
    (s) => s.resolveFeedbackResponses,
  );
  const resolveStockRequestResponses = useMarketStore(
    (s) => s.resolveStockRequestResponses,
  );
  const applyPlayerCompanyDividendClaim = useMarketStore(
    (s) => s.applyPlayerCompanyDividendClaim,
  );
  const [queue, setQueue] = useState<QueuedResponse[]>([]);

  const check = useCallback(async () => {
    if (!userId) return;
    const [bugs, feedback, stocks, companies, dividendClaim] = await Promise.all([
      listMyBugResponses(),
      listMyFeedbackResponses(),
      listMyStockRequestResponses(),
      listMyCompanyFoundationResponses(),
      claimPlayerCompanyDividends(),
    ]);
    if (dividendClaim.claimedCount > 0) {
      applyPlayerCompanyDividendClaim(dividendClaim);
    }

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
          category: null,
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
          reward: r.rewardCents > 0,
          rewardCents: r.rewardCents,
          category: r.category,
          message: r.message,
        });
      }
    }
    if (stocks.length > 0) {
      for (const r of resolveStockRequestResponses(stocks)) {
        queued.push({
          source: "stock",
          id: r.id,
          title: r.title,
          statusLabel: STOCK_REQUEST_STATUS_LABEL[r.status],
          reward: r.refundCents > 0,
          rewardCents: r.refundCents,
          category: null,
          message: r.message,
        });
      }
    }
    if (companies.length > 0) {
      // 회사 설립 허가는 신청 비용이 없어 환불 없이 사유만 전달한다.
      // 동일 stock_requests id 공간을 쓰므로 resolvedStockRequestIds 로 멱등 처리한다.
      for (const r of resolveStockRequestResponses(
        companies.map((response) => ({
          ...response,
          refundCents: 0,
        })),
      )) {
        queued.push({
          source: "company",
          id: r.id,
          title: r.title,
          statusLabel: COMPANY_FOUNDATION_STATUS_LABEL.rejected,
          reward: false,
          rewardCents: 0,
          category: null,
          message: r.message,
        });
      }
    }
    if (queued.length > 0) setQueue((prev) => [...prev, ...queued]);
  }, [
    userId,
    resolveBugReports,
    resolveFeedbackResponses,
    resolveStockRequestResponses,
    applyPlayerCompanyDividendClaim,
  ]);

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

  const show = useModalSlot(
    "bug-response",
    MODAL_PRIORITY.bugResponse,
    queue.length > 0,
  );
  if (queue.length === 0 || !show) return null;

  const current = queue[0];
  const isBug = current.source === "bug";
  const isStock = current.source === "stock";
  const isCompany = current.source === "company";
  const rewarded = current.reward && current.rewardCents > 0;
  const isPhase =
    current.source === "feedback" &&
    current.category === MARKET_PHASE_CATEGORY;
  const isDialogue =
    current.source === "feedback" &&
    current.category === CHARACTER_DIALOGUE_CATEGORY;
  const phaseRewarded = isPhase && current.rewardCents > 0;
  const phaseDeclined = isPhase && current.rewardCents === 0;
  const dismiss = () => setQueue((prev) => prev.slice(1));

  const heading = isCompany
    ? "회사 설립 허가 반려"
    : isStock
      ? "IPO 신청 반려 — 비용 환불"
      : phaseRewarded
        ? "새 시장 국면 반영 완료 — 보상 지급"
        : phaseDeclined
          ? "새 국면 요청 반려"
          : rewarded
            ? isBug
              ? "버그 수정 완료 — 보상 지급"
              : isDialogue
                ? "캐릭터 대사 채택 — 보상 지급"
                : "피드백 반영 — 보상 지급"
            : isBug
              ? "버그 리포트 회신"
              : "피드백 회신";
  const emoji = isCompany
    ? "🏢"
    : isStock
      ? "📈"
      : isPhase
        ? "🌐"
        : rewarded
          ? isBug
            ? "🛠️"
            : isDialogue
              ? "🗨️"
              : "💡"
          : "📮";
  const closing = isCompany
    ? "반려 사유를 확인해 주세요. 내용을 수정한 뒤 다시 허가 신청할 수 있습니다."
    : isStock
      ? "반려 사유를 확인해 주세요. 사용한 IPO 신청 비용은 전액 돌려드렸습니다."
      : phaseRewarded
        ? "요청하신 새 국면이 반영됐습니다. 멋진 아이디어를 제안해 주셔서 고맙습니다."
        : phaseDeclined
          ? "요청하신 국면은 이번에는 반영하지 않기로 했습니다. 회신 내용을 확인해 주세요."
          : rewarded
            ? isBug
              ? "제보해 주셔서 고맙습니다. 여러분의 제보가 게임을 더 단단하게 만듭니다."
              : "제안해 주셔서 고맙습니다. 여러분의 아이디어가 게임을 키웁니다."
            : "소중한 의견 고맙습니다. 다음에 더 좋은 소식으로 찾아뵐게요.";
  const sourceLabel = isBug
    ? "🐞 버그"
    : isStock
      ? "📈 IPO 요청"
      : isCompany
        ? "🏢 회사 설립"
        : "💡 피드백";

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-sm rounded-3xl border border-[var(--border)] bg-[var(--background)] p-6 text-center shadow-2xl">
        <p className="text-4xl">{emoji}</p>
        <h2 className="mt-3 text-lg font-bold">{heading}</h2>
        <span
          className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${
            rewarded && !isStock && !isCompany
              ? "bg-emerald-500/15 text-emerald-400"
              : "bg-rose-500/15 text-rose-400"
          }`}
        >
          {sourceLabel} · {current.statusLabel}
        </span>

        <p className="mt-3 text-sm font-medium text-[var(--foreground)]">
          “{current.title}”
        </p>

        {rewarded && (
          <div className="mt-4 rounded-2xl bg-emerald-500/10 px-5 py-3">
            <p className="text-[11px] text-[var(--muted)]">
              {isStock
                ? "IPO 신청 비용 환불"
                : phaseRewarded
                  ? "국면 추가 채택 보상"
                  : isBug
                    ? "제보 보상"
                    : isDialogue
                      ? "대사 채택 보상"
                      : "제안 보상"}
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

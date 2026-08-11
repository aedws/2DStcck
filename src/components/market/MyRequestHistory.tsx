"use client";

import { useEffect, useState } from "react";
import {
  listLocalFeedbackReceipts,
  subscribeToLocalFeedbackReceipts,
  type LocalFeedbackReceipt,
} from "@/lib/googleSheets/feedback";

/**
 * Google Sheets에는 공개 조회 API를 두지 않는다. 대신 저장 확인을 받은 요청만
 * 현재 브라우저에 보관해 사용자가 방금 보낸 개선안을 다시 확인할 수 있게 한다.
 */
export function MyRequestHistory() {
  const [mounted, setMounted] = useState(false);
  const [items, setItems] = useState<LocalFeedbackReceipt[]>([]);

  useEffect(() => {
    const refresh = () => setItems(listLocalFeedbackReceipts());
    setMounted(true);
    refresh();
    return subscribeToLocalFeedbackReceipts(refresh);
  }, []);

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--surface)]">
      <div className="border-b border-[var(--border)] px-4 py-3">
        <h2 className="text-sm font-semibold">이 브라우저에서 보낸 개선안</h2>
        <p className="mt-0.5 text-[11px] leading-relaxed text-[var(--muted)]">
          Google 스프레드시트 저장 확인을 받은 최근 요청만 표시합니다. 다른 기기나
          브라우저의 제출 내역은 이곳에 나타나지 않습니다.
        </p>
      </div>
      <div className="px-4 py-3">
        {!mounted ? (
          <p className="py-6 text-center text-xs text-[var(--muted)]">
            불러오는 중…
          </p>
        ) : items.length === 0 ? (
          <p className="py-4 text-center text-xs text-[var(--muted)]">
            아직 이 브라우저에서 보낸 개선안이 없습니다.
          </p>
        ) : (
          <ul className="max-h-96 space-y-2 overflow-y-auto">
            {items.map((item) => (
              <li
                key={item.requestId}
                className="rounded-xl border border-[var(--border)] bg-[var(--background)]/50 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold">💡 {item.title}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--muted)]">
                      {item.category ? `${item.category} · ` : ""}
                      {new Date(item.submittedAt).toLocaleString("ko-KR")}
                    </p>
                    {item.playerId && (
                      <p className="mt-1 text-[10px] text-[var(--muted)]">
                        V1 아이디: {item.playerId}
                      </p>
                    )}
                  </div>
                  <span className="shrink-0 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                    접수 완료
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

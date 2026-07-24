"use client";

import { useEffect, useState } from "react";
import {
  fetchDevStatus,
  DEV_STATE_LABEL,
  DEV_STATE_EMOJI,
  type DevStatus,
} from "@/lib/supabase/devStatus";

function formatResume(ms: number): string {
  return new Date(ms).toLocaleString("ko-KR", {
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * 개발자 처리 상태 배너. 버그 리포트·피드백·IPO 화면 상단에 붙여, 유저가 현재
 * 개발자가 처리 중(available)인지, 보류(paused)인지, 토큰 부족으로 불가(blocked)이며
 * 언제부터 재개하는지 알 수 있게 한다.
 */
export function DevStatusBanner() {
  const [status, setStatus] = useState<DevStatus | null>(null);

  useEffect(() => {
    let alive = true;
    void fetchDevStatus().then((s) => {
      if (alive) setStatus(s);
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!status) return null;

  const tone =
    status.state === "blocked"
      ? "border-rose-500/40 bg-rose-500/10 text-rose-200"
      : status.state === "paused"
        ? "border-amber-500/40 bg-amber-500/10 text-amber-200"
        : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200";

  const resumeText =
    status.state === "blocked" && status.resumeAt
      ? ` ${formatResume(status.resumeAt)}부터 작업을 재개할 예정입니다.`
      : "";

  const body =
    status.state === "available"
      ? "개발자가 버그·요청을 처리 중입니다."
      : status.state === "paused"
        ? "현재 처리를 잠시 보류하고 있습니다. 접수는 계속 받습니다."
        : `토큰 부족으로 현재 처리가 불가합니다.${resumeText}`;

  return (
    <div className={`rounded-xl border px-3 py-2.5 text-xs ${tone}`}>
      <span className="font-semibold">
        {DEV_STATE_EMOJI[status.state]} 개발자 상태 · {DEV_STATE_LABEL[status.state]}
      </span>
      <p className="mt-1 leading-relaxed opacity-90">{body}</p>
      {status.note && (
        <p className="mt-1 leading-relaxed opacity-80">{status.note}</p>
      )}
    </div>
  );
}

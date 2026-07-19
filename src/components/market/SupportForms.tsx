"use client";

import { BugReportForm } from "@/components/market/BugReportForm";
import { FeedbackForm } from "@/components/market/FeedbackForm";

/** 버그 리포트 + 피드백·요청을 반반(데스크톱 2열) 나란히 배치한다. */
export function SupportForms() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      <BugReportForm />
      <FeedbackForm />
    </div>
  );
}

"use client";

import { BugReportForm } from "@/components/market/BugReportForm";
import { FeedbackForm } from "@/components/market/FeedbackForm";
import { ContentRequestForms } from "@/components/market/ContentRequestForms";
import { DevStatusBanner } from "@/components/market/DevStatusBanner";

/** 버그 리포트 + 피드백·요청 + 콘텐츠 요청(캐릭터 대사·새 국면)을 배치한다. */
export function SupportForms() {
  return (
    <div className="space-y-3">
      <DevStatusBanner />
      <div className="grid gap-3 md:grid-cols-2">
        <BugReportForm />
        <FeedbackForm />
      </div>
      <ContentRequestForms />
    </div>
  );
}

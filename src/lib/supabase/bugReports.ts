import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";

/**
 * 유저의 '버그 리포트' — Supabase `bug_reports` 테이블 접근 계층.
 * 정적 배포라 서버 API가 없어, 클라이언트가 anon 키로 직접 접근하고 RLS로 보호된다.
 * INSERT 는 인증 유저 본인만, 전체 SELECT/UPDATE 는 관리자(dorothy)만 가능하다.
 * 재화 소모 없이 무료로 제출한다.
 */

export type BugReportStatus =
  | "open"
  | "investigating"
  | "fixed"
  | "wontfix"
  | "duplicate";

export const BUG_REPORT_STATUS_LABEL: Record<BugReportStatus, string> = {
  open: "접수",
  investigating: "조사 중",
  fixed: "수정 완료",
  wontfix: "보류",
  duplicate: "중복",
};

/** 버그 수정 완료(fixed) 시 제보자에게 지급하는 보상(센트) — $5,000,000. */
export const BUG_FIX_BOUNTY_CENTS = 500_000_000;

/** 운영자 회신을 유저에게 전달하기 위한 정규화된 응답. */
export interface BugResponse {
  id: string;
  title: string;
  status: "fixed" | "wontfix"; // 처리 완료된 두 상태만
  message: string | null; // 운영자 회신 메시지(admin_note)
  rewardCents: number; // 수정 완료 보상(센트). 보류면 0.
}

export interface BugReportInput {
  category?: string;
  title: string;
  description?: string;
}

export interface BugReportRow {
  id: string;
  user_id: string;
  game_id: string;
  category: string | null;
  title: string;
  description: string | null;
  status: BugReportStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitBugResult {
  success: boolean;
  message: string;
  cooldown?: boolean;
}

/** 버그 리포트 제출. */
export async function submitBugReport(
  input: BugReportInput,
): Promise<SubmitBugResult> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 제보할 수 있습니다." };
  }
  const title = input.title.trim();
  if (title.length < 1 || title.length > 80) {
    return { success: false, message: "제목은 1~80자로 입력해 주세요." };
  }
  const supabase = createClient();
  const { error } = await supabase.from("bug_reports").insert({
    user_id: auth.userId,
    game_id: auth.gameId,
    category: input.category?.trim() || null,
    title,
    description: input.description?.trim() || null,
  });
  if (error) {
    if (
      error.message?.includes("bug_report_cooldown") ||
      (error as { hint?: string }).hint?.includes("잠시 후")
    ) {
      return {
        success: false,
        message: "잠시 후 다시 제출해 주세요.",
        cooldown: true,
      };
    }
    if (error.code === "42P01") {
      return {
        success: false,
        message: "버그 리포트 기능이 아직 준비되지 않았습니다(테이블 없음).",
      };
    }
    return {
      success: false,
      message: "제출에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  return { success: true, message: "버그 리포트가 접수되었습니다. 고마워요!" };
}

/** (관리자) 전체 리포트 목록. 비관리자는 RLS 로 본인 것만 반환된다. */
export async function listBugReports(): Promise<BugReportRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("bug_reports")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data as BugReportRow[];
}

/**
 * (유저) 내 리포트 중 운영자가 처리(fixed/wontfix)한 건들의 회신을 가져온다.
 * RLS 로 본인 것만 반환되지만, 관리자 계정 등 예외를 위해 user_id 로 한 번 더 거른다.
 * 수정 완료(fixed)엔 보상 지급, 보류(wontfix)엔 회신 메시지만 전달한다.
 */
export async function listMyBugResponses(): Promise<BugResponse[]> {
  const auth = await getCurrentAuth();
  if (!auth) return [];
  const rows = await listBugReports();
  return rows
    .filter(
      (r) =>
        r.user_id === auth.userId &&
        (r.status === "fixed" || r.status === "wontfix"),
    )
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status as "fixed" | "wontfix",
      message: r.admin_note,
      rewardCents: r.status === "fixed" ? BUG_FIX_BOUNTY_CENTS : 0,
    }));
}

/** (관리자) 리포트 상태·메모 갱신. */
export async function updateBugReport(
  id: string,
  patch: { status?: BugReportStatus; adminNote?: string },
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("bug_reports")
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.adminNote !== undefined ? { admin_note: patch.adminNote } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return !error;
}

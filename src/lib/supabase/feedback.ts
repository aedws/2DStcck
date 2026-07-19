import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";

/**
 * 유저의 '피드백·요청 사항' — Supabase `feedback` 테이블 접근 계층.
 * INSERT 는 인증 유저 본인만, 전체 SELECT/UPDATE 는 관리자(dorothy)만 가능하다.
 * 무료로 제출한다.
 */

export type FeedbackStatus =
  | "open"
  | "considering"
  | "planned"
  | "done"
  | "declined";

export const FEEDBACK_STATUS_LABEL: Record<FeedbackStatus, string> = {
  open: "접수",
  considering: "검토 중",
  planned: "반영 예정",
  done: "반영 완료",
  declined: "반려",
};

export interface FeedbackInput {
  category?: string;
  title: string;
  description?: string;
}

export interface FeedbackRow {
  id: string;
  user_id: string;
  game_id: string;
  category: string | null;
  title: string;
  description: string | null;
  status: FeedbackStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubmitFeedbackResult {
  success: boolean;
  message: string;
  cooldown?: boolean;
}

/** 피드백·요청 제출. */
export async function submitFeedback(
  input: FeedbackInput,
): Promise<SubmitFeedbackResult> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 남길 수 있습니다." };
  }
  const title = input.title.trim();
  if (title.length < 1 || title.length > 80) {
    return { success: false, message: "제목은 1~80자로 입력해 주세요." };
  }
  const supabase = createClient();
  const { error } = await supabase.from("feedback").insert({
    user_id: auth.userId,
    game_id: auth.gameId,
    category: input.category?.trim() || null,
    title,
    description: input.description?.trim() || null,
  });
  if (error) {
    if (
      error.message?.includes("feedback_cooldown") ||
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
        message: "피드백 기능이 아직 준비되지 않았습니다(테이블 없음).",
      };
    }
    return {
      success: false,
      message: "제출에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  return { success: true, message: "피드백이 접수되었습니다. 고마워요!" };
}

/** (관리자) 전체 피드백 목록. 비관리자는 RLS 로 본인 것만 반환된다. */
export async function listFeedback(): Promise<FeedbackRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("feedback")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data as FeedbackRow[];
}

/** (관리자) 피드백 상태·메모 갱신. */
export async function updateFeedback(
  id: string,
  patch: { status?: FeedbackStatus; adminNote?: string },
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("feedback")
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.adminNote !== undefined ? { admin_note: patch.adminNote } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return !error;
}

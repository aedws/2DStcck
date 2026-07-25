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

/** 피드백 반영 완료(done) 시 제안자에게 지급하는 보상(센트) — $50,000. */
export const FEEDBACK_REWARD_CENTS = 5_000_000;

/**
 * 특수 요청 카테고리 — 일반 피드백과 같은 `feedback` 테이블을 쓰되,
 * 채택(done) 시 지갑 효과가 다르다.
 * - 캐릭터 대사 요청: 채택 시 +$50,000 보상.
 * - 국면 추가 요청: 승인 시 $100,000 소모(차감).
 */
export const CHARACTER_DIALOGUE_CATEGORY = "캐릭터 대사 요청";
export const MARKET_PHASE_CATEGORY = "국면 추가 요청";

/** 국면 추가 요청 승인 시 신청자에게서 차감하는 비용(센트) — $100,000. */
export const MARKET_PHASE_REQUEST_COST_CENTS = 10_000_000;

/** 특수 요청(캐릭터 대사·국면 추가) 카테고리인지. */
export function isContentRequestCategory(
  category: string | null | undefined,
): boolean {
  return (
    category === CHARACTER_DIALOGUE_CATEGORY ||
    category === MARKET_PHASE_CATEGORY
  );
}

/** 카테고리별 채택(done) 지갑 효과(센트, 부호 있음). 양수는 지급, 음수는 차감. */
export function feedbackDoneEffectCents(
  category: string | null | undefined,
): number {
  if (category === MARKET_PHASE_CATEGORY) {
    return -MARKET_PHASE_REQUEST_COST_CENTS;
  }
  // 캐릭터 대사 요청·일반 피드백 모두 채택 시 보상 지급.
  return FEEDBACK_REWARD_CENTS;
}

/** 운영자 회신을 유저에게 전달하기 위한 정규화된 응답. */
export interface FeedbackResponse {
  id: string;
  title: string;
  status: "done" | "declined"; // 처리 완료된 두 상태만
  category: string | null; // 특수 요청 구분용(캐릭터 대사·국면 추가)
  message: string | null; // 운영자 회신 메시지(admin_note)
  /** 채택(done) 지갑 효과(센트, 부호 있음). 양수 지급·음수 차감. 반려면 0. */
  rewardCents: number;
}

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

/**
 * (유저) 내 피드백 중 운영자가 처리(반영 완료·반려)한 건들의 회신을 가져온다.
 * RLS 로 본인 것만 반환되지만, 관리자 계정 등 예외를 위해 user_id 로 한 번 더 거른다.
 * 반영 완료(done)엔 보상 지급, 반려(declined)엔 회신 메시지만 전달한다.
 */
export async function listMyFeedbackResponses(): Promise<FeedbackResponse[]> {
  const auth = await getCurrentAuth();
  if (!auth) return [];
  const rows = await listFeedback();
  return rows
    .filter(
      (r) =>
        r.user_id === auth.userId &&
        (r.status === "done" || r.status === "declined"),
    )
    .map((r) => ({
      id: r.id,
      title: r.title,
      status: r.status as "done" | "declined",
      category: r.category,
      message: r.admin_note,
      rewardCents: r.status === "done" ? feedbackDoneEffectCents(r.category) : 0,
    }));
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

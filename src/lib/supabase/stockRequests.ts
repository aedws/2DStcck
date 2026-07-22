import { createClient } from "@/lib/supabase/client";

/**
 * 유저의 '종목 추가 요청' — Supabase `stock_requests` 테이블 접근 계층.
 * 정적 배포라 서버 API가 없어, 클라이언트가 anon 키로 직접 접근하고 RLS로 보호된다.
 * INSERT 는 인증 유저 본인만, 전체 SELECT/UPDATE 는 관리자(dorothy)만 가능하다.
 */

/** 관리자 게임 아이디 목록(공개 식별자). 실제 보안은 그 계정의 PIN + RLS 가 담당한다. */
export const ADMIN_GAME_IDS = ["dorothy"] as const;

/** 요청 1건 비용 (센트) — $50,000 */
export const STOCK_REQUEST_COST = 5_000_000;
/** 요청 쿨다운 (거래일) — 계정당 이 기간에 1건 */
export const STOCK_REQUEST_COOLDOWN_DAYS = 5;

export type StockRequestStatus =
  | "pending"
  | "reviewing"
  | "accepted"
  | "rejected"
  | "shipped";

export const STOCK_REQUEST_STATUS_LABEL: Record<StockRequestStatus, string> = {
  pending: "대기",
  reviewing: "검토 중",
  accepted: "반영 예정",
  rejected: "반려",
  shipped: "반영 완료",
};

/** 반려를 제외한 정상 IPO 진행 순서. */
export const STOCK_REQUEST_PROGRESS = [
  "pending",
  "reviewing",
  "accepted",
  "shipped",
] as const satisfies readonly StockRequestStatus[];

export function stockRequestProgressIndex(status: StockRequestStatus): number {
  return STOCK_REQUEST_PROGRESS.indexOf(
    status as (typeof STOCK_REQUEST_PROGRESS)[number],
  );
}

export interface StockRequestInput {
  sector?: string;
  name: string;
  description?: string;
  referenceUrl?: string;
  costPaid: number;
}

export interface StockRequestRow {
  id: string;
  user_id: string;
  game_id: string;
  sector: string | null;
  name: string;
  description: string | null;
  reference_url: string | null;
  cost_paid: number;
  status: StockRequestStatus;
  admin_note: string | null;
  created_at: string;
  updated_at: string;
}

/** 반려된 IPO 요청을 신청자에게 전달하기 위한 회신. */
export interface StockRequestResponse {
  id: string;
  title: string;
  status: "rejected";
  message: string | null;
  refundCents: number;
}

/**
 * 반려 환불액은 실제 기록액을 따르되 현재 신청 비용을 넘지 않는다.
 * cost_paid는 클라이언트가 작성하는 감사 필드라 임의의 큰 값으로 환불받을 수 없게 제한한다.
 */
export function stockRequestRefundCents(
  request: Pick<StockRequestRow, "status" | "cost_paid">,
): number {
  if (request.status !== "rejected") return 0;
  return Math.min(
    STOCK_REQUEST_COST,
    Math.max(0, Math.floor(Number.isFinite(request.cost_paid) ? request.cost_paid : 0)),
  );
}

/** 이메일(game.<id>@2dstock.local)에서 게임 아이디를 뽑는다. */
export function gameIdFromEmail(email: string | undefined | null): string {
  if (!email) return "";
  const local = email.split("@")[0] ?? "";
  return local.startsWith("game.") ? local.slice("game.".length) : local;
}

export function isAdminEmail(email: string | undefined | null): boolean {
  const gid = gameIdFromEmail(email);
  return (ADMIN_GAME_IDS as readonly string[]).includes(gid);
}

/** 현재 로그인 세션(없으면 null). */
export async function getCurrentAuth(): Promise<{
  userId: string;
  email: string;
  gameId: string;
} | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.user) return null;
  return {
    userId: session.user.id,
    email: session.user.email ?? "",
    gameId: gameIdFromEmail(session.user.email),
  };
}

export interface SubmitResult {
  success: boolean;
  message: string;
  cooldown?: boolean;
}

/** 종목 추가 요청 제출. 성공 시에만 재화를 차감하도록 호출부에서 순서를 지킨다. */
export async function submitStockRequest(
  input: StockRequestInput,
): Promise<SubmitResult> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 요청할 수 있습니다." };
  }
  const name = input.name.trim();
  if (name.length < 1 || name.length > 60) {
    return { success: false, message: "이름은 1~60자로 입력해 주세요." };
  }
  const supabase = createClient();
  const { error } = await supabase.from("stock_requests").insert({
    user_id: auth.userId,
    game_id: auth.gameId,
    sector: input.sector?.trim() || null,
    name,
    description: input.description?.trim() || null,
    reference_url: input.referenceUrl?.trim() || null,
    cost_paid: input.costPaid,
  });
  if (error) {
    // DB 쿨다운 트리거에 걸린 경우
    if (
      error.message?.includes("stock_request_cooldown") ||
      (error as { hint?: string }).hint?.includes("쿨다운")
    ) {
      return {
        success: false,
        message: "요청 쿨다운이 아직 남았습니다.",
        cooldown: true,
      };
    }
    if (error.code === "42P01") {
      return {
        success: false,
        message: "요청 기능이 아직 준비되지 않았습니다(테이블 없음).",
      };
    }
    return { success: false, message: "요청 저장에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return { success: true, message: "요청이 접수되었습니다. 고마워요!" };
}

/** (관리자) 전체 요청 목록. 비관리자는 RLS 로 본인 것만 반환된다. */
export async function listStockRequests(): Promise<StockRequestRow[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error || !data) return [];
  return data as StockRequestRow[];
}

/** (유저) 로그인한 본인이 신청한 IPO 요청만 가져온다. 관리자 계정도 본인 것만 반환한다. */
export async function listMyStockRequests(): Promise<StockRequestRow[]> {
  const auth = await getCurrentAuth();
  if (!auth) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_requests")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return data as StockRequestRow[];
}

/** (유저) 반려된 내 IPO 요청의 사유와 환불액을 가져온다. */
export async function listMyStockRequestResponses(): Promise<StockRequestResponse[]> {
  const rows = await listMyStockRequests();
  return rows
    .filter(
      (r) =>
        r.status === "rejected" &&
        !(r.description ?? "").startsWith("[PLAYER_COMPANY_FOUNDATION]") &&
        !(r.description ?? "").startsWith("[ASSET_MANAGER_FOUNDATION]") &&
        !(r.description ?? "").startsWith("[AMC_ETF_LISTING]"),
    )
    .map((r) => ({
      id: r.id,
      title: r.name,
      status: "rejected" as const,
      message: r.admin_note,
      refundCents: stockRequestRefundCents(r),
    }));
}

/** (관리자) 요청 상태·메모 갱신. */
export async function updateStockRequest(
  id: string,
  patch: { status?: StockRequestStatus; adminNote?: string },
): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("stock_requests")
    .update({
      ...(patch.status ? { status: patch.status } : {}),
      ...(patch.adminNote !== undefined ? { admin_note: patch.adminNote } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);
  return !error;
}

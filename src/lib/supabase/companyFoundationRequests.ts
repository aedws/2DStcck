import type { FoundPlayerCompanyInput } from "@/lib/player/playerCompany";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentAuth,
  completeOwnSpecialStockRequest,
  submitStockRequest,
  type StockRequestRow,
  type StockRequestStatus,
  type SubmitResult,
} from "@/lib/supabase/stockRequests";

export const COMPANY_FOUNDATION_REQUEST_MARKER =
  "[PLAYER_COMPANY_FOUNDATION]" as const;

export const COMPANY_FOUNDATION_STATUS_LABEL: Record<
  StockRequestStatus,
  string
> = {
  pending: "허가 대기",
  reviewing: "심사 중",
  accepted: "설립 허가",
  rejected: "반려",
  shipped: "설립 완료",
};

export interface CompanyFoundationRequest {
  id: string;
  userId: string;
  gameId: string;
  status: StockRequestStatus;
  company: FoundPlayerCompanyInput;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SerializedCompanyFoundation {
  ticker: string;
  subsector?: string;
  description?: string;
}

export function serializeCompanyFoundationRequest(
  input: FoundPlayerCompanyInput,
): string {
  const payload: SerializedCompanyFoundation = {
    ticker: input.ticker.trim().toUpperCase(),
    ...(input.subsector?.trim()
      ? { subsector: input.subsector.trim().slice(0, 40) }
      : {}),
    ...(input.description?.trim()
      ? { description: input.description.trim().slice(0, 300) }
      : {}),
  };
  return `${COMPANY_FOUNDATION_REQUEST_MARKER}\n${JSON.stringify(payload)}`;
}

export function parseCompanyFoundationRequest(
  row: StockRequestRow,
): CompanyFoundationRequest | null {
  const raw = row.description ?? "";
  if (!raw.startsWith(COMPANY_FOUNDATION_REQUEST_MARKER)) return null;
  try {
    const payload = JSON.parse(
      raw.slice(COMPANY_FOUNDATION_REQUEST_MARKER.length).trim(),
    ) as Partial<SerializedCompanyFoundation>;
    const ticker =
      typeof payload.ticker === "string"
        ? payload.ticker.trim().toUpperCase()
        : "";
    if (!/^[A-Z0-9]{2,6}$/.test(ticker) || !row.sector) return null;
    return {
      id: row.id,
      userId: row.user_id,
      gameId: row.game_id,
      status: row.status,
      company: {
        name: row.name,
        ticker,
        sector: row.sector,
        ...(typeof payload.subsector === "string" && payload.subsector.trim()
          ? { subsector: payload.subsector.trim().slice(0, 40) }
          : {}),
        ...(typeof payload.description === "string" &&
        payload.description.trim()
          ? { description: payload.description.trim().slice(0, 300) }
          : {}),
      },
      adminNote: row.admin_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export function isCompanyFoundationRequestRow(row: StockRequestRow): boolean {
  return parseCompanyFoundationRequest(row) !== null;
}

export async function submitCompanyFoundationRequest(
  input: FoundPlayerCompanyInput,
): Promise<SubmitResult> {
  const name = input.name.trim();
  const ticker = input.ticker.trim().toUpperCase();
  if (name.length < 2 || name.length > 30) {
    return { success: false, message: "회사명은 2~30자로 입력해 주세요." };
  }
  if (!/^[A-Z0-9]{2,6}$/.test(ticker)) {
    return {
      success: false,
      message: "티커는 영문 대문자·숫자 2~6자로 입력해 주세요.",
    };
  }
  const existing = await listMyCompanyFoundationRequests();
  if (
    existing.some((request) =>
      ["pending", "reviewing", "accepted"].includes(request.status),
    )
  ) {
    return {
      success: false,
      message: "이미 심사 중이거나 허가된 회사 설립 신청이 있습니다.",
    };
  }
  return submitStockRequest({
    name,
    sector: input.sector,
    description: serializeCompanyFoundationRequest({
      ...input,
      name,
      ticker,
    }),
    costPaid: 0,
  });
}

export async function listMyCompanyFoundationRequests(): Promise<
  CompanyFoundationRequest[]
> {
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
  return (data as StockRequestRow[])
    .map(parseCompanyFoundationRequest)
    .filter(
      (request): request is CompanyFoundationRequest => request !== null,
    );
}

/** 반려된 회사 설립 허가 신청의 사유를 신청자에게 전달하기 위한 회신. */
export interface CompanyFoundationResponse {
  id: string;
  title: string;
  status: "rejected";
  message: string | null;
}

/** (유저) 반려된 내 회사 설립 허가 신청의 사유를 가져온다. */
export async function listMyCompanyFoundationResponses(): Promise<
  CompanyFoundationResponse[]
> {
  const requests = await listMyCompanyFoundationRequests();
  return requests
    .filter((request) => request.status === "rejected")
    .map((request) => ({
      id: request.id,
      title: `${request.company.name} (${request.company.ticker})`,
      status: "rejected" as const,
      message: request.adminNote,
    }));
}

export async function verifyCompanyFoundationApproval(
  requestId: string,
  input: FoundPlayerCompanyInput,
): Promise<boolean> {
  const auth = await getCurrentAuth();
  if (!auth) return false;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_requests")
    .select("*")
    .eq("id", requestId)
    .eq("user_id", auth.userId)
    .eq("status", "accepted")
    .maybeSingle();
  if (error || !data) return false;
  const approved = parseCompanyFoundationRequest(data as StockRequestRow);
  if (!approved) return false;
  return (
    approved.company.name === input.name.trim() &&
    approved.company.ticker === input.ticker.trim().toUpperCase() &&
    approved.company.sector === input.sector &&
    (approved.company.subsector ?? "") === (input.subsector?.trim() ?? "") &&
    (approved.company.description ?? "") === (input.description?.trim() ?? "")
  );
}

/** 설립 비용 차감과 로컬 객체 생성이 끝난 신청을 서버 완료 상태로 고정한다. */
export async function markCompanyFoundationShipped(
  requestId: string,
): Promise<boolean> {
  return completeOwnSpecialStockRequest(requestId);
}

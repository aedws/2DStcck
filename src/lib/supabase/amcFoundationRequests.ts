import type { FoundAssetManagerInput } from "@/lib/player/assetManager";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentAuth,
  submitStockRequest,
  type StockRequestRow,
  type StockRequestStatus,
  type SubmitResult,
} from "@/lib/supabase/stockRequests";

export const AMC_FOUNDATION_REQUEST_MARKER = "[ASSET_MANAGER_FOUNDATION]" as const;

export const AMC_FOUNDATION_STATUS_LABEL: Record<StockRequestStatus, string> = {
  pending: "허가 대기",
  reviewing: "심사 중",
  accepted: "설립 허가",
  rejected: "반려",
  shipped: "설립 완료",
};

export interface AmcFoundationRequest {
  id: string;
  userId: string;
  gameId: string;
  status: StockRequestStatus;
  company: FoundAssetManagerInput;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

interface SerializedAmcFoundation {
  tagline: string;
  detail?: string;
}

export function serializeAmcFoundationRequest(
  input: FoundAssetManagerInput,
): string {
  const payload: SerializedAmcFoundation = {
    tagline: input.tagline.trim().slice(0, 80),
    ...(input.detail?.trim()
      ? { detail: input.detail.trim().slice(0, 500) }
      : {}),
  };
  return `${AMC_FOUNDATION_REQUEST_MARKER}\n${JSON.stringify(payload)}`;
}

export function parseAmcFoundationRequest(
  row: StockRequestRow,
): AmcFoundationRequest | null {
  const raw = row.description ?? "";
  if (!raw.startsWith(AMC_FOUNDATION_REQUEST_MARKER)) return null;
  try {
    const payload = JSON.parse(
      raw.slice(AMC_FOUNDATION_REQUEST_MARKER.length).trim(),
    ) as Partial<SerializedAmcFoundation>;
    const tagline =
      typeof payload.tagline === "string" ? payload.tagline.trim() : "";
    if (tagline.length < 2 || !row.name?.trim()) return null;
    return {
      id: row.id,
      userId: row.user_id,
      gameId: row.game_id,
      status: row.status,
      company: {
        name: row.name,
        tagline: tagline.slice(0, 80),
        ...(typeof payload.detail === "string" && payload.detail.trim()
          ? { detail: payload.detail.trim().slice(0, 500) }
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

export function isAmcFoundationRequestRow(row: StockRequestRow): boolean {
  return parseAmcFoundationRequest(row) !== null;
}

export async function submitAmcFoundationRequest(
  input: FoundAssetManagerInput,
): Promise<SubmitResult> {
  const name = input.name.trim();
  const tagline = input.tagline.trim();
  if (name.length < 2 || name.length > 40) {
    return { success: false, message: "운용사명은 2~40자로 입력해 주세요." };
  }
  if (tagline.length < 2 || tagline.length > 80) {
    return { success: false, message: "한 줄 소개는 2~80자로 입력해 주세요." };
  }
  const existing = await listMyAmcFoundationRequests();
  if (
    existing.some((request) =>
      ["pending", "reviewing", "accepted"].includes(request.status),
    )
  ) {
    return {
      success: false,
      message: "이미 심사 중이거나 허가된 운용사 설립 신청이 있습니다.",
    };
  }
  return submitStockRequest({
    name,
    sector: "자산운용",
    description: serializeAmcFoundationRequest({
      ...input,
      name,
      tagline,
    }),
    costPaid: 0,
  });
}

export async function listMyAmcFoundationRequests(): Promise<
  AmcFoundationRequest[]
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
    .map(parseAmcFoundationRequest)
    .filter((request): request is AmcFoundationRequest => request !== null);
}

export async function verifyAmcFoundationApproval(
  requestId: string,
  input: FoundAssetManagerInput,
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
  const approved = parseAmcFoundationRequest(data as StockRequestRow);
  if (!approved) return false;
  return (
    approved.company.name === input.name.trim() &&
    approved.company.tagline === input.tagline.trim() &&
    (approved.company.detail ?? "") === (input.detail?.trim() ?? "")
  );
}

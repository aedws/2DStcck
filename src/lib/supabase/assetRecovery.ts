import { createClient } from "@/lib/supabase/client";

export type AssetRecoveryStatus =
  | "under_review"
  | "verified"
  | "paid"
  | "corrected"
  | "rejected";

export interface AssetRecoveryRequestRow {
  id: string;
  source_kind: "bug" | "feedback";
  report_id: string;
  user_id: string;
  game_id: string;
  requested_amount_text: string | null;
  status: AssetRecoveryStatus;
  verified_amount_cents: string | number | null;
  evidence_note: string | null;
  resolution_note: string | null;
  reviewed_at: string | null;
  paid_at: string | null;
  adjustment_id: string | null;
  created_at: string;
  updated_at: string;
}

export const ASSET_RECOVERY_STATUS_LABEL: Record<AssetRecoveryStatus, string> = {
  under_review: "증거 확인 중",
  verified: "지급액 검증 완료",
  paid: "복구 지급 완료",
  corrected: "오염분 교정 완료",
  rejected: "근거 불충분",
};

export async function listAssetRecoveryRequests(): Promise<
  AssetRecoveryRequestRow[]
> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("asset_recovery_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  if (error || !data) return [];
  return data as AssetRecoveryRequestRow[];
}

export async function verifyAssetRecoveryRequest(
  requestId: string,
  amountCents: string,
  evidenceNote: string,
): Promise<{ success: boolean; message: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("verify_asset_recovery_request", {
    p_request_id: requestId,
    p_verified_amount_cents: amountCents,
    p_evidence_note: evidenceNote,
  });
  return error
    ? { success: false, message: error.message }
    : { success: true, message: "서버 증거와 지급액을 검증했습니다." };
}

export async function payVerifiedAssetRecovery(
  requestId: string,
  resolutionNote: string,
): Promise<{ success: boolean; message: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("pay_verified_asset_recovery", {
    p_request_id: requestId,
    p_resolution_note: resolutionNote,
  });
  return error
    ? { success: false, message: error.message }
    : { success: true, message: "검증액을 1회 복구 지급했습니다." };
}

export async function rejectAssetRecoveryRequest(
  requestId: string,
  resolutionNote: string,
): Promise<{ success: boolean; message: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("reject_asset_recovery_request", {
    p_request_id: requestId,
    p_resolution_note: resolutionNote,
  });
  return error
    ? { success: false, message: error.message }
    : { success: true, message: "근거 불충분 사유를 기록하고 회신했습니다." };
}

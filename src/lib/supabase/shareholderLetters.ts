import {
  validateShareholderLetterDraft,
} from "@/lib/player/shareholderLetters";
import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";

export interface ShareholderLetterStatus {
  eligibleCount: number;
  lastSentSession: number | null;
  nextSendSession: number;
  canSend: boolean;
}

export interface ShareholderLetter {
  id: string;
  stockId: string;
  ticker: string;
  companyName: string;
  title: string;
  body: string;
  sentSession: number;
  createdAt: string;
  readAt: string | null;
}

export type SendShareholderLetterResult =
  | {
      success: true;
      message: string;
      recipientCount: number;
      sentSession: number;
      nextSendSession: number;
    }
  | { success: false; message: string };

function recordOf(value: unknown): Record<string, unknown> | null {
  if (Array.isArray(value)) return recordOf(value[0]);
  return value && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

export async function getShareholderLetterStatus(
  stockId: string,
): Promise<ShareholderLetterStatus | null> {
  const auth = await getCurrentAuth();
  if (!auth) return null;
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "get_player_company_letter_status",
    { p_stock_id: stockId },
  );
  if (error) return null;
  const row = recordOf(data);
  if (!row) return null;
  return {
    eligibleCount: Math.max(0, Number(row.eligible_count) || 0),
    lastSentSession:
      row.last_sent_session === null || row.last_sent_session === undefined
        ? null
        : Number(row.last_sent_session),
    nextSendSession: Number(row.next_send_session) || 0,
    canSend: row.can_send === true,
  };
}

export async function sendShareholderLetter({
  stockId,
  title,
  body,
}: {
  stockId: string;
  title: string;
  body: string;
}): Promise<SendShareholderLetterResult> {
  const draft = validateShareholderLetterDraft(title, body);
  if (!draft.valid) return { success: false, message: draft.message };
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인한 상장 회사 창업주만 서한을 보낼 수 있습니다." };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "send_player_company_shareholder_letter",
    {
      p_stock_id: stockId,
      p_title: draft.title,
      p_body: draft.body,
    },
  );
  if (error || !data) {
    const detail = error?.message ?? "";
    if (detail.includes("not_listed_founder")) {
      return { success: false, message: "상장된 회사의 인증된 창업주만 서한을 보낼 수 있습니다." };
    }
    if (detail.includes("letter_cooldown")) {
      return { success: false, message: "다음 주주서한 발송 가능 시점까지 기다려 주세요." };
    }
    if (detail.includes("no_eligible_shareholders")) {
      return { success: false, message: "현재 20거래일 장기보유 조건을 충족한 주주가 없습니다." };
    }
    if (detail.includes("links_not_allowed")) {
      return { success: false, message: "주주서한에는 외부 링크를 넣을 수 없습니다." };
    }
    if (detail.includes("invalid_title") || detail.includes("invalid_body")) {
      return { success: false, message: "서한 제목과 본문 길이를 확인해 주세요." };
    }
    return { success: false, message: "주주서한 발송에 실패했습니다. 잠시 후 다시 시도해 주세요." };
  }
  const row = recordOf(data);
  const recipientCount = Math.max(0, Number(row?.recipientCount) || 0);
  return {
    success: true,
    message: `장기보유 주주 ${recipientCount.toLocaleString()}명에게 CEO 서한을 보냈습니다.`,
    recipientCount,
    sentSession: Number(row?.sentSession) || 0,
    nextSendSession: Number(row?.nextSendSession) || 0,
  };
}

export async function listMyShareholderLetters(
  limit = 100,
): Promise<ShareholderLetter[]> {
  const auth = await getCurrentAuth();
  if (!auth) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc("list_my_shareholder_letters", {
    p_limit: Math.min(200, Math.max(1, Math.floor(limit))),
  });
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[])
    .map((row): ShareholderLetter => ({
      id: String(row.id ?? ""),
      stockId: String(row.stock_id ?? ""),
      ticker: String(row.ticker ?? ""),
      companyName: String(row.company_name ?? ""),
      title: String(row.title ?? ""),
      body: String(row.body ?? ""),
      sentSession: Number(row.sent_session) || 0,
      createdAt: String(row.created_at ?? ""),
      readAt: row.read_at ? String(row.read_at) : null,
    }))
    .filter((letter) => Boolean(letter.id && letter.stockId && letter.companyName));
}

export async function markShareholderLetterRead(
  letterId: string,
): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("mark_shareholder_letter_read", {
    p_letter_id: letterId,
  });
  return !error && data === true;
}

export async function markAllShareholderLettersRead(): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase.rpc("mark_all_shareholder_letters_read");
  return !error;
}

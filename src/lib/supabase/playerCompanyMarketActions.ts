import type {
  PlayerCompanyMarketAction,
  PlayerCompanyMarketActionType,
} from "@/lib/market/playerCompanyMarketActions";
import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";

function parseAction(
  row: Record<string, unknown> | null | undefined,
): PlayerCompanyMarketAction | null {
  if (!row) return null;
  const actionType = String(row.action_type) as PlayerCompanyMarketActionType;
  const action: PlayerCompanyMarketAction = {
    id: String(row.id ?? ""),
    sequence: Number(row.sequence),
    stockId: String(row.stock_id ?? ""),
    ticker: String(row.ticker ?? ""),
    actionType,
    shares: Number(row.shares),
    totalSharesBefore: Number(row.total_shares_before),
    publicSharesBefore: Number(row.public_shares_before),
    totalSharesAfter: Number(row.total_shares_after),
    publicSharesAfter: Number(row.public_shares_after),
    priceFactor: Number(row.price_factor),
    priceCents: Number(row.price_cents),
    effectiveTick: Number(row.effective_tick),
    createdAt: String(row.created_at ?? ""),
  };
  if (
    !action.id ||
    !Number.isSafeInteger(action.sequence) ||
    !["issue", "buyback", "retire"].includes(action.actionType) ||
    !Number.isFinite(action.priceFactor) ||
    !Number.isSafeInteger(action.effectiveTick)
  ) {
    return null;
  }
  return action;
}

/** 모든 계정이 공유하는 플레이어 회사 기업행동 원장. */
export async function listPlayerCompanyMarketActions(
  limit = 2_000,
): Promise<PlayerCompanyMarketAction[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("player_company_market_actions")
    .select("*")
    .order("effective_tick", { ascending: true })
    .order("sequence", { ascending: true })
    .limit(limit);
  if (error || !data) return [];
  return (data as Record<string, unknown>[])
    .map(parseAction)
    .filter((action): action is PlayerCompanyMarketAction => action !== null);
}

export interface RecordPlayerCompanyMarketActionInput {
  requestId: string;
  ticker: string;
  stockId: string;
  actionType: PlayerCompanyMarketActionType;
  shares: number;
  totalSharesBefore: number;
  publicSharesBefore: number;
  priceCents: number;
}

export async function recordPlayerCompanyMarketAction(
  input: RecordPlayerCompanyMarketActionInput,
): Promise<
  | { success: true; action: PlayerCompanyMarketAction }
  | { success: false; message: string }
> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return {
      success: false,
      message: "로그인한 상장 회사 창업주만 자본관리를 실행할 수 있습니다.",
    };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "record_player_company_market_action",
    {
      p_request_id: input.requestId,
      p_ticker: input.ticker.trim().toUpperCase(),
      p_stock_id: input.stockId,
      p_action_type: input.actionType,
      p_shares: Math.floor(input.shares),
      p_total_shares_before: Math.floor(input.totalSharesBefore),
      p_public_shares_before: Math.floor(input.publicSharesBefore),
      p_price_cents: Math.round(input.priceCents),
    },
  );
  if (error || !data) {
    const detail = error?.message ?? "";
    if (detail.includes("stale_company_state")) {
      return {
        success: false,
        message:
          "다른 탭에서 회사 지분이 먼저 변경됐습니다. 클라우드 저장을 다시 불러온 뒤 재시도해 주세요.",
      };
    }
    if (detail.includes("not_founder") || detail.includes("not_listed_founder")) {
      return {
        success: false,
        message: "상장된 회사의 인증된 창업주만 실행할 수 있습니다.",
      };
    }
    if (detail.includes("unregistered_company_listing")) {
      return {
        success: false,
        message:
          "이 회사의 상장 종목과 창업주 서버 명부가 아직 연결되지 않았습니다.",
      };
    }
    if (detail.includes("insufficient_public_shares")) {
      return {
        success: false,
        message: "현재 서버 공모주보다 많은 좌수를 처리할 수 없습니다.",
      };
    }
    if (detail.includes("insufficient_cash")) {
      return {
        success: false,
        message: "서버에 저장된 현금이 자사주 매입 비용보다 부족합니다.",
      };
    }
    return {
      success: false,
      message:
        "공통 시장 기업행동 등록에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  const action = parseAction(
    (Array.isArray(data) ? data[0] : data) as Record<string, unknown>,
  );
  return action
    ? { success: true, action }
    : {
        success: false,
        message: "기업행동 서버 응답을 확인하지 못했습니다.",
      };
}

import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";

/**
 * 유저 회사 배당 원장 접근 계층.
 * - 창업주는 `declarePlayerCompanyDividend` 로 배당을 선언(서버가 창업주 검증).
 * - 모든 보유자는 `listClaimablePlayerCompanyDividends` 로 지급 개시된 배당을 읽어
 *   보유 좌수 비례로 지급받는다(클라이언트가 멱등 크레딧).
 */

export interface PlayerCompanyDividend {
  id: string;
  stockId: string;
  ticker: string;
  perShareCents: number;
  dividendSession: number;
}

export interface DeclareDividendInput {
  ticker: string;
  stockId: string;
  perShareCents: number;
  totalCents: number;
  dividendSession: number;
}

export interface DeclareDividendResult {
  success: boolean;
  message: string;
  dividend?: PlayerCompanyDividend;
}

export async function declarePlayerCompanyDividend(
  input: DeclareDividendInput,
): Promise<DeclareDividendResult> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인한 창업주만 배당을 선언할 수 있습니다." };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "declare_player_company_dividend",
    {
      p_ticker: input.ticker.trim().toUpperCase(),
      p_stock_id: input.stockId,
      p_per_share_cents: Math.round(input.perShareCents),
      p_total_cents: Math.round(input.totalCents),
      p_dividend_session: Math.round(input.dividendSession),
    },
  );
  if (error || !data) {
    if (error?.message?.includes("not_founder")) {
      return {
        success: false,
        message: "이 회사의 창업주(설립 허가 이력)만 배당을 선언할 수 있습니다.",
      };
    }
    if (error?.message?.includes("duplicate key")) {
      return {
        success: false,
        message: "이번 배당일에는 이미 배당이 선언되어 있습니다.",
      };
    }
    return {
      success: false,
      message: "배당 선언에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  const row = data as Record<string, unknown>;
  return {
    success: true,
    message: "배당을 선언했습니다.",
    dividend: {
      id: String(row.id),
      stockId: String(row.stock_id),
      ticker: String(row.ticker),
      perShareCents: Number(row.per_share_cents),
      dividendSession: Number(row.dividend_session),
    },
  };
}

/** 지급 개시(dividend_session ≤ 현재)된 최근 배당 목록. 보유자 클라이언트가 정산에 쓴다. */
export async function listClaimablePlayerCompanyDividends(
  currentSession: number,
  limit = 100,
): Promise<PlayerCompanyDividend[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("player_company_dividends")
    .select("id, stock_id, ticker, per_share_cents, dividend_session")
    .lte("dividend_session", Math.round(currentSession))
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error || !data) return [];
  return data.map((row) => ({
    id: String(row.id),
    stockId: String(row.stock_id),
    ticker: String(row.ticker),
    perShareCents: Number(row.per_share_cents),
    dividendSession: Number(row.dividend_session),
  }));
}

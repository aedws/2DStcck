import { createClient } from "@/lib/supabase/client";
import { loadGameSave } from "@/lib/supabase/cloudSave";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";
import type { CashPayment } from "@/lib/types/market";

/**
 * 유저 회사 배당 원장 접근 계층.
 * - 창업주는 `declarePlayerCompanyDividend` 로 배당을 선언(서버가 창업주 검증).
 * - 지급은 선언 시점 주주명부를 고정한 서버 원장에서 원자적으로 처리한다.
 */

export interface PlayerCompanyDividend {
  id: string;
  stockId: string;
  ticker: string;
  perShareCents: number;
  perShareCentsExact: string;
  dividendSession: number;
}

export interface DeclareDividendInput {
  ticker: string;
  stockId: string;
  perShareCentsExact: string;
  totalCentsExact: string;
  dividendSession: number;
  dividendKind?: "special" | "regular";
  shareMultiplier: number;
}

export interface PlayerCompanyDividendClaim {
  claimedCount: number;
  totalCentsExact: string;
  payments: CashPayment[];
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
  const params = {
    p_ticker: input.ticker.trim().toUpperCase(),
    p_stock_id: input.stockId,
    p_per_share_cents: input.perShareCentsExact,
    p_total_cents: input.totalCentsExact,
    p_dividend_session: Math.round(input.dividendSession),
  };
  // v2는 배당 유형까지 서버 현금 원장에 기록한다. 마이그레이션 전 서버에서는
  // 기존 원자적 차감 RPC로 안전하게 폴백해 배당 실행 자체가 막히지 않게 한다.
  let { data, error } = await supabase.rpc(
    "declare_player_company_dividend_v3",
    {
      ...params,
      p_dividend_kind: input.dividendKind ?? "special",
      p_share_multiplier:
        Number.isFinite(input.shareMultiplier) && input.shareMultiplier > 0
          ? input.shareMultiplier
          : 1,
    },
  );
  if (
    error &&
    (error.code === "PGRST202" ||
      error.message?.includes("declare_player_company_dividend_v3"))
  ) {
    ({ data, error } = await supabase.rpc(
      "declare_player_company_dividend_v2",
      {
        ...params,
        p_dividend_kind: input.dividendKind ?? "special",
      },
    ));
    if (
      error &&
      (error.code === "PGRST202" ||
        error.message?.includes("declare_player_company_dividend_v2"))
    ) {
      ({ data, error } = await supabase.rpc(
        "declare_player_company_dividend",
        params,
      ));
    }
  }
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
    if (error?.message?.includes("insufficient_cash")) {
      return {
        success: false,
        message:
          "서버에 저장된 현금이 이번 1회 배당 재원보다 부족합니다. 계좌를 새로고침한 뒤 다시 확인해 주세요.",
      };
    }
    if (
      error?.message?.includes("not_listed_founder") ||
      error?.message?.includes("invalid_dividend_budget")
    ) {
      return {
        success: false,
        message:
          "서버의 상장 회사·발행주식수와 배당 계산 기준이 달라졌습니다. 계좌를 새로고침한 뒤 다시 계산해 주세요.",
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
      perShareCentsExact: String(row.per_share_cents),
      dividendSession: Number(row.dividend_session),
    },
  };
}

/** 선언 시점 주주명부에 확정된 배당을 서버 지갑에 원자적으로 지급한다. */
export async function claimPlayerCompanyDividends(): Promise<PlayerCompanyDividendClaim> {
  const empty: PlayerCompanyDividendClaim = {
    claimedCount: 0,
    totalCentsExact: "0",
    payments: [],
  };
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "claim_player_company_dividends",
  );
  if (error || !data || typeof data !== "object") return empty;

  const row = data as Record<string, unknown>;
  const rawPayments = Array.isArray(row.payments) ? row.payments : [];
  const payments = rawPayments.filter(
    (payment): payment is CashPayment =>
      Boolean(payment) &&
      typeof payment === "object" &&
      typeof (payment as CashPayment).id === "string" &&
      typeof (payment as CashPayment).amountExact === "string",
  );
  const claimedCount = Math.max(
    0,
    Math.floor(Number(row.claimedCount) || 0),
  );
  // 실제 지급 때만 wallet_revision이 오르므로 그때만 다음 CAS 기준을 갱신한다.
  if (claimedCount > 0) await loadGameSave();
  return {
    claimedCount,
    totalCentsExact: String(row.totalCentsExact ?? "0"),
    payments,
  };
}

/** 같은 회사·배당일에 이미 예약된 배당이 있는지 확인한다. 정기배당 재시도 중복 방지용. */
export async function hasPlayerCompanyDividend(
  stockId: string,
  dividendSession: number,
): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("player_company_dividends")
    .select("id")
    .eq("stock_id", stockId.trim().toLowerCase())
    .eq("dividend_session", Math.round(dividendSession))
    .limit(1);
  return !error && Array.isArray(data) && data.length > 0;
}

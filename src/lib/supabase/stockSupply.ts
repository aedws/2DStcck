import { createClient } from "@/lib/supabase/client";
import { isSupplyLimitedStock } from "@/lib/market/shareSupply";
import type { StockDefinition } from "@/lib/types/market";

export interface StockSupplySnapshot {
  stockId: string;
  ticker: string;
  issuedShares: number;
  floatShares: number;
  remainingShares: number;
  splitMultiplier: number;
  updatedAt: number;
}

export type StockSupplyAdjustment =
  | { success: true; mode: "applied" | "practice" | "exempt"; remainingShares?: number }
  | { success: false; code: string; message: string; remainingShares?: number };

export const STOCK_SUPPLY_CHANGED_EVENT = "2dstock:stock-supply-changed";

export function announceStockSupplyChanged(stockId: string): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(STOCK_SUPPLY_CHANGED_EVENT, { detail: { stockId } }),
  );
}

export async function loadStockSupply(
  stockId: string,
): Promise<StockSupplySnapshot | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_supply")
    .select(
      "stock_id,ticker,issued_shares,float_shares,remaining_shares,split_multiplier,updated_at",
    )
    .eq("stock_id", stockId)
    .maybeSingle();
  if (error || !data) return null;
  return {
    stockId: String(data.stock_id),
    ticker: String(data.ticker),
    issuedShares: Number(data.issued_shares),
    floatShares: Number(data.float_shares),
    remainingShares: Number(data.remaining_shares),
    splitMultiplier: Number(data.split_multiplier),
    updatedAt: new Date(String(data.updated_at)).getTime(),
  };
}
/** 로그인 보통주 거래만 원자 RPC로 전역 유통 재고에 반영한다. */
export async function adjustStockSupply(
  stock: Pick<StockDefinition, "id" | "sector" | "universalDerivative">,
  side: "buy" | "sell",
  quantity: number,
  operationId: string,
  authenticated: boolean,
): Promise<StockSupplyAdjustment> {
  if (!isSupplyLimitedStock(stock)) return { success: true, mode: "exempt" };
  if (!authenticated) return { success: true, mode: "practice" };

  const supabase = createClient();
  const { data, error } = await supabase.rpc("adjust_stock_supply", {
    p_operation_id: operationId,
    p_quantity: quantity,
    p_side: side,
    p_stock_id: stock.id,
  });
  if (error) {
    const missing = error.code === "42883" || error.code === "PGRST202";
    return {
      success: false,
      code: missing ? "schema_missing" : "server_error",
      message: missing
        ? "공유 유통 재고가 아직 준비되지 않았습니다. 관리자 SQL 적용이 필요합니다."
        : "유통 재고 확인에 실패했습니다. 연결을 확인하고 다시 시도해 주세요.",
    };
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || row.success !== true) {
    const code = String(row?.code ?? "server_error");
    return {
      success: false,
      code,
      remainingShares:
        row?.remaining_shares === undefined ? undefined : Number(row.remaining_shares),
      message:
        code === "insufficient_supply"
          ? `유통 잔여 물량이 부족합니다${row?.remaining_shares !== undefined ? ` (잔여 ${Number(row.remaining_shares).toLocaleString("ko-KR", { maximumFractionDigits: 6 })}주)` : ""}.`
          : code === "unknown_stock"
            ? "이 종목의 유통 재고가 아직 등록되지 않았습니다."
            : "유통 재고 거래를 처리하지 못했습니다.",
    };
  }
  announceStockSupplyChanged(stock.id);
  return {
    success: true,
    mode: "applied",
    remainingShares: Number(row.remaining_shares),
  };
}

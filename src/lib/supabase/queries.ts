import { createClient } from "@/lib/supabase/client";
import {
  createInitialMarketState,
  parseMarketRow,
  type ServerMarketState,
} from "@/lib/market/serverState";
import type { Holding, OpenOrder, Trade } from "@/lib/types/market";

/** 시장 상태 직접 조회 (RLS: 전체 공개 읽기) */
export async function fetchMarketState(): Promise<ServerMarketState | null> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("market_global")
    .select("*")
    .eq("id", "global")
    .maybeSingle();

  if (error) return null;
  // cron이 아직 첫 tick을 만들기 전이면 초기 상태로 표시
  if (!data) return createInitialMarketState();
  return parseMarketRow(data);
}

export interface PortfolioData {
  cash: number;
  initialCash: number;
  holdings: Holding[];
  trades: Trade[];
}

/** 로그인 유저의 포트폴리오 직접 조회 (RLS: 본인 데이터만) */
export async function fetchPortfolio(): Promise<PortfolioData | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: holdings }, { data: trades }] =
    await Promise.all([
      supabase.from("profiles").select("*").eq("id", user.id).single(),
      supabase.from("holdings").select("*").eq("user_id", user.id),
      supabase
        .from("trades")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);

  if (!profile) return null;

  return {
    cash: profile.cash,
    initialCash: profile.initial_cash,
    holdings: (holdings ?? []).map((h) => ({
      stockId: h.stock_id,
      quantity: h.quantity,
      averagePrice: h.average_price,
    })),
    trades: (trades ?? []).map((t) => ({
      id: t.id,
      stockId: t.stock_id,
      ticker: t.ticker,
      type: t.type,
      quantity: t.quantity,
      price: t.price,
      total: t.total,
      timestamp: new Date(t.created_at).getTime(),
    })),
  };
}

/** 본인 미체결 지정가 주문 조회 */
export async function fetchOpenOrders(): Promise<OpenOrder[] | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("orders")
    .select("*")
    .eq("user_id", user.id)
    .eq("status", "open")
    .order("created_at", { ascending: false });

  if (error) return null;
  return (data ?? []).map((o) => ({
    id: o.id,
    stockId: o.stock_id,
    ticker: o.ticker,
    side: o.side,
    price: o.price,
    quantity: o.quantity,
    createdAt: new Date(o.created_at).getTime(),
  }));
}

/** 미체결 주문 취소 */
export async function cancelOpenOrder(orderId: string): Promise<boolean> {
  const supabase = createClient();
  const { error } = await supabase
    .from("orders")
    .update({ status: "cancelled" })
    .eq("id", orderId)
    .eq("status", "open");
  return !error;
}

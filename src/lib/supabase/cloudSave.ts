import { createClient } from "@/lib/supabase/client";
import type {
  CashPayment,
  Holding,
  OpenOrder,
  Trade,
} from "@/lib/types/market";

/**
 * 경량 계정 동기화의 저장 단위 — 유저 지갑.
 * 시장(stocks/events)은 결정론으로 재계산되므로 저장하지 않는다.
 */
export interface WalletSave {
  cash: number;
  initialCash: number;
  holdings: Holding[];
  trades: Trade[];
  openOrders: OpenOrder[];
  cashPayments: CashPayment[];
  lastSalarySession: number;
  lastMonthlyDistributionSession: number;
  lastQuarterlyDividendSession: number;
}

/** 로그인 유저의 저장된 지갑을 불러온다 (RLS: 본인 행만). 없으면 null. */
export async function loadGameSave(): Promise<WalletSave | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data, error } = await supabase
    .from("game_saves")
    .select("state")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error || !data?.state) return null;
  return data.state as WalletSave;
}

/** 현재 지갑을 저장한다 (upsert). 로그인 상태가 아니면 무시. */
export async function saveGameSave(wallet: WalletSave): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { error } = await supabase.from("game_saves").upsert({
    user_id: user.id,
    state: wallet,
    updated_at: new Date().toISOString(),
  });
  return !error;
}

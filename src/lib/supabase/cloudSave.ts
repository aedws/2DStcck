import { createClient } from "@/lib/supabase/client";
import type {
  CashPayment,
  Holding,
  OpenOrder,
  Trade,
} from "@/lib/types/market";
import type { OwnedLuxury } from "@/lib/types/luxury";

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
  /** 보유 사치재 (재화 sink). 구버전 저장분 호환을 위해 선택형. */
  ownedLuxuries?: OwnedLuxury[];
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

/** 리더보드 한 행 (공개 읽기). 순자산·수익률·과시 요약. */
export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  netWorth: number;
  returnRate: number;
  topTier: number;
  luxuryCount: number;
  showcase: string[];
  updatedAt: number;
}

/** 계산된 지표를 본인 리더보드 행에 upsert 한다. 로그인 상태가 아니면 무시. */
export async function syncLeaderboard(stats: {
  netWorth: number;
  returnRate: number;
  topTier: number;
  luxuryCount: number;
  showcase: string[];
}): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const displayName =
    (user.user_metadata?.game_id as string | undefined) ??
    user.email?.split("@")[0] ??
    "익명";

  const { error } = await supabase.from("leaderboard").upsert({
    user_id: user.id,
    display_name: displayName,
    net_worth: Math.round(stats.netWorth),
    return_rate: Number(stats.returnRate.toFixed(2)),
    top_tier: stats.topTier,
    luxury_count: stats.luxuryCount,
    showcase: stats.showcase,
    updated_at: new Date().toISOString(),
  });
  return !error;
}

/** 순자산 상위 랭킹을 읽는다 (공개). 실패 시 빈 배열. */
export async function fetchLeaderboard(
  limit = 100,
): Promise<LeaderboardEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leaderboard")
    .select(
      "user_id, display_name, net_worth, return_rate, top_tier, luxury_count, showcase, updated_at",
    )
    .order("net_worth", { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data.map((row) => ({
    userId: row.user_id,
    displayName: row.display_name,
    netWorth: Number(row.net_worth),
    returnRate: Number(row.return_rate),
    topTier: Number(row.top_tier),
    luxuryCount: Number(row.luxury_count),
    showcase: (row.showcase as string[]) ?? [],
    updatedAt: new Date(row.updated_at).getTime(),
  }));
}

/** 현재 로그인 유저의 id (없으면 null). 리더보드에서 '나' 강조에 사용. */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

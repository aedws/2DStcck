import { createClient } from "@/lib/supabase/client";
import type {
  CashPayment,
  CharacterProgressMap,
  Holding,
  InvestmentMission,
  InvestmentMissionHistory,
  MarginLeverage,
  OpenOrder,
  OptionPosition,
  RecurringInvestment,
  ShortPosition,
  StoryDecision,
  Trade,
} from "@/lib/types/market";
import type { OwnedLuxury } from "@/lib/types/luxury";
import type { InvestmentMasteryState } from "@/lib/market/investmentMastery";
import type { InvestmentSeasonState } from "@/lib/market/investmentSeasons";
import type { AttendanceState } from "@/lib/player/playerProfile";

/**
 * 경량 계정 동기화의 저장 단위 — 유저 지갑.
 * 시장(stocks/events)은 결정론으로 재계산되므로 저장하지 않는다.
 */
export interface WalletSave {
  /** 저장 당시 거래일 길이. 구버전(없음)은 3시간으로 간주한다. */
  sessionDurationMs?: number;
  cash: number;
  initialCash: number;
  holdings: Holding[];
  trades: Trade[];
  openOrders: OpenOrder[];
  cashPayments: CashPayment[];
  lastSalarySession: number;
  lastMonthlyDistributionSession: number;
  lastSingleCoveredCallDistributionSession?: number;
  lastQuarterlyDividendSession: number;
  /** 보유 사치재 (재화 sink). 구버전 저장분 호환을 위해 선택형. */
  ownedLuxuries?: OwnedLuxury[];
  /** 공매도 포지션. 구버전 호환을 위해 선택형. */
  shorts?: ShortPosition[];
  /** 옵션 포지션. 구버전 호환을 위해 선택형. */
  options?: OptionPosition[];
  /** 마지막 이자 정산 거래일. 구버전 호환을 위해 선택형. */
  lastInterestSession?: number;
  /** 달성 업적 id. 구버전 호환을 위해 선택형. */
  achievements?: string[];
  /** 복권 회차·구매수·잭팟 이력. 구버전 호환을 위해 선택형. */
  lotteryWindowStart?: number;
  lotteryTicketsBought?: number;
  wonJackpot?: boolean;
  investmentMission?: InvestmentMission | null;
  missionHistory?: InvestmentMissionHistory[];
  reputation?: number;
  characterProgress?: CharacterProgressMap;
  readCharacterMessageIds?: string[];
  investmentMastery?: InvestmentMasteryState;
  investmentSeason?: InvestmentSeasonState;
  storyDecision?: StoryDecision | null;
  storyDecisionHistory?: StoryDecision[];
  marginEnabled?: boolean;
  marginLeverage?: MarginLeverage;
  recurringInvestments?: RecurringInvestment[];
  attendance?: AttendanceState;
  selectedTitleId?: string;
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
  weeklyReturn: number;
  title: string;
  tradeCount: number;
  winRate: number;
}

export const LEADERBOARD_REFRESH_MS = 10 * 60 * 1_000;

/** 계산된 지표를 본인 리더보드 행에 upsert 한다. 로그인 상태가 아니면 무시. */
export async function syncLeaderboard(stats: {
  netWorth: number;
  returnRate: number;
  initialCash: number;
  marketSession: number;
  topTier: number;
  luxuryCount: number;
  showcase: string[];
  reputation: number;
  title: string;
  tradeCount: number;
  winRate: number;
}): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const throttleKey = `2dstock-leaderboard-sync:${user.id}`;
  const lastSynced = Number(window.localStorage.getItem(throttleKey)) || 0;
  if (Date.now() - lastSynced < LEADERBOARD_REFRESH_MS) return true;

  const displayName =
    (user.user_metadata?.game_id as string | undefined) ??
    user.email?.split("@")[0] ??
    "익명";

  // 브라우저 개발자 도구의 단순 값 변조를 먼저 거른다. 진짜 권한 경계는
  // basic_leaderboard_integrity 마이그레이션의 submit_leaderboard RPC이며,
  // 저장 지갑과 세션을 재검증한다.
  const expectedReturn =
    stats.initialCash > 0
      ? ((stats.netWorth - stats.initialCash) / stats.initialCash) * 100
      : Number.NaN;
  if (
    !Number.isSafeInteger(Math.round(stats.netWorth)) ||
    !Number.isSafeInteger(Math.round(stats.initialCash)) ||
    stats.initialCash <= 0 ||
    !Number.isFinite(stats.returnRate) ||
    Math.abs(expectedReturn - stats.returnRate) > 0.05 ||
    !Number.isSafeInteger(stats.marketSession) ||
    stats.luxuryCount < 0 ||
    stats.luxuryCount > 100 ||
    stats.reputation < 0
  ) {
    return false;
  }

  const { error: rpcError } = await supabase.rpc("submit_leaderboard", {
    p_display_name: displayName,
    p_net_worth: Math.round(stats.netWorth),
    p_return_rate: Number(stats.returnRate.toFixed(2)),
    p_initial_cash: Math.round(stats.initialCash),
    p_market_session: stats.marketSession,
    p_top_tier: stats.topTier,
    p_luxury_count: stats.luxuryCount,
    p_showcase: stats.showcase,
    p_reputation: Math.round(stats.reputation),
    p_title: stats.title.slice(0, 30),
    p_trade_count: Math.max(0, Math.floor(stats.tradeCount)),
    p_win_rate: Number(Math.max(0, Math.min(100, stats.winRate)).toFixed(2)),
  });
  if (!rpcError) {
    window.localStorage.setItem(throttleKey, String(Date.now()));
    return true;
  }

  // 마이그레이션 적용 전 개발 DB 호환. 함수가 존재하는데 검증에 실패한 경우에는
  // 직접 upsert로 우회하지 않는다.
  if (rpcError.code !== "42883" && !rpcError.message.includes("submit_leaderboard")) {
    return false;
  }

  const { error } = await supabase.from("leaderboard").upsert({
    user_id: user.id,
    display_name: displayName,
    net_worth: Math.round(stats.netWorth),
    return_rate: Number(stats.returnRate.toFixed(2)),
    top_tier: stats.topTier,
    luxury_count: stats.luxuryCount,
    showcase: stats.showcase,
    title: stats.title.slice(0, 30),
    trade_count: Math.max(0, Math.floor(stats.tradeCount)),
    win_rate: Number(Math.max(0, Math.min(100, stats.winRate)).toFixed(2)),
    updated_at: new Date().toISOString(),
  });
  if (!error) window.localStorage.setItem(throttleKey, String(Date.now()));
  return !error;
}

/** 순자산 상위 랭킹을 읽는다 (공개). 실패 시 빈 배열. */
export async function fetchLeaderboard(
  limit = 100,
  sort: "netWorth" | "weekly" = "netWorth",
): Promise<LeaderboardEntry[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("leaderboard")
    .select(
      "user_id, display_name, net_worth, return_rate, weekly_return, title, trade_count, win_rate, top_tier, luxury_count, showcase, updated_at",
    )
    .order(sort === "weekly" ? "weekly_return" : "net_worth", {
      ascending: false,
    })
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
    weeklyReturn: Number(row.weekly_return ?? 0),
    title: String(row.title ?? ""),
    tradeCount: Number(row.trade_count ?? 0),
    winRate: Number(row.win_rate ?? 0),
  }));
}

/** 아이디·이메일을 노출하지 않고 등록된 게임 계정 수만 집계한다. */
export async function fetchRegisteredAccountCount(): Promise<number | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_registered_account_count");
  if (error) return null;
  const count = Number(data);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

/** 현재 로그인 유저의 id (없으면 null). 리더보드에서 '나' 강조에 사용. */
export async function getCurrentUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

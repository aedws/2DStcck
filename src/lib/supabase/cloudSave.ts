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
  PensionAnnuity,
  PreferredShare,
  RecurringInvestment,
  ShortPosition,
  StoryDecision,
  Trade,
} from "@/lib/types/market";
import type { OwnedLuxury } from "@/lib/types/luxury";
import type { PlacedRoomItem } from "@/data/roomItems";
import type { InvestmentMasteryState } from "@/lib/market/investmentMastery";
import type { InvestmentSeasonState } from "@/lib/market/investmentSeasons";
import type { AttendanceState } from "@/lib/player/playerProfile";
import type { DailyOperation } from "@/lib/market/dailyOperations";
import type { PortfolioStrategyId } from "@/lib/market/portfolioStrategies";
import type { SeasonRewardId } from "@/lib/player/seasonRewards";
import type { PlayerCompanyState } from "@/lib/player/playerCompany";
import type { AssetManagerState } from "@/lib/player/assetManager";
import {
  exactPercentChange,
  exactToNumber,
  normalizeExactAmount,
} from "@/lib/market/exactAmount";

/**
 * 경량 계정 동기화의 저장 단위 — 유저 지갑.
 * 시장(stocks/events)은 결정론으로 재계산되므로 저장하지 않는다.
 */
export interface WalletSave {
  /**
   * 지갑 스키마 세대. 없거나 현재 `WALLET_EPOCH` 미만이면 폐기 대상.
   * (비정상 자산·거래내역 누락 시즌을 한 번에 리셋할 때 올린다.)
   */
  walletEpoch?: number;
  /** 저장 당시 거래일 길이. 구버전(없음)은 3시간으로 간주한다. */
  sessionDurationMs?: number;
  cash: number;
  cashExact?: string;
  /** 서버 ETF 누적 현금원장에서 이 지갑에 반영 완료한 값. */
  amcLedgerBalance?: number;
  amcLedgerBalanceExact?: string;
  amcLedgerRevision?: number;
  initialCash: number;
  initialCashExact?: string;
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
  /** 마지막 강제청산 시각. 재접속 직후 같은 포지션을 중복 청산하지 않기 위한 체크포인트. */
  marginCallAt?: number | null;
  /** 달성 업적 id. 구버전 호환을 위해 선택형. */
  achievements?: string[];
  /** 복권 회차·구매수·잭팟 이력. 구버전 호환을 위해 선택형. */
  lotteryWindowStart?: number;
  lotteryTicketsBought?: number;
  wonJackpot?: boolean;
  /** 연금 복권 당첨 잔여 지급분. 구버전 호환을 위해 선택형. */
  pensionAnnuities?: PensionAnnuity[];
  /** 마지막 종목 추가 요청 거래일 (쿨다운). 구버전 호환을 위해 선택형. */
  lastStockRequestSession?: number;
  investmentMission?: InvestmentMission | null;
  missionHistory?: InvestmentMissionHistory[];
  reputation?: number;
  characterProgress?: CharacterProgressMap;
  preferredShares?: PreferredShare[];
  preferredIssuedCharacterIds?: string[];
  preferredDiversifiedSince?: number | null;
  readCharacterMessageIds?: string[];
  resolvedBugReportIds?: string[];
  resolvedFeedbackIds?: string[];
  resolvedStockRequestIds?: string[];
  /** 이미 받은 전 계정 운영 보상(롤백 보상 등) id. 중복 지급 방지. */
  claimedCompensationIds?: string[];
  /** 마이룸에 배치된 가구. */
  myRoomItems?: PlacedRoomItem[];
  /** 마이룸 확장 단계 (0 = 기본 방). */
  myRoomLevel?: number;
  /** 적용 중인 숙소 테마 id. */
  myRoomTheme?: string;
  /** 보유한 숙소 테마 id 목록. */
  myRoomOwnedThemes?: string[];
  /** 친밀도로 초대해 상주 중인 CEO 캐릭터 id 목록. */
  myRoomResidentCharacterIds?: string[];
  investmentMastery?: InvestmentMasteryState;
  investmentSeason?: InvestmentSeasonState;
  storyDecision?: StoryDecision | null;
  storyDecisionHistory?: StoryDecision[];
  marginEnabled?: boolean;
  marginLeverage?: MarginLeverage;
  recurringInvestments?: RecurringInvestment[];
  attendance?: AttendanceState;
  selectedTitleId?: string;
  dailyOperation?: DailyOperation | null;
  dailyOperationHistory?: DailyOperation[];
  selectedPortfolioStrategyId?: PortfolioStrategyId;
  portfolioStrategySelectedAt?: number;
  unlockedSeasonRewardIds?: SeasonRewardId[];
  selectedSeasonFrameId?: SeasonRewardId | null;
  /** 초고액 계정 전용 비상장 플레이어 회사. 회사 가치는 순자산에 합산하지 않는다. */
  playerCompany?: PlayerCompanyState | null;
  /** 자산운용사·유저 ETF. 보유 좌의 NAV 평가액도 총자산·랭킹에 합산한다. */
  assetManager?: AssetManagerState | null;
}

export type GameSaveLoadResult =
  | {
      status: "loaded";
      wallet: WalletSave;
      updatedAt: number;
      revision: number;
    }
  | { status: "missing" }
  | { status: "error"; message: string };

export type GameSaveWriteResult = "saved" | "conflict" | "failed";

type GameSaveWriteRpcResponse = {
  saved?: unknown;
  conflict?: unknown;
  revision?: unknown;
};

const gameSaveRevisionByUser = new Map<string, number>();
const gameSaveGenerationByUser = new Map<string, number>();

function bumpGameSaveGeneration(userId: string): void {
  gameSaveGenerationByUser.set(
    userId,
    (gameSaveGenerationByUser.get(userId) ?? 0) + 1,
  );
}

function safeWalletRevision(value: unknown): number {
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision >= 0 ? revision : 0;
}

export function parseGameSaveWriteRpcResponse(
  value: unknown,
): { status: GameSaveWriteResult; revision: number } {
  if (!value || typeof value !== "object") {
    return { status: "failed", revision: 0 };
  }
  const response = value as GameSaveWriteRpcResponse;
  const revision = safeWalletRevision(response.revision);
  if (response.saved === true) return { status: "saved", revision };
  if (response.conflict === true) return { status: "conflict", revision };
  return { status: "failed", revision };
}

// 짧은 간격의 매매·ETF 원장 갱신이 동시에 저장되면 먼저 시작한 느린 요청이
// 나중 상태를 덮어쓸 수 있다. 브라우저 탭 안의 지갑 쓰기는 반드시 순서대로 보낸다.
let gameSaveWriteQueue: Promise<void> = Promise.resolve();

/** 로그인 유저의 지갑을 읽고, '저장 없음'과 네트워크 오류를 구분한다. */
export async function loadGameSave(): Promise<GameSaveLoadResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  if (!user) return { status: "error", message: "not authenticated" };

  const { data, error } = await supabase
    .from("game_saves")
    .select("state, updated_at, wallet_revision")
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) return { status: "error", message: error.message };
  if (!data?.state) {
    gameSaveRevisionByUser.set(user.id, 0);
    bumpGameSaveGeneration(user.id);
    return { status: "missing" };
  }
  const revision = safeWalletRevision(data.wallet_revision);
  gameSaveRevisionByUser.set(user.id, revision);
  bumpGameSaveGeneration(user.id);
  return {
    status: "loaded",
    wallet: data.state as WalletSave,
    updatedAt: new Date(data.updated_at as string).getTime(),
    revision,
  };
}

/** 현재 지갑을 저장한다 (upsert). 로그인 상태가 아니면 무시. */
export async function saveGameSave(
  wallet: WalletSave,
): Promise<GameSaveWriteResult> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return "failed";

  // 큐 대기 중 store 배열이 교체돼도 이 요청의 시점별 스냅샷은 변하지 않게 한다.
  const snapshot =
    typeof structuredClone === "function"
      ? structuredClone(wallet)
      : (JSON.parse(JSON.stringify(wallet)) as WalletSave);
  const generation = gameSaveGenerationByUser.get(userId) ?? 0;
  const write = gameSaveWriteQueue.then(
    async (): Promise<GameSaveWriteResult> => {
      // 앞선 저장이 충돌해 서버 원본을 다시 읽는 동안 큐에 남은 스냅샷도 폐기한다.
      if ((gameSaveGenerationByUser.get(userId) ?? 0) !== generation) {
        return "conflict";
      }
      const expectedRevision = gameSaveRevisionByUser.get(userId) ?? 0;
      const { data, error } = await supabase.rpc("save_game_save_cas", {
        // 대기 중 로그아웃·계정 전환이 일어나도 이전 계정 스냅샷을 새 계정에
        // 쓰지 않도록 큐에 넣는 순간의 사용자 ID를 고정한다.
        p_state: snapshot,
        p_expected_revision: expectedRevision,
      });
      if (error) {
        console.warn("[cloud-save] wallet write failed", error.message);
        return "failed";
      }
      const result = parseGameSaveWriteRpcResponse(data);
      if (result.status === "saved" || result.status === "conflict") {
        gameSaveRevisionByUser.set(userId, result.revision);
      }
      if (result.status === "conflict") {
        bumpGameSaveGeneration(userId);
      }
      return result.status;
    },
  );
  gameSaveWriteQueue = write.then(
    () => undefined,
    () => undefined,
  );
  return write;
}

/** 리더보드 한 행 (공개 읽기). 순자산·수익률·과시 요약. */
export interface LeaderboardEntry {
  userId: string;
  displayName: string;
  netWorth: number;
  /** JSON number로 변환하지 않은 DB numeric 원문. 표시·재계산의 기준값이다. */
  netWorthExact: string;
  returnRate: number;
  returnRateExact: string;
  topTier: number;
  luxuryCount: number;
  showcase: string[];
  updatedAt: number;
  weeklyReturn: number;
  weeklyReturnExact: string;
  title: string;
  tradeCount: number;
  winRate: number;
  /** 수집·경쟁 종합 점수. 백엔드 마이그레이션 전이면 0. */
  prestige: number;
}

/** 신 함수 시그니처/컬럼이 아직 배포 전인지(마이그레이션 전) 판별 */
function isMissingSchema(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = error.code ?? "";
  const message = error.message ?? "";
  return (
    code === "42883" || // undefined_function
    code === "42703" || // undefined_column
    code === "PGRST202" || // PostgREST: function not found
    code === "PGRST204" || // PostgREST: column not found
    /prestige|function|argument|column/i.test(message)
  );
}

/** 저장 성공 뒤 공개 랭킹을 다시 제출할 수 있는 최소 간격. */
export const LEADERBOARD_REFRESH_MS = 60 * 1_000;

/** 계산된 지표를 본인 리더보드 행에 upsert 한다. 로그인 상태가 아니면 무시. */
export async function syncLeaderboard(stats: {
  netWorth: number;
  netWorthExact?: string;
  returnRate: number;
  returnRateExact?: string;
  initialCash: number;
  initialCashExact?: string;
  marketSession: number;
  topTier: number;
  luxuryCount: number;
  showcase: string[];
  reputation: number;
  title: string;
  tradeCount: number;
  winRate: number;
  prestige: number;
}): Promise<boolean> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
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
  const netWorthExact = normalizeExactAmount(
    stats.netWorthExact,
    normalizeExactAmount(stats.netWorth),
  );
  const initialCashExact = normalizeExactAmount(
    stats.initialCashExact,
    normalizeExactAmount(stats.initialCash),
  );
  const expectedReturnExact =
    BigInt(initialCashExact) > 0n
      ? exactPercentChange(netWorthExact, initialCashExact, 8)
      : "NaN";
  const expectedReturn = Number(expectedReturnExact);
  const submittedReturnExact =
    stats.returnRateExact?.trim() || expectedReturnExact;
  const submittedReturn = Number(submittedReturnExact);
  // 순자산은 상한 없이 커질 수 있으므로 '안전 정수'가 아니라 '유한값'만 요구한다.
  // 정밀도 검증 오차는 값 크기에 비례해 완화한다(거액에서 float 반올림으로 오탐
  // 안 나게). DB도 numeric으로 저장하므로 Qa 이후 값을 잘라낼 필요가 없다.
  const returnTolerance = Math.max(0.05, Math.abs(expectedReturn) * 1e-4);
  if (
    BigInt(initialCashExact) <= 0n ||
    !Number.isFinite(expectedReturn) ||
    !Number.isFinite(submittedReturn) ||
    Math.abs(expectedReturn - submittedReturn) > returnTolerance ||
    !Number.isSafeInteger(stats.marketSession) ||
    stats.luxuryCount < 0 ||
    stats.luxuryCount > 100 ||
    stats.reputation < 0
  ) {
    return false;
  }

  const baseParams = {
    p_display_name: displayName,
    p_net_worth: netWorthExact,
    p_return_rate: submittedReturnExact,
    p_initial_cash: initialCashExact,
    p_market_session: stats.marketSession,
    p_top_tier: stats.topTier,
    p_luxury_count: stats.luxuryCount,
    p_showcase: stats.showcase,
    p_reputation: Math.round(stats.reputation),
    p_title: stats.title.slice(0, 30),
    p_trade_count: Math.max(0, Math.floor(stats.tradeCount)),
    p_win_rate: Number(Math.max(0, Math.min(100, stats.winRate)).toFixed(2)),
  };
  const p_prestige = Math.max(0, Math.min(100000000, Math.round(stats.prestige)));

  // text 파라미터를 받는 정밀 RPC가 numeric 캐스팅과 검증을 서버 안에서 수행한다.
  // 따라서 PostgREST JSON 디코더가 큰 수를 JS number로 바꾸는 구간 자체를 통과하지 않는다.
  let { error: rpcError } = await supabase.rpc("submit_leaderboard_precise", {
    ...baseParams,
    p_prestige,
  });
  if (rpcError && isMissingSchema(rpcError)) {
    ({ error: rpcError } = await supabase.rpc("submit_leaderboard", {
      ...baseParams,
      p_prestige,
    }));
  }
  if (rpcError && isMissingSchema(rpcError)) {
    ({ error: rpcError } = await supabase.rpc("submit_leaderboard", baseParams));
  }
  if (!rpcError) {
    window.localStorage.setItem(throttleKey, String(Date.now()));
    return true;
  }

  // 함수 자체가 없는 초기 DB만 직접 upsert로 우회한다. 검증 실패는 우회하지 않는다.
  if (!isMissingSchema(rpcError)) {
    return false;
  }

  const { error } = await supabase.from("leaderboard").upsert({
    user_id: user.id,
    display_name: displayName,
    net_worth: netWorthExact,
    return_rate: submittedReturnExact,
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

function parseLeaderboardRow(row: Record<string, unknown>): LeaderboardEntry {
  const netWorthExact = normalizeExactAmount(
    String(row.net_worth_exact ?? row.net_worth ?? "0"),
  );
  const returnRateExact = String(
    row.return_rate_exact ?? row.return_rate ?? "0",
  );
  const weeklyReturnExact = String(
    row.weekly_return_exact ?? row.weekly_return ?? "0",
  );
  return {
    userId: String(row.user_id),
    displayName: String(row.display_name),
    netWorth: exactToNumber(netWorthExact),
    netWorthExact,
    returnRate: Number(returnRateExact),
    returnRateExact,
    topTier: Number(row.top_tier),
    luxuryCount: Number(row.luxury_count),
    showcase: (row.showcase as string[]) ?? [],
    updatedAt: new Date(row.updated_at as string).getTime(),
    weeklyReturn: Number(weeklyReturnExact),
    weeklyReturnExact,
    title: String(row.title ?? ""),
    tradeCount: Number(row.trade_count ?? 0),
    winRate: Number(row.win_rate ?? 0),
    prestige: Number(row.prestige ?? 0),
  };
}

/** 순자산 상위 랭킹을 읽는다 (공개). 실패 시 빈 배열. */
export async function fetchLeaderboard(
  limit = 100,
  sort: "netWorth" | "weekly" | "prestige" = "netWorth",
): Promise<LeaderboardEntry[]> {
  const supabase = createClient();
  const precise = await supabase.rpc("get_leaderboard_exact", {
    p_limit: limit,
    p_sort: sort,
  });
  if (!precise.error && Array.isArray(precise.data)) {
    return (precise.data as Array<Record<string, unknown>>).map(
      parseLeaderboardRow,
    );
  }

  const baseCols =
    "user_id, display_name, net_worth, return_rate, weekly_return, title, trade_count, win_rate, top_tier, luxury_count, showcase, updated_at";
  const orderCol =
    sort === "weekly" ? "weekly_return" : sort === "prestige" ? "prestige" : "net_worth";

  const primary = await supabase
    .from("leaderboard")
    .select(`${baseCols}, prestige`)
    .order(orderCol, { ascending: false })
    .limit(limit);

  let rows = primary.data as Array<Record<string, unknown>> | null;
  let error = primary.error;

  // 마이그레이션 전(프레스티지 컬럼 없음)에는 컬럼을 빼고 안전 정렬로 재조회한다.
  if (error && isMissingSchema(error)) {
    const fallback = await supabase
      .from("leaderboard")
      .select(baseCols)
      .order(sort === "weekly" ? "weekly_return" : "net_worth", {
        ascending: false,
      })
      .limit(limit);
    rows = fallback.data as Array<Record<string, unknown>> | null;
    error = fallback.error;
  }

  if (error || !rows) return [];
  return rows.map(parseLeaderboardRow);
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
    data: { session },
  } = await supabase.auth.getSession();
  const user = session?.user ?? null;
  return user?.id ?? null;
}

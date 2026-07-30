import type { Trade } from "@/lib/types/market";
import type { InvestmentSeasonState } from "@/lib/market/investmentSeasons";
import type { InvestmentMasteryState } from "@/lib/market/investmentMastery";
import { replayClosedTrades } from "@/lib/market/tradeReplay";

export const ATTENDANCE_TIME_ZONE = "Asia/Seoul";
export const ATTENDANCE_BASE_REWARD = 25_000;

export interface AttendanceState {
  lastClaimDate?: string;
  streak: number;
  totalDays: number;
}

export interface TradingStats {
  tradeCount: number;
  buyCount: number;
  sellCount: number;
  closeCount: number;
  winningCloses: number;
  winRate: number;
  turnover: number;
  realizedPnl: number;
}

export interface PlayerTitleContext {
  tradeCount: number;
  attendanceStreak: number;
  attendanceTotalDays: number;
  netWorth: number;
  initialCash: number;
  seasonState: InvestmentSeasonState;
  mastery: InvestmentMasteryState;
  /** 최애(호감 만렙) 관계 수 — 수집 메타 진척도. */
  favoriteCount: number;
  achievements: string[];
}

export interface PlayerTitleDefinition {
  id: string;
  name: string;
  emoji: string;
  condition: string;
  unlocked: (context: PlayerTitleContext) => boolean;
}

export const PLAYER_TITLES: PlayerTitleDefinition[] = [
  { id: "rookie", name: "시장 신입", emoji: "🌱", condition: "기본 칭호", unlocked: () => true },
  { id: "regular", name: "꾸준한 출석 투자자", emoji: "📅", condition: "누적 출석 7일", unlocked: (c) => c.attendanceTotalDays >= 7 },
  { id: "trader", name: "백전 트레이더", emoji: "🔁", condition: "누적 거래 100회", unlocked: (c) => c.tradeCount >= 100 },
  { id: "outperformer", name: "지수의 추월자", emoji: "🏁", condition: "다이아몬드 이상 시즌 달성", unlocked: (c) => c.seasonState.history.some((s) => s.tierId === "diamond" || s.tierId === "master") },
  { id: "master", name: "투자 스타일 마스터", emoji: "🎓", condition: "숙련도 한 분야 1,200 XP", unlocked: (c) => Object.values(c.mastery.xp).some((xp) => xp >= 1_200) },
  { id: "wealth", name: "자산 설계자", emoji: "💎", condition: "순자산 2배 달성", unlocked: (c) => c.initialCash > 0 && c.netWorth >= c.initialCash * 2 },
  { id: "collector", name: "캐릭터 수집가", emoji: "🎭", condition: "최애 관계 3명", unlocked: (c) => c.favoriteCount >= 3 },
  { id: "patron", name: "인망의 오너", emoji: "👑", condition: "최애 관계 10명", unlocked: (c) => c.favoriteCount >= 10 },
  { id: "market_firefighter", name: "시장의 소방수", emoji: "🚒", condition: "공동 자본 투입으로 유동성 위기 진화", unlocked: (c) => c.achievements.includes("market_firefighter") },
  { id: "great_capitalist", name: "위대한 자본가", emoji: "🏛️", condition: "유동성 위기 진화의 최대 기여자", unlocked: (c) => c.achievements.includes("great_capitalist") },
];

export function koreaDateKey(now = Date.now()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: ATTENDANCE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const value = (type: "year" | "month" | "day") =>
    parts.find((part) => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function previousKoreaDateKey(now = Date.now()): string {
  return koreaDateKey(now - 24 * 60 * 60 * 1_000);
}

export function normalizeAttendance(value: unknown): AttendanceState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { streak: 0, totalDays: 0 };
  }
  const raw = value as Partial<AttendanceState>;
  return {
    lastClaimDate:
      typeof raw.lastClaimDate === "string" ? raw.lastClaimDate : undefined,
    streak: Math.max(0, Math.floor(Number(raw.streak) || 0)),
    totalDays: Math.max(0, Math.floor(Number(raw.totalDays) || 0)),
  };
}

export function attendanceReward(streak: number): number {
  return ATTENDANCE_BASE_REWARD + Math.min(6, Math.max(0, streak - 1)) * 5_000;
}

export function claimAttendanceState(
  input: AttendanceState,
  now = Date.now(),
): { state: AttendanceState; reward: number } | null {
  const current = normalizeAttendance(input);
  const today = koreaDateKey(now);
  if (current.lastClaimDate === today) return null;
  const streak =
    current.lastClaimDate === previousKoreaDateKey(now)
      ? current.streak + 1
      : 1;
  return {
    state: {
      lastClaimDate: today,
      streak,
      totalDays: current.totalDays + 1,
    },
    reward: attendanceReward(streak),
  };
}

export function buildTradingStats(trades: Trade[]): TradingStats {
  let buyCount = 0;
  let sellCount = 0;
  let turnover = 0;

  for (const trade of trades) {
    turnover += Math.abs(trade.total);
    if (
      trade.type === "buy" ||
      trade.type === "short" ||
      trade.type === "option_buy" ||
      trade.type === "option_write"
    ) {
      buyCount += 1;
    } else if (
      trade.type === "sell" ||
      trade.type === "cover" ||
      trade.type === "option_close" ||
      trade.type === "option_expire"
    ) {
      sellCount += 1;
    }
  }

  const closedTrades = replayClosedTrades(trades);
  const closeCount = closedTrades.length;
  const winningCloses = closedTrades.filter((trade) => trade.pnl > 0).length;
  const realizedPnl = closedTrades.reduce((sum, trade) => sum + trade.pnl, 0);

  return {
    tradeCount: trades.length,
    buyCount,
    sellCount,
    closeCount,
    winningCloses,
    winRate: closeCount > 0 ? (winningCloses / closeCount) * 100 : 0,
    turnover: Math.round(turnover),
    realizedPnl: Math.round(realizedPnl),
  };
}

export function unlockedPlayerTitles(
  context: PlayerTitleContext,
): PlayerTitleDefinition[] {
  return PLAYER_TITLES.filter((title) => title.unlocked(context));
}

export function getPlayerTitle(id: string | undefined): PlayerTitleDefinition {
  return PLAYER_TITLES.find((title) => title.id === id) ?? PLAYER_TITLES[0];
}

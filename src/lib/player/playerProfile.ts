import type { Trade } from "@/lib/types/market";
import type { InvestmentSeasonState } from "@/lib/market/investmentSeasons";
import type { InvestmentMasteryState } from "@/lib/market/investmentMastery";

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
  const longs = new Map<string, { quantity: number; average: number }>();
  const shorts = new Map<string, { quantity: number; average: number }>();
  const options = new Map<
    string,
    { quantity: number; average: number; side: "long" | "short" }
  >();
  let buyCount = 0;
  let sellCount = 0;
  let closeCount = 0;
  let winningCloses = 0;
  let turnover = 0;
  let realizedPnl = 0;

  for (let index = trades.length - 1; index >= 0; index--) {
    const trade = trades[index];
    turnover += Math.abs(trade.total);
    if (trade.type === "buy") {
      buyCount += 1;
      const position = longs.get(trade.stockId) ?? { quantity: 0, average: 0 };
      const nextQuantity = position.quantity + trade.quantity;
      position.average =
        nextQuantity > 0
          ? (position.average * position.quantity + trade.price * trade.quantity) /
            nextQuantity
          : 0;
      position.quantity = nextQuantity;
      longs.set(trade.stockId, position);
    } else if (trade.type === "sell") {
      sellCount += 1;
      const position = longs.get(trade.stockId) ?? { quantity: 0, average: 0 };
      const quantity = Math.min(position.quantity, trade.quantity);
      const pnl = (trade.price - position.average) * quantity;
      if (quantity > 0) {
        closeCount += 1;
        if (pnl > 0) winningCloses += 1;
        realizedPnl += pnl;
      }
      position.quantity = Math.max(0, position.quantity - quantity);
      longs.set(trade.stockId, position);
    } else if (trade.type === "short") {
      buyCount += 1;
      const position = shorts.get(trade.stockId) ?? { quantity: 0, average: 0 };
      const nextQuantity = position.quantity + trade.quantity;
      position.average =
        nextQuantity > 0
          ? (position.average * position.quantity + trade.price * trade.quantity) /
            nextQuantity
          : 0;
      position.quantity = nextQuantity;
      shorts.set(trade.stockId, position);
    } else if (trade.type === "cover") {
      sellCount += 1;
      const position = shorts.get(trade.stockId) ?? { quantity: 0, average: 0 };
      const quantity = Math.min(position.quantity, trade.quantity);
      const pnl = (position.average - trade.price) * quantity;
      if (quantity > 0) {
        closeCount += 1;
        if (pnl > 0) winningCloses += 1;
        realizedPnl += pnl;
      }
      position.quantity = Math.max(0, position.quantity - quantity);
      shorts.set(trade.stockId, position);
    } else if (trade.type === "option_buy" || trade.type === "option_write") {
      buyCount += 1;
      if (!trade.optionId) continue;
      const side = trade.type === "option_buy" ? "long" : "short";
      const position = options.get(trade.optionId) ?? {
        quantity: 0,
        average: 0,
        side,
      };
      const nextQuantity = position.quantity + trade.quantity;
      position.average =
        nextQuantity > 0
          ? (position.average * position.quantity + trade.price * trade.quantity) /
            nextQuantity
          : 0;
      position.quantity = nextQuantity;
      position.side = side;
      options.set(trade.optionId, position);
    } else if (trade.type === "option_close" || trade.type === "option_expire") {
      sellCount += 1;
      if (!trade.optionId) continue;
      const position = options.get(trade.optionId);
      if (!position) continue;
      const quantity = Math.min(position.quantity, trade.quantity);
      const pnl =
        (position.side === "long"
          ? trade.price - position.average
          : position.average - trade.price) * quantity;
      if (quantity > 0) {
        closeCount += 1;
        if (pnl > 0) winningCloses += 1;
        realizedPnl += pnl;
      }
      position.quantity = Math.max(0, position.quantity - quantity);
      if (position.quantity === 0) options.delete(trade.optionId);
      else options.set(trade.optionId, position);
    }
  }

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

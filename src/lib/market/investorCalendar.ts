import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  EARNINGS_INTERVAL_SESSIONS,
  isEarningsSession,
} from "@/lib/market/earningsCalendar";
import { QUARTERLY_DIVIDEND_INTERVAL_DAYS } from "@/lib/market/distributions";
import {
  amcFundStockId,
  type AmcFundState,
} from "@/lib/player/assetManager";
import type { Holding, StockState } from "@/lib/types/market";

export type InvestorCalendarEventType =
  | "earnings"
  | "dividend"
  | "meeting"
  | "amc-dividend";

export interface InvestorCalendarEvent {
  id: string;
  type: InvestorCalendarEventType;
  session: number;
  stockId: string;
  name: string;
  ticker: string;
  title: string;
  href: string;
}

const EPOCH_SESSION = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);
export const SHAREHOLDER_MEETING_INTERVAL_SESSIONS = 90;

function hashText(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function sessionsMatching(
  fromSession: number,
  toSession: number,
  predicate: (session: number) => boolean,
): number[] {
  const output: number[] = [];
  for (let session = fromSession; session <= toSession; session++) {
    if (predicate(session)) output.push(session);
  }
  return output;
}

export function shareholderMeetingOffset(stockId: string): number {
  return hashText(`meeting:${stockId}`) % SHAREHOLDER_MEETING_INTERVAL_SESSIONS;
}

export function buildInvestorCalendar(input: {
  currentSession: number;
  watchlist: readonly string[];
  holdings: readonly Holding[];
  stocks: readonly StockState[];
  amcFunds: readonly AmcFundState[];
  horizonSessions?: number;
}): InvestorCalendarEvent[] {
  const from = Math.floor(input.currentSession);
  const to = from + Math.max(1, Math.floor(input.horizonSessions ?? 90));
  const heldIds = input.holdings
    .filter((holding) => holding.quantity > 0)
    .map((holding) => holding.stockId);
  const interestedIds = new Set([...input.watchlist, ...heldIds]);
  const events: InvestorCalendarEvent[] = [];

  for (const stock of input.stocks) {
    if (!interestedIds.has(stock.id)) continue;
    const isCompany =
      stock.instrumentType === "company" ||
      (!stock.instrumentType && Boolean(stock.ceoId));

    if (isCompany) {
      for (const session of sessionsMatching(from, to, (candidate) =>
        isEarningsSession(stock.id, candidate),
      )) {
        events.push({
          id: `earnings:${stock.id}:${session}`,
          type: "earnings",
          session,
          stockId: stock.id,
          name: stock.name,
          ticker: stock.ticker,
          title: "실적 발표",
          href: `/stock/${stock.id}`,
        });
      }

      const meetingOffset = shareholderMeetingOffset(stock.id);
      for (const session of sessionsMatching(from, to, (candidate) => {
        const elapsed = candidate - EPOCH_SESSION - meetingOffset;
        return elapsed >= 0 && elapsed % SHAREHOLDER_MEETING_INTERVAL_SESSIONS === 0;
      })) {
        events.push({
          id: `meeting:${stock.id}:${session}`,
          type: "meeting",
          session,
          stockId: stock.id,
          name: stock.name,
          ticker: stock.ticker,
          title: "주주총회",
          href: `/stock/${stock.id}`,
        });
      }
    }

    if ((stock.quarterlyDividend ?? 0) > 0) {
      for (const session of sessionsMatching(from, to, (candidate) => {
        const elapsed = candidate - EPOCH_SESSION;
        return elapsed >= 0 && elapsed % QUARTERLY_DIVIDEND_INTERVAL_DAYS === 0;
      })) {
        events.push({
          id: `dividend:${stock.id}:${session}`,
          type: "dividend",
          session,
          stockId: stock.id,
          name: stock.name,
          ticker: stock.ticker,
          title: "배당 기준일",
          href: `/stock/${stock.id}`,
        });
      }
    }
  }

  for (const fund of input.amcFunds) {
    const holdingId = amcFundStockId(fund.id);
    if (
      !interestedIds.has(holdingId) &&
      !interestedIds.has(fund.id) &&
      !input.watchlist.includes(fund.id)
    ) {
      continue;
    }
    const interval = Math.max(1, fund.dividendIntervalDays);
    let session = fund.lastDividendSession + interval;
    if (session < from) {
      session += Math.ceil((from - session) / interval) * interval;
    }
    while (session <= to) {
      events.push({
        id: `amc-dividend:${fund.id}:${session}`,
        type: "amc-dividend",
        session,
        stockId: fund.id,
        name: fund.name,
        ticker: fund.ticker,
        title: "유저 ETF 분배 기준일",
        href: `/amc/trade?id=${encodeURIComponent(fund.id)}`,
      });
      session += interval;
    }
  }

  return events.sort(
    (left, right) =>
      left.session - right.session ||
      left.name.localeCompare(right.name, "ko") ||
      left.type.localeCompare(right.type),
  );
}

export function calendarEventTone(type: InvestorCalendarEventType): string {
  switch (type) {
    case "earnings":
      return "text-violet-300 bg-violet-400/10";
    case "dividend":
    case "amc-dividend":
      return "text-emerald-300 bg-emerald-400/10";
    case "meeting":
      return "text-amber-300 bg-amber-400/10";
  }
}

export function calendarIntervalLabel(): string {
  return `${EARNINGS_INTERVAL_SESSIONS}거래일 분기`;
}

import { getCompanyDefinitions } from "@/data/stocks";
import { withCharacterQuote } from "@/data/eventQuotes";
import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "@/lib/market/constants";
import { seededRand } from "@/lib/market/engine";
import type { MarketEvent, StockDefinition } from "@/lib/types/market";

export const EARNINGS_INTERVAL_SESSIONS = 20;
const EPOCH_SESSION = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);

export type EarningsResult = "beat" | "inline" | "miss";

export interface EarningsCalendarEntry {
  id: string;
  company: StockDefinition;
  session: number;
  quarter: number;
  consensusGrowthPercent: number;
  actualGrowthPercent: number;
  surprisePoint: number;
  expectedMovePercent: number;
  result: EarningsResult;
  impact: number;
}

function hashText(text: string): number {
  let hash = 2166136261;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function earningsOffsetForCompany(companyId: string): number {
  return hashText(companyId) % EARNINGS_INTERVAL_SESSIONS;
}

export function isEarningsSession(companyId: string, session: number): boolean {
  const elapsed = session - EPOCH_SESSION - earningsOffsetForCompany(companyId);
  return elapsed >= 0 && elapsed % EARNINGS_INTERVAL_SESSIONS === 0;
}

export function buildEarningsEntry(
  company: StockDefinition,
  session: number,
): EarningsCalendarEntry {
  const rand = seededRand(session, `earnings:${company.id}`);
  const consensusGrowthPercent = Number((4 + rand() * 18).toFixed(1));
  const surprisePoint = Number(((rand() + rand() + rand() - 1.5) * 10).toFixed(1));
  const actualGrowthPercent = Number(
    (consensusGrowthPercent + surprisePoint).toFixed(1),
  );
  const result: EarningsResult =
    surprisePoint >= 1.5 ? "beat" : surprisePoint <= -1.5 ? "miss" : "inline";
  const directionalImpact = Math.max(-0.075, Math.min(0.075, surprisePoint * 0.008));
  const impact = result === "inline"
    ? (surprisePoint >= 0 ? 0.008 : -0.008)
    : directionalImpact;
  const quarter = Math.floor(
    (session - EPOCH_SESSION - earningsOffsetForCompany(company.id)) /
      EARNINGS_INTERVAL_SESSIONS,
  ) + 1;

  return {
    id: `earnings-${session}-${company.id}`,
    company,
    session,
    quarter,
    consensusGrowthPercent,
    actualGrowthPercent,
    surprisePoint,
    expectedMovePercent: Number(
      Math.min(12, Math.max(3, company.volatility * 150)).toFixed(1),
    ),
    result,
    impact,
  };
}

/** 해당 거래일에 이미 상장돼 있는가(실적 발표 자격). 상장 예정(IPO)이면 제외. */
function isListedBySession(
  def: { listingEpochMs?: number },
  session: number,
): boolean {
  if (!def.listingEpochMs) return true;
  return session >= Math.floor(def.listingEpochMs / SESSION_DURATION_MS);
}

export function getEarningsForSession(session: number): EarningsCalendarEntry[] {
  return getCompanyDefinitions()
    .filter(
      (company) =>
        company.ceoId &&
        isListedBySession(company, session) &&
        isEarningsSession(company.id, session),
    )
    .map((company) => buildEarningsEntry(company, session));
}

export function getEarningsCalendar(
  fromSession: number,
  toSession: number,
): EarningsCalendarEntry[] {
  const entries: EarningsCalendarEntry[] = [];
  for (let session = fromSession; session <= toSession; session++) {
    entries.push(...getEarningsForSession(session));
  }
  return entries.sort(
    (a, b) => a.session - b.session || a.company.name.localeCompare(b.company.name, "ko"),
  );
}

export function buildEarningsEvent(entry: EarningsCalendarEntry): MarketEvent {
  const label = entry.result === "beat"
    ? "어닝 서프라이즈"
    : entry.result === "miss"
      ? "실적 쇼크"
      : "예상 부합 실적";
  const event: MarketEvent = {
    id: entry.id,
    title: `${entry.company.name}, ${label}`,
    description: `매출 성장률 ${entry.actualGrowthPercent.toFixed(1)}%로 시장 예상 ${entry.consensusGrowthPercent.toFixed(1)}%를 ${entry.surprisePoint >= 0 ? "웃돌았습니다" : "밑돌았습니다"}.`,
    affectedStockIds: [entry.company.id],
    impact: entry.impact,
    timestamp: entry.session * SESSION_DURATION_MS,
    category: "company",
    tag: "실적",
  };
  return withCharacterQuote(
    event,
    seededRand(entry.session, `earnings-quote:${entry.company.id}`),
  );
}

export function getEarningsEventsForSession(session: number): MarketEvent[] {
  return getEarningsForSession(session).map(buildEarningsEvent);
}

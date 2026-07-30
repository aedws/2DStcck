import type { StockDefinition } from "@/lib/types/market";
import {
  SESSION_DURATION_MS,
} from "@/lib/market/constants";
import {
  cycleReturnForStock,
  getMarketCycleAtSession,
} from "@/lib/market/marketCycles";
import {
  getMarketRegimeAtSession,
  regimeReturnForStock,
} from "@/lib/market/marketRegimes";
import { getMarketEra } from "@/lib/market/marketEras";
import { findUpcomingLiquidityCrisis } from "@/lib/market/liquidityCrisis";

export const INSTITUTION_POSITION_INTERVAL = 20;
export const WALL_STREET_ACCURACY = 0.8;
export const BURRY_ACCURACY = 0.01;

export interface InstitutionHolding {
  stockId: string;
  weight: number;
}

export interface MarketForecast {
  cycle: number;
  horizonSessions: number;
  direction: "up" | "down";
  warning: boolean;
  warningLeadSessions?: number;
  featuredStockIds: string[];
  statedAccuracy: number;
}

function hashIndex(seed: string, modulo: number): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % modulo;
}

/** 연속된 5개 전망 묶음마다 정확히 4개가 적중한다. */
export function wallStreetPredictionIsAccurate(cycle: number): boolean {
  const block = Math.floor(cycle / 5);
  const missAt = hashIndex(`wall-street-block:${block}`, 5);
  return ((cycle % 5) + 5) % 5 !== missAt;
}

/** 연속된 100개 전망 묶음마다 정확히 1개만 적중한다. */
export function burryPredictionIsAccurate(cycle: number): boolean {
  const block = Math.floor(cycle / 100);
  const hitAt = hashIndex(`burry-block:${block}`, 100);
  return ((cycle % 100) + 100) % 100 === hitAt;
}

/** 공개 13F. 20거래일마다 비중은 유지하되 종목 정의가 없는 경우만 제외한다. */
export function pensionFund13F(
  stocks: readonly Pick<StockDefinition, "id">[],
): InstitutionHolding[] {
  const available = new Set(stocks.map((stock) => stock.id));
  return [
    { stockId: "vnasdaq", weight: 0.3 },
    { stockId: "jbinv", weight: 0.18 },
    { stockId: "iori", weight: 0.16 },
    { stockId: "carrot", weight: 0.14 },
    { stockId: "ishmael", weight: 0.12 },
    { stockId: "gldx", weight: 0.1 },
  ].filter((holding) => available.has(holding.stockId));
}

function futureMarketDirection(session: number, horizon: number): "up" | "down" {
  const futureSession = session + horizon;
  const seconds = SESSION_DURATION_MS / 1_000;
  const era = getMarketEra(futureSession);
  const regime = getMarketRegimeAtSession(futureSession);
  const cycle = getMarketCycleAtSession(futureSession);
  const score =
    era.driftPerSecond * seconds +
    regimeReturnForStock(regime, "지수", seconds) +
    cycleReturnForStock(cycle, "지수", seconds);
  return score >= 0 ? "up" : "down";
}

function featuredStocks(
  stocks: readonly StockDefinition[],
  direction: "up" | "down",
): string[] {
  return stocks
    .filter(
      (stock) =>
        stock.instrumentType === "company" &&
        stock.leverage === undefined &&
        !stock.coveredCallUnderlyingId,
    )
    .sort((left, right) => {
      const leftScore =
        (left.drift ?? 0) * 1_000 -
        left.volatility +
        (1 - (left.beta ?? 1)) * 0.02;
      const rightScore =
        (right.drift ?? 0) * 1_000 -
        right.volatility +
        (1 - (right.beta ?? 1)) * 0.02;
      return direction === "up"
        ? rightScore - leftScore
        : leftScore - rightScore;
    })
    .slice(0, 3)
    .map((stock) => stock.id);
}

/** 5회 중 4회는 결정론적 미래 방향·위기 여부와 일치해 장기 적중률을 80%로 고정한다. */
export function wallStreetForecast(
  session: number,
  stocks: readonly StockDefinition[],
): MarketForecast {
  const cycle = Math.floor(session / INSTITUTION_POSITION_INTERVAL);
  const horizonSessions = INSTITUTION_POSITION_INTERVAL;
  const actualDirection = futureMarketDirection(session, horizonSessions);
  const accurate = wallStreetPredictionIsAccurate(cycle);
  const direction = accurate
    ? actualDirection
    : actualDirection === "up"
      ? "down"
      : "up";
  const upcoming = findUpcomingLiquidityCrisis(session, horizonSessions);
  const actualWarning = Boolean(upcoming);
  const warning = accurate ? actualWarning : !actualWarning;
  return {
    cycle,
    horizonSessions,
    direction,
    warning,
    ...(warning && upcoming
      ? { warningLeadSessions: upcoming.sessionsUntil }
      : {}),
    featuredStockIds: featuredStocks(stocks, direction),
    statedAccuracy: WALL_STREET_ACCURACY,
  };
}

/** 개발자 편향: 100회 중 1회만 실제 미래 위기 여부와 같은 신호를 낸다. */
export function burryForecast(session: number): MarketForecast {
  const cycle = Math.floor(session / INSTITUTION_POSITION_INTERVAL);
  const horizonSessions = INSTITUTION_POSITION_INTERVAL;
  const upcoming = findUpcomingLiquidityCrisis(session, horizonSessions);
  const accurate = burryPredictionIsAccurate(cycle);
  const actualWarning = Boolean(upcoming);
  return {
    cycle,
    horizonSessions,
    direction: "down",
    warning: accurate ? actualWarning : !actualWarning,
    ...(accurate && upcoming
      ? { warningLeadSessions: upcoming.sessionsUntil }
      : {}),
    featuredStockIds: [],
    statedAccuracy: BURRY_ACCURACY,
  };
}

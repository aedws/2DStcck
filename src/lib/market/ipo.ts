import type { StockDefinition } from "@/lib/types/market";
import { SIM_TICK_MS } from "@/lib/market/constants";

/**
 * IPO(신규 상장) 유틸리티.
 * listingEpochMs 가 있는 종목은 그 시각 전에는 '상장 예정'(비거래·비노출)이고,
 * 시각이 지나면 공모가로 개장해 정상 종목이 된다. 결정론 시뮬레이션은 종목별
 * 상장 틱 이후에만 그 종목을 갱신한다(그 전에는 공모가로 동결).
 */

/** 상장 틱(이 틱부터 시뮬레이션 참여). 예정이 없으면 -Infinity(항상 상장). */
export function listingTickOf(def: {
  listingEpochMs?: number;
}): number {
  if (!def.listingEpochMs) return Number.NEGATIVE_INFINITY;
  return Math.floor(def.listingEpochMs / SIM_TICK_MS);
}

/** 지금 시각 기준 상장되어 거래 가능한가. */
export function isListed(
  def: { listingEpochMs?: number },
  nowMs: number = Date.now(),
): boolean {
  return !def.listingEpochMs || nowMs >= def.listingEpochMs;
}

/** 아직 상장 전(IPO 예정)인가. */
export function isUpcomingIpo(
  def: { listingEpochMs?: number },
  nowMs: number = Date.now(),
): boolean {
  return Boolean(def.listingEpochMs) && nowMs < def.listingEpochMs!;
}

/** 상장까지 남은 ms (이미 상장이면 0). */
export function msUntilListing(
  def: { listingEpochMs?: number },
  nowMs: number = Date.now(),
): number {
  if (!def.listingEpochMs) return 0;
  return Math.max(0, def.listingEpochMs - nowMs);
}

/** 상장까지 남은 시간을 사람이 읽는 문자열로. */
export function listingCountdownLabel(
  def: { listingEpochMs?: number },
  nowMs: number = Date.now(),
): string {
  const ms = msUntilListing(def, nowMs);
  if (ms <= 0) return "상장 완료";
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) {
    const d = Math.floor(h / 24);
    return `상장까지 ${d}일 ${h % 24}시간`;
  }
  if (h >= 1) return `상장까지 ${h}시간 ${m}분`;
  return `상장까지 ${m}분`;
}

/** 방금(최근 window 내) 상장했는가 — '신규 상장' 배지용. */
export function isRecentlyListed(
  def: { listingEpochMs?: number },
  windowMs: number,
  nowMs: number = Date.now(),
): boolean {
  if (!def.listingEpochMs) return false;
  return nowMs >= def.listingEpochMs && nowMs - def.listingEpochMs < windowMs;
}

/** 정의 목록에서 상장 예정만 (상장 임박 순). */
export function upcomingIpos<T extends StockDefinition>(
  defs: T[],
  nowMs: number = Date.now(),
): T[] {
  return defs
    .filter((d) => isUpcomingIpo(d, nowMs))
    .sort((a, b) => (a.listingEpochMs ?? 0) - (b.listingEpochMs ?? 0));
}

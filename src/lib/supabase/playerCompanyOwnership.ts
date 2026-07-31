import {
  decimalToScaledInteger,
  exactQuantityAdd,
  normalizeExactQuantity,
} from "@/lib/market/exactAmount";
import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";

export interface PlayerCompanyFounderOwnershipSummary {
  stockId: string;
  currentSession: number;
  lastClosedSession: number;
  founderQuantityExact: string;
  totalSharesExact: string;
  founderOwnershipPercent: number;
  trackedShareholderCount: number;
  trackedPublicQuantityExact: string;
  eligibleVoteWeightExact: string;
  founderExpectedVotePercent: number;
}

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function parseSummary(
  row: Record<string, unknown>,
): PlayerCompanyFounderOwnershipSummary | null {
  const stockId = text(row.stock_id);
  if (!stockId) return null;
  return {
    stockId,
    currentSession: Math.floor(number(row.current_session)),
    lastClosedSession: Math.floor(number(row.last_closed_session)),
    founderQuantityExact: normalizeExactQuantity(row.founder_quantity),
    totalSharesExact: normalizeExactQuantity(row.total_shares),
    founderOwnershipPercent: number(row.founder_ownership_percent),
    trackedShareholderCount: Math.max(
      0,
      Math.floor(number(row.tracked_shareholder_count)),
    ),
    trackedPublicQuantityExact: normalizeExactQuantity(
      row.tracked_public_quantity,
    ),
    eligibleVoteWeightExact: normalizeExactQuantity(row.eligible_vote_weight),
    founderExpectedVotePercent: number(row.founder_expected_vote_percent),
  };
}

export async function getPlayerCompanyFounderOwnershipSummary(
  stockId: string,
): Promise<PlayerCompanyFounderOwnershipSummary | null> {
  const auth = await getCurrentAuth();
  if (!auth) return null;
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "get_player_company_founder_ownership_summary",
    { p_stock_id: stockId.trim().toLowerCase() },
  );
  if (error || !data) return null;
  return parseSummary(
    (Array.isArray(data) ? data[0] : data) as Record<string, unknown>,
  );
}

/** 큰 좌수도 Number 정밀도 손실 없이 지분율(%)을 계산한다. */
export function exactOwnershipPercent(
  quantity: unknown,
  totalShares: unknown,
): number {
  const quantityMicros = decimalToScaledInteger(
    normalizeExactQuantity(quantity),
    6,
  );
  const totalMicros = decimalToScaledInteger(
    normalizeExactQuantity(totalShares),
    6,
  );
  if (totalMicros <= 0n || quantityMicros <= 0n) return 0;
  const millionthPercent =
    (quantityMicros * 100_000_000n + totalMicros / 2n) / totalMicros;
  return Number(millionthPercent) / 1_000_000;
}

/**
 * 현재 계좌의 창업주 수량과 서버가 확정한 다른 장기주주의 수량을 합쳐
 * 다음 주총의 예상 단독 의결권을 계산한다.
 *
 * 서버 요약의 창업주 수량은 저장 시점보다 늦을 수 있으므로 그대로 재사용하지
 * 않고, 전체 유효 의결권에서 서버 창업주분만 뺀 뒤 현재 계좌분을 다시 더한다.
 */
export function expectedFounderVotePercent(
  localFounderQuantity: unknown,
  summary: Pick<
    PlayerCompanyFounderOwnershipSummary,
    "founderQuantityExact" | "eligibleVoteWeightExact"
  > | null,
): number {
  const founder = normalizeExactQuantity(localFounderQuantity);
  return exactOwnershipPercent(
    founder,
    adjustedFounderEligibleVoteWeight(founder, summary),
  );
}

export function adjustedFounderEligibleVoteWeight(
  localFounderQuantity: unknown,
  summary: Pick<
    PlayerCompanyFounderOwnershipSummary,
    "founderQuantityExact" | "eligibleVoteWeightExact"
  > | null,
): string {
  const founder = normalizeExactQuantity(localFounderQuantity);
  if (!summary) return founder;

  const eligibleMicros = decimalToScaledInteger(
    normalizeExactQuantity(summary.eligibleVoteWeightExact),
    6,
  );
  const serverFounderMicros = decimalToScaledInteger(
    normalizeExactQuantity(summary.founderQuantityExact),
    6,
  );
  const otherEligibleMicros =
    eligibleMicros > serverFounderMicros
      ? eligibleMicros - serverFounderMicros
      : 0n;
  const otherWhole = otherEligibleMicros / 1_000_000n;
  const otherFraction = otherEligibleMicros % 1_000_000n;
  const otherEligible =
    otherFraction === 0n
      ? String(otherWhole)
      : `${otherWhole}.${String(otherFraction).padStart(6, "0")}`;
  return exactQuantityAdd(founder, otherEligible);
}

/** 최대 소수 6자리 좌수를 천 단위 구분 기호와 함께 표시한다. */
export function formatExactShareQuantity(value: unknown): string {
  const normalized = normalizeExactQuantity(value);
  const negative = normalized.startsWith("-");
  const unsigned = negative ? normalized.slice(1) : normalized;
  const [whole = "0", fraction = ""] = unsigned.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${negative ? "-" : ""}${grouped}${
    fraction ? `.${fraction}` : ""
  }`;
}

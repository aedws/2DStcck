import {
  PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
  PLAYER_COMPANY_FOUNDING_RATE,
  PLAYER_COMPANY_INITIAL_SHARES,
  PLAYER_COMPANY_MIN_NET_WORTH,
  type PlayerCompanyState,
} from "@/lib/player/playerCompany";
import {
  AMC_FOUNDING_BURN,
  type AssetManagerState,
} from "@/lib/player/assetManager";
import type { CashPayment } from "@/lib/types/market";
import type { CompanyFoundationRequest } from "@/lib/supabase/companyFoundationRequests";
import type { AmcFoundationRequest } from "@/lib/supabase/amcFoundationRequests";
import {
  reconcileOwnedListingRequestsIntoManager,
  type AmcEtfListingRequest,
} from "@/lib/supabase/amcEtfListingRequests";

export interface RecoveredServerEntity<T> {
  entity: T;
  requestId: string;
  shouldMarkShipped: boolean;
}

const timestampOf = (value: string, fallback: number) => {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const burnedAmount = (payment: CashPayment | undefined, fallback: number) =>
  payment && Number.isFinite(payment.amount) && payment.amount < 0
    ? Math.abs(payment.amount)
    : fallback;

/**
 * 클라우드 지갑에서 회사 객체만 유실된 경우, 서버 신청 기록과 현금 소각 기록을
 * 조합해 재구성한다. `accepted`만으로는 아직 사용자가 설립을 확정하지 않았을 수
 * 있으므로, 레거시 설립 결제 기록이 있거나 서버 상태가 `shipped`인 경우에만 복구한다.
 */
export function recoverPlayerCompanyFromServerRecords(
  requests: readonly CompanyFoundationRequest[],
  cashPayments: readonly CashPayment[],
  currentSession: number,
  now = Date.now(),
): RecoveredServerEntity<PlayerCompanyState> | null {
  for (const request of requests) {
    if (!['accepted', 'shipped'].includes(request.status)) continue;
    const foundingPayment = cashPayments.find(
      (payment) =>
        payment.kind === "company_capital" &&
        payment.id.startsWith("company-founding-") &&
        payment.ticker?.toUpperCase() === request.company.ticker.toUpperCase(),
    );
    if (request.status !== "shipped" && !foundingPayment) continue;

    const foundedAt = foundingPayment?.timestamp ?? timestampOf(request.updatedAt, now);
    const foundedSession = foundingPayment?.dueSession ?? currentSession;
    const foundingCost = burnedAmount(
      foundingPayment,
      Math.round(PLAYER_COMPANY_MIN_NET_WORTH * PLAYER_COMPANY_FOUNDING_RATE),
    );
    const companyId =
      foundingPayment?.sourceId || `player-company-restored-${request.id}`;
    const laterCapitalPayments = cashPayments.filter(
      (payment) =>
        payment.kind === "company_capital" &&
        payment.sourceId === companyId &&
        payment.id !== foundingPayment?.id &&
        payment.amount < 0,
    );
    const lastCapitalSession = laterCapitalPayments.reduce(
      (latest, payment) => Math.max(latest, payment.dueSession),
      foundedSession,
    );
    const cumulativeCapitalBurned = laterCapitalPayments.reduce(
      (total, payment) => total + Math.abs(payment.amount),
      foundingCost,
    );

    return {
      requestId: request.id,
      shouldMarkShipped: request.status === "accepted",
      entity: {
        id: companyId,
        ...request.company,
        ticker: request.company.ticker.toUpperCase(),
        status: "active",
        foundedAt,
        foundedSession,
        foundingNetWorth: Math.round(foundingCost / PLAYER_COMPANY_FOUNDING_RATE),
        foundingCost,
        cumulativeCapitalBurned,
        totalShares: PLAYER_COMPANY_INITIAL_SHARES,
        founderShares: PLAYER_COMPANY_INITIAL_SHARES,
        publicShares: 0,
        fundedRounds: laterCapitalPayments.length,
        dilutionRounds: 0,
        refusedRounds: 0,
        lastCapitalRoundSession: lastCapitalSession,
        nextCapitalRoundSession:
          Math.max(currentSession, lastCapitalSession) +
          PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
        pendingCapitalCall: null,
        lastActionAt: Math.max(
          foundedAt,
          ...laterCapitalPayments.map((payment) => payment.timestamp),
        ),
      },
    };
  }
  return null;
}

/**
 * 운용사 객체가 사라졌어도 설립 완료 상태, 설립 결제, 또는 그 운용사의 ETF 신청
 * 기록 중 하나가 남아 있으면 운용사와 펀드 카드를 서버 기록에서 함께 복원한다.
 */
export function recoverAssetManagerFromServerRecords(
  requests: readonly AmcFoundationRequest[],
  listingRequests: readonly AmcEtfListingRequest[],
  cashPayments: readonly CashPayment[],
  currentSession: number,
  now = Date.now(),
): RecoveredServerEntity<AssetManagerState> | null {
  const foundingPayment = cashPayments.find(
    (payment) =>
      payment.kind === "amc_capital" && payment.id.startsWith("amc-founding-"),
  );

  for (const request of requests) {
    if (!['accepted', 'shipped'].includes(request.status)) continue;
    const ownedListings = listingRequests.filter(
      (listing) =>
        listing.status !== "rejected" &&
        listing.payload.managerName === request.company.name,
    );
    if (
      request.status !== "shipped" &&
      !foundingPayment &&
      ownedListings.length === 0
    ) {
      continue;
    }

    const foundedAt = foundingPayment?.timestamp ?? timestampOf(request.updatedAt, now);
    const foundedSession = foundingPayment?.dueSession ?? currentSession;
    const managerId = foundingPayment?.sourceId || `amc-restored-${request.id}`;
    const cumulativeBurned = cashPayments
      .filter(
        (payment) =>
          payment.kind === "amc_capital" &&
          payment.amount < 0 &&
          payment.timestamp >= foundedAt,
      )
      .reduce((total, payment) => total + Math.abs(payment.amount), 0);
    const manager: AssetManagerState = {
      id: managerId,
      ...request.company,
      foundedAt,
      foundedSession,
      foundingBurn: burnedAmount(foundingPayment, AMC_FOUNDING_BURN),
      cumulativeBurned: Math.max(AMC_FOUNDING_BURN, cumulativeBurned),
      approvalRequestId: request.id,
      funds: [],
      lastActionAt: Math.max(
        foundedAt,
        ...ownedListings.map((listing) => timestampOf(listing.updatedAt, foundedAt)),
      ),
    };
    return {
      requestId: request.id,
      shouldMarkShipped: request.status === "accepted",
      entity: reconcileOwnedListingRequestsIntoManager(manager, ownedListings),
    };
  }
  return null;
}

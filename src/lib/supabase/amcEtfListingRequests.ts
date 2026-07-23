import {
  normalizeAmcDividendInterval,
  normalizeAmcShareAdjustmentRatio,
  type AmcDividendIntervalDays,
  type AmcFundState,
  type AmcFundStyle,
  type AmcHoldingWeight,
  type AssetManagerState,
} from "@/lib/player/assetManager";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { createClient } from "@/lib/supabase/client";
import {
  getCurrentAuth,
  type StockRequestRow,
  type StockRequestStatus,
  type SubmitResult,
  completeOwnSpecialStockRequest,
} from "@/lib/supabase/stockRequests";

export const AMC_ETF_LISTING_REQUEST_MARKER = "[AMC_ETF_LISTING]" as const;

export const AMC_ETF_LISTING_STATUS_LABEL: Record<StockRequestStatus, string> = {
  pending: "상장 대기",
  reviewing: "심사 중",
  accepted: "상장 허가",
  rejected: "반려",
  shipped: "상장 완료",
};

export interface AmcEtfListingPayload {
  fundId: string;
  ticker: string;
  style: AmcFundStyle;
  feeRate: number;
  benchmarkStockId?: string;
  holdings: AmcHoldingWeight[];
  basketPriceFactor?: number;
  seedNavValue: number;
  totalShares: number;
  managerName: string;
  managerTagline: string;
  dividendIntervalDays: AmcDividendIntervalDays;
  dividendRate: number;
  splitTriggerPrice?: number;
  splitRatio?: number;
  reverseSplitTriggerPrice?: number;
  reverseSplitRatio?: number;
}

export interface AmcEtfListingRequest {
  id: string;
  userId: string;
  gameId: string;
  status: StockRequestStatus;
  fundName: string;
  payload: AmcEtfListingPayload;
  adminNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export function serializeAmcEtfListingRequest(
  fund: AmcFundState,
  manager: AssetManagerState,
): string {
  const payload: AmcEtfListingPayload = {
    fundId: fund.id,
    ticker: fund.ticker,
    style: fund.style,
    feeRate: fund.feeRate,
    ...(fund.benchmarkStockId
      ? { benchmarkStockId: fund.benchmarkStockId }
      : {}),
    holdings: fund.holdings,
    basketPriceFactor: fund.basketPriceFactor,
    seedNavValue: fund.seedNavValue,
    totalShares: fund.totalShares,
    managerName: manager.name,
    managerTagline: manager.tagline,
    dividendIntervalDays: fund.dividendIntervalDays,
    dividendRate: fund.dividendRate,
    ...(fund.splitTriggerPrice
      ? {
          splitTriggerPrice: fund.splitTriggerPrice,
          splitRatio: fund.splitRatio,
        }
      : {}),
    ...(fund.reverseSplitTriggerPrice
      ? {
          reverseSplitTriggerPrice: fund.reverseSplitTriggerPrice,
          reverseSplitRatio: fund.reverseSplitRatio,
        }
      : {}),
  };
  return `${AMC_ETF_LISTING_REQUEST_MARKER}\n${JSON.stringify(payload)}`;
}

export function parseAmcEtfListingRequest(
  row: StockRequestRow,
): AmcEtfListingRequest | null {
  const raw = row.description ?? "";
  if (!raw.startsWith(AMC_ETF_LISTING_REQUEST_MARKER)) return null;
  try {
    const payload = JSON.parse(
      raw.slice(AMC_ETF_LISTING_REQUEST_MARKER.length).trim(),
    ) as Partial<AmcEtfListingPayload>;
    const fundId = typeof payload.fundId === "string" ? payload.fundId.trim() : "";
    const ticker =
      typeof payload.ticker === "string"
        ? payload.ticker.trim().toUpperCase()
        : "";
    if (!fundId || !/^[A-Z0-9]{2,6}$/.test(ticker) || !row.name?.trim()) {
      return null;
    }
    const style: AmcFundStyle =
      payload.style === "passive" ? "passive" : "active";
    const holdings = Array.isArray(payload.holdings)
      ? payload.holdings
          .map((row) => {
            if (!row || typeof row !== "object") return null;
            const stockId =
              typeof row.stockId === "string" ? row.stockId.trim() : "";
            const weight = Number(row.weight);
            if (!stockId || !Number.isFinite(weight) || weight <= 0) return null;
            const basePrice = Number(row.basePrice);
            return {
              stockId,
              weight,
              ...(Number.isFinite(basePrice) && basePrice > 0
                ? { basePrice }
                : {}),
            };
          })
          .filter((row): row is AmcHoldingWeight => row !== null)
      : [];
    if (holdings.length < 3) return null;
    return {
      id: row.id,
      userId: row.user_id,
      gameId: row.game_id,
      status: row.status,
      fundName: row.name.trim(),
      payload: {
        fundId,
        ticker,
        style,
        feeRate: Number(payload.feeRate) || 0,
        ...(typeof payload.benchmarkStockId === "string" &&
        payload.benchmarkStockId
          ? { benchmarkStockId: payload.benchmarkStockId }
          : {}),
        holdings,
        basketPriceFactor:
          Number.isFinite(Number(payload.basketPriceFactor)) &&
          Number(payload.basketPriceFactor) > 0
            ? Number(payload.basketPriceFactor)
            : 1,
        seedNavValue: Math.max(0, Math.round(Number(payload.seedNavValue) || 0)),
        totalShares: Math.max(1, Number(payload.totalShares) || 1),
        managerName:
          typeof payload.managerName === "string"
            ? payload.managerName.trim().slice(0, 40)
            : "",
        managerTagline:
          typeof payload.managerTagline === "string"
            ? payload.managerTagline.trim().slice(0, 80)
            : "",
        dividendIntervalDays: normalizeAmcDividendInterval(
          payload.dividendIntervalDays,
          60,
        ),
        dividendRate: Math.max(0, Number(payload.dividendRate) || 0),
        ...(Number(payload.splitTriggerPrice) > 0
          ? {
              splitTriggerPrice: Math.round(Number(payload.splitTriggerPrice)),
              splitRatio: normalizeAmcShareAdjustmentRatio(payload.splitRatio),
            }
          : {}),
        ...(Number(payload.reverseSplitTriggerPrice) > 0
          ? {
              reverseSplitTriggerPrice: Math.round(
                Number(payload.reverseSplitTriggerPrice),
              ),
              reverseSplitRatio: normalizeAmcShareAdjustmentRatio(
                payload.reverseSplitRatio,
              ),
            }
          : {}),
      },
      adminNote: row.admin_note,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  } catch {
    return null;
  }
}

export function isAmcEtfListingRequestRow(row: StockRequestRow): boolean {
  return parseAmcEtfListingRequest(row) !== null;
}

/** 상장 신청 페이로드로 지갑에서 사라진 펀드를 복구한다. */
export function listingRequestToAmcState(
  request: AmcEtfListingRequest,
): AmcFundState {
  const payload = request.payload;
  const createdAt = Date.parse(request.createdAt) || Date.now();
  const createdSession = Math.floor(createdAt / SESSION_DURATION_MS);
  return {
    id: payload.fundId,
    name: request.fundName.slice(0, 40),
    ticker: payload.ticker,
    style: payload.style,
    status: "active",
    feeRate: payload.feeRate,
    ...(payload.benchmarkStockId
      ? { benchmarkStockId: payload.benchmarkStockId }
      : {}),
    holdings: payload.holdings,
    basketPriceFactor: payload.basketPriceFactor ?? 1,
    totalShares: payload.totalShares,
    seedNavValue: payload.seedNavValue,
    createdAt,
    createdSession,
    lastFeeSession: createdSession,
    lastRebalanceSession: createdSession,
    dividendIntervalDays: payload.dividendIntervalDays,
    dividendRate: payload.dividendRate,
    lastDividendSession: createdSession,
    cumulativeDividendsPaid: 0,
    dividendHistory: [],
    graceStartedSession: null,
    navHistory: [],
    cumulativeFeesPaid: 0,
    ...(payload.splitTriggerPrice
      ? {
          splitTriggerPrice: payload.splitTriggerPrice,
          splitRatio: normalizeAmcShareAdjustmentRatio(payload.splitRatio),
        }
      : {}),
    ...(payload.reverseSplitTriggerPrice
      ? {
          reverseSplitTriggerPrice: payload.reverseSplitTriggerPrice,
          reverseSplitRatio: normalizeAmcShareAdjustmentRatio(
            payload.reverseSplitRatio,
          ),
        }
      : {}),
    shareMultiplier: 1,
    listingRequestId: request.id,
  };
}

export function reconcileOwnedListingRequestsIntoManager(
  manager: AssetManagerState,
  requests: AmcEtfListingRequest[],
): AssetManagerState {
  if (!requests.length) return manager;
  const existing = new Set(manager.funds.map((fund) => fund.id));
  const restored: AmcFundState[] = [];
  for (const request of requests) {
    if (existing.has(request.payload.fundId)) continue;
    if (request.status === "rejected") continue;
    restored.push(listingRequestToAmcState(request));
    existing.add(request.payload.fundId);
  }
  if (!restored.length) return manager;
  return {
    ...manager,
    funds: [...manager.funds, ...restored],
    lastActionAt: Date.now(),
  };
}

export async function submitAmcEtfListingRequest(
  fund: AmcFundState,
  manager: AssetManagerState,
): Promise<SubmitResult & { requestId?: string }> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 상장 신청할 수 있습니다." };
  }
  const existing = await listMyAmcEtfListingRequests();
  if (
    existing.some(
      (request) =>
        request.payload.fundId === fund.id &&
        ["pending", "reviewing", "accepted"].includes(request.status),
    )
  ) {
    return {
      success: false,
      message: "이미 심사 중이거나 허가된 상장 신청이 있습니다.",
    };
  }
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_requests")
    .insert({
      user_id: auth.userId,
      game_id: auth.gameId,
      sector: "유저ETF",
      name: fund.name.slice(0, 60),
      description: serializeAmcEtfListingRequest(fund, manager),
      reference_url: null,
      cost_paid: 0,
    })
    .select("*")
    .single();
  if (error) {
    if (
      error.message?.includes("stock_request_cooldown") ||
      (error as { hint?: string }).hint?.includes("쿨다운")
    ) {
      return {
        success: false,
        message: "상장 신청 쿨다운이 아직 남았습니다.",
        cooldown: true,
      };
    }
    return {
      success: false,
      message: "상장 신청 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.",
    };
  }
  return {
    success: true,
    message: "ETF 상장 허가 신청이 접수되었습니다.",
    requestId: (data as StockRequestRow).id,
  };
}

export async function listMyAmcEtfListingRequests(): Promise<
  AmcEtfListingRequest[]
> {
  const auth = await getCurrentAuth();
  if (!auth) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_requests")
    .select("*")
    .eq("user_id", auth.userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error || !data) return [];
  return (data as StockRequestRow[])
    .map(parseAmcEtfListingRequest)
    .filter((request): request is AmcEtfListingRequest => request !== null);
}

export async function verifyAmcEtfListingApproval(
  requestId: string,
  fund: AmcFundState,
): Promise<boolean> {
  const auth = await getCurrentAuth();
  if (!auth) return false;
  const supabase = createClient();
  const { data, error } = await supabase
    .from("stock_requests")
    .select("*")
    .eq("id", requestId)
    .eq("user_id", auth.userId)
    .eq("status", "accepted")
    .maybeSingle();
  if (error || !data) return false;
  const approved = parseAmcEtfListingRequest(data as StockRequestRow);
  if (!approved) return false;
  return (
    approved.payload.fundId === fund.id &&
    approved.payload.ticker === fund.ticker &&
    approved.fundName === fund.name
  );
}

export async function markAmcEtfListingShipped(
  requestId: string,
): Promise<boolean> {
  return completeOwnSpecialStockRequest(requestId);
}

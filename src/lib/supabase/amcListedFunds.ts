import {
  type AmcDividendIntervalDays,
  type AmcDividendPoint,
  type AmcFundState,
  type AmcFundStatus,
  type AmcFundStyle,
  type AmcHoldingWeight,
  type AssetManagerState,
  type UpdateAmcShareAdjustmentInput,
  normalizeAmcDividendInterval,
  normalizeAmcShareAdjustmentRatio,
  normalizeWeightsSafe,
} from "@/lib/player/assetManager";
import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";

export interface ListedAmcFund {
  id: string;
  managerUserId: string;
  managerGameId: string;
  managerName: string;
  managerTagline: string;
  managerDetail?: string;
  name: string;
  ticker: string;
  style: AmcFundStyle;
  feeRate: number;
  benchmarkStockId?: string;
  comparisonStockId?: string;
  holdings: AmcHoldingWeight[];
  basketPriceFactor?: number;
  totalShares: number;
  seedNavValue: number;
  status: AmcFundStatus;
  lastFeeSession: number;
  lastRebalanceSession: number;
  graceStartedSession: number | null;
  createdSession: number;
  cumulativeFeesPaid: number;
  dividendIntervalDays: AmcDividendIntervalDays;
  dividendRate: number;
  lastDividendSession: number;
  cumulativeDividendsPaid: number;
  dividendHistory: AmcDividendPoint[];
  splitTriggerPrice?: number;
  splitRatio?: number;
  reverseSplitTriggerPrice?: number;
  reverseSplitRatio?: number;
  shareMultiplier?: number;
  lastShareAdjustmentSession?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AmcLedgerPosition {
  fundId: string;
  quantity: number;
}

export interface AmcLedgerSnapshot {
  balance: number;
  revision: number;
  positions: AmcLedgerPosition[];
  trades: AmcLedgerTrade[];
  payments: AmcLedgerPayment[];
}

export interface AmcLedgerTrade {
  id: string;
  fundId: string;
  delta: number;
  navPerShare: number;
  total: number;
  createdAt: number;
}

export interface AmcLedgerPayment {
  eventId: number;
  fundId: string;
  ticker: string;
  kind: "management_fee" | "dividend" | "delist";
  dueSession: number;
  quantity: number;
  perShare: number;
  amount: number;
  createdAt: number;
}

export interface AmcLedgerTradeResult {
  success: boolean;
  message: string;
  fund?: ListedAmcFund;
  position?: number;
  navPerShare?: number;
  total?: number;
  cashDelta?: number;
  ledgerBalance?: number;
  ledgerRevision?: number;
}

interface AmcListedFundRow {
  id: string;
  manager_user_id: string;
  manager_game_id: string;
  manager_name: string;
  manager_tagline: string;
  manager_detail: string | null;
  name: string;
  ticker: string;
  style: string;
  fee_rate: number;
  benchmark_stock_id: string | null;
  comparison_stock_id?: string | null;
  holdings: unknown;
  basket_price_factor?: number | null;
  total_shares: number;
  seed_nav_value: number;
  status: string;
  last_fee_session: number;
  last_rebalance_session: number;
  grace_started_session: number | null;
  created_session: number;
  cumulative_fees_paid: number;
  dividend_interval_days?: number | null;
  dividend_rate?: number | null;
  last_dividend_session?: number | null;
  cumulative_dividends_paid?: number | null;
  dividend_history?: unknown;
  split_trigger_price?: number | null;
  split_ratio?: number | null;
  reverse_split_trigger_price?: number | null;
  reverse_split_ratio?: number | null;
  share_multiplier?: number | null;
  last_share_adjustment_session?: number | null;
  created_at: string;
  updated_at: string;
}

function parseHoldings(value: unknown): AmcHoldingWeight[] | null {
  if (!Array.isArray(value)) return null;
  const rows = value
    .map((row) => {
      if (!row || typeof row !== "object") return null;
      const item = row as {
        stockId?: unknown;
        stock_id?: unknown;
        weight?: unknown;
        basePrice?: unknown;
        base_price?: unknown;
      };
      const stockIdRaw = item.stockId ?? item.stock_id;
      const stockId = typeof stockIdRaw === "string" ? stockIdRaw.trim() : "";
      const weight = Number(item.weight);
      if (!stockId || !Number.isFinite(weight) || weight <= 0) return null;
      const basePrice = Number(item.basePrice ?? item.base_price);
      return {
        stockId,
        weight,
        ...(Number.isFinite(basePrice) && basePrice > 0 ? { basePrice } : {}),
      };
    })
    .filter((row): row is AmcHoldingWeight => row !== null);
  return normalizeWeightsSafe(rows);
}

function parseDividendHistory(value: unknown): AmcDividendPoint[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((point) => {
      if (!point || typeof point !== "object") return null;
      const row = point as {
        session?: unknown;
        perShare?: unknown;
        total?: unknown;
        shareMultiplier?: unknown;
      };
      const session = Math.floor(Number(row.session));
      const perShare = Math.floor(Number(row.perShare));
      const total = Math.round(Number(row.total));
      if (!Number.isFinite(session) || perShare <= 0 || total <= 0) return null;
      const shareMultiplier = Math.max(
        0.000001,
        Number(row.shareMultiplier) || 1,
      );
      return { session, perShare, total, shareMultiplier };
    })
    .filter((point): point is NonNullable<typeof point> => point !== null)
    .slice(-240);
}

export function parseListedAmcFundRow(
  row: AmcListedFundRow,
): ListedAmcFund | null {
  const holdings = parseHoldings(row.holdings);
  if (!holdings) return null;
  const style: AmcFundStyle = row.style === "passive" ? "passive" : "active";
  const status: AmcFundStatus =
    row.status === "grace" || row.status === "delisted" ? row.status : "active";
  const ticker = String(row.ticker ?? "")
    .trim()
    .toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(ticker)) return null;
  const name = String(row.name ?? "").trim();
  if (name.length < 2) return null;
  return {
    id: row.id,
    managerUserId: row.manager_user_id,
    managerGameId: row.manager_game_id,
    managerName: String(row.manager_name ?? "").trim().slice(0, 40) || "운용사",
    managerTagline: String(row.manager_tagline ?? "")
      .trim()
      .slice(0, 80),
    ...(row.manager_detail?.trim()
      ? { managerDetail: row.manager_detail.trim().slice(0, 500) }
      : {}),
    name: name.slice(0, 40),
    ticker,
    style,
    feeRate: Number(row.fee_rate) || 0,
    ...(style === "active" && row.benchmark_stock_id
      ? { benchmarkStockId: row.benchmark_stock_id }
      : {}),
    ...(row.comparison_stock_id
      ? { comparisonStockId: row.comparison_stock_id }
      : {}),
    holdings,
    basketPriceFactor:
      Number.isFinite(Number(row.basket_price_factor)) &&
      Number(row.basket_price_factor) > 0
        ? Number(row.basket_price_factor)
        : 1,
    totalShares: Math.max(1, Number(row.total_shares) || 1),
    seedNavValue: Math.max(0, Math.round(Number(row.seed_nav_value) || 0)),
    status,
    lastFeeSession: Math.floor(Number(row.last_fee_session) || 0),
    lastRebalanceSession: Math.floor(Number(row.last_rebalance_session) || 0),
    graceStartedSession:
      row.grace_started_session == null
        ? null
        : Math.floor(Number(row.grace_started_session) || 0),
    createdSession: Math.floor(Number(row.created_session) || 0),
    cumulativeFeesPaid: Math.max(
      0,
      Math.round(Number(row.cumulative_fees_paid) || 0),
    ),
    dividendIntervalDays: normalizeAmcDividendInterval(
      row.dividend_interval_days,
      60,
    ),
    dividendRate: Math.max(0, Number(row.dividend_rate) || 0),
    lastDividendSession: Math.floor(
      Number(row.last_dividend_session ?? row.created_session) || 0,
    ),
    cumulativeDividendsPaid: Math.max(
      0,
      Math.round(Number(row.cumulative_dividends_paid) || 0),
    ),
    dividendHistory: parseDividendHistory(row.dividend_history),
    ...(Number(row.split_trigger_price) > 0
      ? { splitTriggerPrice: Math.round(Number(row.split_trigger_price)) }
      : {}),
    splitRatio: normalizeAmcShareAdjustmentRatio(row.split_ratio),
    ...(Number(row.reverse_split_trigger_price) > 0
      ? {
          reverseSplitTriggerPrice: Math.round(
            Number(row.reverse_split_trigger_price),
          ),
        }
      : {}),
    reverseSplitRatio: normalizeAmcShareAdjustmentRatio(
      row.reverse_split_ratio,
    ),
    shareMultiplier: Math.max(0.000001, Number(row.share_multiplier) || 1),
    ...(row.last_share_adjustment_session != null
      ? {
          lastShareAdjustmentSession: Math.floor(
            Number(row.last_share_adjustment_session) || 0,
          ),
        }
      : {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listedFundToAmcState(fund: ListedAmcFund): AmcFundState {
  return {
    id: fund.id,
    name: fund.name,
    ticker: fund.ticker,
    style: fund.style,
    status: fund.status,
    feeRate: fund.feeRate,
    ...(fund.benchmarkStockId
      ? { benchmarkStockId: fund.benchmarkStockId }
      : {}),
    ...(fund.comparisonStockId
      ? { comparisonStockId: fund.comparisonStockId }
      : {}),
    holdings: fund.holdings,
    basketPriceFactor: fund.basketPriceFactor ?? 1,
    totalShares: fund.totalShares,
    seedNavValue: fund.seedNavValue,
    createdAt: Date.parse(fund.createdAt) || Date.now(),
    createdSession: fund.createdSession,
    lastFeeSession: fund.lastFeeSession,
    lastRebalanceSession: fund.lastRebalanceSession,
    dividendIntervalDays: fund.dividendIntervalDays,
    dividendRate: fund.dividendRate,
    lastDividendSession: fund.lastDividendSession,
    cumulativeDividendsPaid: fund.cumulativeDividendsPaid,
    dividendHistory: fund.dividendHistory,
    graceStartedSession: fund.graceStartedSession,
    navHistory: [],
    cumulativeFeesPaid: fund.cumulativeFeesPaid,
    ...(fund.splitTriggerPrice
      ? {
          splitTriggerPrice: fund.splitTriggerPrice,
          splitRatio: normalizeAmcShareAdjustmentRatio(fund.splitRatio),
        }
      : {}),
    ...(fund.reverseSplitTriggerPrice
      ? {
          reverseSplitTriggerPrice: fund.reverseSplitTriggerPrice,
          reverseSplitRatio: normalizeAmcShareAdjustmentRatio(
            fund.reverseSplitRatio,
          ),
        }
      : {}),
    shareMultiplier: fund.shareMultiplier ?? 1,
    ...(fund.lastShareAdjustmentSession != null
      ? { lastShareAdjustmentSession: fund.lastShareAdjustmentSession }
      : {}),
  };
}

function fundToRow(
  fund: AmcFundState,
  manager: AssetManagerState,
  auth: { userId: string; gameId: string },
): Omit<AmcListedFundRow, "created_at" | "updated_at"> & {
  updated_at?: string;
} {
  return {
    id: fund.id,
    manager_user_id: auth.userId,
    manager_game_id: auth.gameId,
    manager_name: manager.name.slice(0, 40),
    manager_tagline: manager.tagline.slice(0, 80),
    manager_detail: manager.detail?.slice(0, 500) ?? null,
    name: fund.name.slice(0, 40),
    ticker: fund.ticker,
    style: fund.style,
    fee_rate: fund.feeRate,
    benchmark_stock_id: fund.benchmarkStockId ?? null,
    comparison_stock_id: fund.comparisonStockId ?? null,
    holdings: fund.holdings,
    basket_price_factor: fund.basketPriceFactor ?? 1,
    total_shares: fund.totalShares,
    seed_nav_value: fund.seedNavValue,
    status: fund.status,
    last_fee_session: fund.lastFeeSession,
    last_rebalance_session: fund.lastRebalanceSession,
    grace_started_session: fund.graceStartedSession,
    created_session: fund.createdSession,
    cumulative_fees_paid: fund.cumulativeFeesPaid,
    dividend_interval_days: fund.dividendIntervalDays,
    dividend_rate: fund.dividendRate,
    last_dividend_session: fund.lastDividendSession,
    cumulative_dividends_paid: fund.cumulativeDividendsPaid,
    dividend_history: fund.dividendHistory,
    split_trigger_price: fund.splitTriggerPrice ?? null,
    split_ratio: normalizeAmcShareAdjustmentRatio(fund.splitRatio),
    reverse_split_trigger_price: fund.reverseSplitTriggerPrice ?? null,
    reverse_split_ratio: normalizeAmcShareAdjustmentRatio(
      fund.reverseSplitRatio,
    ),
    share_multiplier: Math.max(0.000001, fund.shareMultiplier ?? 1),
    last_share_adjustment_session: fund.lastShareAdjustmentSession ?? null,
  };
}

export async function fetchLiveListedAmcFunds(): Promise<ListedAmcFund[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("amc_listed_funds")
    .select("*")
    .neq("status", "delisted")
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error || !data) {
    console.warn("[amcListedFunds] fetch live failed", error?.message);
    return [];
  }
  return (data as AmcListedFundRow[])
    .map(parseListedAmcFundRow)
    .filter((row): row is ListedAmcFund => row !== null);
}

/** 내가 운용하는 상장 ETF — live 200건 밖이어도 빠지지 않게 별도 조회. */
export async function fetchListedAmcFundsByManager(
  managerUserId: string,
): Promise<ListedAmcFund[]> {
  if (!managerUserId) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("amc_listed_funds")
    .select("*")
    .eq("manager_user_id", managerUserId)
    .neq("status", "delisted")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error || !data) {
    console.warn("[amcListedFunds] fetch by manager failed", error?.message);
    return [];
  }
  return (data as AmcListedFundRow[])
    .map(parseListedAmcFundRow)
    .filter((row): row is ListedAmcFund => row !== null);
}

export async function fetchListedAmcFundsByIds(
  ids: string[],
): Promise<ListedAmcFund[]> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (!unique.length) return [];
  const supabase = createClient();
  const { data, error } = await supabase
    .from("amc_listed_funds")
    .select("*")
    .in("id", unique);
  if (error || !data) {
    console.warn("[amcListedFunds] fetch by ids failed", error?.message);
    return [];
  }
  return (data as AmcListedFundRow[])
    .map(parseListedAmcFundRow)
    .filter((row): row is ListedAmcFund => row !== null);
}

export async function publishAmcListedFund(
  fund: AmcFundState,
  manager: AssetManagerState,
): Promise<{ success: boolean; message: string; fund?: ListedAmcFund }> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 상장할 수 있습니다." };
  }
  const supabase = createClient();
  const payload = {
    ...fundToRow(fund, manager, auth),
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase
    .from("amc_listed_funds")
    .insert(payload)
    .select("*")
    .single();
  if (error || !data) {
    const message = error?.message?.includes("amc_listed_funds_ticker_live_idx")
      ? "이미 사용 중인 티커입니다."
      : error?.message || "공유 상장에 실패했습니다.";
    return { success: false, message };
  }
  const parsed = parseListedAmcFundRow(data as AmcListedFundRow);
  if (!parsed) {
    return { success: false, message: "상장 응답을 해석하지 못했습니다." };
  }
  return { success: true, message: "공유 상장되었습니다.", fund: parsed };
}

export async function syncAmcListedFundMeta(
  fund: AmcFundState,
  manager: AssetManagerState,
  includeNav = false,
): Promise<{ success: boolean; message: string; fund?: ListedAmcFund }> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 동기화할 수 있습니다." };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc("amc_sync_fund_meta", {
    p_fund_id: fund.id,
    p_manager_name: manager.name.slice(0, 40),
    p_manager_tagline: manager.tagline.slice(0, 80),
    p_manager_detail: manager.detail?.slice(0, 500) ?? "",
    p_name: fund.name.slice(0, 40),
    p_holdings: fund.holdings,
    p_benchmark_stock_id: fund.benchmarkStockId ?? "",
    p_dividend_interval_days: fund.dividendIntervalDays,
    p_dividend_rate: fund.dividendRate,
    p_include_nav: includeNav,
    p_basket_price_factor: fund.basketPriceFactor ?? 1,
    p_seed_nav_value: fund.seedNavValue,
    p_last_rebalance_session: fund.lastRebalanceSession,
  });
  if (error) {
    return { success: false, message: error.message };
  }
  if (!data) {
    return {
      success: false,
      message: "아직 공유 상장되지 않은 펀드입니다.",
    };
  }
  const parsed = parseListedAmcFundRow(data as AmcListedFundRow);
  return parsed
    ? { success: true, message: "동기화됨", fund: parsed }
    : { success: false, message: "동기화 응답 해석 실패" };
}

/** 운용사가 상장 후 자동 분할·병합 임계값을 수정한다. */
export async function updateAmcListedFundShareAdjustment(
  fundId: string,
  input: UpdateAmcShareAdjustmentInput,
): Promise<{ success: boolean; message: string; fund?: ListedAmcFund }> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 수정할 수 있습니다." };
  }
  const splitTriggerPrice = Math.round(Number(input.splitTriggerPrice) || 0);
  const reverseSplitTriggerPrice = Math.round(
    Number(input.reverseSplitTriggerPrice) || 0,
  );
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "amc_update_share_adjustment_settings",
    {
      p_fund_id: fundId,
      p_split_trigger_price:
        splitTriggerPrice > 0 ? splitTriggerPrice : null,
      p_split_ratio: normalizeAmcShareAdjustmentRatio(input.splitRatio),
      p_reverse_split_trigger_price:
        reverseSplitTriggerPrice > 0 ? reverseSplitTriggerPrice : null,
      p_reverse_split_ratio: normalizeAmcShareAdjustmentRatio(
        input.reverseSplitRatio,
      ),
    },
  );
  if (error || !data) {
    return {
      success: false,
      message: error?.message || "자동 분할·병합 설정 수정에 실패했습니다.",
    };
  }
  const parsed = parseListedAmcFundRow(data as AmcListedFundRow);
  return parsed
    ? { success: true, message: "자동 분할·병합 설정을 수정했습니다.", fund: parsed }
    : { success: false, message: "설정 수정 응답을 해석하지 못했습니다." };
}

/** 운용사가 상장 ETF의 성과 비교 대상 일반 주식 1개를 변경한다. */
export async function updateAmcListedFundComparisonStock(
  fundId: string,
  comparisonStockId: string,
): Promise<{ success: boolean; message: string; fund?: ListedAmcFund }> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 목표 주식을 수정할 수 있습니다." };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "amc_update_comparison_stock",
    {
      p_fund_id: fundId,
      p_comparison_stock_id: comparisonStockId.trim(),
    },
  );
  if (error || !data) {
    return {
      success: false,
      message: error?.message || "목표 주식 동기화에 실패했습니다.",
    };
  }
  const parsed = parseListedAmcFundRow(data as AmcListedFundRow);
  return parsed
    ? { success: true, message: "목표 주식을 저장했습니다.", fund: parsed }
    : { success: false, message: "목표 주식 응답을 해석하지 못했습니다." };
}

export async function fetchMyAmcLedger(): Promise<AmcLedgerSnapshot> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { balance: 0, revision: 0, positions: [], trades: [], payments: [] };
  }
  const supabase = createClient();
  const [accountResult, positionsResult, tradesResult, paymentsResult] =
    await Promise.all([
    supabase
      .from("amc_accounts")
      .select("balance_delta, revision")
      .eq("user_id", auth.userId)
      .maybeSingle(),
    supabase
      .from("amc_fund_positions")
      .select("fund_id, quantity")
      .eq("user_id", auth.userId),
    supabase
      .from("amc_fund_trades")
      .select("client_order_id, fund_id, delta_shares, nav_per_share, total, created_at")
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("amc_fund_payments")
      .select(
        "event_id, quantity, amount, created_at, event:amc_fund_events!inner(fund_id,ticker,kind,due_session,per_share)",
      )
      .eq("user_id", auth.userId)
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  if (
    accountResult.error ||
    positionsResult.error ||
    tradesResult.error ||
    paymentsResult.error
  ) {
    throw new Error(
      accountResult.error?.message ??
        positionsResult.error?.message ??
        tradesResult.error?.message ??
        paymentsResult.error?.message ??
        "ETF 원장을 불러오지 못했습니다.",
    );
  }
  const account = accountResult.data as
    | { balance_delta?: unknown; revision?: unknown }
    | null;
  const positions = ((positionsResult.data ?? []) as Array<{
    fund_id?: unknown;
    quantity?: unknown;
  }>)
    .map((row) => ({
      fundId: String(row.fund_id ?? ""),
      quantity: Math.max(0, Number(row.quantity) || 0),
    }))
    .filter((row) => row.fundId);
  const trades = ((tradesResult.data ?? []) as Array<{
    client_order_id?: unknown;
    fund_id?: unknown;
    delta_shares?: unknown;
    nav_per_share?: unknown;
    total?: unknown;
    created_at?: unknown;
  }>).map((row) => ({
    id: String(row.client_order_id ?? ""),
    fundId: String(row.fund_id ?? ""),
    delta: Number(row.delta_shares) || 0,
    navPerShare: Math.max(1, Math.round(Number(row.nav_per_share) || 1)),
    total: Math.max(0, Math.round(Number(row.total) || 0)),
    createdAt: Date.parse(String(row.created_at ?? "")) || Date.now(),
  }));
  const payments = ((paymentsResult.data ?? []) as Array<{
    event_id?: unknown;
    quantity?: unknown;
    amount?: unknown;
    created_at?: unknown;
    event?: unknown;
  }>).flatMap((row) => {
    const event = Array.isArray(row.event) ? row.event[0] : row.event;
    if (!event || typeof event !== "object") return [];
    const item = event as {
      fund_id?: unknown;
      ticker?: unknown;
      kind?: unknown;
      due_session?: unknown;
      per_share?: unknown;
    };
    const kind = String(item.kind ?? "");
    if (kind !== "management_fee" && kind !== "dividend" && kind !== "delist") {
      return [];
    }
    return [{
      eventId: Math.floor(Number(row.event_id) || 0),
      fundId: String(item.fund_id ?? ""),
      ticker: String(item.ticker ?? ""),
      kind,
      dueSession: Math.floor(Number(item.due_session) || 0),
      quantity: Math.max(0, Number(row.quantity) || 0),
      perShare: Math.max(0, Math.round(Number(item.per_share) || 0)),
      amount: Math.max(0, Math.round(Number(row.amount) || 0)),
      createdAt: Date.parse(String(row.created_at ?? "")) || Date.now(),
    } satisfies AmcLedgerPayment];
  });
  return {
    balance: Math.round(Number(account?.balance_delta) || 0),
    revision: Math.max(0, Math.floor(Number(account?.revision) || 0)),
    positions,
    trades,
    payments,
  };
}

export async function bootstrapAmcPosition(
  fundId: string,
): Promise<AmcLedgerPosition | null> {
  if (!fundId) return null;
  const supabase = createClient();
  const { data, error } = await supabase.rpc("amc_bootstrap_position", {
    p_fund_id: fundId,
  });
  if (error || !data) return null;
  const row = data as { fund_id?: unknown; quantity?: unknown };
  const id = String(row.fund_id ?? fundId);
  const parsedQuantity = Math.max(0, Number(row.quantity) || 0);
  return id ? { fundId: id, quantity: parsedQuantity } : null;
}

export async function settleAmcListedFund(input: {
  fundId: string;
  currentSession: number;
  priceFactor: number;
  passivePeriodRate: number;
}): Promise<ListedAmcFund | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("amc_settle_fund", {
    p_fund_id: input.fundId,
    p_current_session: input.currentSession,
    p_price_factor: input.priceFactor,
    p_passive_period_rate: input.passivePeriodRate,
  });
  if (error || !data) {
    console.warn("[amcListedFunds] settle failed", error?.message);
    return null;
  }
  const fund = (data as { fund?: unknown }).fund;
  return fund && typeof fund === "object"
    ? parseListedAmcFundRow(fund as AmcListedFundRow)
    : null;
}

export async function adjustAmcListedFundShares(input: {
  fundId: string;
  currentSession: number;
  priceFactor: number;
}): Promise<ListedAmcFund | null> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "amc_apply_auto_share_adjustment",
    {
      p_fund_id: input.fundId,
      p_current_session: input.currentSession,
      p_price_factor: input.priceFactor,
    },
  );
  if (error || !data) {
    console.warn("[amcListedFunds] share adjustment failed", error?.message);
    return null;
  }
  const fund = (data as { fund?: unknown }).fund;
  return fund && typeof fund === "object"
    ? parseListedAmcFundRow(fund as AmcListedFundRow)
    : null;
}

export async function tradeAmcListedFund(input: {
  fundId: string;
  delta: number;
  expectedPosition: number;
  priceFactor: number;
  clientOrderId: string;
}): Promise<AmcLedgerTradeResult> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("amc_trade_fund", {
    p_fund_id: input.fundId,
    p_delta: input.delta,
    p_expected_position: input.expectedPosition,
    p_price_factor: input.priceFactor,
    p_client_order_id: input.clientOrderId,
  });
  if (error || !data) {
    const raw = error?.message ?? "";
    const message = raw.includes("position_conflict")
      ? "다른 기기에서 보유 좌수가 변경됐습니다. 원장을 새로고침해 주세요."
      : raw.includes("insufficient_cash")
        ? "현금이 부족합니다."
        : raw.includes("insufficient_position")
          ? "보유 좌수가 부족합니다."
          : raw.includes("fund_grace_no_buy")
            ? "유예 기간에는 신규 매수가 불가합니다."
            : raw.includes("save_required")
              ? "클라우드 저장 후 다시 거래해 주세요."
              : raw || "ETF 서버 거래에 실패했습니다.";
    return { success: false, message };
  }
  const row = data as {
    fund?: unknown;
    position?: unknown;
    navPerShare?: unknown;
    total?: unknown;
    cashDelta?: unknown;
    ledgerBalance?: unknown;
    ledgerRevision?: unknown;
  };
  const fund =
    row.fund && typeof row.fund === "object"
      ? parseListedAmcFundRow(row.fund as AmcListedFundRow)
      : null;
  if (!fund) return { success: false, message: "ETF 거래 응답을 읽지 못했습니다." };
  return {
    success: true,
    message: "ok",
    fund,
    position: Math.max(0, Number(row.position) || 0),
    navPerShare: Math.max(1, Math.round(Number(row.navPerShare) || 1)),
    total: Math.max(0, Math.round(Number(row.total) || 0)),
    cashDelta: Math.round(Number(row.cashDelta) || 0),
    ledgerBalance: Math.round(Number(row.ledgerBalance) || 0),
    ledgerRevision: Math.max(0, Math.floor(Number(row.ledgerRevision) || 0)),
  };
}

/** 공유 원장 좌수·시드 NAV 조정. cashDelta는 부호 검증용(실제 seed는 서버가 장부가로 계산). */
export async function adjustAmcListedShares(
  fundId: string,
  delta: number,
  cashDelta: number,
): Promise<{ success: boolean; message: string; fund?: ListedAmcFund }> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 거래할 수 있습니다." };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc("amc_adjust_shares", {
    p_fund_id: fundId,
    p_delta: delta,
    p_cash_delta: Math.round(cashDelta),
  });
  if (error || !data) {
    const raw = error?.message ?? "";
    const message =
      raw.includes("fund_delisted")
        ? "상장폐지된 펀드입니다."
        : raw.includes("fund_grace_no_buy")
          ? "유예 기간에는 신규 매수가 불가합니다."
          : raw.includes("insufficient_shares")
            ? "유통 좌수가 부족합니다."
            : raw.includes("insufficient_nav")
              ? "펀드 NAV가 부족합니다."
              : raw.includes("fund_not_found")
                ? "공유 원장에서 펀드를 찾을 수 없습니다."
                : raw || "좌수 조정에 실패했습니다.";
    return { success: false, message };
  }
  const parsed = parseListedAmcFundRow(data as AmcListedFundRow);
  if (!parsed) {
    return { success: false, message: "좌수 조정 응답을 해석하지 못했습니다." };
  }
  return { success: true, message: "ok", fund: parsed };
}

export async function applyAmcListedManagementFee(input: {
  fundId: string;
  dueSession: number;
  amount: number;
  newSeedNavValue: number;
  newLastFeeSession: number;
  newCumulativeFeesPaid: number;
}): Promise<{ success: boolean; message: string; fund?: ListedAmcFund }> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 운용료를 반영할 수 있습니다." };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc("amc_apply_management_fee", {
    p_fund_id: input.fundId,
    p_due_session: input.dueSession,
    p_amount: input.amount,
    p_new_seed_nav_value: input.newSeedNavValue,
    p_new_last_fee_session: input.newLastFeeSession,
    p_new_cumulative_fees_paid: input.newCumulativeFeesPaid,
  });
  if (error || !data) {
    return {
      success: false,
      message: error?.message || "운용료 공유 반영에 실패했습니다.",
    };
  }
  const parsed = parseListedAmcFundRow(data as AmcListedFundRow);
  if (!parsed) {
    return { success: false, message: "운용료 응답을 해석하지 못했습니다." };
  }
  return { success: true, message: "ok", fund: parsed };
}


export async function applyAmcListedDividend(input: {
  fundId: string;
  dueSession: number;
  perShare: number;
  total: number;
  newSeedNavValue: number;
  newLastDividendSession: number;
  newCumulativeDividendsPaid: number;
  dividendHistory: AmcDividendPoint[];
}): Promise<{ success: boolean; message: string; fund?: ListedAmcFund }> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 배당을 반영할 수 있습니다." };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc("amc_apply_dividend", {
    p_fund_id: input.fundId,
    p_due_session: input.dueSession,
    p_per_share: input.perShare,
    p_total: input.total,
    p_new_seed_nav_value: input.newSeedNavValue,
    p_new_last_dividend_session: input.newLastDividendSession,
    p_new_cumulative_dividends_paid: input.newCumulativeDividendsPaid,
    p_dividend_history: input.dividendHistory,
  });
  if (error || !data) {
    return {
      success: false,
      message: error?.message || "배당 공유 반영에 실패했습니다.",
    };
  }
  const parsed = parseListedAmcFundRow(data as AmcListedFundRow);
  if (!parsed) {
    return { success: false, message: "배당 응답을 해석하지 못했습니다." };
  }
  return { success: true, message: "ok", fund: parsed };
}

/** 로컬 운용 상태를 공유 AUM(좌수·시드 NAV·수수료 회차)에 맞춘다. */
export function mergeListedAumIntoManager(
  manager: AssetManagerState,
  listed: ListedAmcFund[],
): AssetManagerState {
  if (!listed.length) return manager;
  const byId = new Map(listed.map((fund) => [fund.id, fund]));
  let changed = false;
  const funds = manager.funds.map((fund) => {
    const remote = byId.get(fund.id);
    if (!remote) return fund;
    const holdingsChanged =
      remote.holdings.length !== fund.holdings.length ||
      remote.holdings.some(
        (row, index) =>
          row.stockId !== fund.holdings[index]?.stockId ||
          Math.abs(row.weight - (fund.holdings[index]?.weight ?? 0)) > 1e-12 ||
          Math.abs(
            (row.basePrice ?? 0) -
              (fund.holdings[index]?.basePrice ?? 0),
          ) > 1e-9,
      );
    const next = {
      ...fund,
      comparisonStockId:
        remote.comparisonStockId ?? fund.comparisonStockId,
      holdings: holdingsChanged ? remote.holdings : fund.holdings,
      basketPriceFactor: remote.basketPriceFactor ?? fund.basketPriceFactor ?? 1,
      totalShares: remote.totalShares,
      seedNavValue: remote.seedNavValue,
      lastRebalanceSession: Math.max(
        fund.lastRebalanceSession,
        remote.lastRebalanceSession,
      ),
      lastFeeSession: Math.max(fund.lastFeeSession, remote.lastFeeSession),
      cumulativeFeesPaid: Math.max(
        fund.cumulativeFeesPaid,
        remote.cumulativeFeesPaid,
      ),
      dividendIntervalDays: remote.dividendIntervalDays ?? fund.dividendIntervalDays,
      dividendRate: remote.dividendRate ?? fund.dividendRate,
      lastDividendSession: Math.max(
        fund.lastDividendSession,
        remote.lastDividendSession ?? 0,
      ),
      cumulativeDividendsPaid: Math.max(
        fund.cumulativeDividendsPaid,
        remote.cumulativeDividendsPaid ?? 0,
      ),
      dividendHistory:
        (remote.dividendHistory?.length ?? 0) >= fund.dividendHistory.length
          ? remote.dividendHistory ?? fund.dividendHistory
          : fund.dividendHistory,
      status:
        remote.status === "delisted"
          ? ("delisted" as const)
          : fund.status === "delisted"
            ? fund.status
            : remote.status === "grace" && fund.status === "active"
              ? ("grace" as const)
              : fund.status,
      graceStartedSession:
        fund.graceStartedSession ?? remote.graceStartedSession,
    };
    if (
      next.totalShares !== fund.totalShares ||
      next.seedNavValue !== fund.seedNavValue ||
      holdingsChanged ||
      next.basketPriceFactor !== fund.basketPriceFactor ||
      next.lastFeeSession !== fund.lastFeeSession ||
      next.lastRebalanceSession !== fund.lastRebalanceSession ||
      next.status !== fund.status ||
      next.cumulativeFeesPaid !== fund.cumulativeFeesPaid ||
      next.lastDividendSession !== fund.lastDividendSession ||
      next.cumulativeDividendsPaid !== fund.cumulativeDividendsPaid ||
      next.dividendIntervalDays !== fund.dividendIntervalDays ||
      next.dividendRate !== fund.dividendRate ||
      next.comparisonStockId !== fund.comparisonStockId ||
      next.dividendHistory.length !== fund.dividendHistory.length
    ) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...manager, funds } : manager;
}

/**
 * 지갑에서 빠진 내 ETF를 상장 원장에서 복구한다.
 * (클라우드 저장 경합 등으로 assetManager.funds 가 비어도 마켓에는 남는 경우)
 */
export function reconcileOwnedListedFundsIntoManager(
  manager: AssetManagerState,
  listed: ListedAmcFund[],
  managerUserId: string | null | undefined,
): AssetManagerState {
  if (!managerUserId || !listed.length) return manager;
  const owned = listed.filter(
    (fund) =>
      fund.managerUserId === managerUserId && fund.status !== "delisted",
  );
  if (!owned.length) return manager;
  const existing = new Set(manager.funds.map((fund) => fund.id));
  const missing = owned.filter((fund) => !existing.has(fund.id));
  if (!missing.length) {
    return mergeListedAumIntoManager(manager, listed);
  }
  const restored = missing.map(listedFundToAmcState);
  return mergeListedAumIntoManager(
    {
      ...manager,
      funds: [...manager.funds, ...restored],
      lastActionAt: Date.now(),
    },
    listed,
  );
}

/**
 * 운용사 지갑 자체가 사라졌지만 상장 ETF는 남아 있는 경우 운용사를 재구성한다.
 */
export function rebuildAssetManagerFromOwnedListed(
  listed: ListedAmcFund[],
  managerUserId: string,
  existing: AssetManagerState | null,
): AssetManagerState | null {
  if (!managerUserId) return existing;
  const owned = listed.filter(
    (fund) =>
      fund.managerUserId === managerUserId && fund.status !== "delisted",
  );
  if (existing) {
    return reconcileOwnedListedFundsIntoManager(existing, listed, managerUserId);
  }
  if (!owned.length) return null;
  const sample = owned[0]!;
  const foundedAt = Date.parse(sample.createdAt) || Date.now();
  return {
    id: `amc-restored-${managerUserId.slice(0, 8)}`,
    name: sample.managerName || "복구된 운용사",
    tagline: sample.managerTagline || "상장 ETF에서 자동 복구됨",
    ...(sample.managerDetail ? { detail: sample.managerDetail } : {}),
    foundedAt,
    foundedSession: sample.createdSession,
    foundingBurn: 1_000_000,
    cumulativeBurned: 1_000_000,
    approvalRequestId: "restored-from-listed",
    funds: owned.map(listedFundToAmcState),
    lastActionAt: Date.now(),
  };
}

export function upsertListedCache(
  list: ListedAmcFund[],
  fund: ListedAmcFund,
): ListedAmcFund[] {
  const rest = list.filter((item) => item.id !== fund.id);
  if (fund.status === "delisted") {
    return [fund, ...rest];
  }
  return [fund, ...rest].sort((a, b) =>
    a.updatedAt < b.updatedAt ? 1 : -1,
  );
}

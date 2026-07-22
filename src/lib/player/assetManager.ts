/**
 * 자산운용사(AMC) · 유저 ETF.
 * - 설립: NW ≥ $10K, 즉시 소각 $10K, 시드 Y의 10% 소각·90% NAV
 * - 액티브 ≤3% / 패시브 ≤0.5% (20거래일 회차), NAV 차감 → 운용료 현금
 * - 액티브: 30일 손바꿈(5%p), 유예 10일, 미이행 시 상폐·NAV 환급
 * - 펀드 좌는 순자산 랭킹 미합산
 */

export const AMC_MIN_NET_WORTH = 1_000_000; // $10,000
export const AMC_FOUNDING_BURN = 1_000_000; // $10,000
export const AMC_SEED_BURN_RATE = 0.1;
export const AMC_FEE_INTERVAL_DAYS = 20;
export const AMC_ACTIVE_MAX_FEE_RATE = 0.03;
export const AMC_PASSIVE_MAX_FEE_RATE = 0.005;
export const AMC_REBALANCE_WINDOW_DAYS = 30;
export const AMC_GRACE_DAYS = 10;
export const AMC_TURNOVER_THRESHOLD = 0.05;
export const AMC_MIN_HOLDINGS = 3;
export const AMC_MAX_HOLDINGS = 30;
export const AMC_FUND_ID_PREFIX = "amc:" as const;
export const AMC_DIVIDEND_INTERVALS = [5, 20, 60] as const;
export type AmcDividendIntervalDays = (typeof AMC_DIVIDEND_INTERVALS)[number];
/** 액티브 회차당 AUM 대비 배당률 상한 */
export const AMC_ACTIVE_MAX_DIVIDEND_RATE = 0.05;
export const AMC_TRADING_SESSIONS_PER_YEAR = 240;

export type AmcFundStyle = "active" | "passive";
export type AmcFundStatus = "active" | "grace" | "delisted";

export interface AmcHoldingWeight {
  stockId: string;
  weight: number;
}

export interface AmcNavPoint {
  t: number;
  /** 좌당 NAV (센트) */
  nav: number;
  /** 벤치마크 좌당 환산(액티브, 센트). 패시브는 생략 가능 */
  benchmarkNav?: number;
}

export interface AmcDividendPoint {
  session: number;
  /** 좌당 배당 (센트) */
  perShare: number;
  /** 펀드 전체 배당 총액 (센트) — NAV 차감분 */
  total: number;
}

export interface AmcFundState {
  id: string;
  name: string;
  ticker: string;
  style: AmcFundStyle;
  status: AmcFundStatus;
  /** 20거래일당 회차 요율 (액티브 ≤0.03, 패시브 ≤0.005) */
  feeRate: number;
  /** 액티브만. 벤치마크 종목 id 1개 고정 */
  benchmarkStockId?: string;
  holdings: AmcHoldingWeight[];
  /** 유통 좌수 (시드·매매로 증감) */
  totalShares: number;
  /** 기준 바스켓 가치(센트) — 시드 편입액(90%). 좌당 NAV = basketValue/totalShares 보정은 시세 반영 함수에서 */
  seedNavValue: number;
  createdAt: number;
  createdSession: number;
  lastFeeSession: number;
  lastRebalanceSession: number;
  /** 배당 지급 주기 (5/20/60 거래일) */
  dividendIntervalDays: AmcDividendIntervalDays;
  /**
   * 액티브: 회차당 AUM 대비 배당률 (0이면 배당 없음).
   * 패시브: 무시 — 구성 종목 평균 배당률로 산출.
   */
  dividendRate: number;
  lastDividendSession: number;
  cumulativeDividendsPaid: number;
  dividendHistory: AmcDividendPoint[];
  /** 유예 진입 세션 (없으면 null) */
  graceStartedSession: number | null;
  delistedAt?: number;
  delistedSession?: number;
  navHistory: AmcNavPoint[];
  cumulativeFeesPaid: number;
  /** stock_requests 상장 허가 신청 id (공유 마켓 상장 전) */
  listingRequestId?: string;
}

export interface AssetManagerState {
  id: string;
  name: string;
  /** 필수 한 줄 소개 */
  tagline: string;
  /** 자유 세부 소개 */
  detail?: string;
  foundedAt: number;
  foundedSession: number;
  foundingBurn: number;
  cumulativeBurned: number;
  approvalRequestId: string;
  funds: AmcFundState[];
  lastActionAt: number;
}

export interface FoundAssetManagerInput {
  name: string;
  tagline: string;
  detail?: string;
}

export interface CreateAmcFundInput {
  name: string;
  ticker: string;
  style: AmcFundStyle;
  feeRate: number;
  benchmarkStockId?: string;
  holdings: AmcHoldingWeight[];
  /** 시드 현금(센트). 10% 소각, 90% NAV */
  seedCash: number;
  /** 배당 주기. 기본 60 */
  dividendIntervalDays?: AmcDividendIntervalDays;
  /** 액티브 회차 배당률. 패시브는 무시 */
  dividendRate?: number;
}

export type AmcActionResult = {
  success: boolean;
  message: string;
  manager?: AssetManagerState;
  cash?: number;
  burned?: number;
  fund?: AmcFundState;
  refunded?: number;
};

const finiteNonNegative = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));

export function isAmcFundStockId(stockId: string | undefined | null): boolean {
  return Boolean(stockId && stockId.startsWith(AMC_FUND_ID_PREFIX));
}

export function amcFundStockId(fundId: string): string {
  return fundId.startsWith(AMC_FUND_ID_PREFIX)
    ? fundId
    : `${AMC_FUND_ID_PREFIX}${fundId}`;
}

export function parseAmcFundId(stockId: string): string | null {
  if (!isAmcFundStockId(stockId)) return null;
  return stockId.slice(AMC_FUND_ID_PREFIX.length);
}

function normalizeWeights(
  holdings: AmcHoldingWeight[],
): AmcHoldingWeight[] | null {
  if (holdings.length < AMC_MIN_HOLDINGS || holdings.length > AMC_MAX_HOLDINGS) {
    return null;
  }
  const cleaned = holdings
    .map((row) => ({
      stockId: String(row.stockId ?? "").trim(),
      weight: finiteNonNegative(row.weight),
    }))
    .filter((row) => row.stockId && row.weight > 0);
  if (cleaned.length < AMC_MIN_HOLDINGS) return null;
  const ids = new Set(cleaned.map((row) => row.stockId));
  if (ids.size !== cleaned.length) return null;
  const sum = cleaned.reduce((acc, row) => acc + row.weight, 0);
  if (sum <= 0) return null;
  return cleaned.map((row) => ({
    stockId: row.stockId,
    weight: row.weight / sum,
  }));
}

/** 공유 원장 JSON 파싱용 — 종목 수 상한만 완화하지 않고 동일 규칙. */
export function normalizeWeightsSafe(
  holdings: AmcHoldingWeight[],
): AmcHoldingWeight[] | null {
  return normalizeWeights(holdings);
}

export function maxFeeRateForStyle(style: AmcFundStyle): number {
  return style === "active"
    ? AMC_ACTIVE_MAX_FEE_RATE
    : AMC_PASSIVE_MAX_FEE_RATE;
}

export function normalizeAmcDividendInterval(
  value: unknown,
  fallback: AmcDividendIntervalDays = 60,
): AmcDividendIntervalDays {
  const number = Math.floor(Number(value));
  if (number === 5 || number === 20 || number === 60) return number;
  return fallback;
}

/** 구성 종목의 배당·인컴 주기(5/20/60). 배당 없으면 null. */
export function holdingDividendCadence(stock: {
  quarterlyDividend?: number;
  coveredCallAnnualYield?: number;
  coveredCallDistributionIntervalDays?: number;
}): AmcDividendIntervalDays | null {
  if ((stock.quarterlyDividend ?? 0) > 0) return 60;
  if ((stock.coveredCallAnnualYield ?? 0) > 0) {
    return normalizeAmcDividendInterval(
      stock.coveredCallDistributionIntervalDays,
      20,
    );
  }
  return null;
}

export function collectHoldingDividendCadences(
  holdings: AmcHoldingWeight[],
  stockOf: (stockId: string) =>
    | {
        quarterlyDividend?: number;
        coveredCallAnnualYield?: number;
        coveredCallDistributionIntervalDays?: number;
      }
    | undefined,
): AmcDividendIntervalDays[] {
  const set = new Set<AmcDividendIntervalDays>();
  for (const row of holdings) {
    const cadence = holdingDividendCadence(stockOf(row.stockId) ?? {});
    if (cadence != null) set.add(cadence);
  }
  return [...set].sort((a, b) => a - b);
}

export function hasMixedDividendCadences(
  holdings: AmcHoldingWeight[],
  stockOf: (stockId: string) =>
    | {
        quarterlyDividend?: number;
        coveredCallAnnualYield?: number;
        coveredCallDistributionIntervalDays?: number;
      }
    | undefined,
): boolean {
  return collectHoldingDividendCadences(holdings, stockOf).length > 1;
}

/** 구성 비중 가중 연율 배당·인컴 수익률 (소수, 예: 0.04 = 4%). */
export function computePassiveAmcAnnualDividendYield(
  holdings: AmcHoldingWeight[],
  priceOf: (stockId: string) => number,
  stockOf: (stockId: string) =>
    | {
        quarterlyDividend?: number;
        coveredCallAnnualYield?: number;
      }
    | undefined,
): number {
  let total = 0;
  for (const row of holdings) {
    const stock = stockOf(row.stockId);
    const price = priceOf(row.stockId);
    if (!stock || !(price > 0)) continue;
    let annual = 0;
    const quarterly = stock.quarterlyDividend ?? 0;
    if (quarterly > 0) {
      annual +=
        (quarterly * (AMC_TRADING_SESSIONS_PER_YEAR / 60)) / price;
    }
    const cc = stock.coveredCallAnnualYield ?? 0;
    if (cc > 0) annual += cc / 100;
    total += row.weight * annual;
  }
  return Math.max(0, total);
}

/** 회차 배당률 (AUM 대비). 패시브는 평균 연율→회차 환산, 액티브는 설정값. */
export function resolveAmcDividendPeriodRate(
  fund: AmcFundState,
  priceOf: (stockId: string) => number,
  stockOf: (stockId: string) =>
    | {
        quarterlyDividend?: number;
        coveredCallAnnualYield?: number;
      }
    | undefined,
): number {
  if (fund.style === "active") {
    return Math.min(
      AMC_ACTIVE_MAX_DIVIDEND_RATE,
      Math.max(0, fund.dividendRate),
    );
  }
  const annual = computePassiveAmcAnnualDividendYield(
    fund.holdings,
    priceOf,
    stockOf,
  );
  return (
    annual *
    (fund.dividendIntervalDays / AMC_TRADING_SESSIONS_PER_YEAR)
  );
}

/** 시드 Y → 소각액·NAV 편입액 */
export function splitAmcSeed(seedCash: number): {
  burned: number;
  navValue: number;
} {
  const seed = Math.max(0, Math.round(finiteNonNegative(seedCash)));
  const burned = Math.round(seed * AMC_SEED_BURN_RATE);
  return { burned, navValue: seed - burned };
}

/**
 * 좌당 NAV(센트). 구성 종목 현재가와 시드 기준가를 이용해
 * 시드 시점 바스켓 대비 상대 성과를 반영한다.
 */
export function computeAmcFundNavPerShare(
  fund: AmcFundState,
  priceOf: (stockId: string) => number,
  initialPriceOf: (stockId: string) => number,
): number {
  if (fund.totalShares <= 0 || fund.status === "delisted") return 0;
  let relative = 0;
  for (const row of fund.holdings) {
    const px = priceOf(row.stockId);
    const base = initialPriceOf(row.stockId);
    if (!(px > 0) || !(base > 0)) continue;
    relative += row.weight * (px / base);
  }
  if (!(relative > 0)) {
    return Math.round(fund.seedNavValue / fund.totalShares);
  }
  return Math.max(1, Math.round((fund.seedNavValue * relative) / fund.totalShares));
}

export function amcFundShareValue(
  fund: AmcFundState,
  quantity: number,
  priceOf: (stockId: string) => number,
  initialPriceOf: (stockId: string) => number,
): number {
  if (!(quantity > 0) || fund.status === "delisted") return 0;
  return Math.round(
    quantity * computeAmcFundNavPerShare(fund, priceOf, initialPriceOf),
  );
}

/** 랭킹용: 보유분 중 유저 ETF 평가액을 뺀다. */
export function amcHoldingsMarketValue(
  holdings: { stockId: string; quantity: number }[],
  manager: AssetManagerState | null | undefined,
  priceOf: (stockId: string) => number,
  initialPriceOf: (stockId: string) => number,
): number {
  if (!manager?.funds.length) return 0;
  const byId = new Map(manager.funds.map((fund) => [fund.id, fund]));
  let total = 0;
  for (const holding of holdings) {
    const fundId = parseAmcFundId(holding.stockId);
    if (!fundId) continue;
    const fund = byId.get(fundId);
    if (!fund || fund.status === "delisted") continue;
    total += amcFundShareValue(
      fund,
      holding.quantity,
      priceOf,
      initialPriceOf,
    );
  }
  return total;
}

export function foundAssetManager(
  input: FoundAssetManagerInput,
  cash: number,
  netWorth: number,
  approvalRequestId: string,
  currentSession: number,
  now = Date.now(),
): AmcActionResult {
  const name = input.name.trim();
  const tagline = input.tagline.trim();
  const detail = input.detail?.trim() || undefined;
  if (name.length < 2 || name.length > 40) {
    return { success: false, message: "운용사명은 2~40자로 입력해 주세요." };
  }
  if (tagline.length < 2 || tagline.length > 80) {
    return { success: false, message: "한 줄 소개는 2~80자로 입력해 주세요." };
  }
  if (detail && detail.length > 500) {
    return { success: false, message: "세부 소개는 500자 이내로 입력해 주세요." };
  }
  if (!approvalRequestId) {
    return { success: false, message: "관리자 허가가 필요합니다." };
  }
  if (!Number.isFinite(netWorth) || netWorth < AMC_MIN_NET_WORTH) {
    return {
      success: false,
      message: "순자산 $10,000 이상에서 자산운용사를 설립할 수 있습니다.",
    };
  }
  if (cash < AMC_FOUNDING_BURN) {
    return {
      success: false,
      message: "설립 소각금 $10,000에 필요한 현금이 부족합니다.",
    };
  }
  const manager: AssetManagerState = {
    id: `amc-${now.toString(36)}`,
    name,
    tagline,
    ...(detail ? { detail } : {}),
    foundedAt: now,
    foundedSession: currentSession,
    foundingBurn: AMC_FOUNDING_BURN,
    cumulativeBurned: AMC_FOUNDING_BURN,
    approvalRequestId,
    funds: [],
    lastActionAt: now,
  };
  return {
    success: true,
    message: `${name} 자산운용사를 설립했습니다. $10,000가 영구 소각되었습니다.`,
    manager,
    cash: cash - AMC_FOUNDING_BURN,
    burned: AMC_FOUNDING_BURN,
  };
}

export function createAmcFund(
  manager: AssetManagerState,
  input: CreateAmcFundInput,
  cash: number,
  currentSession: number,
  priceOf: (stockId: string) => number,
  initialPriceOf: (stockId: string) => number,
  now = Date.now(),
  reservedTickers: readonly string[] = [],
): AmcActionResult {
  const name = input.name.trim();
  const ticker = input.ticker.trim().toUpperCase();
  if (name.length < 2 || name.length > 40) {
    return { success: false, message: "펀드명은 2~40자로 입력해 주세요." };
  }
  if (!/^[A-Z0-9]{2,6}$/.test(ticker)) {
    return {
      success: false,
      message: "티커는 영문·숫자 2~6자로 입력해 주세요.",
    };
  }
  if (
    reservedTickers.includes(ticker) ||
    manager.funds.some((fund) => fund.ticker === ticker)
  ) {
    return { success: false, message: "이미 사용 중인 티커입니다." };
  }
  const holdings = normalizeWeights(input.holdings);
  if (!holdings) {
    return {
      success: false,
      message: `구성 종목은 ${AMC_MIN_HOLDINGS}~${AMC_MAX_HOLDINGS}개, 비중 합 100%여야 합니다.`,
    };
  }
  for (const row of holdings) {
    if (!(priceOf(row.stockId) > 0) || !(initialPriceOf(row.stockId) > 0)) {
      return {
        success: false,
        message: "상장·거래 중인 기업 종목만 편입할 수 있습니다.",
      };
    }
  }
  const maxFee = maxFeeRateForStyle(input.style);
  const feeRate = finiteNonNegative(input.feeRate);
  if (feeRate <= 0 || feeRate > maxFee + 1e-12) {
    return {
      success: false,
      message:
        input.style === "active"
          ? "액티브 운용료는 회차당 최대 3%입니다."
          : "패시브 운용료는 회차당 최대 0.5%입니다.",
    };
  }
  if (input.style === "active") {
    const bench = input.benchmarkStockId?.trim();
    if (!bench || !(priceOf(bench) > 0)) {
      return { success: false, message: "액티브 펀드는 벤치마크 1개가 필요합니다." };
    }
  }
  const dividendIntervalDays = normalizeAmcDividendInterval(
    input.dividendIntervalDays,
    60,
  );
  let dividendRate = 0;
  if (input.style === "active") {
    dividendRate = finiteNonNegative(input.dividendRate);
    if (dividendRate > AMC_ACTIVE_MAX_DIVIDEND_RATE + 1e-12) {
      return {
        success: false,
        message: "액티브 회차 배당률은 최대 5%입니다.",
      };
    }
  }
  const seedCash = Math.round(finiteNonNegative(input.seedCash));
  if (seedCash < 100_00) {
    return { success: false, message: "시드는 최소 $100 이상이어야 합니다." };
  }
  const { burned, navValue } = splitAmcSeed(seedCash);
  if (cash < seedCash) {
    return { success: false, message: "시드에 필요한 현금이 부족합니다." };
  }
  const totalShares = 10_000;
  const fundId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const navPerShare = Math.max(1, Math.round(navValue / totalShares));
  const fund: AmcFundState = {
    id: fundId,
    name,
    ticker,
    style: input.style,
    status: "active",
    feeRate,
    ...(input.style === "active" && input.benchmarkStockId
      ? { benchmarkStockId: input.benchmarkStockId.trim() }
      : {}),
    holdings,
    totalShares,
    seedNavValue: navValue,
    createdAt: now,
    createdSession: currentSession,
    lastFeeSession: currentSession,
    lastRebalanceSession: currentSession,
    dividendIntervalDays,
    dividendRate,
    lastDividendSession: currentSession,
    cumulativeDividendsPaid: 0,
    dividendHistory: [],
    graceStartedSession: null,
    navHistory: [{ t: now, nav: navPerShare }],
    cumulativeFeesPaid: 0,
  };
  const nextManager: AssetManagerState = {
    ...manager,
    cumulativeBurned: manager.cumulativeBurned + burned,
    funds: [...manager.funds, fund],
    lastActionAt: now,
  };
  return {
    success: true,
    message: `${name}(${ticker})를 설정했습니다. 시드 중 ${burned.toLocaleString()}¢가 소각되고 ${navValue.toLocaleString()}¢가 NAV로 편입됩니다.`,
    manager: nextManager,
    cash: cash - seedCash,
    burned,
    fund,
  };
}

export function rebalanceAmcFund(
  manager: AssetManagerState,
  fundId: string,
  nextHoldings: AmcHoldingWeight[],
  currentSession: number,
  now = Date.now(),
): AmcActionResult {
  const fund = manager.funds.find((item) => item.id === fundId);
  if (!fund) return { success: false, message: "펀드를 찾을 수 없습니다." };
  if (fund.status === "delisted") {
    return { success: false, message: "상장폐지된 펀드는 변경할 수 없습니다." };
  }
  if (fund.style === "passive") {
    return {
      success: false,
      message:
        "패시브 ETF는 수동 손바꿈이 없습니다. 목표가중은 자동으로 유지됩니다.",
    };
  }
  const holdings = normalizeWeights(nextHoldings);
  if (!holdings) {
    return {
      success: false,
      message: `구성은 ${AMC_MIN_HOLDINGS}종목 이상이어야 합니다.`,
    };
  }
  const prev = new Map(fund.holdings.map((row) => [row.stockId, row.weight]));
  const nextIds = new Set(holdings.map((row) => row.stockId));
  const prevIds = new Set(fund.holdings.map((row) => row.stockId));
  const compositionChanged =
    [...nextIds].some((id) => !prevIds.has(id)) ||
    [...prevIds].some((id) => !nextIds.has(id));
  let maxDelta = 0;
  for (const row of holdings) {
    maxDelta = Math.max(maxDelta, Math.abs(row.weight - (prev.get(row.stockId) ?? 0)));
  }
  for (const id of prevIds) {
    if (!nextIds.has(id)) {
      maxDelta = Math.max(maxDelta, prev.get(id) ?? 0);
    }
  }
  const turnoverOk =
    compositionChanged || maxDelta + 1e-12 >= AMC_TURNOVER_THRESHOLD;
  if (!turnoverOk) {
    return {
      success: false,
      message: "액티브 손바꿈은 비중 5%p 이상 조정 또는 편입/편출이 필요합니다.",
    };
  }
  // status "active" = 운영중(유예 해제). style(액티브/패시브)과는 별개.
  const updated: AmcFundState = {
    ...fund,
    holdings,
    lastRebalanceSession: currentSession,
    graceStartedSession: null,
    status: "active",
  };
  return {
    success: true,
    message: "리밸런싱을 반영했습니다.",
    manager: {
      ...manager,
      funds: manager.funds.map((item) => (item.id === fundId ? updated : item)),
      lastActionAt: now,
    },
    fund: updated,
  };
}

/** 패시브 고정비중 자동 복원 — 시세 드리프트 후 weight 재정규화는 목표 비중 유지로 처리(보유 비중 테이블이 곧 목표). */
export function autoRebalancePassiveFunds(
  manager: AssetManagerState,
  currentSession: number,
  now = Date.now(),
): AssetManagerState {
  let changed = false;
  const funds = manager.funds.map((fund) => {
    if (fund.style !== "passive" || fund.status !== "active") return fund;
    if (currentSession - fund.lastRebalanceSession < AMC_FEE_INTERVAL_DAYS) {
      return fund;
    }
    changed = true;
    return {
      ...fund,
      lastRebalanceSession: currentSession,
    };
  });
  if (!changed) return manager;
  return { ...manager, funds, lastActionAt: now };
}

export function evaluateAmcCompliance(
  manager: AssetManagerState,
  currentSession: number,
  now = Date.now(),
): { manager: AssetManagerState; newlyDelisted: AmcFundState[] } {
  const newlyDelisted: AmcFundState[] = [];
  const funds = manager.funds.map((fund) => {
    if (fund.style !== "active" || fund.status === "delisted") return fund;
    const idle = currentSession - fund.lastRebalanceSession;
    if (fund.status === "active") {
      if (idle < AMC_REBALANCE_WINDOW_DAYS) return fund;
      return {
        ...fund,
        status: "grace" as const,
        graceStartedSession: currentSession,
      };
    }
    // grace
    const graceStart = fund.graceStartedSession ?? currentSession;
    if (currentSession - graceStart < AMC_GRACE_DAYS) return fund;
    const delisted: AmcFundState = {
      ...fund,
      status: "delisted",
      delistedAt: now,
      delistedSession: currentSession,
      graceStartedSession: null,
    };
    newlyDelisted.push(delisted);
    return delisted;
  });
  return {
    manager: { ...manager, funds, lastActionAt: now },
    newlyDelisted,
  };
}

export function settleAmcManagementFees(
  manager: AssetManagerState,
  currentSession: number,
  priceOf: (stockId: string) => number,
  initialPriceOf: (stockId: string) => number,
  now = Date.now(),
): {
  manager: AssetManagerState;
  feePayments: {
    id: string;
    fundId: string;
    ticker: string;
    dueSession: number;
    amount: number;
  }[];
} {
  const feePayments: {
    id: string;
    fundId: string;
    ticker: string;
    dueSession: number;
    amount: number;
  }[] = [];
  const funds = manager.funds.map((fund) => {
    if (fund.status === "delisted" || fund.status === "grace") return fund;
    const elapsed = currentSession - fund.lastFeeSession;
    const periods = Math.min(3, Math.floor(Math.max(0, elapsed) / AMC_FEE_INTERVAL_DAYS));
    if (periods <= 0) return fund;
    let next = fund;
    for (let i = 1; i <= periods; i++) {
      const dueSession = fund.lastFeeSession + i * AMC_FEE_INTERVAL_DAYS;
      const nav = computeAmcFundNavPerShare(next, priceOf, initialPriceOf);
      const aum = nav * next.totalShares;
      const amount = Math.max(0, Math.round(aum * next.feeRate));
      if (amount > 0) {
        // NAV에서 차감 ≡ seedNavValue 감소 (좌수 유지)
        const nextSeed = Math.max(0, next.seedNavValue - amount);
        next = {
          ...next,
          seedNavValue: nextSeed,
          cumulativeFeesPaid: next.cumulativeFeesPaid + amount,
        };
        feePayments.push({
          id: `mgmt-fee-${next.id}-${dueSession}`,
          fundId: next.id,
          ticker: next.ticker,
          dueSession,
          amount,
        });
      }
    }
    return {
      ...next,
      lastFeeSession: fund.lastFeeSession + periods * AMC_FEE_INTERVAL_DAYS,
      navHistory: [
        ...next.navHistory,
        {
          t: now,
          nav: computeAmcFundNavPerShare(next, priceOf, initialPriceOf),
        },
      ].slice(-120),
    };
  });
  return {
    manager: {
      ...manager,
      funds,
      lastActionAt: feePayments.length ? now : manager.lastActionAt,
    },
    feePayments,
  };
}

export type AmcDividendPayment = {
  id: string;
  fundId: string;
  ticker: string;
  dueSession: number;
  perShare: number;
  /** 펀드 전체 NAV 차감액 */
  total: number;
};

/**
 * 유저 ETF 배당 정산 — NAV(seedNavValue)에서 차감.
 * 액티브는 설정 회차율, 패시브는 구성 평균 연율÷주기로 산출.
 */
export function settleAmcDividends(
  funds: AmcFundState[],
  currentSession: number,
  priceOf: (stockId: string) => number,
  initialPriceOf: (stockId: string) => number,
  stockOf: (stockId: string) =>
    | {
        quarterlyDividend?: number;
        coveredCallAnnualYield?: number;
      }
    | undefined,
  now = Date.now(),
): { funds: AmcFundState[]; dividendPayments: AmcDividendPayment[] } {
  const dividendPayments: AmcDividendPayment[] = [];
  const nextFunds = funds.map((fund) => {
    if (fund.status === "delisted" || fund.status === "grace") return fund;
    const interval = fund.dividendIntervalDays;
    const elapsed = currentSession - fund.lastDividendSession;
    const periods = Math.min(3, Math.floor(Math.max(0, elapsed) / interval));
    if (periods <= 0) return fund;
    let next = fund;
    const history = [...fund.dividendHistory];
    for (let i = 1; i <= periods; i++) {
      const dueSession = fund.lastDividendSession + i * interval;
      const rate = resolveAmcDividendPeriodRate(next, priceOf, stockOf);
      if (!(rate > 0)) continue;
      const nav = computeAmcFundNavPerShare(next, priceOf, initialPriceOf);
      const aum = nav * next.totalShares;
      const total = Math.max(0, Math.round(aum * rate));
      if (total <= 0 || next.totalShares <= 0) continue;
      const perShare = Math.max(0, Math.floor(total / next.totalShares));
      const paidTotal = perShare * next.totalShares;
      if (perShare <= 0 || paidTotal <= 0) continue;
      next = {
        ...next,
        seedNavValue: Math.max(0, next.seedNavValue - paidTotal),
        cumulativeDividendsPaid: next.cumulativeDividendsPaid + paidTotal,
      };
      history.push({ session: dueSession, perShare, total: paidTotal });
      dividendPayments.push({
        id: `amc-div-${next.id}-${dueSession}`,
        fundId: next.id,
        ticker: next.ticker,
        dueSession,
        perShare,
        total: paidTotal,
      });
    }
    return {
      ...next,
      lastDividendSession:
        fund.lastDividendSession + periods * interval,
      dividendHistory: history.slice(-12),
      navHistory: [
        ...next.navHistory,
        {
          t: now,
          nav: computeAmcFundNavPerShare(next, priceOf, initialPriceOf),
        },
      ].slice(-120),
    };
  });
  return { funds: nextFunds, dividendPayments };
}

export function settleAmcManagerDividends(
  manager: AssetManagerState,
  currentSession: number,
  priceOf: (stockId: string) => number,
  initialPriceOf: (stockId: string) => number,
  stockOf: (stockId: string) =>
    | {
        quarterlyDividend?: number;
        coveredCallAnnualYield?: number;
      }
    | undefined,
  now = Date.now(),
): {
  manager: AssetManagerState;
  dividendPayments: AmcDividendPayment[];
} {
  const settled = settleAmcDividends(
    manager.funds,
    currentSession,
    priceOf,
    initialPriceOf,
    stockOf,
    now,
  );
  return {
    manager: {
      ...manager,
      funds: settled.funds,
      lastActionAt: settled.dividendPayments.length
        ? now
        : manager.lastActionAt,
    },
    dividendPayments: settled.dividendPayments,
  };
}

export function normalizeAssetManager(value: unknown): AssetManagerState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<AssetManagerState>;
  const name = typeof source.name === "string" ? source.name.trim() : "";
  const tagline = typeof source.tagline === "string" ? source.tagline.trim() : "";
  if (name.length < 2 || tagline.length < 2) return null;
  const funds = Array.isArray(source.funds)
    ? source.funds
        .map(normalizeAmcFund)
        .filter((fund): fund is AmcFundState => fund !== null)
    : [];
  return {
    id:
      typeof source.id === "string" && source.id
        ? source.id
        : `amc-${Date.now().toString(36)}`,
    name: name.slice(0, 40),
    tagline: tagline.slice(0, 80),
    ...(typeof source.detail === "string" && source.detail.trim()
      ? { detail: source.detail.trim().slice(0, 500) }
      : {}),
    foundedAt: finiteNonNegative(source.foundedAt, Date.now()),
    foundedSession: Math.floor(finiteNonNegative(source.foundedSession)),
    foundingBurn: finiteNonNegative(source.foundingBurn, AMC_FOUNDING_BURN),
    cumulativeBurned: finiteNonNegative(
      source.cumulativeBurned,
      AMC_FOUNDING_BURN,
    ),
    approvalRequestId:
      typeof source.approvalRequestId === "string"
        ? source.approvalRequestId
        : "",
    funds,
    lastActionAt: finiteNonNegative(source.lastActionAt, Date.now()),
  };
}

function normalizeAmcFund(value: unknown): AmcFundState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<AmcFundState>;
  const holdings = normalizeWeights(
    Array.isArray(source.holdings) ? source.holdings : [],
  );
  if (!holdings) return null;
  const style: AmcFundStyle = source.style === "passive" ? "passive" : "active";
  const status: AmcFundStatus =
    source.status === "grace" || source.status === "delisted"
      ? source.status
      : "active";
  const feeRate = clamp01(finiteNonNegative(source.feeRate));
  const maxFee = maxFeeRateForStyle(style);
  return {
    id:
      typeof source.id === "string" && source.id
        ? source.id
        : Date.now().toString(36),
    name:
      typeof source.name === "string" && source.name.trim()
        ? source.name.trim().slice(0, 40)
        : "유저 ETF",
    ticker:
      typeof source.ticker === "string"
        ? source.ticker.trim().toUpperCase().slice(0, 6)
        : "FUND",
    style,
    status,
    feeRate: Math.min(feeRate, maxFee) || Math.min(0.001, maxFee),
    ...(style === "active" &&
    typeof source.benchmarkStockId === "string" &&
    source.benchmarkStockId
      ? { benchmarkStockId: source.benchmarkStockId }
      : {}),
    holdings,
    totalShares: Math.max(1, Math.floor(finiteNonNegative(source.totalShares, 10_000))),
    seedNavValue: Math.max(0, Math.round(finiteNonNegative(source.seedNavValue))),
    createdAt: finiteNonNegative(source.createdAt, Date.now()),
    createdSession: Math.floor(finiteNonNegative(source.createdSession)),
    lastFeeSession: Math.floor(finiteNonNegative(source.lastFeeSession)),
    lastRebalanceSession: Math.floor(
      finiteNonNegative(source.lastRebalanceSession),
    ),
    dividendIntervalDays: normalizeAmcDividendInterval(
      source.dividendIntervalDays,
      60,
    ),
    dividendRate: Math.min(
      AMC_ACTIVE_MAX_DIVIDEND_RATE,
      finiteNonNegative(source.dividendRate),
    ),
    lastDividendSession: Math.floor(
      finiteNonNegative(
        source.lastDividendSession,
        finiteNonNegative(source.createdSession),
      ),
    ),
    cumulativeDividendsPaid: finiteNonNegative(source.cumulativeDividendsPaid),
    dividendHistory: Array.isArray(source.dividendHistory)
      ? source.dividendHistory
          .map((point) => {
            if (!point || typeof point !== "object") return null;
            const row = point as AmcDividendPoint;
            const perShare = Math.floor(finiteNonNegative(row.perShare));
            const total = Math.round(finiteNonNegative(row.total));
            const session = Math.floor(finiteNonNegative(row.session));
            if (perShare <= 0 || total <= 0) return null;
            return { session, perShare, total };
          })
          .filter((point): point is AmcDividendPoint => point !== null)
          .slice(-12)
      : [],
    graceStartedSession:
      source.graceStartedSession == null
        ? null
        : Math.floor(finiteNonNegative(source.graceStartedSession)),
    ...(source.delistedAt
      ? { delistedAt: finiteNonNegative(source.delistedAt) }
      : {}),
    ...(source.delistedSession != null
      ? {
          delistedSession: Math.floor(
            finiteNonNegative(source.delistedSession),
          ),
        }
      : {}),
    navHistory: Array.isArray(source.navHistory)
      ? source.navHistory
          .map((point) => {
            if (!point || typeof point !== "object") return null;
            const row = point as AmcNavPoint;
            const nav = finiteNonNegative(row.nav);
            if (!(nav > 0)) return null;
            return {
              t: finiteNonNegative(row.t, Date.now()),
              nav,
              ...(row.benchmarkNav != null
                ? { benchmarkNav: finiteNonNegative(row.benchmarkNav) }
                : {}),
            };
          })
          .filter((point): point is AmcNavPoint => point !== null)
          .slice(-120)
      : [],
    cumulativeFeesPaid: finiteNonNegative(source.cumulativeFeesPaid),
    ...(typeof source.listingRequestId === "string" && source.listingRequestId
      ? { listingRequestId: source.listingRequestId }
      : {}),
  };
}

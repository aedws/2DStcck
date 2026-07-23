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
export const AMC_MIN_HOLDING_WEIGHT = 0.01;
export const AMC_MAX_HOLDING_WEIGHT = 0.5;
export const AMC_FUND_ID_PREFIX = "amc:" as const;
export const AMC_DIVIDEND_INTERVALS = [5, 20, 60] as const;
export const AMC_MIN_DIVIDEND_INTERVAL_DAYS = 1;
export const AMC_MAX_DIVIDEND_INTERVAL_DAYS = 240;
export type AmcDividendIntervalDays = number;
export const AMC_SHARE_ADJUSTMENT_RATIOS = [2, 5, 10] as const;
export type AmcShareAdjustmentRatio =
  (typeof AMC_SHARE_ADJUSTMENT_RATIOS)[number];
/** 자동 분할·병합 뒤 반대 조정이 연속 발동하지 않는 최소 거래일. */
export const AMC_SHARE_ADJUSTMENT_COOLDOWN_DAYS = 5;
/** 액티브 회차당 AUM 대비 배당률 상한 */
export const AMC_ACTIVE_MAX_DIVIDEND_RATE = 0.05;
export const AMC_TRADING_SESSIONS_PER_YEAR = 240;
/** 신규 ETF의 표준 최초 좌당 NAV — $100. 거액 시드도 과대 액면가로 시작하지 않는다. */
export const AMC_INITIAL_NAV_PER_SHARE = 10_000;

export type AmcFundStyle = "active" | "passive";
export type AmcFundStatus = "active" | "grace" | "delisted";
export type AmcFundProfile = "general" | "income" | "leveraged" | "mixed";

export interface AmcHoldingWeight {
  stockId: string;
  weight: number;
  /** 마지막 설정·리밸런싱 시점의 액면분할 전 경제가. */
  basePrice?: number;
}

export interface AmcFundExposureProfile {
  profile: AmcFundProfile;
  label: "일반형" | "인컴형" | "레버리지형" | "파생 혼합형";
  incomeWeight: number;
  leverageWeight: number;
  directWeight: number;
}

type AmcExposureStock = {
  leverage?: number;
  coveredCallUnderlyingId?: string;
  coveredCallAnnualYield?: number;
};

/**
 * 유저 ETF의 현재 구성 비중에서 운용 성향을 파생한다.
 * 커버드콜은 인컴, 레버리지·인버스·곱버스는 레버리지 노출로 분류하며
 * 리밸런싱 직후에도 저장 마이그레이션 없이 즉시 새 상태가 반영된다.
 */
export function classifyAmcFundExposure(
  fund: Pick<AmcFundState, "holdings">,
  stockOf: (stockId: string) => AmcExposureStock | undefined,
): AmcFundExposureProfile {
  const totalWeight = fund.holdings.reduce(
    (sum, holding) =>
      sum + (Number.isFinite(holding.weight) && holding.weight > 0
        ? holding.weight
        : 0),
    0,
  );
  if (!(totalWeight > 0)) {
    return {
      profile: "general",
      label: "일반형",
      incomeWeight: 0,
      leverageWeight: 0,
      directWeight: 1,
    };
  }

  let incomeWeight = 0;
  let leverageWeight = 0;
  for (const holding of fund.holdings) {
    if (!(holding.weight > 0)) continue;
    const stock = stockOf(holding.stockId);
    if (
      stock?.coveredCallUnderlyingId ||
      (stock?.coveredCallAnnualYield ?? 0) > 0
    ) {
      incomeWeight += holding.weight / totalWeight;
    } else if (stock?.leverage !== undefined) {
      leverageWeight += holding.weight / totalWeight;
    }
  }
  incomeWeight = Math.max(0, Math.min(1, incomeWeight));
  leverageWeight = Math.max(0, Math.min(1, leverageWeight));
  const directWeight = Math.max(0, 1 - incomeWeight - leverageWeight);

  if (incomeWeight <= 1e-9 && leverageWeight <= 1e-9) {
    return {
      profile: "general",
      label: "일반형",
      incomeWeight,
      leverageWeight,
      directWeight,
    };
  }
  if (Math.abs(incomeWeight - leverageWeight) <= 1e-9) {
    return {
      profile: "mixed",
      label: "파생 혼합형",
      incomeWeight,
      leverageWeight,
      directWeight,
    };
  }
  return incomeWeight > leverageWeight
    ? {
        profile: "income",
        label: "인컴형",
        incomeWeight,
        leverageWeight,
        directWeight,
      }
    : {
        profile: "leveraged",
        label: "레버리지형",
        incomeWeight,
        leverageWeight,
        directWeight,
      };
}

export interface AmcNavPoint {
  t: number;
  /** 좌당 NAV (센트) */
  nav: number;
  /** 벤치마크 좌당 환산(액티브, 센트). 패시브는 생략 가능 */
  benchmarkNav?: number;
  /** 기록 당시 누적 좌수 배수. 분할·병합 뒤 과거 NAV를 현재 액면으로 환산한다. */
  shareMultiplier?: number;
}

export interface AmcDividendPoint {
  session: number;
  /** 좌당 배당 (센트) */
  perShare: number;
  /** 펀드 전체 배당 총액 (센트) — NAV 차감분 */
  total: number;
  /** 지급 당시 누적 좌수 배수. 이후 분할·병합 뒤 좌당 인컴을 환산할 때 사용한다. */
  shareMultiplier?: number;
}

/** 마지막 확인 회차 뒤의 배당만 오래된 순서로 반환한다. */
export function amcDividendHistoryAfter(
  history: AmcDividendPoint[],
  cursorSession: number | undefined,
): AmcDividendPoint[] {
  const cursor = Number.isFinite(cursorSession)
    ? cursorSession!
    : Number.NEGATIVE_INFINITY;
  return history
    .filter((entry) => entry.session > cursor)
    .sort((a, b) => a.session - b.session);
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
  /** 가격수익률을 비교할 일반 주식 1개. 운용 유형과 무관하게 선택할 수 있다. */
  comparisonStockId?: string;
  holdings: AmcHoldingWeight[];
  /** 구성별 편입 기준가 대비 현재 경제가의 가중 합 기준값. */
  basketPriceFactor?: number;
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
  /** 좌당 NAV가 이 가격(센트) 이상이면 자동 분할. 없으면 비활성. */
  splitTriggerPrice?: number;
  splitRatio?: AmcShareAdjustmentRatio;
  /** 좌당 NAV가 이 가격(센트) 이하이면 자동 병합. 없으면 비활성. */
  reverseSplitTriggerPrice?: number;
  reverseSplitRatio?: AmcShareAdjustmentRatio;
  /** 설립 이후 누적 좌수 배수. 2:1 분할은 ×2, 1:2 병합은 ÷2. */
  shareMultiplier?: number;
  lastShareAdjustmentSession?: number;
  /** stock_requests 상장 허가 신청 id (공유 마켓 상장 전) */
  listingRequestId?: string;
}

/**
 * 상장 신청 전 로컬 전용 ETF만 브라우저가 배당·운용료를 정산한다.
 * 신청 이후에는 공유 목록 복원이 잠시 늦더라도 서버 원장이 단일 권위다.
 */
export function shouldSettleAmcFundLocally(
  fund: Pick<AmcFundState, "id" | "listingRequestId">,
  listedFundIds: ReadonlySet<string>,
): boolean {
  return !listedFundIds.has(fund.id) && !fund.listingRequestId;
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

export interface UpdateAssetManagerProfileInput {
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
  comparisonStockId?: string;
  holdings: AmcHoldingWeight[];
  /** 시드 현금(센트). 10% 소각, 90% NAV */
  seedCash: number;
  /** 배당 주기. 기본 60 */
  dividendIntervalDays?: AmcDividendIntervalDays;
  /** 액티브 회차 배당률. 패시브는 무시 */
  dividendRate?: number;
  splitTriggerPrice?: number;
  splitRatio?: AmcShareAdjustmentRatio;
  reverseSplitTriggerPrice?: number;
  reverseSplitRatio?: AmcShareAdjustmentRatio;
}

export interface UpdateAmcShareAdjustmentInput {
  splitTriggerPrice?: number;
  splitRatio?: AmcShareAdjustmentRatio;
  reverseSplitTriggerPrice?: number;
  reverseSplitRatio?: AmcShareAdjustmentRatio;
}

export interface UpdateAmcComparisonStockInput {
  comparisonStockId: string;
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

export function normalizeAmcShareAdjustmentRatio(
  value: unknown,
  fallback: AmcShareAdjustmentRatio = 2,
): AmcShareAdjustmentRatio {
  const ratio = Number(value);
  return AMC_SHARE_ADJUSTMENT_RATIOS.includes(
    ratio as AmcShareAdjustmentRatio,
  )
    ? (ratio as AmcShareAdjustmentRatio)
    : fallback;
}

/** 분할·병합 직후 가격이 반대 트리거를 다시 밟지 않는 설정인지 확인합니다. */
export function isAmcShareAdjustmentBandStable(input: {
  splitTriggerPrice?: number;
  splitRatio?: AmcShareAdjustmentRatio;
  reverseSplitTriggerPrice?: number;
  reverseSplitRatio?: AmcShareAdjustmentRatio;
}): boolean {
  const split = Math.round(finiteNonNegative(input.splitTriggerPrice));
  const reverse = Math.round(finiteNonNegative(input.reverseSplitTriggerPrice));
  if (!(split > 0) || !(reverse > 0)) return true;
  const splitRatio = normalizeAmcShareAdjustmentRatio(input.splitRatio);
  const reverseRatio = normalizeAmcShareAdjustmentRatio(
    input.reverseSplitRatio,
  );
  return reverse * splitRatio < split && reverse * reverseRatio < split;
}

export function isAmcShareAdjustmentCoolingDown(
  lastAdjustmentSession: number | undefined,
  currentSession: number,
): boolean {
  return (
    lastAdjustmentSession != null &&
    currentSession - lastAdjustmentSession < AMC_SHARE_ADJUSTMENT_COOLDOWN_DAYS
  );
}

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
      ...(finiteNonNegative(row.basePrice) > 0
        ? { basePrice: finiteNonNegative(row.basePrice) }
        : {}),
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
    ...(row.basePrice != null ? { basePrice: row.basePrice } : {}),
  }));
}

/** 공유 원장 JSON 파싱용 — 종목 수 상한만 완화하지 않고 동일 규칙. */
export function normalizeWeightsSafe(
  holdings: AmcHoldingWeight[],
): AmcHoldingWeight[] | null {
  return normalizeWeights(holdings);
}

/** 신규 설정·리밸런싱용 비중 규칙. 기존 서버 원장 파싱은 호환성을 위해 별도다. */
export function validateAmcHoldingWeights(
  holdings: AmcHoldingWeight[],
): AmcHoldingWeight[] | null {
  const rawWeightSum = holdings.reduce(
    (sum, row) => sum + finiteNonNegative(row.weight),
    0,
  );
  if (Math.abs(rawWeightSum - 1) > 0.000001) return null;
  const normalized = normalizeWeights(holdings);
  if (!normalized) return null;
  const epsilon = 1e-9;
  if (
    normalized.some(
      (row) =>
        row.weight < AMC_MIN_HOLDING_WEIGHT - epsilon ||
        row.weight > AMC_MAX_HOLDING_WEIGHT + epsilon,
    )
  ) {
    return null;
  }
  return normalized;
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
  if (
    Number.isFinite(number) &&
    number >= AMC_MIN_DIVIDEND_INTERVAL_DAYS &&
    number <= AMC_MAX_DIVIDEND_INTERVAL_DAYS
  ) {
    return number;
  }
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
  valuationPriceOf: (stockId: string) => number = priceOf,
): number {
  if (fund.totalShares <= 0 || fund.status === "delisted") return 0;
  const currentFactor = computeAmcFundBasketPriceFactor(
    fund.holdings,
    priceOf,
    initialPriceOf,
    valuationPriceOf,
  );
  if (!(currentFactor > 0)) {
    return Math.round(fund.seedNavValue / fund.totalShares);
  }
  const baseFactor =
    Number.isFinite(fund.basketPriceFactor) && (fund.basketPriceFactor ?? 0) > 0
      ? fund.basketPriceFactor!
      : 1;
  return Math.max(
    1,
    Math.round(
      (fund.seedNavValue * (currentFactor / baseFactor)) / fund.totalShares,
    ),
  );
}

export function computeAmcFundBasketPriceFactor(
  holdings: AmcHoldingWeight[],
  priceOf: (stockId: string) => number,
  initialPriceOf: (stockId: string) => number,
  valuationPriceOf: (stockId: string) => number = priceOf,
): number {
  let factor = 0;
  for (const row of holdings) {
    const hasHoldingBase = Number.isFinite(row.basePrice) && (row.basePrice ?? 0) > 0;
    const px = hasHoldingBase
      ? valuationPriceOf(row.stockId)
      : priceOf(row.stockId);
    const base = hasHoldingBase ? row.basePrice! : initialPriceOf(row.stockId);
    if (!(px > 0) || !(base > 0)) continue;
    factor += row.weight * (px / base);
  }
  return factor;
}

/**
 * 구 ETF를 현재 NAV 그대로 구성별 편입 기준가 모델로 전환한다.
 * 전환 순간까지의 손익은 seedNavValue에 확정하고, 이후부터 목표 비중대로 움직인다.
 */
export function upgradeAmcFundHoldingBases(
  fund: AmcFundState,
  priceOf: (stockId: string) => number,
  initialPriceOf: (stockId: string) => number,
  valuationPriceOf: (stockId: string) => number = priceOf,
): AmcFundState {
  if (
    fund.holdings.every(
      (row) => Number.isFinite(row.basePrice) && (row.basePrice ?? 0) > 0,
    )
  ) {
    return fund;
  }
  const oldFactor = computeAmcFundBasketPriceFactor(
    fund.holdings,
    priceOf,
    initialPriceOf,
    valuationPriceOf,
  );
  const oldBase =
    Number.isFinite(fund.basketPriceFactor) && (fund.basketPriceFactor ?? 0) > 0
      ? fund.basketPriceFactor!
      : 1;
  const holdings = fund.holdings.map((row) => ({
    ...row,
    basePrice: valuationPriceOf(row.stockId),
  }));
  if (
    !(oldFactor > 0) ||
    holdings.some((row) => !(row.basePrice > 0))
  ) {
    return fund;
  }
  return {
    ...fund,
    holdings,
    seedNavValue: Math.max(
      0,
      Math.round(fund.seedNavValue * (oldFactor / oldBase)),
    ),
    basketPriceFactor: 1,
  };
}

/** 장부가(seed/shares). 생성·환매 시 seedNavValue는 이 값으로만 증감해야 한다. */
export function computeAmcFundBookPerShare(fund: {
  seedNavValue: number;
  totalShares: number;
}): number {
  if (!(fund.totalShares > 0)) return 0;
  return fund.seedNavValue / fund.totalShares;
}

/**
 * 오픈엔드 생성/환매 — 장부가 × 좌수만 seed에 반영.
 * (시세 NAV를 seed에 넣으면 relative가 이중 반영되어 AUM이 폭주·붕괴한다.)
 */
export function applyAmcShareCreationRedemption(
  fund: AmcFundState,
  deltaShares: number,
): AmcFundState | null {
  if (!Number.isFinite(deltaShares) || deltaShares === 0) return null;
  if (!(fund.totalShares > 0) || fund.status === "delisted") return null;
  const nextShares = fund.totalShares + deltaShares;
  if (!(nextShares > 0)) return null;
  const book = computeAmcFundBookPerShare(fund);
  const nextSeed = Math.round(fund.seedNavValue + book * deltaShares);
  if (nextSeed < 0) return null;
  return {
    ...fund,
    totalShares: nextShares,
    seedNavValue: nextSeed,
  };
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

export function updateAssetManagerProfile(
  manager: AssetManagerState,
  input: UpdateAssetManagerProfileInput,
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
  return {
    success: true,
    message: "자산운용사 이름과 소개를 수정했습니다.",
    manager: {
      ...manager,
      name,
      tagline,
      ...(detail ? { detail } : { detail: undefined }),
      lastActionAt: now,
    },
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
  valuationPriceOf: (stockId: string) => number = priceOf,
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
  const validatedHoldings = validateAmcHoldingWeights(input.holdings);
  if (!validatedHoldings) {
    return {
      success: false,
      message: `구성 종목은 ${AMC_MIN_HOLDINGS}~${AMC_MAX_HOLDINGS}개, 합계 100%, 종목별 비중은 1~50%여야 합니다.`,
    };
  }
  for (const row of validatedHoldings) {
    if (
      !(priceOf(row.stockId) > 0) ||
      !(initialPriceOf(row.stockId) > 0) ||
      !(valuationPriceOf(row.stockId) > 0)
    ) {
      return {
        success: false,
        message: "상장·거래 중인 기업 종목만 편입할 수 있습니다.",
      };
    }
  }
  const holdings = validatedHoldings.map((row) => ({
    ...row,
    basePrice: valuationPriceOf(row.stockId),
  }));
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
  const fundId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const basketPriceFactor = computeAmcFundBasketPriceFactor(
    holdings,
    priceOf,
    initialPriceOf,
    valuationPriceOf,
  );
  const splitTriggerPrice = Math.round(
    finiteNonNegative(input.splitTriggerPrice),
  );
  const reverseSplitTriggerPrice = Math.round(
    finiteNonNegative(input.reverseSplitTriggerPrice),
  );
  if (!isAmcShareAdjustmentBandStable({
    splitTriggerPrice,
    splitRatio: normalizeAmcShareAdjustmentRatio(input.splitRatio),
    reverseSplitTriggerPrice,
    reverseSplitRatio: normalizeAmcShareAdjustmentRatio(
      input.reverseSplitRatio,
    ),
  })) {
    return {
      success: false,
      message: "자동 병합 가격은 자동 분할 가격보다 낮아야 합니다.",
    };
  }
  // 종전 1만 좌 상한은 거액 시드 ETF를 좌당 수백만~수천만 달러로 만들고,
  // 자동 분할 냉각기간 동안 가격·수익률이 고장난 것처럼 보이게 했다. 최초 NAV를
  // $100 근처(사용자가 정한 자동조정 밴드가 더 좁으면 그 안)로 정규화한다.
  const initialNavTarget = Math.max(
    reverseSplitTriggerPrice > 0
      ? reverseSplitTriggerPrice *
          normalizeAmcShareAdjustmentRatio(input.reverseSplitRatio)
      : 1,
    Math.min(
      AMC_INITIAL_NAV_PER_SHARE,
      splitTriggerPrice > 0 ? Math.max(1, splitTriggerPrice - 1) : Number.MAX_SAFE_INTEGER,
    ),
  );
  const totalShares = Math.max(
    1,
    Math.round(navValue / initialNavTarget),
  );
  const navPerShare = Math.max(1, Math.round(navValue / totalShares));
  const comparisonStockId = input.comparisonStockId?.trim();
  if (comparisonStockId && !(priceOf(comparisonStockId) > 0)) {
    return { success: false, message: "비교할 목표 주식의 시세를 확인할 수 없습니다." };
  }
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
    ...(comparisonStockId ? { comparisonStockId } : {}),
    holdings,
    basketPriceFactor,
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
    navHistory: [{ t: now, nav: navPerShare, shareMultiplier: 1 }],
    cumulativeFeesPaid: 0,
    ...(splitTriggerPrice > 0
      ? {
          splitTriggerPrice,
          splitRatio: normalizeAmcShareAdjustmentRatio(input.splitRatio),
        }
      : {}),
    ...(reverseSplitTriggerPrice > 0
      ? {
          reverseSplitTriggerPrice,
          reverseSplitRatio: normalizeAmcShareAdjustmentRatio(
            input.reverseSplitRatio,
          ),
        }
      : {}),
    shareMultiplier: 1,
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

/** 생성 이후에도 자동 분할·병합 조건만 독립적으로 변경한다. */
export function updateAmcShareAdjustmentSettings(
  manager: AssetManagerState,
  fundId: string,
  input: UpdateAmcShareAdjustmentInput,
  now = Date.now(),
): AmcActionResult {
  const fund = manager.funds.find((item) => item.id === fundId);
  if (!fund) return { success: false, message: "펀드를 찾을 수 없습니다." };
  if (fund.status === "delisted") {
    return { success: false, message: "상장폐지된 펀드는 수정할 수 없습니다." };
  }

  const splitTriggerPrice = Math.round(
    finiteNonNegative(input.splitTriggerPrice),
  );
  const reverseSplitTriggerPrice = Math.round(
    finiteNonNegative(input.reverseSplitTriggerPrice),
  );
  if (!isAmcShareAdjustmentBandStable({
    splitTriggerPrice,
    splitRatio: normalizeAmcShareAdjustmentRatio(input.splitRatio),
    reverseSplitTriggerPrice,
    reverseSplitRatio: normalizeAmcShareAdjustmentRatio(
      input.reverseSplitRatio,
    ),
  })) {
    return {
      success: false,
      message: "자동 병합 가격은 자동 분할 가격보다 낮아야 합니다.",
    };
  }

  const baseFund: AmcFundState = { ...fund };
  delete baseFund.splitTriggerPrice;
  delete baseFund.splitRatio;
  delete baseFund.reverseSplitTriggerPrice;
  delete baseFund.reverseSplitRatio;
  const updated: AmcFundState = {
    ...baseFund,
    ...(splitTriggerPrice > 0
      ? {
          splitTriggerPrice,
          splitRatio: normalizeAmcShareAdjustmentRatio(input.splitRatio),
        }
      : {}),
    ...(reverseSplitTriggerPrice > 0
      ? {
          reverseSplitTriggerPrice,
          reverseSplitRatio: normalizeAmcShareAdjustmentRatio(
            input.reverseSplitRatio,
          ),
        }
      : {}),
  };
  return {
    success: true,
    message: "자동 분할·병합 설정을 수정했습니다.",
    manager: {
      ...manager,
      funds: manager.funds.map((item) =>
        item.id === fundId ? updated : item,
      ),
      lastActionAt: now,
    },
    fund: updated,
  };
}

/** 생성·상장 이후에도 성과 비교 대상 주식 1개를 변경한다. */
export function updateAmcComparisonStock(
  manager: AssetManagerState,
  fundId: string,
  input: UpdateAmcComparisonStockInput,
  isEligibleStock: (stockId: string) => boolean,
  now = Date.now(),
): AmcActionResult {
  const fund = manager.funds.find((item) => item.id === fundId);
  if (!fund) return { success: false, message: "펀드를 찾을 수 없습니다." };
  if (fund.status === "delisted") {
    return { success: false, message: "상장폐지된 펀드는 수정할 수 없습니다." };
  }
  const comparisonStockId = input.comparisonStockId.trim();
  if (!comparisonStockId || !isEligibleStock(comparisonStockId)) {
    return { success: false, message: "상장된 일반 주식 1개를 선택해 주세요." };
  }
  const updated: AmcFundState = { ...fund, comparisonStockId };
  return {
    success: true,
    message: "목표 주식 대비 성과 기준을 변경했습니다.",
    manager: {
      ...manager,
      funds: manager.funds.map((item) =>
        item.id === fundId ? updated : item,
      ),
      lastActionAt: now,
    },
    fund: updated,
  };
}

export function rebalanceAmcFund(
  manager: AssetManagerState,
  fundId: string,
  nextHoldings: AmcHoldingWeight[],
  currentSession: number,
  now = Date.now(),
  priceOf?: (stockId: string) => number,
  initialPriceOf?: (stockId: string) => number,
  valuationPriceOf?: (stockId: string) => number,
): AmcActionResult {
  const fund = manager.funds.find((item) => item.id === fundId);
  if (!fund) return { success: false, message: "펀드를 찾을 수 없습니다." };
  if (fund.status === "delisted") {
    return { success: false, message: "상장폐지된 펀드는 변경할 수 없습니다." };
  }
  const validatedHoldings = validateAmcHoldingWeights(nextHoldings);
  if (!validatedHoldings) {
    return {
      success: false,
      message: `구성은 ${AMC_MIN_HOLDINGS}~${AMC_MAX_HOLDINGS}종목, 합계 100%, 종목별 비중은 1~50%여야 합니다.`,
    };
  }
  const holdings = validatedHoldings.map((row) => ({
    ...row,
    ...(valuationPriceOf && valuationPriceOf(row.stockId) > 0
      ? { basePrice: valuationPriceOf(row.stockId) }
      : {}),
  }));
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
  // 액티브만 5%p 손바꿈 의무. 패시브는 금액 비중을 자유롭게 수정.
  if (fund.style === "active" && !turnoverOk) {
    return {
      success: false,
      message: "액티브 손바꿈은 비중 5%p 이상 조정 또는 편입/편출이 필요합니다.",
    };
  }
  // status "active" = 운영중(유예 해제). style(액티브/패시브)과는 별개.
  let seedNavValue = fund.seedNavValue;
  let basketPriceFactor = fund.basketPriceFactor;
  if (priceOf && initialPriceOf) {
    const oldFactor = computeAmcFundBasketPriceFactor(
      fund.holdings,
      priceOf,
      initialPriceOf,
      valuationPriceOf ?? priceOf,
    );
    const nextFactor = computeAmcFundBasketPriceFactor(
      holdings,
      priceOf,
      initialPriceOf,
      valuationPriceOf ?? priceOf,
    );
    if (oldFactor > 0 && nextFactor > 0) {
      const oldBase =
        Number.isFinite(fund.basketPriceFactor) &&
        (fund.basketPriceFactor ?? 0) > 0
          ? fund.basketPriceFactor!
          : 1;
      // 종목/비중 변경 자체로 NAV가 튀지 않도록 현재 AUM에서 새 기준을 잡는다.
      seedNavValue = Math.max(
        0,
        Math.round(fund.seedNavValue * (oldFactor / oldBase)),
      );
      basketPriceFactor = nextFactor;
    }
  }
  const updated: AmcFundState = {
    ...fund,
    holdings,
    seedNavValue,
    ...(basketPriceFactor && basketPriceFactor > 0
      ? { basketPriceFactor }
      : {}),
    lastRebalanceSession: currentSession,
    graceStartedSession: null,
    status: "active",
  };
  return {
    success: true,
    message:
      fund.style === "passive"
        ? "패시브 목표가중(금액 비중)을 반영했습니다."
        : "리밸런싱을 반영했습니다.",
    manager: {
      ...manager,
      funds: manager.funds.map((item) => (item.id === fundId ? updated : item)),
      lastActionAt: now,
    },
    fund: updated,
  };
}

/**
 * 운용사가 상장 ETF를 자진 청산한 뒤 로컬 운용 상태에도 같은 결과를 반영한다.
 * 실제 보유자 환급과 원장 좌수 0 처리는 서버 RPC가 한 트랜잭션으로 수행한다.
 */
export function markAmcFundVoluntarilyDelisted(
  manager: AssetManagerState,
  fundId: string,
  currentSession: number,
  now = Date.now(),
): AmcActionResult {
  const fund = manager.funds.find((item) => item.id === fundId);
  if (!fund) return { success: false, message: "펀드를 찾을 수 없습니다." };
  if (fund.status === "delisted") {
    return { success: false, message: "이미 상장폐지된 펀드입니다." };
  }
  const updated: AmcFundState = {
    ...fund,
    status: "delisted",
    graceStartedSession: null,
    delistedAt: now,
    delistedSession: currentSession,
  };
  return {
    success: true,
    message: `${fund.ticker} 자진 상장폐지가 완료되었습니다.`,
    manager: {
      ...manager,
      funds: manager.funds.map((item) =>
        item.id === fundId ? updated : item,
      ),
      lastActionAt: now,
    },
    fund: updated,
  };
}

/** 구성 종목 금액(가치) 동일 비중. 동일 좌수가 아님. */
export function equalWeightHoldings(
  holdings: { stockId: string }[],
): AmcHoldingWeight[] | null {
  const ids = [
    ...new Set(
      holdings
        .map((row) => String(row.stockId ?? "").trim())
        .filter(Boolean),
    ),
  ];
  if (ids.length < AMC_MIN_HOLDINGS || ids.length > AMC_MAX_HOLDINGS) {
    return null;
  }
  const weight = 1 / ids.length;
  return ids.map((stockId) => ({ stockId, weight }));
}

/** 패시브 고정비중 자동 복원 — 시세 드리프트 후 weight 재정규화는 목표 비중 유지로 처리(보유 비중 테이블이 곧 목표). */
export function autoRebalancePassiveFunds(
  manager: AssetManagerState,
  currentSession: number,
  now = Date.now(),
  priceOf?: (stockId: string) => number,
  initialPriceOf?: (stockId: string) => number,
  valuationPriceOf?: (stockId: string) => number,
): AssetManagerState {
  let changed = false;
  const funds = manager.funds.map((fund) => {
    if (fund.style !== "passive" || fund.status !== "active") return fund;
    if (currentSession - fund.lastRebalanceSession < AMC_FEE_INTERVAL_DAYS) {
      return fund;
    }
    changed = true;
    if (priceOf && initialPriceOf) {
      const oldFactor = computeAmcFundBasketPriceFactor(
        fund.holdings,
        priceOf,
        initialPriceOf,
        valuationPriceOf ?? priceOf,
      );
      const oldBase =
        Number.isFinite(fund.basketPriceFactor) &&
        (fund.basketPriceFactor ?? 0) > 0
          ? fund.basketPriceFactor!
          : 1;
      const holdings = fund.holdings.map((row) => ({
        ...row,
        basePrice: (valuationPriceOf ?? priceOf)(row.stockId),
      }));
      if (oldFactor > 0 && holdings.every((row) => row.basePrice > 0)) {
        return {
          ...fund,
          holdings,
          seedNavValue: Math.max(
            0,
            Math.round(fund.seedNavValue * (oldFactor / oldBase)),
          ),
          basketPriceFactor: 1,
          lastRebalanceSession: currentSession,
        };
      }
    }
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
    manager:
      newlyDelisted.length ||
      funds.some((fund, index) => fund !== manager.funds[index])
        ? { ...manager, funds, lastActionAt: now }
        : manager,
    newlyDelisted,
  };
}

export function settleAmcManagementFees(
  manager: AssetManagerState,
  currentSession: number,
  priceOf: (stockId: string) => number,
  initialPriceOf: (stockId: string) => number,
  now = Date.now(),
  valuationPriceOf: (stockId: string) => number = priceOf,
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
      const nav = computeAmcFundNavPerShare(
        next,
        priceOf,
        initialPriceOf,
        valuationPriceOf,
      );
      const aum = nav * next.totalShares;
      const amount = Math.max(0, Math.round(aum * next.feeRate));
      if (amount > 0) {
        const factor = computeAmcFundBasketPriceFactor(
          next.holdings,
          priceOf,
          initialPriceOf,
          valuationPriceOf,
        );
        const baseFactor =
          Number.isFinite(next.basketPriceFactor) &&
          (next.basketPriceFactor ?? 0) > 0
            ? next.basketPriceFactor!
            : 1;
        const performanceFactor = factor > 0 ? factor / baseFactor : 1;
        // 현재 AUM에서 정확히 amount만 빠지도록 기준자산 금액으로 환산한다.
        const seedDeduction = Math.round(amount / performanceFactor);
        const nextSeed = Math.max(0, next.seedNavValue - seedDeduction);
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
          nav: computeAmcFundNavPerShare(
            next,
            priceOf,
            initialPriceOf,
            valuationPriceOf,
          ),
          shareMultiplier: Math.max(0.000001, next.shareMultiplier ?? 1),
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
  valuationPriceOf: (stockId: string) => number = priceOf,
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
      const nav = computeAmcFundNavPerShare(
        next,
        priceOf,
        initialPriceOf,
        valuationPriceOf,
      );
      const aum = nav * next.totalShares;
      const total = Math.max(0, Math.round(aum * rate));
      if (total <= 0 || next.totalShares <= 0) continue;
      const perShare = Math.max(0, Math.floor(total / next.totalShares));
      const paidTotal = perShare * next.totalShares;
      if (perShare <= 0 || paidTotal <= 0) continue;
      const factor = computeAmcFundBasketPriceFactor(
        next.holdings,
        priceOf,
        initialPriceOf,
        valuationPriceOf,
      );
      const baseFactor =
        Number.isFinite(next.basketPriceFactor) &&
        (next.basketPriceFactor ?? 0) > 0
          ? next.basketPriceFactor!
          : 1;
      const performanceFactor = factor > 0 ? factor / baseFactor : 1;
      next = {
        ...next,
        seedNavValue: Math.max(
          0,
          next.seedNavValue - Math.round(paidTotal / performanceFactor),
        ),
        cumulativeDividendsPaid: next.cumulativeDividendsPaid + paidTotal,
      };
      history.push({
        session: dueSession,
        perShare,
        total: paidTotal,
        shareMultiplier: Math.max(0.000001, next.shareMultiplier ?? 1),
      });
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
      dividendHistory: history.slice(-240),
      navHistory: [
        ...next.navHistory,
        {
          t: now,
          nav: computeAmcFundNavPerShare(
            next,
            priceOf,
            initialPriceOf,
            valuationPriceOf,
          ),
          shareMultiplier: Math.max(0.000001, next.shareMultiplier ?? 1),
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
  valuationPriceOf: (stockId: string) => number = priceOf,
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
    valuationPriceOf,
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
    ...(typeof source.comparisonStockId === "string" &&
    source.comparisonStockId
      ? { comparisonStockId: source.comparisonStockId }
      : {}),
    holdings,
    basketPriceFactor:
      Number.isFinite(source.basketPriceFactor) &&
      (source.basketPriceFactor ?? 0) > 0
        ? source.basketPriceFactor
        : 1,
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
            const shareMultiplier = Math.max(
              0.000001,
              finiteNonNegative(row.shareMultiplier, 1),
            );
            return { session, perShare, total, shareMultiplier };
          })
          .filter((point): point is NonNullable<typeof point> => point !== null)
          .slice(-240)
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
              ...(row.shareMultiplier != null
                ? {
                    shareMultiplier: Math.max(
                      0.000001,
                      finiteNonNegative(row.shareMultiplier, 1),
                    ),
                  }
                : {}),
            };
          })
          .filter((point): point is AmcNavPoint => point !== null)
          .slice(-120)
      : [],
    cumulativeFeesPaid: finiteNonNegative(source.cumulativeFeesPaid),
    ...(finiteNonNegative(source.splitTriggerPrice) > 0
      ? {
          splitTriggerPrice: Math.round(
            finiteNonNegative(source.splitTriggerPrice),
          ),
          splitRatio: normalizeAmcShareAdjustmentRatio(source.splitRatio),
        }
      : {}),
    ...(finiteNonNegative(source.reverseSplitTriggerPrice) > 0
      ? {
          reverseSplitTriggerPrice: Math.round(
            finiteNonNegative(source.reverseSplitTriggerPrice),
          ),
          reverseSplitRatio: normalizeAmcShareAdjustmentRatio(
            source.reverseSplitRatio,
          ),
        }
      : {}),
    shareMultiplier: Math.max(0.000001, finiteNonNegative(source.shareMultiplier, 1)),
    ...(source.lastShareAdjustmentSession != null
      ? {
          lastShareAdjustmentSession: Math.floor(
            finiteNonNegative(source.lastShareAdjustmentSession),
          ),
        }
      : {}),
    ...(typeof source.listingRequestId === "string" && source.listingRequestId
      ? { listingRequestId: source.listingRequestId }
      : {}),
  };
}

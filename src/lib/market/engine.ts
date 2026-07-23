import type {
  Candle,
  EventTemplate,
  MarketEvent,
  PricePoint,
  StockDefinition,
  StockState,
} from "@/lib/types/market";
import {
  BASE_CANDLE_INTERVAL_MS,
  CANDLE_TICKS,
  DRIFT_TIME_SCALE,
  EVENT_CHANCE_PER_TICK,
  EVENT_IMPACT_TIME_SCALE,
  EVENT_MIN_GAP_MS,
  LEVERAGE_SPLIT_AT,
  LEVERAGE_MERGE_AT,
  LEVERAGE_SPLIT_RATIO,
  LEVERAGE_MERGE_RATIO,
  MARKET_ORDER_SLIPPAGE,
  MARKET_EPOCH_MS,
  MARKET_SECULAR_GROWTH_PER_SESSION,
  MEAN_REVERSION_UP_PER_SESSION,
  MEAN_REVERSION_DOWN_PER_SESSION,
  MARKET_SHOCK_TIME_SCALE,
  MARKET_TREND_BASE_PER_SEC,
  MAX_PRICE_HISTORY,
  SERVER_TICK_SECONDS,
  SESSION_DURATION_MS,
  VOLATILITY_TIME_SCALE,
} from "@/lib/market/constants";
import {
  EVENT_TEMPLATES,
  getCompanyDefinitions,
  STOCK_DEFINITIONS,
} from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import { pickEventQuote, withCharacterQuote } from "@/data/eventQuotes";
import { generateOrderBook } from "@/lib/market/orderBook";
import { isListed } from "@/lib/market/ipo";
import {
  TRADING_SESSIONS_PER_YEAR,
} from "@/lib/market/distributions";
import {
  getMarketRegimeAtSession,
  regimeReturnForStock,
} from "@/lib/market/marketRegimes";
import {
  cycleReturnForStock,
  getMarketCycleAtSession,
} from "@/lib/market/marketCycles";
import {
  crisisReturnForStock,
  getActiveMarketCrisis,
} from "@/lib/market/marketCrises";
import { getMarketEra } from "@/lib/market/marketEras";
import { getGuidelineModifiers } from "@/lib/market/marketGuidelines";
import { strategyFilterLabel } from "@/lib/market/taxonomy";

/** 사인파 추세 주기 (15분) */
const MARKET_TREND_PERIOD_MS = 900_000;
/** 선물의 추세 선행 시간 */
const FUTURES_LEAD_MS = 90_000;

export function randomNormal(rand: () => number = Math.random): number {
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

// ── 결정론 시뮬레이션용 시드 RNG ──
// 같은 (tick, key)면 항상 같은 난수열 → 모든 클라이언트가 동일한 시장을 계산한다.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** (tick, key)로 고정된 난수 스트림. 종목 배열 순서와 무관하게 결정론적이다. */
export function seededRand(simTick: number, key: string): () => number {
  return mulberry32(fnv1a(`${simTick}:${key}`));
}

/**
 * 독립 난수를 몇 초 간격 앵커 사이에서 보간해 1초 틱의 톱니 움직임을 줄인다.
 * 현재 틱만으로 계산할 수 있어 체크포인트 재접속 후에도 같은 가격 경로를 만든다.
 */
export function smoothedNormalAtTick(
  simTick: number,
  key: string,
  spanTicks = 6,
): number {
  const span = Math.max(2, Math.floor(spanTicks));
  const anchor = Math.floor(simTick / span);
  const fraction = (simTick - anchor * span) / span;
  const eased = fraction * fraction * (3 - 2 * fraction);
  const leftWeight = 1 - eased;
  const rightWeight = eased;
  const left = randomNormal(seededRand(anchor, `${key}:smooth`));
  const right = randomNormal(seededRand(anchor + 1, `${key}:smooth`));
  const normalization = Math.sqrt(
    leftWeight * leftWeight + rightWeight * rightWeight,
  );
  return (left * leftWeight + right * rightWeight) / Math.max(normalization, 1e-9);
}

export function createInitialStockState(
  def: StockDefinition,
  at?: number,
): StockState {
  const orderBook = generateOrderBook(def.initialPrice);
  const now = at ?? Date.now();
  return {
    ...def,
    shareMultiplier: 1,
    currentPrice: def.initialPrice,
    prevDayClose: def.initialPrice,
    dayOpen: def.initialPrice,
    daySessionId: Math.floor(now / SESSION_DURATION_MS),
    leveragePathSessionId: Math.floor(now / SESSION_DURATION_MS),
    leveragePathSessionBase: def.initialPrice,
    leveragePathFactors: { "-2": 1, "-1": 1, "2": 1 },
    priceHistory: [{ timestamp: now, price: def.initialPrice }],
    candles: [
      {
        timestamp:
          Math.floor(now / BASE_CANDLE_INTERVAL_MS) * BASE_CANDLE_INTERVAL_MS,
        open: def.initialPrice,
        high: def.initialPrice,
        low: def.initialPrice,
        close: def.initialPrice,
      },
    ],
    dailyCandles: [
      {
        timestamp:
          Math.floor(now / SESSION_DURATION_MS) * SESSION_DURATION_MS,
        open: def.initialPrice,
        high: def.initialPrice,
        low: def.initialPrice,
        close: def.initialPrice,
      },
    ],
    orderBook,
  };
}

function getActiveEventImpact(
  stock: StockState,
  events: MarketEvent[],
  now: number,
): number {
  let impact = 0;
  for (const event of events) {
    const elapsed = now - event.timestamp;
    if (elapsed >= 0 && elapsed < 90_000 && event.affectedStockIds.includes(stock.id)) {
      // macro 이벤트는 시장 민감도(베타)만큼 강하게 맞는다
      const betaScale = event.category === "macro" ? (stock.beta ?? 1) : 1;
      impact += event.impact * betaScale * (1 - elapsed / 90_000);
    }
  }
  return impact;
}

/**
 * Keeps the broad benchmarks on a rising long-run path while preserving normal
 * corrections. Support only activates below the compound-growth baseline, so
 * rallies, pullbacks, volatility, and event shocks remain market-driven.
 */
export function calculateSecularGrowthSupport(
  stock: StockState,
  now: number,
  dtSeconds: number,
): number {
  const sessionSeconds = SESSION_DURATION_MS / 1_000;
  // IPO 종목은 상장 시각을 기점으로 앵커가 공모가에서 자라야 한다(그 전엔 동결).
  const epochBase = stock.listingEpochMs ?? MARKET_EPOCH_MS;
  const elapsedSessions = Math.max(
    0,
    (now - epochBase) / SESSION_DURATION_MS,
  );
  // 드리프트 함축 성장 앵커: 종목의 장기 기대 경로 + 완만한 전역 우상향(현실적 시장).
  const driftGrowthPerSession = (stock.drift ?? 0) * DRIFT_TIME_SCALE * sessionSeconds;
  const secular = MARKET_SECULAR_GROWTH_PER_SESSION;
  const anchor =
    (stock.initialPrice / Math.max(stock.shareMultiplier ?? 1, 1e-12)) *
    Math.exp((driftGrowthPerSession + secular) * elapsedSessions);
  // 로그 편차: 양수면 앵커보다 과열(끌어내림), 음수면 과매도(끌어올림).
  const deviation = Math.log(Math.max(stock.currentPrice, 100) / anchor);
  const sessionFraction = dtSeconds / sessionSeconds;
  const kappa =
    deviation > 0
      ? MEAN_REVERSION_UP_PER_SESSION
      : MEAN_REVERSION_DOWN_PER_SESSION;
  return -deviation * kappa * sessionFraction;
}

/** 명시 베타가 없는 기업도 시장 공통 충격에 현실적인 수준으로 함께 반응한다. */
export function marketBetaForStock(stock: {
  sector: string;
  beta?: number;
}): number {
  if (stock.beta !== undefined) return stock.beta;
  if (stock.sector === "채권") return -0.15;
  return 0.65;
}

/** 시간 기반 가격 엔진: 모든 항이 dt(초)로 스케일되어
 * 틱 간격(로컬 1초 / 서버 10초)과 무관하게 하루 등락폭이 동일하다. */
export function calculateTickPrice(
  stock: StockState,
  events: MarketEvent[],
  now: number,
  marketShock = 0,
  dtSeconds = SERVER_TICK_SECONDS,
  rand: () => number = Math.random,
  smoothedNoise?: number,
): number {
  const sqrtDt = Math.sqrt(dtSeconds);
  const eventImpact = getActiveEventImpact(stock, events, now);
  const session = Math.floor(now / SESSION_DURATION_MS);
  const regime = getMarketRegimeAtSession(session);
  const cycle = getMarketCycleAtSession(session);
  const crisis = getActiveMarketCrisis(session);
  // 전역 시장 국면(에라)과 캐릭터 운영 지침. 국면 시작 전이면 배율 1·편향 0이라
  // 결과가 완전히 동일하다(과거 바이트 동일 → 버전 bump 불필요).
  const era = getMarketEra(session);
  const guideline = stock.ceoId
    ? getGuidelineModifiers(stock.ceoId, era)
    : { volMul: 1, driftPerSecond: 0 };
  const volatilityMultiplier = Math.min(
    4.5,
    Math.max(
      0.45,
      regime.volatilityMultiplier *
        cycle.volatilityMultiplier *
        (crisis?.phase.volatilityMultiplier ?? 1) *
        era.volMul *
        guideline.volMul,
    ),
  );
  const noise =
    (smoothedNoise ?? randomNormal(rand)) *
    stock.volatility *
    VOLATILITY_TIME_SCALE *
    sqrtDt *
    volatilityMultiplier;

  // ── 시장 팩터 (베타 모델): 종목 수익률 = 베타 × (추세 + 공통충격) + 개별 노이즈 ──
  // 약 15분 주기의 사인파 추세. 전 종목이 같은 위상을 공유하고,
  // 선물이 90초 선행한다(선행지표) → 선물을 보면 시장 방향을 미리 안다.
  const beta = marketBetaForStock(stock);
  const trendLead = stock.sector === "선물" ? FUTURES_LEAD_MS : 0;
  const trendAmplitude =
    (stock.trendStrength ?? beta * MARKET_TREND_BASE_PER_SEC) * dtSeconds;
  const trend =
    trendAmplitude *
    era.trendMul *
    Math.sin(((now + trendLead) / MARKET_TREND_PERIOD_MS) * 2 * Math.PI);
  // 공통 충격: 같은 틱의 모든 종목이 같은 z를 받아 지수와 동반 등락한다
  const shock =
    beta *
    marketShock *
    MARKET_SHOCK_TIME_SCALE *
    sqrtDt *
    volatilityMultiplier;
  const regimeReturn = regimeReturnForStock(regime, stock.sector, dtSeconds);
  const cycleReturn = cycleReturnForStock(cycle, stock.sector, dtSeconds);
  const crisisReturn = crisis
    ? crisisReturnForStock(crisis, stock, dtSeconds)
    : 0;
  const secularGrowthSupport = calculateSecularGrowthSupport(
    stock,
    now,
    dtSeconds,
  );

  const changeRate =
    stock.drift * DRIFT_TIME_SCALE * dtSeconds +
    beta * era.driftPerSecond * dtSeconds +
    beta * guideline.driftPerSecond * dtSeconds +
    regimeReturn +
    cycleReturn +
    crisisReturn +
    secularGrowthSupport +
    trend +
    shock +
    eventImpact *
      EVENT_IMPACT_TIME_SCALE *
      cycle.eventImpactMultiplier *
      (crisis?.phase.eventImpactMultiplier ?? 1) *
      dtSeconds +
    noise;
  const nextPrice = stock.currentPrice * (1 + changeRate);
  const roundedPrice = Math.max(Math.round(nextPrice), 100);
  if (stock.maxDailyLossRate === undefined) return roundedPrice;

  const lossRate = Math.min(1, Math.max(0, stock.maxDailyLossRate));
  const sessionOpenReference =
    stock.daySessionId !== undefined && stock.daySessionId !== session
      ? stock.currentPrice
      : stock.prevDayClose;
  const dailyFloor = Math.round(sessionOpenReference * (1 - lossRate));
  return Math.max(roundedPrice, dailyFloor, 100);
}

/** 30초봉 6시간, 일봉 약 5게임년을 보존한다. */
export const MAX_CANDLES = 720;
export const MAX_DAILY_CANDLES = 1_250;

export function applyTickToCandles(
  candles: Candle[],
  price: number,
  now: number,
): Candle[] {
  const candleStart =
    Math.floor(now / BASE_CANDLE_INTERVAL_MS) * BASE_CANDLE_INTERVAL_MS;
  const last = candles[candles.length - 1];

  if (last && last.timestamp === candleStart) {
    const updated: Candle = {
      ...last,
      high: Math.max(last.high, price),
      low: Math.min(last.low, price),
      close: price,
    };
    return [...candles.slice(0, -1), updated];
  }

  return [
    ...candles,
    { timestamp: candleStart, open: price, high: price, low: price, close: price },
  ].slice(-MAX_CANDLES);
}

/** 게임 거래일(1시간) 단위 OHLC 유지 */
export function applyTickToDailyCandles(
  candles: Candle[],
  price: number,
  now: number,
): Candle[] {
  const sessionStart =
    Math.floor(now / SESSION_DURATION_MS) * SESSION_DURATION_MS;
  const last = candles[candles.length - 1];

  if (last && last.timestamp === sessionStart) {
    return [
      ...candles.slice(0, -1),
      {
        ...last,
        high: Math.max(last.high, price),
        low: Math.min(last.low, price),
        close: price,
      },
    ];
  }

  return [
    ...candles,
    {
      timestamp: sessionStart,
      open: price,
      high: price,
      low: price,
      close: price,
    },
  ].slice(-MAX_DAILY_CANDLES);
}

/** 연속 일봉을 주·월·연 단위로 집계 */
export function aggregateCandlesBySessions(
  candles: Candle[],
  sessionsPerBar: number,
): Candle[] {
  const size = Math.max(1, Math.floor(sessionsPerBar));
  const buckets = new Map<number, Candle>();

  for (const candle of candles) {
    const session = Math.floor(candle.timestamp / SESSION_DURATION_MS);
    const bucket = Math.floor(session / size);
    const current = buckets.get(bucket);
    if (!current) {
      buckets.set(bucket, { ...candle });
      continue;
    }
    current.high = Math.max(current.high, candle.high);
    current.low = Math.min(current.low, candle.low);
    current.close = candle.close;
  }

  return [...buckets.values()];
}

/** 결정된 다음 가격을 종목 상태에 반영 (거래일 롤오버·호가·히스토리·캔들) */
function applyTickPrice(
  stock: StockState,
  nextPrice: number,
  now: number,
): StockState {
  // 거래일: 벽시계 1시간 단위. 경계를 넘으면 전일 종가·시초가 롤오버.
  // (구버전 상태는 daySessionId가 없음 → 롤오버 없이 현재 거래일에 편입)
  const session = Math.floor(now / SESSION_DURATION_MS);
  const isNewSession =
    stock.daySessionId !== undefined && stock.daySessionId !== session;
  const leveragePath = advanceDailyLeveragePath(stock, session);
  let prevDayClose = stock.prevDayClose;
  let dayOpen = stock.dayOpen;

  if (isNewSession) {
    prevDayClose = stock.currentPrice;
    dayOpen = nextPrice;
  }

  const orderBook = generateOrderBook(nextPrice, stock.orderBook);
  const newHistory = [
    ...stock.priceHistory,
    { timestamp: now, price: nextPrice },
  ].slice(-MAX_PRICE_HISTORY);

  return {
    ...stock,
    daySessionId: session,
    ...leveragePath,
    prevDayClose,
    dayOpen,
    currentPrice: nextPrice,
    orderBook,
    priceHistory: newHistory,
    candles: applyTickToCandles(stock.candles ?? [], nextPrice, now),
    dailyCandles: applyTickToDailyCandles(
      stock.dailyCandles ?? [],
      nextPrice,
      now,
    ),
  };
}

/** 현금 분배일의 배당락을 가격·시초가·차트·호가에 한 번 반영한다. */
export function applyCashDistributionToStock(
  stock: StockState,
  amountPerShare: number,
  now: number,
): StockState {
  if (amountPerShare <= 0) return stock;

  const session = Math.floor(now / SESSION_DURATION_MS);
  const isNewSession =
    stock.daySessionId !== undefined && stock.daySessionId !== session;
  const leveragePath = advanceDailyLeveragePath(stock, session);
  const unadjustedOpen = isNewSession ? stock.currentPrice : stock.dayOpen;
  const nextPrice = Math.max(Math.round(stock.currentPrice - amountPerShare), 100);
  const dayOpen = Math.max(Math.round(unadjustedOpen - amountPerShare), 100);
  const candleStart =
    Math.floor(now / BASE_CANDLE_INTERVAL_MS) * BASE_CANDLE_INTERVAL_MS;
  const lastCandle = stock.candles?.[stock.candles.length - 1];
  const candles =
    lastCandle?.timestamp === candleStart
      ? [
          ...stock.candles.slice(0, -1),
          {
            ...lastCandle,
            open: Math.max(lastCandle.open - amountPerShare, 100),
            high: Math.max(lastCandle.high - amountPerShare, 100),
            low: Math.max(lastCandle.low - amountPerShare, 100),
            close: nextPrice,
          },
        ]
      : applyTickToCandles(stock.candles ?? [], nextPrice, now);
  const lastPoint = stock.priceHistory[stock.priceHistory.length - 1];
  const priceHistory = (
    lastPoint?.timestamp === now
      ? [...stock.priceHistory.slice(0, -1), { timestamp: now, price: nextPrice }]
      : [...stock.priceHistory, { timestamp: now, price: nextPrice }]
  ).slice(-MAX_PRICE_HISTORY);
  const sessionStart =
    Math.floor(now / SESSION_DURATION_MS) * SESSION_DURATION_MS;
  const previousDailyCandles = stock.dailyCandles ?? [];
  const lastDailyCandle = previousDailyCandles[previousDailyCandles.length - 1];
  const dailyCandles =
    lastDailyCandle?.timestamp === sessionStart
      ? [
          ...previousDailyCandles.slice(0, -1),
          {
            ...lastDailyCandle,
            open: Math.max(lastDailyCandle.open - amountPerShare, 100),
            high: Math.max(lastDailyCandle.high - amountPerShare, 100),
            low: Math.max(lastDailyCandle.low - amountPerShare, 100),
            close: nextPrice,
          },
        ]
      : applyTickToDailyCandles(previousDailyCandles, nextPrice, now);

  return {
    ...stock,
    navDistributionAdjustment: stock.etfHoldings?.length
      ? (stock.navDistributionAdjustment ?? 0) + amountPerShare
      : stock.navDistributionAdjustment,
    daySessionId: session,
    ...leveragePath,
    prevDayClose: isNewSession ? stock.currentPrice : stock.prevDayClose,
    dayOpen,
    currentPrice: nextPrice,
    orderBook: generateOrderBook(nextPrice, stock.orderBook),
    priceHistory,
    candles,
    dailyCandles,
  };
}

export function tickStock(
  stock: StockState,
  events: MarketEvent[],
  now: number,
  tick: number,
  marketShock = 0,
  dtSeconds = SERVER_TICK_SECONDS,
  rand: () => number = Math.random,
): StockState {
  const nextPrice = calculateTickPrice(
    stock,
    events,
    now,
    marketShock,
    dtSeconds,
    rand,
  );
  return applyTickPrice(stock, nextPrice, now);
}

const DAILY_TRACKING_LEVERAGES = [-2, -1, 2] as const;
const MIN_DAILY_LEVERAGE_FACTOR = 1e-6;

/** 하루 수익률에 배율을 적용한다. 손실이 100%를 넘으면 0에 가깝게 제한한다. */
export function dailyLeverageFactor(
  underlyingReturn: number,
  leverage: number,
): number {
  return Math.max(
    1 + leverage * underlyingReturn,
    MIN_DAILY_LEVERAGE_FACTOR,
  );
}

/**
 * 기초자산이 새 60분 거래일로 넘어갈 때 직전 거래일 수익률을 배율별 누적계수에
 * 확정한다. 현재 거래일의 움직임은 아직 계수에 넣지 않고 sessionBase 대비로 계산한다.
 */
export function advanceDailyLeveragePath(
  stock: StockState,
  session: number,
): Pick<
  StockState,
  | "leveragePathSessionId"
  | "leveragePathSessionBase"
  | "leveragePathFactors"
> {
  const pathSession = stock.leveragePathSessionId ?? stock.daySessionId ?? session;
  const sessionBase = stock.leveragePathSessionBase ?? stock.currentPrice;
  const factors = stock.leveragePathFactors ?? {
    "-2": 1,
    "-1": 1,
    "2": 1,
  };

  if (pathSession === session) {
    return {
      leveragePathSessionId: session,
      leveragePathSessionBase: sessionBase,
      leveragePathFactors: factors,
    };
  }

  const completedReturn =
    sessionBase > 0 ? stock.currentPrice / sessionBase - 1 : 0;
  const nextFactors: Record<string, number> = { ...factors };
  for (const leverage of DAILY_TRACKING_LEVERAGES) {
    const key = String(leverage);
    nextFactors[key] =
      (factors[key] ?? 1) * dailyLeverageFactor(completedReturn, leverage);
  }

  return {
    leveragePathSessionId: session,
    leveragePathSessionBase: stock.currentPrice,
    leveragePathFactors: nextFactors,
  };
}

/** 한 거래일 안에서 기초자산의 누적수익률을 지정 배수로 추종한 원가격. */
export function computeLeveragedRawPrice(
  etfSessionStart: number,
  underlyingCurrent: number,
  underlyingSessionBase: number,
  leverage: number,
): number {
  if (underlyingSessionBase <= 0) return etfSessionStart;
  const underlyingReturn =
    Math.max(underlyingCurrent, 1) / underlyingSessionBase - 1;
  return Math.max(
    etfSessionStart * dailyLeverageFactor(underlyingReturn, leverage),
    1e-12,
  );
}

export interface LeveragedPriceSnapshot {
  rawPrice: number;
  sessionStartRawPrice: number;
  splitMultiplier: number;
  currentPrice: number;
  prevDayClose: number;
  dayOpen: number;
  lastShareAdjustmentSession?: number;
}

/** 완료 거래일 누적계수 + 현재 거래일 수익률로 파생상품 가격 상태를 계산한다. */
export function computeLeveragedSnapshot(
  etf: StockState,
  underlying: StockState,
): LeveragedPriceSnapshot {
  const leverage = etf.leverage ?? 1;
  const closedFactor =
    underlying.leveragePathFactors?.[String(leverage)] ?? 1;
  const sessionStartRawPrice = Math.max(etf.initialPrice * closedFactor, 1e-12);
  const underlyingSessionBase =
    underlying.leveragePathSessionBase ?? underlying.initialPrice ?? 0;
  const rawPrice = computeLeveragedRawPrice(
    sessionStartRawPrice,
    underlying.currentPrice,
    underlyingSessionBase,
    leverage,
  );
  const requestedSplitMultiplier = leverageSplitMultiplier(rawPrice);
  const currentSession =
    underlying.daySessionId ?? etf.daySessionId ??
    Math.floor(Date.now() / SESSION_DURATION_MS);
  const appliedSplitMultiplier = Math.max(etf.shareMultiplier ?? 1, 1e-12);
  const lastAdjustment = etf.lastShareAdjustmentSession;
  const coolingDown =
    lastAdjustment !== undefined &&
    currentSession - lastAdjustment <
      SHARE_ADJUSTMENT_COOLDOWN_SESSIONS;
  const splitMultiplier =
    requestedSplitMultiplier !== appliedSplitMultiplier && coolingDown
      ? appliedSplitMultiplier
      : requestedSplitMultiplier;
  const lastShareAdjustmentSession =
    splitMultiplier !== appliedSplitMultiplier
      ? currentSession
      : lastAdjustment;
  const display = (raw: number) =>
    Math.max(Math.round(raw / splitMultiplier), 1);
  const dayOpenRaw = computeLeveragedRawPrice(
    sessionStartRawPrice,
    underlying.dayOpen,
    underlyingSessionBase,
    leverage,
  );

  return {
    rawPrice,
    sessionStartRawPrice,
    splitMultiplier,
    currentPrice: display(rawPrice),
    prevDayClose: display(sessionStartRawPrice),
    dayOpen: display(dayOpenRaw),
    lastShareAdjustmentSession,
  };
}

/**
 * 액면분할·병합 배수 — 일일 누적 경로로 계산된 현재 원가격의 순함수.
 * 반환값 m으로 표시가 = raw / m, 보유 좌수 = 원좌수 × m 이 되도록 밴드에 맞춘다.
 * 분할(가격 상단 초과): m ×= 5. 병합(가격 하단 미만): m ÷= 2. 두 조건은 배타적이라
 * (5:1 분할이면 $500→$100, 2:1 병합이면 $50→$100, 모두 [$50,$500) 안) 진동하지 않는다.
 */
export function leverageSplitMultiplier(rawPrice: number): number {
  let price = Math.max(rawPrice, 1);
  let m = 1;
  let guard = 0;
  while (price >= LEVERAGE_SPLIT_AT && guard++ < 48) {
    price /= LEVERAGE_SPLIT_RATIO;
    m *= LEVERAGE_SPLIT_RATIO;
  }
  while (price < LEVERAGE_MERGE_AT && guard++ < 96) {
    price *= LEVERAGE_MERGE_RATIO;
    m /= LEVERAGE_MERGE_RATIO;
  }
  return m;
}

/** 원가격을 분할·병합 적용한 표시가([$50,$500) 밴드)로 변환한다. */
export function leverageDisplayPrice(rawPrice: number): number {
  const m = leverageSplitMultiplier(rawPrice);
  return Math.max(Math.round(rawPrice / m), 1);
}

/** ETF+기초자산의 현재 분할·병합 배수(보유 좌수 정산용). */
export function leverageMultiplierFor(
  etf: StockState,
  underlying: StockState,
): number {
  return computeLeveragedSnapshot(etf, underlying).splitMultiplier;
}

export function computeLeveragedPrice(
  etf: StockState,
  underlying: StockState,
): number {
  return computeLeveragedSnapshot(etf, underlying).currentPrice;
}

/**
 * 레버리지·인버스 ETF 차트용 '분할조정' 캔들. 표시가는 밴드에 묶여 분할·병합 때
 * ÷5·×2로 튀어 차트에 절벽·스파이크가 생긴다. ETF 가격은 기초자산의 순함수라,
 * 기초자산의 (분할 없는) 캔들에서 raw 가격을 연속으로 재구성하고 '현재 배수'로
 * 나눠, 최신 값은 현재 표시가와 같으면서 과거는 매끄럽게 소급 조정한다.
 * (실제 증권 차트의 액면분할 소급조정과 동일)
 */
interface LeverageSessionAnchor {
  underlyingBase: number;
  rawBase: number;
}

function leverageSessionAnchors(
  etf: StockState,
  underlying: StockState,
): Map<number, LeverageSessionAnchor> {
  const lev = etf.leverage ?? 1;
  const listingSession = Math.floor(
    (etf.listingEpochMs ?? MARKET_EPOCH_MS) / SESSION_DURATION_MS,
  );
  const daily = (underlying.dailyCandles ?? [])
    .filter(
      (candle) =>
        Math.floor(candle.timestamp / SESSION_DURATION_MS) >= listingSession,
    )
    .slice()
    .sort((a, b) => a.timestamp - b.timestamp);
  const anchors = new Map<number, LeverageSessionAnchor>();
  let rawBase = 1;
  let underlyingBase = underlying.initialPrice;

  for (const candle of daily) {
    const session = Math.floor(candle.timestamp / SESSION_DURATION_MS);
    anchors.set(session, { underlyingBase, rawBase });
    rawBase = computeLeveragedRawPrice(
      rawBase,
      candle.close,
      underlyingBase,
      lev,
    );
    underlyingBase = candle.close;
  }

  const currentSession =
    underlying.leveragePathSessionId ?? underlying.daySessionId;
  if (currentSession !== undefined) {
    const calculatedCurrentBase = anchors.get(currentSession)?.rawBase;
    const actualCurrentBase =
      computeLeveragedSnapshot(etf, underlying).sessionStartRawPrice;
    if (calculatedCurrentBase && calculatedCurrentBase > 0) {
      const scale = actualCurrentBase / calculatedCurrentBase;
      for (const [session, anchor] of anchors) {
        anchors.set(session, { ...anchor, rawBase: anchor.rawBase * scale });
      }
    }
    anchors.set(currentSession, {
      underlyingBase:
        underlying.leveragePathSessionBase ?? underlying.initialPrice,
      rawBase: actualCurrentBase,
    });
  }

  return anchors;
}

function leverageChartConverter(
  etf: StockState,
  underlying: StockState,
): ((underlyingPrice: number, timestamp: number) => number) | null {
  const snapshot = computeLeveragedSnapshot(etf, underlying);
  const m = snapshot.splitMultiplier;
  if (m <= 0) return null;
  const anchors = leverageSessionAnchors(etf, underlying);
  const fallback: LeverageSessionAnchor = {
    underlyingBase:
      underlying.leveragePathSessionBase ?? underlying.initialPrice,
    rawBase: snapshot.sessionStartRawPrice,
  };
  const lev = etf.leverage ?? 1;
  return (price: number, timestamp: number) => {
    const session = Math.floor(timestamp / SESSION_DURATION_MS);
    const anchor = anchors.get(session) ?? fallback;
    return Math.max(
      computeLeveragedRawPrice(
        anchor.rawBase,
        price,
        anchor.underlyingBase,
        lev,
      ) / m,
      1,
    );
  };
}

/** 기초자산 캔들 → 레버리지 ETF 분할조정 캔들 (타임스탬프 그대로). */
export function leverageAdjustedCandles(
  etf: StockState,
  underlying: StockState,
  underlyingCandles: Candle[],
): Candle[] {
  const conv = leverageChartConverter(etf, underlying);
  if (!conv) return underlyingCandles;
  const inverse = (etf.leverage ?? 1) < 0;
  return underlyingCandles.map((c) => {
    // 인버스는 기초 상승=ETF 하락이라 고·저가 원본이 뒤바뀐다.
    const hiSource = inverse ? c.low : c.high;
    const loSource = inverse ? c.high : c.low;
    return {
      timestamp: c.timestamp,
      open: conv(c.open, c.timestamp),
      high: conv(hiSource, c.timestamp),
      low: conv(loSource, c.timestamp),
      close: conv(c.close, c.timestamp),
    };
  });
}

/** 기초자산 가격기록 → 레버리지 ETF 분할조정 가격기록. */
export function leverageAdjustedHistory(
  etf: StockState,
  underlying: StockState,
  underlyingHistory: PricePoint[],
): PricePoint[] {
  const conv = leverageChartConverter(etf, underlying);
  if (!conv) return underlyingHistory;
  return underlyingHistory.map((p) => ({
    timestamp: p.timestamp,
    price: conv(p.price, p.timestamp),
  }));
}

/**
 * 커버드콜은 기초자산의 상승·하락에 지정 참여율만큼 반응한다.
 * 옵션 프리미엄은 매 틱 NAV에 누적되고 상품별 분배일에 현금으로 빠져나간다.
 */
export function computeCoveredCallTick(
  etf: StockState,
  underlyingTickReturn: number,
  dtSeconds: number,
): { price: number; premiumReserve: number } {
  const upsideCapture = Math.min(
    1,
    Math.max(0, etf.coveredCallUpsideCapture ?? 0.65),
  );
  // 틱 단위 비대칭 캡처(상승만 축소)는 변동성 잠식으로 가격이 붕괴하므로
  // 대칭 축소 노출로 단순화한다. 대신 옵션 프리미엄이 NAV에 꾸준히 쌓인다.
  const strategyReturn = underlyingTickReturn * upsideCapture;
  const annualPremiumRate = (etf.coveredCallAnnualYield ?? 0) / 100;
  const yearSeconds =
    TRADING_SESSIONS_PER_YEAR * (SESSION_DURATION_MS / 1_000);
  const premiumAccrual =
    etf.currentPrice * annualPremiumRate * (dtSeconds / yearSeconds);
  const premiumWithReserve =
    (etf.coveredCallPremiumReserve ?? 0) + premiumAccrual;
  const wholePremium = Math.floor(premiumWithReserve);
  const strategyPrice = Math.round(etf.currentPrice * (1 + strategyReturn));
  return {
    price: Math.max(strategyPrice + wholePremium, 100),
    premiumReserve: premiumWithReserve - wholePremium,
  };
}

/** NAV 추종 ETF 가격: 상장가 × Σ(비중 × 구성종목 수익률) */
export function computeEtfNav(
  etf: StockState,
  stocksById: Map<string, StockState>,
): number {
  let weightedReturn = 0;
  let weightSum = 0;

  for (const holding of etf.etfHoldings ?? []) {
    const constituent = stocksById.get(holding.stockId);
    const def = STOCK_DEFINITIONS.find((d) => d.id === holding.stockId);
    if (!constituent || !def || def.initialPrice <= 0) continue;
    const constituentBase =
      def.initialPrice / Math.max(constituent.shareMultiplier ?? 1, 1e-12);
    weightedReturn +=
      holding.weight * (constituent.currentPrice / constituentBase);
    weightSum += holding.weight;
  }

  if (weightSum === 0) return etf.currentPrice;
  const grossNav =
    (etf.initialPrice / Math.max(etf.shareMultiplier ?? 1, 1e-12)) *
    (weightedReturn / weightSum);
  return Math.max(
    Math.round(grossNav - (etf.navDistributionAdjustment ?? 0)),
    100,
  );
}

/** 표시용 미세 틱 (서버 모드 클라이언트 전용):
 * 서버 확정가(10초) 사이를 살아있게 움직임. 다음 서버 동기화 때 실제 값으로 수렴. */
export function microTickStock(
  stock: StockState,
  now: number,
  anchorPrice?: number,
): StockState {
  const noise = randomNormal() * stock.volatility * 0.012;
  // 서버 확정가 방향으로 살짝 당기는 평균회귀 (틱당 간극의 8%)
  const anchor = anchorPrice ?? stock.currentPrice;
  const pull = ((anchor - stock.currentPrice) / Math.max(anchor, 1)) * 0.08;
  const nextPrice = Math.max(
    Math.round(stock.currentPrice * (1 + pull + noise)),
    100,
  );
  const history = stock.priceHistory;
  return {
    ...stock,
    currentPrice: nextPrice,
    orderBook: generateOrderBook(nextPrice, stock.orderBook),
    candles: applyTickToCandles(stock.candles ?? [], nextPrice, now),
    priceHistory: [
      ...history.slice(0, -1),
      { timestamp: now, price: nextPrice },
    ],
  };
}

export function tickAllStocks(
  stocks: StockState[],
  events: MarketEvent[],
  now: number,
  tick: number,
  dtSeconds = SERVER_TICK_SECONDS,
  simTick?: number,
): StockState[] {
  // 이 틱의 공통 시장 충격 — 전 종목이 공유 (베타로 개별 스케일)
  // simTick이 주어지면 시드 고정(결정론) — 모든 클라이언트가 같은 시장을 계산한다.
  const marketShock = randomNormal(
    simTick !== undefined ? seededRand(simTick, "shock") : Math.random,
  );

  // 1차: 일반 종목 (파생 ETF 제외) — NAV·레버리지 계산의 기준이 된다
  const isDerived = (s: StockState) =>
    Boolean(s.etfHoldings?.length) ||
    s.leverage !== undefined ||
    Boolean(s.coveredCallUnderlyingId);
  const ticked = stocks.map((stock) =>
    isDerived(stock)
      ? stock
      : tickStock(
          stock,
          events,
          now,
          tick,
          marketShock,
          dtSeconds,
          simTick !== undefined ? seededRand(simTick, stock.id) : Math.random,
        ),
  );

  // 2차: NAV ETF를 먼저 산출해 해당 ETF를 기초로 하는 파생상품도 같은 틱을 추종한다.
  const baseById = new Map(ticked.map((s) => [s.id, s]));
  let calculated = ticked.map((stock) =>
    stock.etfHoldings?.length
      ? applyTickPrice(
          stock,
          computeEtfNav(stock, baseById),
          now,
        )
      : stock,
  );

  const beforeById = new Map(stocks.map((s) => [s.id, s]));
  let afterById = new Map(calculated.map((s) => [s.id, s]));

  // 3차: 각 상품이 기초자산의 1거래일 누적수익률을 배수 추종한다.
  calculated = calculated.map((stock) => {
    if (stock.leverage !== undefined) {
      const underlyingId = stock.leverageUnderlyingId ?? "vnasdaq";
      const after = afterById.get(underlyingId);
      if (!after) return stock;
      const snapshot = computeLeveragedSnapshot(stock, after);
      return {
        ...applyTickPrice(stock, snapshot.currentPrice, now),
        shareMultiplier: snapshot.splitMultiplier,
        lastShareAdjustmentSession:
          snapshot.lastShareAdjustmentSession,
        prevDayClose: snapshot.prevDayClose,
        dayOpen: snapshot.dayOpen,
      };
    }
    return stock;
  });

  // 4차: 커버드콜은 갱신된 기초자산 흐름에 참여율을 적용한다.
  afterById = new Map(calculated.map((s) => [s.id, s]));
  return calculated.map((stock) => {
    if (stock.coveredCallUnderlyingId) {
      const before = beforeById.get(stock.coveredCallUnderlyingId);
      const after = afterById.get(stock.coveredCallUnderlyingId);
      const coveredCallReturn =
        before && after && before.currentPrice > 0
          ? after.currentPrice / before.currentPrice - 1
          : 0;
      const coveredCallTick = computeCoveredCallTick(
        stock,
        coveredCallReturn,
        dtSeconds,
      );
      return normalizeStockSharePrice({
        ...applyTickPrice(stock, coveredCallTick.price, now),
        coveredCallPremiumReserve: coveredCallTick.premiumReserve,
      }, now);
    }
    return normalizeStockSharePrice(stock, now);
  });
}

const STOCK_SPLIT_TRIGGER = 100_000; // $1,000
const STOCK_REVERSE_SPLIT_TRIGGER = 100; // $1
const STOCK_SHARE_ADJUSTMENT_RATIO = 10;
/** 일반·파생 액면조정 뒤 반대 방향 재조정을 막는 거래일 수. */
export const SHARE_ADJUSTMENT_COOLDOWN_SESSIONS = 5;

function scaleCandle(candle: Candle, factor: number): Candle {
  return {
    ...candle,
    open: Math.max(1, candle.open * factor),
    high: Math.max(1, candle.high * factor),
    low: Math.max(1, candle.low * factor),
    close: Math.max(1, candle.close * factor),
  };
}

/**
 * 일반 주식과 비레버리지 ETF를 $1~$1,000 표시 범위에 유지한다.
 * 액면만 바꾸고 과거 차트·보유 좌수는 같은 누적 배수로 소급 조정되어
 * 순자산과 수익률이 변하지 않는다. 레버리지 ETF는 별도 raw-price 경로를 쓴다.
 */
export function normalizeStockSharePrice(
  stock: StockState,
  now = Date.now(),
): StockState {
  if (
    stock.leverage !== undefined ||
    stock.sector === "지수" ||
    stock.sector === "선물" ||
    stock.sector === "급등주"
  ) {
    return stock;
  }
  const session = Math.floor(now / SESSION_DURATION_MS);
  if (
    stock.lastShareAdjustmentSession !== undefined &&
    session - stock.lastShareAdjustmentSession <
      SHARE_ADJUSTMENT_COOLDOWN_SESSIONS
  ) {
    return stock;
  }
  const ratio =
    stock.currentPrice >= STOCK_SPLIT_TRIGGER
      ? STOCK_SHARE_ADJUSTMENT_RATIO
      : stock.currentPrice <= STOCK_REVERSE_SPLIT_TRIGGER
        ? 1 / STOCK_SHARE_ADJUSTMENT_RATIO
        : 1;
  if (ratio === 1) return stock;
  const factor = 1 / ratio;
  const price = (value: number) => Math.max(1, Math.round(value * factor));
  return {
    ...stock,
    shareMultiplier: (stock.shareMultiplier ?? 1) * ratio,
    lastShareAdjustmentSession: session,
    currentPrice: price(stock.currentPrice),
    coveredCallPremiumReserve:
      stock.coveredCallPremiumReserve === undefined
        ? undefined
        : stock.coveredCallPremiumReserve * factor,
    navDistributionAdjustment:
      stock.navDistributionAdjustment === undefined
        ? undefined
        : stock.navDistributionAdjustment * factor,
    prevDayClose: price(stock.prevDayClose),
    dayOpen: price(stock.dayOpen),
    leveragePathSessionBase:
      stock.leveragePathSessionBase === undefined
        ? undefined
        : price(stock.leveragePathSessionBase),
    priceHistory: stock.priceHistory.map((point) => ({
      ...point,
      price: Math.max(1, point.price * factor),
    })),
    candles: stock.candles.map((candle) => scaleCandle(candle, factor)),
    dailyCandles: stock.dailyCandles.map((candle) =>
      scaleCandle(candle, factor),
    ),
    orderBook: generateOrderBook(price(stock.currentPrice)),
  };
}

function pickWeighted<T>(
  items: T[],
  weightOf: (item: T) => number,
  rand: () => number = Math.random,
): T | null {
  const total = items.reduce((sum, item) => sum + Math.max(weightOf(item), 0), 0);
  if (total <= 0) return null;
  let r = rand() * total;
  for (const item of items) {
    r -= Math.max(weightOf(item), 0);
    if (r <= 0) return item;
  }
  return items[items.length - 1];
}

/** 템플릿 → 실제 이벤트: 대상 종목 결정 + {company}/{ceo}/{title} 치환 */
export function resolveEventTemplate(
  template: EventTemplate,
  now: number,
  rand: () => number = Math.random,
): MarketEvent | null {
  let title = template.title;
  let description = template.description;
  let affectedStockIds: string[];
  let quote: string | undefined;
  let quoteBy: string | undefined;

  if (template.category === "company") {
    const candidates = getCompanyDefinitions().filter(
      (c) =>
        isListed(c, now) &&
        (!template.companyId || c.id === template.companyId) &&
        (!template.requiresCeo || c.ceoId),
    );
    const company = pickWeighted(
      candidates,
      (c) => c.eventBias?.[template.tag] ?? 1,
      rand,
    );
    if (!company) return null;

    const ceo = getCharacterById(company.ceoId);
    affectedStockIds = [company.id];
    const substitute = (text: string) =>
      text
        .replaceAll("{company}", company.name)
        .replaceAll("{ceo}", ceo?.name ?? "경영진")
        .replaceAll("{title}", ceo?.title ?? "");
    title = substitute(title);
    description = substitute(description);
    if (ceo) {
      const picked = pickEventQuote(template.tag, ceo, rand, template.impact);
      quote = picked.quote;
      quoteBy = picked.quoteBy;
    }
  } else if (template.category === "sector" && template.sector) {
    affectedStockIds = STOCK_DEFINITIONS.filter(
      (definition) =>
        definition.sector === template.sector ||
        definition.marketTags?.includes(template.sector!),
    ).map((d) => d.id);
  } else {
    affectedStockIds =
      template.affectedStockIds ?? STOCK_DEFINITIONS.map((d) => d.id);
  }

  const event: MarketEvent = {
    id: `event-${now}-${Math.floor(rand() * 1e9).toString(36)}`,
    title,
    description,
    affectedStockIds,
    impact: template.impact,
    timestamp: now,
    category: template.category,
    tag: template.tag,
    quote,
    quoteBy,
  };

  // 회사 뉴스는 위에서 해당 CEO의 전용 대사를 사용한다. 섹터·거시 뉴스는
  // 이벤트 id를 확정한 뒤 관련 기업 캐릭터의 반응을 붙여 기존 결정론 id를 보존한다.
  return withCharacterQuote(event, rand);
}

const ASUNA_FOLLOW_UP_DELAY_MS = 60_000;
const ASUNA_FOLLOW_UP_WINDOW_MS = 5 * 60_000;

/**
 * 아스나 유업은 악재가 발생한 뒤 1분 후 회사 차원의 호재가 이어진다.
 * 일부 호재는 회사 자금 사정만 좋아지고 기존 주주에게 희석 손실을 준다.
 */
export function resolveAsunaAdversityFollowUp(
  now: number,
  events: MarketEvent[],
  rand: () => number = Math.random,
): MarketEvent | null {
  const asuna = STOCK_DEFINITIONS.find((stock) => stock.id === "asuna");
  if (!asuna || !isListed(asuna, now)) return null;

  const trigger = events
    .filter(
      (event) =>
        event.timestamp < now &&
        event.impact < 0 &&
        event.tag !== "악재 후 호재" &&
        event.affectedStockIds.includes("asuna"),
    )
    .sort((a, b) => b.timestamp - a.timestamp)[0];
  if (!trigger) return null;

  const elapsed = now - trigger.timestamp;
  if (
    elapsed < ASUNA_FOLLOW_UP_DELAY_MS ||
    elapsed > ASUNA_FOLLOW_UP_WINDOW_MS
  ) {
    return null;
  }
  if (
    events.some(
      (event) =>
        event.timestamp > trigger.timestamp &&
        event.tag === "악재 후 호재" &&
        event.affectedStockIds.includes("asuna"),
    )
  ) {
    return null;
  }

  const dilution = rand() < 0.35;
  return withCharacterQuote(
    {
      id: `asuna-follow-up-${trigger.id}`,
      title: dilution
        ? "아스나 유업, 악재 속 유상증자 대흥행"
        : "아스나 유업, 악재 직후 대형 납품 계약 확보",
      description: dilution
        ? "악재로 흔들린 사이 신규 설비 자금을 마련하는 유상증자가 초과 청약에 성공했습니다. 회사의 현금 사정은 좋아졌지만 대규모 신주 발행으로 기존 주주 지분은 희석됩니다."
        : "악재 대응 과정에서 개선한 품질 관리 체계가 대형 유통사의 장기 납품 계약으로 이어졌습니다. 앞선 충격의 상당 부분을 빠르게 만회합니다.",
      affectedStockIds: ["asuna"],
      impact: dilution ? -0.75 : 0.85,
      timestamp: now,
      category: "company",
      tag: "악재 후 호재",
    },
    rand,
  );
}

/** 뉴스 템포: 직전 이벤트 후 EVENT_MIN_GAP_MS 경과 전에는 발생하지 않고,
 * 경과 후에는 틱당 EVENT_CHANCE_PER_TICK 확률로 추첨 (틱 간격과 무관한 시간 기반 템포) */
export function maybeGenerateEvent(
  tick: number,
  now: number,
  events: MarketEvent[] = [],
  simTick?: number,
): MarketEvent | null {
  const rand =
    simTick !== undefined ? seededRand(simTick, "event") : Math.random;
  const asunaFollowUp = resolveAsunaAdversityFollowUp(now, events, rand);
  if (asunaFollowUp) return asunaFollowUp;
  const lastEventAt = events.length
    ? Math.max(...events.map((e) => e.timestamp))
    : 0;
  if (now - lastEventAt < EVENT_MIN_GAP_MS) return null;
  if (rand() > EVENT_CHANCE_PER_TICK) return null;

  const template =
    EVENT_TEMPLATES[Math.floor(rand() * EVENT_TEMPLATES.length)];

  return resolveEventTemplate(template, now, rand);
}

/** 시장가 매수 체결가: 현재가 + 0.005% (최소 현재가) */
export function getMarketBuyPrice(currentPrice: number): number {
  return Math.max(
    Math.ceil(currentPrice * (1 + MARKET_ORDER_SLIPPAGE)),
    currentPrice,
  );
}

/** 시장가 매도 체결가: 현재가 - 0.005% (최소 $0.01) */
export function getMarketSellPrice(currentPrice: number): number {
  return Math.max(Math.floor(currentPrice * (1 - MARKET_ORDER_SLIPPAGE)), 1);
}

/** 전일 종가 대비 등락률 */
export function getDayChangePercent(stock: StockState): number {
  return getChangePercent(stock.currentPrice, stock.prevDayClose);
}

export function getDayChangeAmount(stock: StockState): number {
  return stock.currentPrice - stock.prevDayClose;
}

export function buildCandles(
  history: PricePoint[],
  ticksPerCandle = CANDLE_TICKS,
): Candle[] {
  if (history.length === 0) return [];

  const candles: Candle[] = [];
  for (let i = 0; i < history.length; i += ticksPerCandle) {
    const chunk = history.slice(i, i + ticksPerCandle);
    const prices = chunk.map((p) => p.price);
    candles.push({
      timestamp: chunk[chunk.length - 1].timestamp,
      open: prices[0],
      high: Math.max(...prices),
      low: Math.min(...prices),
      close: prices[prices.length - 1],
    });
  }
  return candles;
}

export function getChangePercent(current: number, previous: number): number {
  if (previous === 0) return 0;
  return ((current - previous) / previous) * 100;
}

/** 가격 단위: 내부 정수 = 센트. 표시 = 달러 ($1,234.56) */
export function formatPrice(cents: number): string {
  return (
    "$" +
    (cents / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

const COMPACT_UNITS = [
  { s: "Qi", n: 1e18 },
  { s: "Qa", n: 1e15 },
  { s: "T", n: 1e12 },
  { s: "B", n: 1e9 },
  { s: "M", n: 1e6 },
] as const;

/**
 * 큰 금액을 축약해 보여준다($1.23M·$45.6B·$7.89T…). $1M 미만은 정밀 표기 그대로.
 * 자금은 상한 없이 무한히 커질 수 있으므로, 순자산·현금 같은 합산 표시에 써서
 * 자릿수가 화면을 넘치지 않게 한다(주가·주문 금액은 formatPrice로 정밀 유지).
 */
export function formatCompactMoney(cents: number): string {
  const v = cents / 100;
  const abs = Math.abs(v);
  if (!Number.isFinite(v)) return "$∞";
  if (abs < 1e6) return formatPrice(cents);
  for (const u of COMPACT_UNITS) {
    if (abs >= u.n) {
      const scaled = v / u.n;
      const a = Math.abs(scaled);
      const digits = a >= 100 ? 0 : a >= 10 ? 1 : 2;
      return (
        "$" +
        scaled.toLocaleString("en-US", {
          minimumFractionDigits: digits,
          maximumFractionDigits: digits,
        }) +
        u.s
      );
    }
  }
  return formatPrice(cents);
}

/** 등락 금액 ($ 부호 포함): +$12.34 / -$0.50 */
export function formatSignedMoney(cents: number): string {
  const sign = cents >= 0 ? "+" : "-";
  return (
    sign +
    "$" +
    (Math.abs(cents) / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })
  );
}

/** 등락 금액 축약판: +$1.23M / -$45.6B. $1M 미만은 정밀 표기. */
export function formatSignedCompact(cents: number): string {
  const sign = cents >= 0 ? "+" : "-";
  return sign + formatCompactMoney(Math.abs(cents));
}

/** 지수·선물은 포인트(정수) 표기 */
export function isIndexLike(sector: string): boolean {
  return sector === "지수" || sector === "선물";
}

/** 목록 필터용 표시 카테고리: ETF 안의 레버리지·인버스·곱버스를 분리한다. */
export function stockCategory(stock: {
  sector: string;
  strategyType?: StockDefinition["strategyType"];
  leverage?: number;
  coveredCallUnderlyingId?: string;
}): string {
  const strategy = strategyFilterLabel(stock);
  if (strategy !== "기타") return strategy;
  return stock.sector;
}

/** ETF 계열 카테고리 정렬 순서 (필터 칩을 깔끔하게 묶기 위함) */
export const ETF_FAMILY_ORDER = ["ETF", "커버드콜", "레버리지", "인버스", "곱버스"];

export function formatPoints(value: number): string {
  return Math.round(value).toLocaleString("en-US");
}

/** 종목 성격에 맞는 가격 표기 (지수·선물 = 포인트, 그 외 = 달러) */
export function formatStockValue(
  stock: { sector: string },
  value: number,
): string {
  return isIndexLike(stock.sector) ? formatPoints(value) : formatPrice(value);
}

export function formatPercent(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function formatQuantity(qty: number): string {
  return qty.toLocaleString("ko-KR") + "주";
}

export function formatMarketTime(startedAt: number, tick: number): string {
  const elapsed = tick;
  const h = Math.floor(elapsed / 3600);
  const m = Math.floor((elapsed % 3600) / 60);
  const s = elapsed % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export function formatTradeTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

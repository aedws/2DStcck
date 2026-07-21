import type { MarketEvent, StockState } from "@/lib/types/market";
import {
  BASE_CANDLE_INTERVAL_MS,
  MAX_PRICE_HISTORY,
  SESSION_DURATION_MS,
  SIM_TICK_MS,
} from "@/lib/market/constants";
import { MAX_CANDLES, MAX_DAILY_CANDLES, seededRand } from "@/lib/market/engine";
import { generateOrderBook } from "@/lib/market/orderBook";

/**
 * 랜덤 급등주(펌프-앤-덤프): 시드 고정 결정론으로 가끔 상장되어 급등한 뒤
 * 2거래일 내 상장폐지된다. 가격은 (상장시각, 현재시각)의 순함수라 리플레이
 * 상태 없이도 모든 클라이언트가 동일하게 계산한다. 상장폐지 시점에도 팔지 못한
 * 보유분은 폭락가로 정산되어 손실이 된다.
 */

export const PUMP_SECTOR = "급등주";
/** 거래일마다 급등주가 상장될 확률 */
export const PUMP_SPAWN_CHANCE = 0.14;
/** 상장 후 상장폐지까지 허용되는 최대 거래일 수 */
export const PUMP_LIFETIME_SESSIONS = 2;
/** 상장 직후 바로 사라지는 불공정한 경우를 막는 최소 수명 */
export const PUMP_MIN_LIFETIME_SESSIONS = 0.5;

export const PUMP_PATTERN_IDS = [
  "whipsaw",
  "rug-rebirth",
  "double-squeeze",
  "flash-v",
  "staircase",
  "fake-breakout",
  "liquidation-cascade",
] as const;
export type PumpPatternId = (typeof PUMP_PATTERN_IDS)[number];

const NAMES = [
  ["MEME", "밈코어 홀딩스", "🚀"],
  ["MOON", "문샷 다이내믹스", "🌙"],
  ["HYPE", "하이프체인", "🔥"],
  ["YOLO", "욜로 벤처스", "🎰"],
  ["FOMO", "포모 캐피탈", "📈"],
  ["DGEN", "디젠 랩스", "🃏"],
  ["APED", "에이프드 인더스트리", "🦍"],
  ["PUMP", "펌프킹 코퍼레이션", "💊"],
] as const;

export interface PumpSpec {
  spawnSession: number;
  id: string;
  ticker: string;
  name: string;
  emoji: string;
  basePrice: number;
  peakMult: number;
  crashMult: number;
  /** 최대 2거래일 범위에서 종목별로 숨겨진 실제 상장 수명 */
  lifetimeSessions: number;
  /** 플레이어에게 공개되지 않는 가격 함정 패턴 */
  pattern: PumpPatternId;
}

export function isPumpStock(stock: { sector: string }): boolean {
  return stock.sector === PUMP_SECTOR;
}

/** 해당 거래일에 급등주가 상장되는지 (결정론). 상장되면 스펙 반환. */
function rawPumpSpawnAt(session: number): PumpSpec | null {
  if (seededRand(session, "pump-spawn")() > PUMP_SPAWN_CHANCE) return null;
  const rand = seededRand(session, "pump-spec");
  const [ticker, name, emoji] = NAMES[Math.floor(rand() * NAMES.length)];
  const basePrice = Math.round(1000 + rand() * 4000); // $10 ~ $50
  const peakMult = 3 + rand() * 5; // 3x ~ 8x
  const crashMult = 0.08 + rand() * 0.17; // 최종 8% ~ 25%
  const lifetimeSessions =
    PUMP_MIN_LIFETIME_SESSIONS +
    rand() * (PUMP_LIFETIME_SESSIONS - PUMP_MIN_LIFETIME_SESSIONS);
  const pattern = PUMP_PATTERN_IDS[Math.floor(rand() * PUMP_PATTERN_IDS.length)];
  return {
    spawnSession: session,
    id: `pump-${session}`,
    ticker,
    name,
    emoji,
    basePrice,
    peakMult,
    crashMult,
    lifetimeSessions,
    pattern,
  };
}

/**
 * 한 급등주가 살아 있는 동안에는 다음 급등주를 상장하지 않는다.
 * 연속으로 생성 후보가 나온 경우 후보 묶음의 첫째, 수명+1번째만 채택해
 * 어느 시각에도 활성 급등주가 하나를 넘지 않게 한다.
 */
export function pumpSpawnAt(session: number): PumpSpec | null {
  const candidate = rawPumpSpawnAt(session);
  if (!candidate) return null;

  let consecutiveCandidates = 1;
  for (let previous = session - 1; previous >= 0; previous--) {
    if (!rawPumpSpawnAt(previous)) break;
    consecutiveCandidates += 1;
  }
  return (consecutiveCandidates - 1) % PUMP_LIFETIME_SESSIONS === 0
    ? candidate
    : null;
}

type PumpKeyframe = readonly [progress: number, multiplier: number];

function interpolatePumpFrames(frames: readonly PumpKeyframe[], progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  for (let index = 1; index < frames.length; index++) {
    const previous = frames[index - 1];
    const next = frames[index];
    if (t > next[0]) continue;
    const width = Math.max(Number.EPSILON, next[0] - previous[0]);
    const linear = (t - previous[0]) / width;
    // 완만한 구간은 자연스럽게, 촘촘한 구간은 거의 수직으로 이어진다.
    const eased = linear * linear * (3 - 2 * linear);
    return previous[1] + (next[1] - previous[1]) * eased;
  }
  return frames.at(-1)?.[1] ?? 1;
}

/**
 * 실제 급등주에서 반복되는 페이크 돌파·이중천장·플래시 크래시·죽은 고양이
 * 반등을 섞은 숨은 곡선. 모든 패턴에 두 번 이상의 급락과 재돌파가 있어
 * 횡보 구간이나 첫 고점만 보고 정답을 외울 수 없다.
 */
function pumpBasePatternMultiplierAt(
  spec: PumpSpec,
  pattern: PumpPatternId,
  progress: number,
): number {
  const p = spec.peakMult;
  const c = spec.crashMult;
  let frames: readonly PumpKeyframe[];
  switch (pattern) {
    case "rug-rebirth":
      frames = [
        [0, 1], [0.06, 1.8], [0.12, p * 0.75], [0.16, p],
        [0.172, p * 0.01], [0.2, p * 0.0095], [0.23, p * 0.11],
        [0.3, p * 0.04], [0.39, p * 0.7], [0.43, p * 1.3],
        [0.46, p * 0.18], [0.58, p * 0.65], [0.62, p * 0.12],
        [0.72, p * 0.9], [0.76, p * 0.07], [0.88, p * 0.3], [1, c],
      ];
      break;
    case "double-squeeze":
      frames = [
        [0, 1], [0.07, 1.6], [0.15, p * 0.85], [0.19, p],
        [0.21, p * 0.18], [0.27, p * 0.55], [0.42, p * 0.45],
        [0.5, p * 1.45], [0.54, p * 0.16], [0.64, p * 0.8],
        [0.69, p * 0.1], [0.78, p * 1.1], [0.84, p * 0.2], [1, c],
      ];
      break;
    case "flash-v":
      frames = [
        [0, 1], [0.08, p * 0.45], [0.12, p * 0.9], [0.135, p * 0.035],
        [0.165, p * 0.8], [0.21, p * 1.1], [0.25, p * 0.25],
        [0.34, p * 0.65], [0.38, p * 0.08], [0.46, p * 1.35],
        [0.51, p * 0.3], [0.62, p * 0.9], [0.7, p * 0.15],
        [0.82, p * 0.55], [1, c],
      ];
      break;
    case "staircase":
      frames = [
        [0, 1], [0.06, 1.7], [0.1, 1.1], [0.16, p * 0.45],
        [0.2, p * 0.22], [0.25, p * 0.65], [0.29, p * 0.35],
        [0.36, p * 0.9], [0.4, p * 0.5], [0.46, p * 1.2],
        [0.49, p * 0.14], [0.58, p * 0.7], [0.63, p * 0.32],
        [0.72, p * 1.4], [0.76, p * 0.18], [0.85, p * 0.6], [1, c],
      ];
      break;
    case "fake-breakout":
      frames = [
        [0, 1], [0.08, 1.5], [0.14, 1.25], [0.18, p * 0.55],
        [0.205, p * 0.5], [0.22, p * 0.9], [0.235, p * 0.08],
        [0.27, p * 0.4], [0.34, p * 0.65], [0.42, p * 0.6],
        [0.46, p * 1.3], [0.49, p * 0.2], [0.58, p * 0.85],
        [0.61, p * 0.12], [0.72, p * 1.05], [0.78, p * 0.25],
        [0.88, p * 0.55], [1, c],
      ];
      break;
    case "liquidation-cascade":
      frames = [
        [0, 1], [0.06, p * 0.3], [0.1, p * 0.7], [0.115, p * 0.1],
        [0.15, p * 0.5], [0.18, p * 0.9], [0.195, p * 0.025],
        [0.22, p * 0.3], [0.28, p * 0.08], [0.35, p * 0.65],
        [0.365, p * 0.018], [0.4, p * 0.25], [0.48, p * 1.6],
        [0.495, p * 0.05], [0.56, p * 0.7], [0.63, p * 0.04],
        [0.71, p * 1.2], [0.76, p * 0.09], [0.86, p * 0.4], [1, c],
      ];
      break;
    case "whipsaw":
    default:
      frames = [
        [0, 1], [0.08, 1.7], [0.13, 1.1], [0.19, p * 0.7],
        [0.22, p * 0.3], [0.27, p * 0.8], [0.33, p * 0.55],
        [0.4, p], [0.46, p * 0.4], [0.54, p * 1.2],
        [0.59, p * 0.22], [0.68, p * 0.75], [0.73, p * 0.18],
        [0.82, p * 0.45], [0.9, p * 0.1], [1, c],
      ];
      break;
  }
  return interpolatePumpFrames(frames, progress);
}

/** 테스트·밸런스 분석용 기본 패턴. 실제 시세에는 아래 절차적 함정이 더해진다. */
export function pumpPatternMultiplierAt(spec: PumpSpec, progress: number): number {
  return pumpBasePatternMultiplierAt(spec, spec.pattern, progress);
}

function smoothUnit(value: number): number {
  const x = Math.min(1, Math.max(0, value));
  return x * x * (3 - 2 * x);
}

/** 한두 틱 안에 갭이 난 뒤 서서히 되돌리는 비대칭 시세조종 펄스. */
function manipulationPulse(progress: number, start: number, duration: number): number {
  const local = (progress - start) / duration;
  if (local <= 0 || local >= 1) return 0;
  const gapFraction = 0.02;
  if (local < gapFraction) return smoothUnit(local / gapFraction);
  return 1 - smoothUnit((local - gapFraction) / (1 - gapFraction));
}

/**
 * 기본 패턴 2개를 종목별 비공개 시점에 교체하고, 손절 유도 급락→반등과
 * 돌파 추격 유도→급락을 4~7쌍 겹친다. 같은 기본 패턴도 시간축·혼합 상대·
 * 함정 위치가 달라져 과거 차트를 외운 것만으로 다음 경로를 알 수 없다.
 */
export function pumpAdversarialMultiplierAt(
  spec: PumpSpec,
  progress: number,
): number {
  const t = Math.min(1, Math.max(0, progress));
  const variantRand = seededRand(spec.spawnSession, "pump-procedural-variant");
  const exponent = 0.72 + variantRand() * 0.7;
  const timeWobble = 0.025 + variantRand() * 0.055;
  const timeFrequency = 1 + Math.floor(variantRand() * 3);
  const timePhase = variantRand() * Math.PI * 2;
  const warped = Math.min(
    1,
    Math.max(
      0,
      Math.pow(t, exponent) +
        timeWobble *
          Math.sin(Math.PI * t) *
          Math.sin(Math.PI * 2 * timeFrequency * t + timePhase),
    ),
  );

  const primaryIndex = PUMP_PATTERN_IDS.indexOf(spec.pattern);
  const secondaryOffset = 1 + Math.floor(variantRand() * (PUMP_PATTERN_IDS.length - 1));
  const secondaryPattern =
    PUMP_PATTERN_IDS[(primaryIndex + secondaryOffset) % PUMP_PATTERN_IDS.length];
  const pivot = 0.24 + variantRand() * 0.5;
  const blendWidth = 0.025 + variantRand() * 0.08;
  const blend = smoothUnit((t - (pivot - blendWidth)) / (blendWidth * 2));
  const primary = pumpBasePatternMultiplierAt(spec, spec.pattern, warped);
  const secondary = pumpBasePatternMultiplierAt(spec, secondaryPattern, warped);
  // 기하 혼합으로 저가 러그풀과 고가 스퀴즈가 서로 뭉개지지 않게 한다.
  const hybrid = Math.exp(
    Math.log(Math.max(0.0001, primary)) * (1 - blend) +
      Math.log(Math.max(0.0001, secondary)) * blend,
  );

  const trapRand = seededRand(spec.spawnSession, "pump-psychological-traps");
  const trapPairs = 4 + Math.floor(trapRand() * 4);
  let trapMultiplier = 1;
  for (let index = 0; index < trapPairs; index++) {
    const anchor =
      0.055 +
      (index / Math.max(1, trapPairs - 1)) * 0.82 +
      (trapRand() - 0.5) * 0.035;
    const gap = 0.007 + trapRand() * 0.026;
    const firstWidth = 0.003 + trapRand() * 0.012;
    const secondWidth = 0.003 + trapRand() * 0.014;
    const squeeze = 1.45 + trapRand() * 2.8;
    const crash = 0.008 + trapRand() * 0.2;
    const stopHuntFirst = trapRand() < 0.5;
    const firstTarget = stopHuntFirst ? crash : squeeze;
    const secondTarget = stopHuntFirst ? squeeze : crash;
    trapMultiplier *=
      1 +
      (firstTarget - 1) * manipulationPulse(t, anchor, firstWidth);
    trapMultiplier *=
      1 +
      (secondTarget - 1) * manipulationPulse(t, anchor + gap, secondWidth);
  }

  return Math.max(0.0005, Math.min(30, hybrid * trapMultiplier));
}

/** 모든 클라이언트에서 동일하지만 플레이어에게는 공개하지 않는 실제 상장폐지 시각. */
export function pumpDelistAt(spec: PumpSpec): number {
  return (
    spec.spawnSession * SESSION_DURATION_MS +
    Math.floor(spec.lifetimeSessions * SESSION_DURATION_MS)
  );
}

export function pumpPriceAt(spec: PumpSpec, now: number): number {
  const start = spec.spawnSession * SESSION_DURATION_MS;
  // 가격 곡선은 최대 2거래일 기준으로 흐른다. 실제 상폐 시각을 곡선에 맞추지 않아
  // 상승 중에도 예고 없이 끝날 수 있고, 수명 역산으로 안전한 매도 시점을 알 수 없다.
  const lifeMs = PUMP_LIFETIME_SESSIONS * SESSION_DURATION_MS;
  const f = (now - start) / lifeMs;
  const waveRand = seededRand(spec.spawnSession, "pump-tape-wave");
  const phaseA = waveRand() * Math.PI * 2;
  const phaseB = waveRand() * Math.PI * 2;
  const tapeWave =
    0.035 * (Math.sin(f * Math.PI * 34 + phaseA) - Math.sin(phaseA)) +
    0.025 * (Math.sin(f * Math.PI * 82 + phaseB) - Math.sin(phaseB));
  const tapeTick = now / SIM_TICK_MS;
  const noiseBucket = Math.floor(tapeTick / 6);
  const noiseFraction = tapeTick / 6 - noiseBucket;
  const noiseFrom =
    seededRand(noiseBucket, `${spec.id}-pump-volatility-cluster`)() * 2 - 1;
  const noiseTo =
    seededRand(noiseBucket + 1, `${spec.id}-pump-volatility-cluster`)() * 2 - 1;
  const clusteredNoise =
    noiseFrom + (noiseTo - noiseFrom) * smoothUnit(noiseFraction);
  const tickNoise =
    (seededRand(Math.floor(tapeTick), `${spec.id}-pump-tape`)() - 0.5) * 0.04;
  let rawPrice = Math.max(
    1,
    Math.round(
      spec.basePrice *
        pumpAdversarialMultiplierAt(spec, f) *
        Math.max(0.7, 1 + tapeWave + clusteredNoise * 0.09 + tickNoise),
    ),
  );

  // 두 차례의 거래량 마른 횡보처럼 보이는 가격 압축 구간. 압축 직후 방향은
  // 위 함정 펄스가 정하므로 횡보=고점 또는 돌파 준비라는 단순 해석을 깨뜨린다.
  const compressionRand = seededRand(spec.spawnSession, "pump-compression-bait");
  for (let index = 0; index < 2; index++) {
    const center = 0.14 + compressionRand() * 0.66;
    const halfWidth = 0.018 + compressionRand() * 0.035;
    const quantum = Math.max(1, Math.round(spec.basePrice * (0.018 + compressionRand() * 0.05)));
    if (Math.abs(f - center) < halfWidth) {
      rawPrice = Math.max(1, Math.round(rawPrice / quantum) * quantum);
    }
  }
  return rawPrice;
}

/** 상장폐지 시 최종 정산가 (수명 종료 시점 가격) */
export function pumpFinalPrice(spec: PumpSpec): number {
  const end =
    (spec.spawnSession + PUMP_LIFETIME_SESSIONS) * SESSION_DURATION_MS - 1;
  return pumpPriceAt(spec, end);
}

type OHLC = { o: number; h: number; l: number; c: number };
function accOhlc(map: Map<number, OHLC>, key: number, p: number) {
  const c = map.get(key);
  if (c) {
    if (p > c.h) c.h = p;
    if (p < c.l) c.l = p;
    c.c = p;
  } else {
    map.set(key, { o: p, h: p, l: p, c: p });
  }
}
const ohlcToCandle = ([timestamp, v]: [number, OHLC]) => ({
  timestamp,
  open: v.o,
  high: v.h,
  low: v.l,
  close: v.c,
});

function buildPumpState(spec: PumpSpec, now: number): StockState {
  const price = pumpPriceAt(spec, now);
  const start = spec.spawnSession * SESSION_DURATION_MS;
  const session = Math.floor(now / SESSION_DURATION_MS);

  // 상장 시점부터 촘촘히(3초 간격) 샘플링한다. 30초봉과 같은 간격으로 뽑으면
  // 봉당 표본이 하나뿐이라 시가=고가=저가=종가(점)로만 찍히므로, 봉 안에서
  // 실제 움직임이 생기도록 봉 간격보다 잘게 나눠 집계한다.
  const sampleStep = SIM_TICK_MS * 3;
  const history: { timestamp: number; price: number }[] = [];
  const candlesMap = new Map<number, OHLC>();
  const dailyMap = new Map<number, OHLC>();
  let lastHistoryBucket = -1;
  for (let t = start; t <= now; t += sampleStep) {
    const p = pumpPriceAt(spec, t);
    const candleBucket =
      Math.floor(t / BASE_CANDLE_INTERVAL_MS) * BASE_CANDLE_INTERVAL_MS;
    accOhlc(candlesMap, candleBucket, p);
    accOhlc(dailyMap, Math.floor(t / SESSION_DURATION_MS) * SESSION_DURATION_MS, p);
    if (candleBucket !== lastHistoryBucket) {
      history.push({ timestamp: candleBucket, price: p });
      lastHistoryBucket = candleBucket;
    }
  }
  // 현재가를 마지막(진행 중) 봉에 반영해 종가가 표시가와 일치하게 한다.
  accOhlc(candlesMap, Math.floor(now / BASE_CANDLE_INTERVAL_MS) * BASE_CANDLE_INTERVAL_MS, price);
  accOhlc(dailyMap, Math.floor(now / SESSION_DURATION_MS) * SESSION_DURATION_MS, price);

  const candles = [...candlesMap.entries()].map(ohlcToCandle).slice(-MAX_CANDLES);
  const dailyCandles = [...dailyMap.entries()]
    .map(ohlcToCandle)
    .slice(-MAX_DAILY_CANDLES);
  const priceHistory = history.slice(-MAX_PRICE_HISTORY);

  const dayOpen = pumpPriceAt(spec, Math.max(start, session * SESSION_DURATION_MS));
  const prevDayClose =
    session > spec.spawnSession
      ? pumpPriceAt(spec, session * SESSION_DURATION_MS - 1)
      : spec.basePrice;

  return {
    id: spec.id,
    ticker: spec.ticker,
    name: spec.name,
    sector: PUMP_SECTOR,
    initialPrice: spec.basePrice,
    volatility: 0.06,
    drift: 0,
    description: `${spec.emoji} 패턴·타이밍이 매번 변형되고 최대 2거래일 안에 예고 없이 상장폐지되는 초고위험 급등주. 상승 중에도 갑자기 폭락가로 정산될 수 있습니다.`,
    currentPrice: price,
    prevDayClose,
    dayOpen,
    daySessionId: session,
    priceHistory,
    candles,
    dailyCandles,
    orderBook: generateOrderBook(price),
  };
}

/** 현재 시각에 살아있는(상장 중) 급등주 목록 */
export function getActivePumpStocks(now: number): StockState[] {
  const session = Math.floor(now / SESSION_DURATION_MS);
  const active: StockState[] = [];
  for (let s = session - PUMP_LIFETIME_SESSIONS + 1; s <= session; s++) {
    if (s < 0) continue;
    const spec = pumpSpawnAt(s);
    if (!spec) continue;
    if (now >= pumpDelistAt(spec)) continue;
    active.push(buildPumpState(spec, now));
  }
  return active;
}

/** 저장·리플레이 상태에 남은 급등주를 제거하고 현재 활성 종목만 한 번 얹는다. */
export function replaceActivePumpStocks(
  stocks: StockState[],
  now: number,
): StockState[] {
  const regularStocks = stocks.filter((stock) => !isPumpStock(stock));
  const active = getActivePumpStocks(now);
  return active.length > 0 ? [...regularStocks, active[0]] : regularStocks;
}

/** 상장 거래일에 뜨는 급등주 상장 뉴스 (결정론 id) */
export function getPumpSpawnEvent(
  session: number,
  now: number,
): MarketEvent | null {
  const spec = pumpSpawnAt(session);
  if (!spec) return null;
  return {
    id: `pump-${session}`,
    title: `${spec.emoji} 급등주 ${spec.name}(${spec.ticker}) 상장 — 급등 중!`,
    description: `초고위험 급등주가 상장되어 폭등하고 있습니다. 최대 2거래일 안에 예고 없이 무작위 상장폐지되며, 상승 중에도 폭락가로 강제 정산될 수 있습니다.`,
    affectedStockIds: [spec.id],
    impact: 0,
    timestamp: now,
    category: "macro",
    tag: "급등주",
  };
}

/** 상장폐지된 급등주 id에서 최종 정산가를 구한다 (보유분 정산용). */
export function delistedPumpFinalPrice(
  stockId: string,
  now: number,
): number | null {
  if (!stockId.startsWith("pump-")) return null;
  const s = Number(stockId.slice(5));
  if (!Number.isSafeInteger(s)) return null;
  const spec = pumpSpawnAt(s);
  if (!spec) return null;
  if (now < pumpDelistAt(spec)) return null; // 아직 상장 중
  return pumpFinalPrice(spec);
}

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
/** 상장 후 상장폐지까지 거래일 수 */
export const PUMP_LIFETIME_SESSIONS = 2;

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
  return {
    spawnSession: session,
    id: `pump-${session}`,
    ticker,
    name,
    emoji,
    basePrice,
    peakMult,
    crashMult,
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

/** 상장 후 경과 비율 f(0~1)에 따른 배수: 초반 급등(정점 f≈0.4) 후 폭락. */
function pumpCurve(spec: PumpSpec, f: number): number {
  const t = Math.min(1, Math.max(0, f));
  if (t <= 0.4) {
    // 1 → peakMult (가속 상승)
    const x = t / 0.4;
    return 1 + (spec.peakMult - 1) * Math.pow(x, 0.7);
  }
  // peakMult → crashMult (급락)
  const x = (t - 0.4) / 0.6;
  return spec.peakMult + (spec.crashMult - spec.peakMult) * Math.pow(x, 1.6);
}

export function pumpPriceAt(spec: PumpSpec, now: number): number {
  const start = spec.spawnSession * SESSION_DURATION_MS;
  const lifeMs = PUMP_LIFETIME_SESSIONS * SESSION_DURATION_MS;
  const f = (now - start) / lifeMs;
  const noise =
    (seededRand(Math.floor(now / SIM_TICK_MS), spec.id)() - 0.5) * 0.04;
  return Math.max(
    50,
    Math.round(spec.basePrice * pumpCurve(spec, f) * (1 + noise)),
  );
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
    description: `${spec.emoji} 상장 2거래일 내 상장폐지 예정인 초고위험 급등주. 정점에서 팔지 못하면 폭락합니다.`,
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
    if (session >= spec.spawnSession + PUMP_LIFETIME_SESSIONS) continue;
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
    description: `초고위험 급등주가 상장되어 폭등하고 있습니다. 단, 2거래일 내 상장폐지되니 정점에서 반드시 매도하세요.`,
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
  currentSession: number,
): number | null {
  if (!stockId.startsWith("pump-")) return null;
  const s = Number(stockId.slice(5));
  if (!Number.isSafeInteger(s)) return null;
  if (currentSession < s + PUMP_LIFETIME_SESSIONS) return null; // 아직 상장 중
  const spec = pumpSpawnAt(s);
  if (!spec) return null;
  return pumpFinalPrice(spec);
}

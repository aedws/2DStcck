import { STOCK_DEFINITIONS } from "@/data/stocks";
import {
  MARKET_EPOCH_MS,
  MAX_PRICE_HISTORY,
  SESSION_DURATION_MS,
  SIM_TICK_MS,
} from "@/lib/market/constants";
import {
  MAX_CANDLES,
  MAX_DAILY_CANDLES,
  calculateTickPrice,
  computeCoveredCallTick,
  computeEtfNav,
  computeLeveragedPrice,
  createInitialStockState,
  maybeGenerateEvent,
  randomNormal,
  seededRand,
} from "@/lib/market/engine";
import {
  COVERED_CALL_INTERVAL_DAYS,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  calculateCoveredCallDistribution,
} from "@/lib/market/distributions";
import { generateOrderBook } from "@/lib/market/orderBook";
import type {
  Candle,
  MarketEvent,
  PricePoint,
  StockDefinition,
  StockState,
} from "@/lib/types/market";

/**
 * 로컬 공통 시장: 고정 기원점(MARKET_EPOCH_MS)부터 시드 고정 결정론 시뮬레이션.
 * 서버 없이도 같은 시각에 접속한 모든 클라이언트가 동일한 가격·뉴스를 계산한다.
 * 이 파일의 리플레이 루프가 로컬 시장의 유일한 진실 경로다 (엔진 tickAllStocks의
 * 파생 ETF 처리와 동일한 순서를 유지해야 한다).
 */

const DT_SECONDS = SIM_TICK_MS / 1000;

/** 기원점의 거래일 번호 — 배당락·분배락 절대 그리드의 기준점 */
export const EPOCH_SESSION = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);

/** 지급 카운터를 절대 그리드에 정렬 (모든 클라이언트가 같은 세션에 회차 도래) */
export function alignSessionToGrid(session: number, intervalDays: number): number {
  const offset =
    (((session - EPOCH_SESSION) % intervalDays) + intervalDays) % intervalDays;
  return session - offset;
}

export function currentSimTick(nowMs = Date.now()): number {
  return Math.max(0, Math.floor((nowMs - MARKET_EPOCH_MS) / SIM_TICK_MS));
}

export function simTickTime(tick: number): number {
  return MARKET_EPOCH_MS + tick * SIM_TICK_MS;
}

const SYNTHETIC_HISTORY_SESSIONS = 120;

/** 신규 접속자도 일·주·월봉을 바로 볼 수 있게 만드는 결정론적 과거 일봉 */
function createHistoricalDailyCandles(def: StockDefinition): Candle[] {
  let laterPrice = def.initialPrice;
  const reversed: Candle[] = [];

  for (let offset = 1; offset <= SYNTHETIC_HISTORY_SESSIONS; offset++) {
    const rand = seededRand(-offset, `${def.id}:daily-history`);
    const dailyReturn =
      def.drift * 0.1 + randomNormal(rand) * def.volatility * 0.45;
    const open = Math.max(
      Math.round(laterPrice / Math.max(1 + dailyReturn, 0.2)),
      100,
    );
    const range =
      Math.abs(randomNormal(rand)) * def.volatility * 0.18 * laterPrice;
    reversed.push({
      timestamp: (EPOCH_SESSION - offset) * SESSION_DURATION_MS,
      open,
      high: Math.max(open, laterPrice, Math.round(Math.max(open, laterPrice) + range)),
      low: Math.max(
        Math.min(open, laterPrice, Math.round(Math.min(open, laterPrice) - range)),
        100,
      ),
      close: laterPrice,
    });
    laterPrice = open;
  }

  return reversed.reverse();
}

/** 기원점 시각의 초기 시장 (모든 클라이언트 공통 제네시스) */
export function createGenesisStocks(): StockState[] {
  return STOCK_DEFINITIONS.map((def) => {
    const state = createInitialStockState(def, MARKET_EPOCH_MS);
    return {
      ...state,
      dailyCandles: [
        ...createHistoricalDailyCandles(def),
        ...state.dailyCandles,
      ].slice(-MAX_DAILY_CANDLES),
    };
  });
}

interface SimResult {
  stocks: StockState[];
  events: MarketEvent[];
}

/**
 * fromTick 상태에서 toTick까지 결정론 리플레이.
 * 성능: 가변 복제본을 틱마다 직접 갱신하고, 차트 데이터(히스토리·캔들)는
 * 마지막 표시 구간에서만 축적한다. 호가창은 마지막에 한 번만 생성(표시용).
 */
export function replayMarket(
  inputStocks: StockState[],
  inputEvents: MarketEvent[],
  fromTick: number,
  toTick: number,
): SimResult {
  if (toTick <= fromTick) {
    return { stocks: inputStocks, events: inputEvents };
  }

  // 가변 작업본
  const stocks: StockState[] = inputStocks.map((s) => ({ ...s }));
  const byId = new Map(stocks.map((s) => [s.id, s]));
  const defById = new Map(STOCK_DEFINITIONS.map((d) => [d.id, d]));
  let events: MarketEvent[] = [...inputEvents];

  const isDerived = (s: StockState) =>
    Boolean(s.etfHoldings?.length) ||
    s.leverage !== undefined ||
    Boolean(s.coveredCallUnderlyingId);
  const normals = stocks.filter((s) => !isDerived(s));
  const deriveds = stocks.filter(isDerived);
  const navEtfs = deriveds.filter((stock) => stock.etfHoldings?.length);
  const leveragedEtfs = deriveds.filter(
    (stock) => stock.leverage !== undefined,
  );
  const replayedLeveragedEtfs = leveragedEtfs.filter(
    (stock) => !stock.universalDerivative,
  );
  const universalDerivatives = leveragedEtfs.filter(
    (stock) => stock.universalDerivative,
  );
  const coveredCallEtfs = deriveds.filter(
    (stock) => stock.coveredCallUnderlyingId,
  );
  const replayStartPrices = new Map(
    stocks.map((stock) => [stock.id, stock.currentPrice]),
  );
  const replayedStocks = stocks.filter((stock) => !stock.universalDerivative);

  // 차트 데이터: 캔들은 최근 MAX_CANDLES분, 히스토리는 최근 MAX_PRICE_HISTORY틱만
  const candleWindowStart = toTick - (MAX_CANDLES * 60_000) / SIM_TICK_MS;
  const historyWindowStart = toTick - MAX_PRICE_HISTORY;
  const historyMap = new Map<string, PricePoint[]>();
  const candleMap = new Map<string, Candle[]>();
  const dailyMap = new Map<string, Candle[]>();
  for (const s of stocks) {
    historyMap.set(s.id, []);
    candleMap.set(s.id, []);
    dailyMap.set(
      s.id,
      (s.dailyCandles ?? []).map((candle) => ({ ...candle })),
    );
  }

  let prevSession = Math.floor(simTickTime(fromTick) / SESSION_DURATION_MS);

  for (let tick = fromTick + 1; tick <= toTick; tick++) {
    const now = simTickTime(tick);
    const session = Math.floor(now / SESSION_DURATION_MS);
    const marketShock = randomNormal(seededRand(tick, "shock"));

    const leverageBefore = new Map(
      replayedLeveragedEtfs
        .map((s) => {
          const underlyingId = s.leverageUnderlyingId ?? "vnasdaq";
          return [s.id, byId.get(underlyingId)?.currentPrice ?? 0] as const;
        }),
    );
    const ccBefore = new Map(
      coveredCallEtfs
        .map((s) => [
          s.id,
          byId.get(s.coveredCallUnderlyingId!)?.currentPrice ?? 0,
        ]),
    );

    // 1차: 일반 종목
    for (const s of normals) {
      const isNewSession =
        s.daySessionId !== undefined && s.daySessionId !== session;
      if (isNewSession) s.prevDayClose = s.currentPrice;
      const next = calculateTickPrice(
        s,
        events,
        now,
        marketShock,
        DT_SECONDS,
        seededRand(tick, s.id),
      );
      if (isNewSession) s.dayOpen = next;
      s.daySessionId = session;
      s.currentPrice = next;
    }

    // 2차: NAV ETF. 이 결과를 기초로 하는 레버리지 상품보다 먼저 갱신한다.
    for (const s of navEtfs) {
      const isNewSession =
        s.daySessionId !== undefined && s.daySessionId !== session;
      if (isNewSession) s.prevDayClose = s.currentPrice;
      const next = computeEtfNav(s, byId);
      if (isNewSession) s.dayOpen = next;
      s.daySessionId = session;
      s.currentPrice = next;
    }

    // 3차: 각 레버리지·인버스 상품이 지정된 기초자산 수익률을 추종한다.
    for (const s of replayedLeveragedEtfs) {
      const isNewSession =
        s.daySessionId !== undefined && s.daySessionId !== session;
      if (isNewSession) s.prevDayClose = s.currentPrice;
      const underlyingId = s.leverageUnderlyingId ?? "vnasdaq";
      const before = leverageBefore.get(s.id) ?? 0;
      const after = byId.get(underlyingId)?.currentPrice ?? 0;
      const underlyingReturn = before > 0 ? after / before - 1 : 0;
      const next = computeLeveragedPrice(s, underlyingReturn);
      if (isNewSession) s.dayOpen = next;
      s.daySessionId = session;
      s.currentPrice = next;
    }

    // 4차: 커버드콜 상품 갱신.
    for (const s of coveredCallEtfs) {
      const isNewSession =
        s.daySessionId !== undefined && s.daySessionId !== session;
      if (isNewSession) s.prevDayClose = s.currentPrice;
      const before = ccBefore.get(s.id) ?? 0;
      const after = byId.get(s.coveredCallUnderlyingId!)?.currentPrice ?? 0;
      const ccReturn = before > 0 ? after / before - 1 : 0;
      const result = computeCoveredCallTick(s, ccReturn, DT_SECONDS);
      if (isNewSession) s.dayOpen = result.price;
      s.daySessionId = session;
      s.currentPrice = result.price;
      s.coveredCallPremiumReserve = result.premiumReserve;
    }

    // 배당락·분배락: 기원점 기준 절대 그리드(20/60거래일 배수)에서 전 클라이언트 동일 적용.
    // (플레이어 현금 지급은 cashflows가 별도로 처리 — 여기서는 주가 조정만)
    if (session !== prevSession) {
      for (let s = prevSession + 1; s <= session; s++) {
        const sinceEpoch = s - EPOCH_SESSION;
        if (sinceEpoch <= 0) continue;
        const ccDue = sinceEpoch % COVERED_CALL_INTERVAL_DAYS === 0;
        const divDue = sinceEpoch % QUARTERLY_DIVIDEND_INTERVAL_DAYS === 0;
        if (!ccDue && !divDue) continue;

        for (const stock of stocks) {
          let amount = 0;
          if (ccDue && (stock.coveredCallAnnualYield ?? 0) > 0) {
            amount += calculateCoveredCallDistribution(
              Math.max(stock.prevDayClose, 100),
              stock.coveredCallAnnualYield ?? 0,
              stock.id,
              s,
            );
          }
          if (divDue && (stock.quarterlyDividend ?? 0) > 0) {
            amount += Math.round(stock.quarterlyDividend ?? 0);
          }
          if (amount <= 0) continue;

          if (stock.etfHoldings?.length) {
            // NAV 추종 ETF는 조정분을 NAV 차감으로 반영
            stock.navDistributionAdjustment =
              (stock.navDistributionAdjustment ?? 0) + amount;
            stock.currentPrice = Math.max(stock.currentPrice - amount, 100);
          } else {
            stock.currentPrice = Math.max(stock.currentPrice - amount, 100);
          }
          stock.dayOpen = Math.max(stock.dayOpen - amount, 100);
        }
      }
      prevSession = session;
    }

    // 일봉은 전체 리플레이 구간을 보존해 주봉·월봉의 원본으로 사용한다.
    for (const stock of replayedStocks) {
      const dailyCandles = dailyMap.get(stock.id) ?? [];
      const sessionStart = session * SESSION_DURATION_MS;
      const last = dailyCandles[dailyCandles.length - 1];
      if (last?.timestamp === sessionStart) {
        last.high = Math.max(last.high, stock.currentPrice);
        last.low = Math.min(last.low, stock.currentPrice);
        last.close = stock.currentPrice;
      } else {
        dailyCandles.push({
          timestamp: sessionStart,
          open: stock.currentPrice,
          high: stock.currentPrice,
          low: stock.currentPrice,
          close: stock.currentPrice,
        });
        if (dailyCandles.length > MAX_DAILY_CANDLES) dailyCandles.shift();
      }
      dailyMap.set(stock.id, dailyCandles);
    }

    // 이벤트 (시드 고정 — 모두가 같은 뉴스를 본다)
    const event = maybeGenerateEvent(tick, now, events, tick);
    if (event) {
      events = [...events, event].slice(-50);
    }

    // 차트 데이터는 표시 구간에서만 축적
    if (tick > historyWindowStart) {
      for (const s of stocks) {
        historyMap.get(s.id)!.push({ timestamp: now, price: s.currentPrice });
      }
    }
    if (tick > candleWindowStart) {
      const minuteStart = Math.floor(now / 60_000) * 60_000;
      for (const s of stocks) {
        const candles = candleMap.get(s.id)!;
        const last = candles[candles.length - 1];
        const price = s.currentPrice;
        if (last && last.timestamp === minuteStart) {
          if (price > last.high) last.high = price;
          if (price < last.low) last.low = price;
          last.close = price;
        } else {
          candles.push({
            timestamp: minuteStart,
            open: price,
            high: price,
            low: price,
            close: price,
          });
          if (candles.length > MAX_CANDLES) candles.shift();
        }
      }
    }
  }

  // 자동 생성 상품은 긴 초기 리플레이에서 매 틱 126개를 반복 계산하지 않고,
  // 기초자산의 누적 수익률로 동일한 결정론적 현재가를 구성한다.
  for (const stock of universalDerivatives) {
    const underlyingId = stock.leverageUnderlyingId;
    const underlying = underlyingId ? byId.get(underlyingId) : undefined;
    const start = underlyingId ? replayStartPrices.get(underlyingId) : undefined;
    if (!underlying || !start || start <= 0) continue;
    const ratio = Math.max(underlying.currentPrice / start, 0.01);
    const leveragedRatio = Math.pow(ratio, stock.leverage ?? 1);
    stock.currentPrice = Math.max(
      Math.round(stock.initialPrice * leveragedRatio),
      100,
    );
    stock.prevDayClose = stock.currentPrice;
    stock.dayOpen = stock.currentPrice;

    const dailyCandles = dailyMap.get(stock.id) ?? [];
    const lastDaily = dailyCandles[dailyCandles.length - 1];
    if (lastDaily) {
      lastDaily.high = Math.max(lastDaily.high, stock.currentPrice);
      lastDaily.low = Math.min(lastDaily.low, stock.currentPrice);
      lastDaily.close = stock.currentPrice;
    }
  }

  // 마무리: 차트 데이터 결합 + 호가창 생성 (호가 잔량은 표시용이라 비결정적이어도 무방)
  const finalStocks = stocks.map((s) => {
    const replayHistory = historyMap.get(s.id)!;
    const replayCandles = candleMap.get(s.id)!;
    const gapTicks = toTick - fromTick;

    const priceHistory =
      gapTicks >= MAX_PRICE_HISTORY
        ? replayHistory
        : [...s.priceHistory, ...replayHistory].slice(-MAX_PRICE_HISTORY);
    const candles =
      gapTicks >= (MAX_CANDLES * 60_000) / SIM_TICK_MS
        ? replayCandles
        : mergeCandles(s.candles ?? [], replayCandles);

    return {
      ...s,
      ...(defById.get(s.id) ?? {}),
      priceHistory,
      candles,
      dailyCandles: dailyMap.get(s.id) ?? [],
      orderBook: generateOrderBook(s.currentPrice, s.orderBook),
    };
  });

  return { stocks: finalStocks, events };
}

/** 기존 캔들 뒤에 리플레이 캔들을 이어붙인다 (같은 분은 리플레이 쪽 우선) */
function mergeCandles(existing: Candle[], replayed: Candle[]): Candle[] {
  if (replayed.length === 0) return existing.slice(-MAX_CANDLES);
  const firstReplayTs = replayed[0].timestamp;
  const kept = existing.filter((c) => c.timestamp < firstReplayTs);
  return [...kept, ...replayed].slice(-MAX_CANDLES);
}

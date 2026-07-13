import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "@/lib/market/constants";

export type MarketRegimeId = "risk-on" | "risk-off" | "volatility" | "calm";

export interface MarketRegime {
  id: MarketRegimeId;
  name: string;
  emoji: string;
  summary: string;
  strategy: string;
  /** 일반 위험자산에 거래일당 더해지는 수익률. 채권은 반대 방향으로 반응한다. */
  marketReturnPerSession: number;
  volatilityMultiplier: number;
  instrumentId: string;
  instrumentLabel: string;
}

export interface ActiveMarketRegime extends MarketRegime {
  windowStart: number;
  windowEnd: number;
}

export const REGIME_WINDOW_SESSIONS = 5;

export const MARKET_REGIMES: MarketRegime[] = [
  {
    id: "risk-on",
    name: "위험 선호 랠리",
    emoji: "🚀",
    summary: "유동성이 위험자산으로 이동해 주식 시장에 상승 압력이 붙습니다.",
    strategy: "상승 추세를 따르되 레버리지 상품의 손절선을 짧게 잡아보세요.",
    marketReturnPerSession: 0.0035,
    volatilityMultiplier: 1.05,
    instrumentId: "vnsl2",
    instrumentLabel: "V-NASDAQ 2배",
  },
  {
    id: "risk-off",
    name: "위험 회피 장세",
    emoji: "🛡️",
    summary: "위험자산 매도가 이어지고 채권과 방어 수단이 상대적으로 강해집니다.",
    strategy: "인버스·채권으로 노출을 낮추고 반등 추격 매수는 신중히 하세요.",
    marketReturnPerSession: -0.003,
    volatilityMultiplier: 1.2,
    instrumentId: "vnsi",
    instrumentLabel: "V-NASDAQ 인버스",
  },
  {
    id: "volatility",
    name: "변동성 폭풍",
    emoji: "⚡",
    summary: "방향성은 약하지만 평소보다 큰 가격 진폭이 반복됩니다.",
    strategy: "포지션 크기를 줄이고 옵션 프리미엄과 급격한 손절 체결을 확인하세요.",
    marketReturnPerSession: 0,
    volatilityMultiplier: 1.55,
    instrumentId: "vnasdaq",
    instrumentLabel: "V-NASDAQ",
  },
  {
    id: "calm",
    name: "저변동 완만 상승",
    emoji: "🌤️",
    summary: "변동성이 잦아들고 시장이 완만한 우상향 흐름을 보입니다.",
    strategy: "과도한 방향 베팅보다 분산 보유와 프리미엄 수취 전략이 유리합니다.",
    marketReturnPerSession: 0.0015,
    volatilityMultiplier: 0.65,
    instrumentId: "vncc",
    instrumentLabel: "V-NASDAQ 커버드콜",
  },
];

const EPOCH_SESSION = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);
const ACTIVE_REGIME_CACHE = new Map<number, ActiveMarketRegime>();

export function marketRegimeWindowStart(session: number): number {
  const elapsed = session - EPOCH_SESSION;
  return EPOCH_SESSION + Math.floor(elapsed / REGIME_WINDOW_SESSIONS) * REGIME_WINDOW_SESSIONS;
}

/** 회차 번호만으로 모든 플레이어에게 같은 국면 카드를 결정한다. */
export function getMarketRegimeAtSession(session: number): ActiveMarketRegime {
  const windowStart = marketRegimeWindowStart(session);
  const cached = ACTIVE_REGIME_CACHE.get(windowStart);
  if (cached) return cached;
  const windowIndex = Math.floor((windowStart - EPOCH_SESSION) / REGIME_WINDOW_SESSIONS);
  const mixed = Math.imul(windowIndex + 17, 0x45d9f3b) >>> 0;
  const regime = MARKET_REGIMES[mixed % MARKET_REGIMES.length];
  const active = {
    ...regime,
    windowStart,
    windowEnd: windowStart + REGIME_WINDOW_SESSIONS,
  };
  ACTIVE_REGIME_CACHE.set(windowStart, active);
  return active;
}

export function regimeReturnForStock(
  regime: MarketRegime,
  sector: string,
  dtSeconds: number,
): number {
  const exposure = sector === "채권" ? -0.4 : 1;
  return (
    regime.marketReturnPerSession *
    exposure *
    (dtSeconds / (SESSION_DURATION_MS / 1_000))
  );
}

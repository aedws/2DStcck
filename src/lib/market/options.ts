import type {
  OptionKind,
  OptionPosition,
  OptionSide,
  StockState,
} from "@/lib/types/market";
import { SESSIONS_PER_YEAR } from "@/lib/market/interestRate";
import { EPOCH_SESSION } from "@/lib/market/localSim";

/** 만기 간격 (거래일). 다음 2개 만기를 제공한다. */
export const OPTION_EXPIRY_INTERVAL = 10;
export const OPTION_EXPIRY_COUNT = 2;
/** 1계약 = 기초자산 1주 */
export const OPTION_CONTRACT_MULTIPLIER = 1;

/** 표준정규 누적분포 (Abramowitz–Stegun erf 근사) */
function normCdf(x: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-0.5 * x * x);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - p : p;
}

/** 종목의 연환산 변동성 근사 (틱 변동성 계수 → 연 %) */
export function annualizedVol(stock: { volatility: number }): number {
  return Math.min(2.5, Math.max(0.15, stock.volatility * 13));
}

/** 블랙숄즈 옵션가 (센트). S·K=센트, t=연, r=연이율(소수), vol=연변동성. */
export function blackScholes(
  S: number,
  K: number,
  tYears: number,
  r: number,
  vol: number,
  kind: OptionKind,
): number {
  if (tYears <= 0) return intrinsic(kind, S, K);
  const sqrtT = Math.sqrt(tYears);
  const d1 =
    (Math.log(S / K) + (r + (vol * vol) / 2) * tYears) / (vol * sqrtT);
  const d2 = d1 - vol * sqrtT;
  const disc = Math.exp(-r * tYears);
  const price =
    kind === "call"
      ? S * normCdf(d1) - K * disc * normCdf(d2)
      : K * disc * normCdf(-d2) - S * normCdf(-d1);
  return Math.max(0, Math.round(price));
}

export function intrinsic(kind: OptionKind, S: number, K: number): number {
  return kind === "call" ? Math.max(0, S - K) : Math.max(0, K - S);
}

/** 만기까지 남은 연수 */
export function yearsToExpiry(
  expirySession: number,
  currentSession: number,
): number {
  return Math.max(0, (expirySession - currentSession) / SESSIONS_PER_YEAR);
}

/** 계약당 현재 프리미엄 (마크 투 마켓) */
export function optionPremium(
  kind: OptionKind,
  strike: number,
  expirySession: number,
  stock: StockState,
  currentSession: number,
  rateAnnualDecimal: number,
): number {
  return blackScholes(
    stock.currentPrice,
    strike,
    yearsToExpiry(expirySession, currentSession),
    rateAnnualDecimal,
    annualizedVol(stock),
    kind,
  );
}

/** 제공 만기 목록 (기원점 그리드 정렬 → 전 클라이언트 동일) */
export function listExpiries(currentSession: number): number[] {
  const sinceEpoch = currentSession - EPOCH_SESSION;
  const nextIndex = Math.floor(sinceEpoch / OPTION_EXPIRY_INTERVAL) + 1;
  return Array.from(
    { length: OPTION_EXPIRY_COUNT },
    (_, i) => EPOCH_SESSION + (nextIndex + i) * OPTION_EXPIRY_INTERVAL,
  );
}

/** 현재가 근처 행사가 (±10%, ±5%, ATM) */
export function listStrikes(price: number): number[] {
  return [-0.1, -0.05, 0, 0.05, 0.1].map((p) =>
    Math.max(100, Math.round((price * (1 + p)) / 100) * 100),
  );
}

/** 포지션의 계약당 현재 마크 */
export function positionMark(
  pos: OptionPosition,
  stock: StockState,
  currentSession: number,
  rateAnnualDecimal: number,
): number {
  return optionPremium(
    pos.kind,
    pos.strike,
    pos.expirySession,
    stock,
    currentSession,
    rateAnnualDecimal,
  );
}

/** 발행(short) 계약당 증거금: 콜=기초자산가, 풋=행사가 (최대손실 근사) */
export function shortMarginPerContract(
  pos: OptionPosition,
  stock: StockState,
): number {
  return pos.kind === "call" ? stock.currentPrice : pos.strike;
}

/** 옵션 전체의 자기자본 기여 (long=+마크, short=−마크) */
export function optionsEquityDelta(
  options: OptionPosition[],
  stocks: StockState[],
  currentSession: number,
  rateAnnualDecimal: number,
): number {
  let delta = 0;
  for (const pos of options) {
    const stock = stocks.find((s) => s.id === pos.stockId);
    if (!stock) continue;
    const mark = positionMark(pos, stock, currentSession, rateAnnualDecimal);
    delta += (pos.side === "long" ? mark : -mark) * pos.quantity;
  }
  return delta;
}

/** 발행 옵션의 증거금 예약 총액 */
export function optionsMarginReserve(
  options: OptionPosition[],
  stocks: StockState[],
): number {
  let reserve = 0;
  for (const pos of options) {
    if (pos.side !== "short") continue;
    const stock = stocks.find((s) => s.id === pos.stockId);
    if (!stock) continue;
    reserve += shortMarginPerContract(pos, stock) * pos.quantity;
  }
  return reserve;
}

export function optionLabel(kind: OptionKind, side: OptionSide): string {
  const k = kind === "call" ? "콜" : "풋";
  return side === "long" ? `${k} 매수` : `${k} 발행`;
}

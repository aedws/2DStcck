import type {
  OptionKind,
  OptionPosition,
  OptionSide,
  StockState,
} from "@/lib/types/market";
import { SESSIONS_PER_YEAR } from "@/lib/market/interestRate";
import { EPOCH_SESSION } from "@/lib/market/localSim";
import { leverageMultiplierFor } from "@/lib/market/engine";

/** 만기 간격 (거래일). 다음 2개 만기를 제공한다. */
export const OPTION_EXPIRY_INTERVAL = 10;
export const OPTION_EXPIRY_COUNT = 2;
/** 1계약 = 기초자산 1주 */
export const OPTION_CONTRACT_MULTIPLIER = 1;

/**
 * 제로데이(0DTE): 오늘 거래일 마감(= 다음 거래일 경계)에 만기.
 * 1거래일=1시간이므로 사실상 '한 시간짜리 옵션'. 잔존만기가 극도로 짧아 시간가치가
 * 빠르게 소멸(세타)하고, 현재가 근처에서 손익이 급격히 뒤집힌다(감마). 정산은 다른
 * 옵션과 동일하게 거래일 경계에서 내재가치로 자동 현금정산된다.
 */
export const ZERO_DTE_EXPIRY_OFFSET = 1;

export function zeroDteExpiry(currentSession: number): number {
  return Math.floor(currentSession) + ZERO_DTE_EXPIRY_OFFSET;
}

/** 만기가 오늘 마감(0DTE)인지 여부 */
export function isZeroDteExpiry(
  expirySession: number,
  currentSession: number,
): boolean {
  return expirySession - Math.floor(currentSession) <= ZERO_DTE_EXPIRY_OFFSET;
}

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
  const sinceEpoch = Math.floor(currentSession) - EPOCH_SESSION;
  const nextIndex = Math.floor(sinceEpoch / OPTION_EXPIRY_INTERVAL) + 1;
  return Array.from(
    { length: OPTION_EXPIRY_COUNT },
    (_, i) => EPOCH_SESSION + (nextIndex + i) * OPTION_EXPIRY_INTERVAL,
  );
}

/** 0DTE(오늘 마감) + 표준 만기 목록 (중복 제거·오름차순). */
export function listExpiriesWithZeroDte(currentSession: number): number[] {
  const set = new Set<number>([
    zeroDteExpiry(currentSession),
    ...listExpiries(currentSession),
  ]);
  return [...set].sort((a, b) => a - b);
}

/** 현재가 근처 행사가 (±10%, ±5%, ATM) */
export function listStrikes(price: number): number[] {
  return [-0.1, -0.05, 0, 0.05, 0.1].map((p) =>
    Math.max(100, Math.round((price * (1 + p)) / 100) * 100),
  );
}

/**
 * 기초자산의 현재 액면분할 배수(레버리지·인버스 ETF만 ≠1). stocks 미제공이거나
 * 일반 종목이면 1. 옵션 손익을 분할에 맞춰 보정할 때 쓴다.
 */
export function underlyingSplitMultiplier(
  stock: StockState,
  stocks?: StockState[],
): number {
  if (!stocks || stock.leverage == null || !stock.leverageUnderlyingId) return 1;
  const underlying = stocks.find((s) => s.id === stock.leverageUnderlyingId);
  return underlying ? leverageMultiplierFor(stock, underlying) : 1;
}

/**
 * 분할 정산을 반영한 옵션 평가용 기초자산가. 개시 배수(m_open) 대비 현재
 * 배수(m_now) 변화만큼 표시가를 보정한다 — 레버리지 ETF가 분할되며 표시가가
 * ÷5로 리셋될 때 고정 행사가가 공짜로 深-ITM이 되는 문제를 상쇄한다. 블랙숄즈가
 * (S,K)에 1차 동차라 S×(m_now/m_open)만 넣으면 계약당 가치가 보존된다.
 */
export function effectiveOptionUnderlyingPrice(
  pos: Pick<OptionPosition, "openSplitMultiplier">,
  stock: StockState,
  stocks?: StockState[],
): number {
  const mOpen = pos.openSplitMultiplier ?? 1;
  if (mOpen <= 0) return stock.currentPrice;
  const mNow = underlyingSplitMultiplier(stock, stocks);
  return (stock.currentPrice * mNow) / mOpen;
}

/** 포지션의 계약당 현재 마크 (분할 정산 반영) */
export function positionMark(
  pos: OptionPosition,
  stock: StockState,
  currentSession: number,
  rateAnnualDecimal: number,
  stocks?: StockState[],
): number {
  return blackScholes(
    effectiveOptionUnderlyingPrice(pos, stock, stocks),
    pos.strike,
    yearsToExpiry(pos.expirySession, currentSession),
    rateAnnualDecimal,
    annualizedVol(stock),
    pos.kind,
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
    const mark = positionMark(pos, stock, currentSession, rateAnnualDecimal, stocks);
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

/**
 * 옵션 총노출: 롱은 현재 프리미엄(최대손실 자산), 숏은 최대손실 근사 증거금.
 * 롱 옵션을 노출에서 빼면 프리미엄 지불과 평가자산 증가가 상쇄되어 매수여력이
 * 줄지 않는 무한 레버리지 문제가 생기므로 마진 계산에 반드시 포함한다.
 */
export function optionsGrossExposure(
  options: OptionPosition[],
  stocks: StockState[],
  currentSession: number,
  rateAnnualDecimal: number,
): number {
  let exposure = 0;
  for (const pos of options) {
    const stock = stocks.find((candidate) => candidate.id === pos.stockId);
    if (!stock) continue;
    const perContract =
      pos.side === "long"
        ? positionMark(pos, stock, currentSession, rateAnnualDecimal, stocks)
        : shortMarginPerContract(pos, stock);
    exposure += perContract * pos.quantity;
  }
  return exposure;
}

export function optionLabel(kind: OptionKind, side: OptionSide): string {
  const k = kind === "call" ? "콜" : "풋";
  return side === "long" ? `${k} 매수` : `${k} 발행`;
}

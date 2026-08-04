import { normalizeExactAmount } from "@/lib/market/exactAmount";

function decimalRatio(value: number): {
  numerator: bigint;
  denominator: bigint;
} {
  if (!Number.isFinite(value) || value <= 0) {
    return { numerator: 0n, denominator: 1n };
  }

  const [coefficient, exponentText] = value.toString().toLowerCase().split("e");
  const exponent = exponentText ? Number(exponentText) : 0;
  const [whole, fraction = ""] = coefficient.split(".");
  const digits = `${whole}${fraction}`.replace(/^0+/, "") || "0";
  const decimalPlaces = fraction.length - exponent;
  if (decimalPlaces <= 0) {
    return {
      numerator: BigInt(digits) * 10n ** BigInt(-decimalPlaces),
      denominator: 1n,
    };
  }
  return {
    numerator: BigInt(digits),
    denominator: 10n ** BigInt(decimalPlaces),
  };
}

/** 초고액 계정도 Number 변환 없이 1회 배당 총예산과 좌당 금액을 계산한다. */
export function calculatePlayerCompanyDividendBudget(
  totalAssetsExact: string,
  totalShares: string | number,
  rate: number,
): { totalCentsExact: string; perShareCentsExact: string } {
  const assets = BigInt(normalizeExactAmount(totalAssetsExact));
  const shares = BigInt(normalizeExactAmount(totalShares));
  const { numerator, denominator } = decimalRatio(rate);
  if (assets <= 0n || shares <= 0n || numerator <= 0n) {
    return { totalCentsExact: "0", perShareCentsExact: "0" };
  }
  const total = (assets * numerator + denominator / 2n) / denominator;
  return {
    totalCentsExact: total.toString(),
    perShareCentsExact: (total / shares).toString(),
  };
}

/**
 * 좌당 배당이 현재 주가 대비 허용 배수를 넘는지 판정한다.
 *
 * 배당 예산은 창업주 개인 총자산 기준이라, 다른 경로로 오염·팽창된 총자산이
 * 있으면 좌당 배당이 주가의 수천억 배(예: $480 종목에 $239T/주)까지 튀어
 * 전 주주에게 천문학적 현금이 살포되는 돈복사 연쇄가 생길 수 있다
 * (버그리포트 79118168). 정상 배당은 주가의 수십~수백 배도 넘지 않으므로
 * 100만 배 상한은 정당한 배당엔 절대 걸리지 않고 버그성 값만 차단한다.
 */
export const MAX_DIVIDEND_PER_SHARE_PRICE_MULTIPLE = 1_000_000n;

export function isPlayerCompanyDividendPerShareSane(
  perShareCentsExact: string,
  currentPriceCents: number,
): boolean {
  if (!Number.isFinite(currentPriceCents) || currentPriceCents <= 0) {
    return false;
  }
  const perShare = BigInt(normalizeExactAmount(perShareCentsExact));
  if (perShare <= 0n) return true;
  const cap =
    BigInt(Math.floor(currentPriceCents)) *
    MAX_DIVIDEND_PER_SHARE_PRICE_MULTIPLE;
  return perShare <= cap;
}

/**
 * 배당가산세 누진 구간. 좌당 배당을 '현재 주가 배수'로 나눠, 배수가 커질수록
 * 높은 세율로 과세한다. `upToPriceMultiple`까지의 구간에 `surtaxPercent`%를 물린다.
 * 최상단(100만 배) 초과분은 100% 과세(=지급 상한). 이 구조에서 순 좌당 배당은
 * 주가의 약 11,170배(≈ 1,117,000% 수익률)로 상한이 잡힌다.
 */
const DIVIDEND_SURTAX_BANDS: {
  upToPriceMultiple: bigint;
  surtaxPercent: bigint;
}[] = [
  { upToPriceMultiple: 20n, surtaxPercent: 0n },
  { upToPriceMultiple: 200n, surtaxPercent: 50n },
  { upToPriceMultiple: 2_000n, surtaxPercent: 80n },
  { upToPriceMultiple: 20_000n, surtaxPercent: 95n },
  { upToPriceMultiple: MAX_DIVIDEND_PER_SHARE_PRICE_MULTIPLE, surtaxPercent: 99n },
];

export interface DividendSurtaxResult {
  /** 실제 분배 총액(센트) = 순 좌당 배당 × 총좌수. 원 재원 이하라 돈복사 없음. */
  netTotalCentsExact: string;
  /** 가산세 반영 후 순 좌당 배당(센트). */
  netPerShareCentsExact: string;
  /** 징수(감면)된 배당가산세(센트) = 원 재원 − 순 분배 총액. */
  surtaxCentsExact: string;
}

/**
 * 초고액 배당에 누진 배당가산세를 적용한다. 모든 계산은 BigInt로 정확히 하며
 * (부동소수 왕복 없음), 순 분배 총액 = 순 좌당 배당 × 총좌수라 서버의
 * '총액 = 좌당 × 좌수' 불변식과 정확히 맞고, 순 분배 총액은 항상 원 재원 이하라
 * 배당이 시장에 천문학적 현금을 살포하지 못한다(버그리포트 79118168의 근본 완화).
 * 정상 배당(좌당 ≤ 주가 20배)은 세율 0%라 전혀 감면되지 않는다.
 */
export function applyPlayerCompanyDividendSurtax(
  rawTotalCentsExact: string,
  totalShares: string | number,
  currentPriceCents: number,
): DividendSurtaxResult {
  const rawTotal = BigInt(normalizeExactAmount(rawTotalCentsExact));
  const shares = BigInt(normalizeExactAmount(totalShares));
  // 주가를 못 구하면 과세 기준이 없으므로 원본을 그대로 둔다(상위 가드가 처리).
  if (
    rawTotal <= 0n ||
    shares <= 0n ||
    !Number.isFinite(currentPriceCents) ||
    currentPriceCents <= 0
  ) {
    const netTotal = rawTotal > 0n ? rawTotal : 0n;
    return {
      netTotalCentsExact: netTotal.toString(),
      netPerShareCentsExact:
        shares > 0n && netTotal > 0n ? (netTotal / shares).toString() : "0",
      surtaxCentsExact: "0",
    };
  }
  const price = BigInt(Math.floor(currentPriceCents));
  const perShareRaw = rawTotal / shares; // 내림

  let netPerShare = 0n;
  let prevThreshold = 0n;
  for (const band of DIVIDEND_SURTAX_BANDS) {
    if (perShareRaw <= prevThreshold) break;
    const threshold = price * band.upToPriceMultiple;
    const bandTop = perShareRaw < threshold ? perShareRaw : threshold;
    const bandAmount = bandTop - prevThreshold;
    netPerShare += (bandAmount * (100n - band.surtaxPercent)) / 100n;
    prevThreshold = threshold;
  }
  // 최상단 구간(100만 배) 초과분은 순 좌당에 더하지 않는다 → 100% 과세(지급 상한).

  const netTotal = netPerShare * shares;
  const surtax = rawTotal - netTotal; // ≥ 0
  return {
    netTotalCentsExact: netTotal.toString(),
    netPerShareCentsExact: netPerShare.toString(),
    surtaxCentsExact: (surtax >= 0n ? surtax : 0n).toString(),
  };
}

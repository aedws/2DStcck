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

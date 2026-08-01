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

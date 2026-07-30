import { normalizeExactAmount } from "@/lib/market/exactAmount";

const DIVIDEND_RATE_SCALE = 1_000_000n;

/** 초고액 계정도 Number 변환 없이 1회 배당 총예산과 좌당 금액을 계산한다. */
export function calculatePlayerCompanyDividendBudget(
  totalAssetsExact: string,
  totalShares: string | number,
  rate: number,
): { totalCentsExact: string; perShareCentsExact: string } {
  const assets = BigInt(normalizeExactAmount(totalAssetsExact));
  const shares = BigInt(normalizeExactAmount(totalShares));
  const scaledRate = BigInt(
    Math.round(Math.max(0, rate) * Number(DIVIDEND_RATE_SCALE)),
  );
  if (assets <= 0n || shares <= 0n || scaledRate <= 0n) {
    return { totalCentsExact: "0", perShareCentsExact: "0" };
  }
  const total =
    (assets * scaledRate + DIVIDEND_RATE_SCALE / 2n) /
    DIVIDEND_RATE_SCALE;
  return {
    totalCentsExact: total.toString(),
    perShareCentsExact: (total / shares).toString(),
  };
}

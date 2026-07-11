export function upDownClass(value: number): string {
  return value >= 0 ? "text-[var(--up)]" : "text-[var(--down)]";
}

export function upDownBgClass(value: number): string {
  return value >= 0 ? "bg-[var(--up)]/10" : "bg-[var(--down)]/10";
}

export function formatSignedPercent(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

export function formatSignedPrice(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toLocaleString("ko-KR")}`;
}

/** 센트 금액을 $1.2B / $34.5M / $210K 식으로 축약 */
export function formatCompactUSD(cents: number): string {
  const dollars = cents / 100;
  if (dollars >= 1_000_000_000) {
    return `$${(dollars / 1_000_000_000).toFixed(1)}B`;
  }
  if (dollars >= 1_000_000) {
    return `$${(dollars / 1_000_000).toFixed(1)}M`;
  }
  if (dollars >= 1_000) {
    return `$${(dollars / 1_000).toFixed(0)}K`;
  }
  return `$${dollars.toFixed(0)}`;
}

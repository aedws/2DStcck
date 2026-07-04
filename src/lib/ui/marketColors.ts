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

export function formatCompactKRW(value: number): string {
  if (value >= 1_0000_0000_0000) {
    return `${(value / 1_0000_0000_0000).toFixed(1)}조`;
  }
  if (value >= 1_0000_0000) {
    return `${(value / 1_0000_0000).toFixed(0)}억`;
  }
  if (value >= 1_0000) {
    return `${(value / 1_0000).toFixed(0)}만`;
  }
  return value.toLocaleString("ko-KR");
}

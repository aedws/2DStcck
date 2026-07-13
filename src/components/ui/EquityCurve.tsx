"use client";

import type { NetWorthPoint } from "@/lib/types/market";

/** 순자산 추이 라인 차트 (반응형). 상승/하락에 따라 색이 바뀐다. */
export function EquityCurve({
  data,
  height = 140,
}: {
  data: NetWorthPoint[];
  height?: number;
}) {
  if (data.length < 2) {
    return (
      <p className="py-8 text-center text-xs text-[var(--muted)]">
        순자산 추이는 조금 더 플레이하면 쌓입니다.
      </p>
    );
  }

  const width = 600; // viewBox 기준 폭 — 컨테이너 너비에 맞춰 늘어남
  const pad = 6;
  const values = data.map((d) => d.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const x = (i: number) => pad + (i / (data.length - 1)) * (width - pad * 2);
  const y = (v: number) =>
    pad + (height - pad * 2) - ((v - min) / range) * (height - pad * 2);

  const line = data.map((d, i) => `${x(i)},${y(d.value)}`).join(" ");
  const area = `${x(0)},${height - pad} ${line} ${x(data.length - 1)},${height - pad}`;
  const isUp = values[values.length - 1] >= values[0];
  const stroke = isUp ? "var(--up)" : "var(--down)";

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="h-[140px] w-full"
      role="img"
      aria-label="순자산 추이"
    >
      <polygon points={area} fill={stroke} opacity={0.08} />
      <polyline points={line} fill="none" stroke={stroke} strokeWidth={2} />
    </svg>
  );
}

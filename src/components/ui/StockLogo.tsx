"use client";

import { useState } from "react";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

interface StockLogoLike {
  id: string;
  ticker: string;
  /** 명시 로고 경로/URL (없으면 /logos/<id>.png 관례 경로 시도) */
  logo?: string;
}

/** 기업 로고. 이미지가 있으면 이미지, 없으면(로드 실패) 티커 이니셜 유지. */
export function StockLogo({
  stock,
  size = 28,
}: {
  stock: StockLogoLike;
  size?: number;
}) {
  const [failedId, setFailedId] = useState<string | null>(null);

  const src = stock.logo
    ? stock.logo.startsWith("http")
      ? stock.logo
      : `${BASE_PATH}${stock.logo}`
    : `${BASE_PATH}/logos/${stock.id}.png`;
  const failed = failedId === stock.id;

  if (failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--surface-elevated)] font-bold text-[var(--muted)] ${
          size >= 36 ? "text-[11px]" : "text-[10px]"
        }`}
      >
        {stock.ticker.slice(0, 2)}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={`${stock.ticker} 로고`}
      width={size}
      height={size}
      onError={() => setFailedId(stock.id)}
      className="shrink-0 rounded-full bg-[var(--surface-elevated)] object-cover"
      style={{ width: size, height: size }}
    />
  );
}

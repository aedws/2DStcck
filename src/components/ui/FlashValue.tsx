"use client";

import { useEffect, useRef, useState } from "react";

/**
 * 값이 바뀌면 상승/하락 방향으로 배경을 잠깐 번쩍인다 (가격 손맛).
 * children으로 표시 내용을 받고 value(수치)로 변화 방향을 판단한다.
 */
export function FlashValue({
  value,
  children,
  className = "",
}: {
  value: number;
  children: React.ReactNode;
  className?: string;
}) {
  const prev = useRef(value);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  useEffect(() => {
    if (value === prev.current) return;
    setFlash(value > prev.current ? "up" : "down");
    prev.current = value;
    const t = setTimeout(() => setFlash(null), 500);
    return () => clearTimeout(t);
  }, [value]);

  return (
    <span
      className={`rounded ${flash ? `flash-${flash}` : ""} ${className}`}
    >
      {children}
    </span>
  );
}

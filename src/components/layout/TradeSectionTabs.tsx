"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  isPortfolioPath,
  isTradePath,
} from "@/lib/navigation/paths";

export function TradeSectionTabs() {
  const pathname = usePathname();
  const tradeActive = isTradePath(pathname);
  const accountActive = isPortfolioPath(pathname);

  if (!tradeActive && !accountActive) return null;

  return (
    <div className="border-b border-[var(--border)] bg-[var(--background)]">
      <nav
        aria-label="거래 화면 전환"
        className="mx-auto flex w-full max-w-6xl gap-1 px-4 py-2"
      >
        <Link
          href="/trade"
          aria-current={tradeActive ? "page" : undefined}
          className={`flex-1 rounded-xl px-4 py-2 text-center text-sm transition sm:flex-none sm:min-w-28 ${
            tradeActive
              ? "bg-[var(--foreground)] font-bold text-[var(--background)]"
              : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          }`}
        >
          거래
        </Link>
        <Link
          href="/portfolio"
          aria-current={accountActive ? "page" : undefined}
          className={`flex-1 rounded-xl px-4 py-2 text-center text-sm transition sm:flex-none sm:min-w-28 ${
            accountActive
              ? "bg-[var(--foreground)] font-bold text-[var(--background)]"
              : "text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--foreground)]"
          }`}
        >
          내 계좌
        </Link>
      </nav>
    </div>
  );
}

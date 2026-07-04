"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthButton } from "@/components/auth/AuthButton";

const navItems = [
  { href: "/", label: "홈" },
  { href: "/portfolio", label: "내 계좌" },
  { href: "/history", label: "주문내역" },
];

export function TossHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-md">
      <div className="flex h-14 items-center gap-6 px-5">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
          2D<span className="text-[var(--accent)]">Stock</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-lg px-3 py-2 text-sm transition ${
                  active
                    ? "font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="mx-auto hidden max-w-md flex-1 md:block">
          <div className="flex items-center rounded-xl bg-[var(--surface)] px-4 py-2.5">
            <SearchIcon />
            <span className="ml-2 text-sm text-[var(--muted)]">
              종목, 섹터, 이벤트를 검색하세요
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--up)] opacity-60" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--up)]" />
          </span>
          <span className="hidden text-xs text-[var(--muted)] sm:inline">
            실시간
          </span>
          <AuthButton />
        </div>
      </div>
    </header>
  );
}

function SearchIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className="text-[var(--muted)]"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

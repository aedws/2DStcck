"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/", label: "시장", icon: "⌂" },
  { href: "/news", label: "뉴스", icon: "◈" },
  { href: "/season", label: "시즌", icon: "🏆" },
  { href: "/characters", label: "도감", icon: "🎭" },
  { href: "/missions", label: "의뢰", icon: "📋" },
  { href: "/shop", label: "상점", icon: "🛍" },
  { href: "/portfolio", label: "계좌", icon: "○" },
  { href: "/settings", label: "설정", icon: "⚙" },
];

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      aria-label="모바일 주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-8 border-t border-[var(--border)] bg-[var(--background)]/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
    >
      {items.map((item) => {
        const active =
          item.href === "/"
            ? pathname === "/" || pathname.startsWith("/stock/")
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex min-h-14 flex-col items-center justify-center gap-0.5 text-[10px] transition ${
              active ? "text-[var(--foreground)]" : "text-[var(--muted)]"
            }`}
          >
            <span className="text-lg leading-none" aria-hidden>
              {item.icon}
            </span>
            <span className={active ? "font-semibold" : ""}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

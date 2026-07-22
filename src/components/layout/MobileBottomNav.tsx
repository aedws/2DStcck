"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

interface MobileNavItem {
  href: string;
  label: string;
  icon: string;
}

const bottomItems: MobileNavItem[] = [
  { href: "/", label: "시장", icon: "⌂" },
  { href: "/portfolio", label: "계좌", icon: "○" },
  { href: "/company", label: "회사", icon: "🏢" },
  { href: "/amc", label: "ETF", icon: "📊" },
];

const menuGroups: Array<{ label: string; items: MobileNavItem[] }> = [
  {
    label: "핵심",
    items: [
      { href: "/season", label: "시즌", icon: "🏆" },
      { href: "/leaderboard", label: "랭킹", icon: "🥇" },
      { href: "/characters", label: "도감", icon: "🎭" },
      { href: "/news", label: "뉴스", icon: "◈" },
    ],
  },
  {
    label: "성장",
    items: [
      { href: "/profile", label: "프로필", icon: "👤" },
      { href: "/mastery", label: "숙련도", icon: "🎓" },
      { href: "/achievements", label: "업적", icon: "🎖️" },
      { href: "/missions", label: "의뢰", icon: "📋" },
      { href: "/messages", label: "메시지", icon: "✉️" },
    ],
  },
  {
    label: "투자 도구",
    items: [
      { href: "/calendar", label: "실적", icon: "🗓️" },
      { href: "/strategy", label: "전략", icon: "🧭" },
      { href: "/averaging", label: "평단 계산", icon: "🧮" },
      { href: "/ipo", label: "IPO", icon: "🔔" },
      { href: "/history", label: "주문내역", icon: "🧾" },
    ],
  },
  {
    label: "라운지",
    items: [
      { href: "/shop", label: "상점", icon: "🛍️" },
      { href: "/myroom", label: "마이룸", icon: "🛋️" },
      { href: "/lottery", label: "복권", icon: "🎟️" },
      { href: "/minigame", label: "현금 채굴", icon: "⛏️" },
    ],
  },
  {
    label: "서비스",
    items: [
      { href: "/updates", label: "업데이트", icon: "📢" },
      { href: "/settings", label: "설정", icon: "⚙️" },
    ],
  },
];

function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/" || pathname.startsWith("/stock/");
  return pathname.startsWith(href);
}

export function MobileBottomNav() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const menuActive = menuGroups.some((group) =>
    group.items.some((item) => isActivePath(pathname, item.href)),
  );

  useEffect(() => setMenuOpen(false), [pathname]);

  useEffect(() => {
    if (!menuOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  return (
    <>
      <nav
        aria-label="모바일 주요 메뉴"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-[var(--border)] bg-[var(--background)]/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_24px_rgba(0,0,0,0.08)] backdrop-blur-md md:hidden"
      >
        {bottomItems.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] transition active:scale-95 ${
                active ? "text-[var(--foreground)]" : "text-[var(--muted)]"
              }`}
            >
              <span
                className={`flex h-7 min-w-10 items-center justify-center rounded-full px-2 text-lg leading-none ${
                  active ? "bg-[var(--accent)]/15" : ""
                }`}
                aria-hidden
              >
                {item.icon}
              </span>
              <span className={active ? "font-bold" : "font-medium"}>
                {item.label}
              </span>
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          aria-expanded={menuOpen}
          aria-controls="mobile-all-menu"
          className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] transition active:scale-95 ${
            menuOpen || menuActive
              ? "text-[var(--foreground)]"
              : "text-[var(--muted)]"
          }`}
        >
          <span
            className={`flex h-7 min-w-10 items-center justify-center rounded-full px-2 text-xl leading-none ${
              menuOpen || menuActive ? "bg-[var(--accent)]/15" : ""
            }`}
            aria-hidden
          >
            ☰
          </span>
          <span className={menuOpen || menuActive ? "font-bold" : "font-medium"}>
            전체
          </span>
        </button>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[60] md:hidden">
          <button
            type="button"
            aria-label="전체 메뉴 닫기"
            onClick={() => setMenuOpen(false)}
            className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
          />
          <section
            id="mobile-all-menu"
            role="dialog"
            aria-modal="true"
            aria-label="전체 메뉴"
            className="absolute inset-x-0 bottom-0 max-h-[82dvh] overflow-y-auto rounded-t-3xl border-t border-[var(--border)] bg-[var(--background)] px-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-2 shadow-2xl"
          >
            <div className="mx-auto h-1 w-10 rounded-full bg-[var(--border)]" />
            <div className="sticky top-0 z-10 mt-2 flex items-center justify-between bg-[var(--background)]/95 py-3 backdrop-blur-md">
              <div>
                <h2 className="text-lg font-bold">전체 메뉴</h2>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  PC 메뉴와 같은 분류로 모았습니다
                </p>
              </div>
              <button
                ref={closeButtonRef}
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="전체 메뉴 닫기"
                className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--surface)] text-xl"
              >
                ×
              </button>
            </div>

            <div className="space-y-5 pb-2">
              {menuGroups.map((group) => (
                <div key={group.label}>
                  <h3 className="mb-2 px-1 text-xs font-bold text-[var(--muted)]">
                    {group.label}
                  </h3>
                  <div className="grid grid-cols-4 gap-2">
                    {group.items.map((item) => {
                      const active = isActivePath(pathname, item.href);
                      return (
                        <Link
                          key={item.href}
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          className={`flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-2xl border px-1 py-2 text-center transition active:scale-95 ${
                            active
                              ? "border-[var(--accent)]/40 bg-[var(--accent)]/10 text-[var(--foreground)]"
                              : "border-[var(--border)] bg-[var(--surface)]/55 text-[var(--muted)]"
                          }`}
                        >
                          <span className="text-xl leading-none" aria-hidden>
                            {item.icon}
                          </span>
                          <span className="text-[11px] font-semibold leading-tight">
                            {item.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  );
}

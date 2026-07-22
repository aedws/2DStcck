"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthButton } from "@/components/auth/AuthButton";
import { formatPrice, getDayChangePercent } from "@/lib/market/engine";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";
import { useMarketStore } from "@/store/marketStore";
import { isPumpStock } from "@/lib/market/pumpStocks";
import { marketClassificationLabel } from "@/lib/market/taxonomy";

// 정체성: 수집·경쟁 메타가 주(主). 자주 가는 5개만 1차 탭으로 남기고,
// 나머지는 성격별 드롭다운(성장·투자 도구·라운지)으로 묶는다.
// 업데이트·설정은 우측 아이콘으로 상시 노출한다.
const primaryNavItems = [
  { href: "/", label: "홈" },
  { href: "/portfolio", label: "내 계좌" },
  { href: "/season", label: "시즌" },
  { href: "/leaderboard", label: "랭킹" },
  { href: "/characters", label: "도감" },
];

const navGroups = [
  {
    label: "성장",
    items: [
      { href: "/profile", label: "프로필" },
      { href: "/company", label: "회사" },
      { href: "/mastery", label: "숙련도" },
      { href: "/achievements", label: "업적" },
      { href: "/missions", label: "의뢰" },
      { href: "/messages", label: "메시지" },
    ],
  },
  {
    label: "투자 도구",
    items: [
      { href: "/calendar", label: "실적 캘린더" },
      { href: "/strategy", label: "전략" },
      { href: "/averaging", label: "물타기/불타기" },
      { href: "/ipo", label: "IPO" },
      { href: "/history", label: "주문내역" },
    ],
  },
  {
    label: "라운지",
    items: [
      { href: "/shop", label: "상점" },
      { href: "/myroom", label: "마이룸" },
      { href: "/lottery", label: "복권" },
      { href: "/minigame", label: "현금 채굴" },
    ],
  },
];

function NavGroupMenu({
  label,
  items,
  pathname,
}: {
  label: string;
  items: { href: string; label: string }[];
  pathname: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const groupActive = items.some((item) => pathname.startsWith(item.href));

  // 바깥 클릭·페이지 이동 시 닫기
  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);
  useEffect(() => setOpen(false), [pathname]);

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex items-center gap-1 rounded-lg px-2.5 py-2 text-sm transition ${
          groupActive
            ? "font-semibold text-[var(--foreground)]"
            : "text-[var(--muted)] hover:text-[var(--foreground)]"
        }`}
      >
        {label}
        <span className={`text-[9px] transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>
      {open && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-36 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] py-1 shadow-lg">
          {items.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block px-3.5 py-2 text-sm transition hover:bg-[var(--surface)] ${
                  active
                    ? "font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function TossHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b border-[var(--border)] bg-[var(--background)]/95 backdrop-blur-md">
      <div className="flex h-14 items-center gap-3 px-3 sm:px-5">
        <Link href="/" className="shrink-0 text-lg font-bold tracking-tight">
          2D<span className="text-[var(--accent)]">Stock</span>
        </Link>

        <nav className="hidden min-w-0 flex-1 items-center gap-0.5 md:flex">
          {primaryNavItems.map((item) => {
            const active =
              item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`shrink-0 rounded-lg px-2.5 py-2 text-sm transition ${
                  active
                    ? "font-semibold text-[var(--foreground)]"
                    : "text-[var(--muted)] hover:text-[var(--foreground)]"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
          {navGroups.map((group) => (
            <NavGroupMenu
              key={group.label}
              label={group.label}
              items={group.items}
              pathname={pathname}
            />
          ))}
        </nav>

        <div className="hidden w-56 shrink-0 lg:block xl:w-72">
          <StockSearch />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2.5">
          <span className="flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--up)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--up)]" />
            </span>
            <span className="hidden text-xs text-[var(--muted)] sm:inline">
              실시간
            </span>
          </span>
          <span className="h-4 w-px bg-[var(--border)]" aria-hidden />
          <Link
            href="/updates"
            title="업데이트 내역"
            aria-label="업데이트 내역"
            className={`hidden rounded-lg px-1.5 py-1 text-sm transition md:inline ${
              pathname.startsWith("/updates")
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            🔔
          </Link>
          <Link
            href="/settings"
            title="설정"
            aria-label="설정"
            className={`hidden rounded-lg px-1.5 py-1 text-sm transition md:inline ${
              pathname.startsWith("/settings")
                ? "text-[var(--foreground)]"
                : "text-[var(--muted)] hover:text-[var(--foreground)]"
            }`}
          >
            ⚙️
          </Link>
          <span className="hidden h-4 w-px bg-[var(--border)] md:inline-block" aria-hidden />
          <AuthButton />
        </div>
      </div>
      <div className="px-3 pb-3 lg:hidden">
        <StockSearch />
      </div>
    </header>
  );
}

function StockSearch() {
  const router = useRouter();
  const stocks = useMarketStore((s) => s.stocks);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return stocks
      .filter(
        (s) =>
          !isPumpStock(s) &&
          (s.ticker.toLowerCase().includes(q) ||
            s.name.toLowerCase().includes(q) ||
            s.sector.toLowerCase().includes(q) ||
            s.subsector?.toLowerCase().includes(q)),
      )
      .slice(0, 8);
  }, [stocks, query]);

  // 바깥 클릭 시 닫기
  useEffect(() => {
    function onPointerDown(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, []);

  useEffect(() => setHighlighted(0), [query]);

  function goTo(stockId: string) {
    setOpen(false);
    setQuery("");
    router.push(`/stock/${stockId}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open || results.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((h) => (h + 1) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((h) => (h - 1 + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      goTo(results[highlighted].id);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className="relative">
      <div className="flex items-center rounded-xl bg-[var(--surface)] px-4 py-2.5">
        <SearchIcon />
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="티커, 종목명, 섹터·세부 섹터 검색"
          className="ml-2 w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]"
        />
      </div>

      {open && query.trim() && (
        <div className="absolute left-0 right-0 top-full mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--background)] shadow-lg">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--muted)]">
              검색 결과가 없습니다
            </p>
          ) : (
            results.map((s, i) => {
              const change = getDayChangePercent(s);
              return (
                <button
                  key={s.id}
                  onClick={() => goTo(s.id)}
                  onMouseEnter={() => setHighlighted(i)}
                  className={`flex w-full items-center gap-3 px-4 py-2.5 text-left ${
                    i === highlighted ? "bg-[var(--surface)]" : ""
                  }`}
                >
                  <span className="w-14 shrink-0 text-xs font-semibold text-[var(--muted)]">
                    {s.ticker}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm">
                    {s.name}
                    <span className="ml-2 text-xs text-[var(--muted)]">
                      {marketClassificationLabel(s)}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm tabular-nums">
                    {formatPrice(s.currentPrice)}
                  </span>
                  <span
                    className={`w-16 shrink-0 text-right text-xs tabular-nums ${upDownClass(change)}`}
                  >
                    {formatSignedPercent(change)}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
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
      className="shrink-0 text-[var(--muted)]"
    >
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.3-4.3" />
    </svg>
  );
}

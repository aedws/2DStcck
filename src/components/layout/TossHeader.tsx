"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AuthButton } from "@/components/auth/AuthButton";
import { formatPrice, getDayChangePercent } from "@/lib/market/engine";
import { formatSignedPercent, upDownClass } from "@/lib/ui/marketColors";
import { useMarketStore } from "@/store/marketStore";
import { isPumpStock } from "@/lib/market/pumpStocks";

const navItems = [
  { href: "/", label: "홈" },
  { href: "/calendar", label: "실적" },
  { href: "/leaderboard", label: "랭킹" },
  { href: "/portfolio", label: "내 계좌" },
  { href: "/missions", label: "의뢰" },
  { href: "/shop", label: "상점" },
  { href: "/lottery", label: "복권" },
  { href: "/achievements", label: "업적" },
  { href: "/characters", label: "도감" },
  { href: "/history", label: "주문내역" },
  { href: "/updates", label: "업데이트" },
  { href: "/settings", label: "설정" },
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
          <StockSearch />
        </div>

        <div className="ml-auto flex items-center gap-2.5">
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
          <AuthButton />
        </div>
      </div>
      <div className="px-3 pb-3 md:hidden">
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
                      {s.sector}
                      {s.subsector ? ` · ${s.subsector}` : ""}
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

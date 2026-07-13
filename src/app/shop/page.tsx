"use client";

import { useMemo, useRef, useState } from "react";
import {
  LUXURY_CATEGORY_ORDER,
  LUXURY_ITEMS,
} from "@/data/luxuries";
import { formatPrice } from "@/lib/market/engine";
import { getLuxuryValue } from "@/lib/market/luxury";
import { useMarketStore } from "@/store/marketStore";
import type { LuxuryItem } from "@/lib/types/luxury";

export default function ShopPage() {
  const cash = useMarketStore((s) => s.cash);
  const ownedLuxuries = useMarketStore((s) => s.ownedLuxuries);
  const purchaseLuxury = useMarketStore((s) => s.purchaseLuxury);
  const saveCloud = useMarketStore((s) => s.saveCloud);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(
    null,
  );
  const toastTimer = useRef<number | undefined>(undefined);

  const ownedIds = useMemo(
    () => new Set(ownedLuxuries.map((o) => o.id)),
    [ownedLuxuries],
  );
  const luxuryValue = getLuxuryValue(ownedLuxuries);
  const ownedCount = ownedLuxuries.length;

  function handleBuy(item: LuxuryItem) {
    const result = purchaseLuxury(item.id);
    setToast({ ok: result.success, text: result.message });
    if (result.success) void saveCloud();
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">🛍️ 사치재 상점</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          현금으로 구매하며, 보유 사치재의 가치는 <b>순자산에 그대로 합산</b>되어
          랭킹에 과시 뱃지로 노출됩니다. 사도 순위가 내려가지 않아요.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="보유 현금" value={formatPrice(cash)} />
        <StatCard label="사치재 가치" value={formatPrice(luxuryValue)} />
        <StatCard label="수집" value={`${ownedCount} / ${LUXURY_ITEMS.length}`} />
      </div>

      <div className="space-y-7">
        {LUXURY_CATEGORY_ORDER.map((category) => {
          const items = LUXURY_ITEMS.filter((i) => i.category === category);
          if (items.length === 0) return null;
          return (
            <section key={category}>
              <h2 className="mb-3 text-sm font-semibold text-[var(--muted)]">
                {category}
              </h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {items.map((item) => {
                  const owned = ownedIds.has(item.id);
                  const affordable = cash >= item.price;
                  return (
                    <div
                      key={item.id}
                      className={`flex items-center gap-3 rounded-2xl border p-4 ${
                        owned
                          ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                          : "border-[var(--border)] bg-[var(--surface)]"
                      }`}
                    >
                      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--background)] text-2xl">
                        {item.emoji}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-sm font-semibold">
                            {item.name}
                          </p>
                          <span className="shrink-0 text-[10px] text-[var(--muted)]">
                            {"★".repeat(item.tier)}
                          </span>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                          {item.description}
                        </p>
                        <p className="mt-1 text-sm font-semibold tabular-nums">
                          {formatPrice(item.price)}
                        </p>
                      </div>
                      {owned ? (
                        <span className="shrink-0 rounded-lg bg-[var(--accent)]/15 px-3 py-2 text-xs font-semibold text-[var(--accent)]">
                          보유중
                        </span>
                      ) : (
                        <button
                          onClick={() => handleBuy(item)}
                          disabled={!affordable}
                          className={`shrink-0 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                            affordable
                              ? "bg-[var(--accent)] text-white hover:opacity-90"
                              : "cursor-not-allowed bg-[var(--background)] text-[var(--muted)]"
                          }`}
                        >
                          {affordable ? "구매" : "현금 부족"}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {toast && (
        <div
          className={`fixed inset-x-0 bottom-24 z-50 mx-auto w-fit rounded-full px-4 py-2 text-sm font-medium shadow-lg md:bottom-8 ${
            toast.ok
              ? "bg-[var(--accent)] text-white"
              : "bg-[var(--down)] text-white"
          }`}
        >
          {toast.text}
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 text-sm font-semibold tabular-nums">{value}</p>
    </div>
  );
}

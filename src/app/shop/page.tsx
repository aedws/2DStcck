"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  LUXURY_CATEGORY_ORDER,
  LUXURY_ITEMS,
} from "@/data/luxuries";
import { formatPrice } from "@/lib/market/engine";
import { getLuxuryValue, scaledLuxuryPrice } from "@/lib/market/luxury";
import { useMarketStore } from "@/store/marketStore";
import { playSound } from "@/lib/ui/sound";
import type { LuxuryItem } from "@/lib/types/luxury";

export default function ShopPage() {
  const cash = useMarketStore((s) => s.cash);
  const ownedLuxuries = useMarketStore((s) => s.ownedLuxuries);
  const netWorth = useMarketStore((s) => s.getTotalAssets());
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
    playSound(result.success ? "cash" : "error");
    if (result.success) void saveCloud();
    window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2200);
  }

  return (
    <div className="mx-auto max-w-3xl pb-20">
      <div className="mb-5">
        <h1 className="text-2xl font-bold">🛍️ 사치재 상점</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          현금으로 구매하면 구매가의 <b>70%가 순자산 가치</b>로 남고 30%는
          소비·감가됩니다. 과시 뱃지는 랭킹에 그대로 노출됩니다.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard label="보유 현금" value={formatPrice(cash)} />
        <StatCard label="사치재 가치" value={formatPrice(luxuryValue)} />
        <StatCard label="수집" value={`${ownedCount} / ${LUXURY_ITEMS.length}`} />
      </div>

      <Link
        href="/myroom"
        className="mb-6 flex items-center gap-3 rounded-2xl border border-pink-400/40 bg-pink-500/10 px-4 py-3 transition hover:border-pink-400/70"
      >
        <span className="text-2xl">🛁</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">마이룸 꾸미기</span>
          <span className="mt-0.5 block text-[11px] text-[var(--muted)]">
            가구·욕조·펫으로 나만의 방을 꾸며 보세요 — 새로 열린 소비 공간.
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-pink-400">입장 →</span>
      </Link>

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
                  const price = scaledLuxuryPrice(item.price, netWorth);
                  const affordable = cash >= price;
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
                          {formatPrice(price)}
                          {price > item.price && (
                            <span className="ml-1 text-[10px] font-normal text-[var(--muted)]">
                              (기본 {formatPrice(item.price)})
                            </span>
                          )}
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

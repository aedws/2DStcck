"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getCompanyDefinitions } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import { useMarketStore } from "@/store/marketStore";

export default function CharactersPage() {
  const holdings = useMarketStore((s) => s.holdings);
  const heldIds = useMemo(
    () => new Set(holdings.map((h) => h.stockId)),
    [holdings],
  );

  const entries = useMemo(
    () =>
      getCompanyDefinitions()
        .map((company) => ({
          company,
          ceo: getCharacterById(company.ceoId),
        }))
        .filter((e) => e.ceo !== undefined),
    [],
  );

  const discovered = entries.filter((e) => heldIds.has(e.company.id)).length;

  return (
    <div className="mx-auto max-w-4xl pb-20">
      <div className="mb-5 flex items-baseline justify-between">
        <h1 className="text-2xl font-bold">🎭 캐릭터 도감</h1>
        <span className="text-xs text-[var(--muted)]">
          보유 발견 {discovered} / {entries.length}
        </span>
      </div>
      <p className="mb-5 text-sm text-[var(--muted)]">
        상장된 회사를 이끄는 경영진입니다. 해당 회사 주식을 보유하면{" "}
        <span className="text-amber-400">보유 중</span> 배지가 붙습니다.
      </p>

      <div className="grid gap-3 sm:grid-cols-2">
        {entries.map(({ company, ceo }) => {
          const held = heldIds.has(company.id);
          return (
            <Link
              key={company.id}
              href={`/characters/${company.id}`}
              className={`flex items-start gap-3 rounded-2xl border p-4 transition hover:border-[var(--accent)]/50 ${
                held
                  ? "border-[var(--accent)]/40 bg-[var(--accent)]/5"
                  : "border-[var(--border)] bg-[var(--surface)]"
              }`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--background)] text-2xl">
                {ceo!.emoji}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-sm font-semibold">{ceo!.name}</p>
                  <span className="shrink-0 text-[11px] text-[var(--muted)]">
                    {ceo!.title}
                  </span>
                  {held && (
                    <span className="ml-auto shrink-0 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                      보유 중
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-[var(--muted)]">
                  {company.name}{" "}
                  <span className="text-[var(--border)]">·</span> {company.ticker}
                </p>
                {ceo!.traits.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ceo!.traits.map((t) => (
                      <span
                        key={t}
                        className="rounded-full bg-[var(--background)] px-2 py-0.5 text-[10px] text-[var(--muted)]"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                )}
                {ceo!.bio && (
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--muted)]">
                    {ceo!.bio}
                  </p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

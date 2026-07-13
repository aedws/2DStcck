"use client";

import { useMemo } from "react";
import Link from "next/link";
import { getCompanyDefinitions } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import { formatPrice } from "@/lib/market/engine";
import { useMarketStore } from "@/store/marketStore";

export function CharacterDetailClient({ id }: { id: string }) {
  const company = useMemo(
    () => getCompanyDefinitions().find((c) => c.id === id),
    [id],
  );
  const ceo = getCharacterById(company?.ceoId);
  const live = useMarketStore((s) => s.getStockById(id));
  const held = useMarketStore((s) =>
    s.holdings.find((h) => h.stockId === id),
  );
  const events = useMarketStore((s) => s.events);
  const relatedNews = useMemo(
    () =>
      events.filter((e) => e.quoteBy && e.affectedStockIds.includes(id)),
    [events, id],
  );

  if (!company || !ceo) {
    return (
      <div className="py-20 text-center text-[var(--muted)]">
        <p>캐릭터를 찾을 수 없습니다.</p>
        <Link href="/characters" className="mt-2 inline-block text-[var(--accent)]">
          도감으로 돌아가기
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl pb-20">
      <Link
        href="/characters"
        className="text-sm text-[var(--muted)] hover:text-[var(--foreground)]"
      >
        ← 도감
      </Link>

      <div className="mt-4 flex items-start gap-4">
        <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-[var(--surface)] text-5xl">
          {ceo.emoji}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold">{ceo.name}</h1>
            {held && (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-semibold text-amber-400">
                보유 중
              </span>
            )}
          </div>
          <p className="text-sm text-[var(--muted)]">
            {ceo.title} · {company.name}
          </p>
          <div className="mt-2 flex flex-wrap gap-1">
            {ceo.traits.map((t) => (
              <span
                key={t}
                className="rounded-full bg-[var(--surface)] px-2 py-0.5 text-[11px] text-[var(--muted)]"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {ceo.bio && (
        <p className="mt-4 rounded-2xl bg-[var(--surface)] p-4 text-sm leading-relaxed">
          {ceo.bio}
        </p>
      )}

      <div className="mt-4 rounded-2xl border border-[var(--border)] p-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold">
              {company.name}{" "}
              <span className="text-xs text-[var(--muted)]">
                {company.ticker}
              </span>
            </p>
            <p className="text-xs text-[var(--muted)]">
              {company.sector}
              {company.subsector ? ` · ${company.subsector}` : ""}
            </p>
          </div>
          {live && (
            <p className="text-lg font-bold tabular-nums">
              {formatPrice(live.currentPrice)}
            </p>
          )}
        </div>
        {company.description && (
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            {company.description}
          </p>
        )}
        <Link
          href={`/stock/${company.id}`}
          className="mt-3 block rounded-xl bg-[var(--accent)] py-3 text-center text-sm font-semibold text-white transition hover:opacity-90"
        >
          거래하기
        </Link>
      </div>

      {relatedNews.length > 0 && (
        <div className="mt-4">
          <h2 className="mb-2 text-sm font-semibold">최근 한마디</h2>
          <ul className="space-y-2">
            {[...relatedNews]
              .reverse()
              .slice(0, 5)
              .map((e) => (
                <li
                  key={e.id}
                  className="rounded-2xl bg-[var(--surface)] p-3 text-xs"
                >
                  <p className="font-medium">{e.title}</p>
                  {e.quote && (
                    <p className="mt-1 italic text-[var(--muted)]">
                      “{e.quote}”
                    </p>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

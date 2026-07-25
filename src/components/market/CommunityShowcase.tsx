"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { getCompanyDefinitions } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import {
  listCommunityQuotes,
  listCommunityCompanies,
  type CharacterQuote,
  type CommunityDexCompany,
} from "@/lib/supabase/feedback";

interface CharacterRef {
  companyId: string;
  name: string;
  emoji: string;
}

/**
 * 커뮤니티 채택 콘텐츠(캐릭터 대사·유저 회사)를 캐릭터 도감과 분리된
 * 카드 목록으로 보여준다. character_id → 회사 페이지 링크로 연결한다.
 */
export function CommunityShowcase() {
  const [quotes, setQuotes] = useState<CharacterQuote[]>([]);
  const [companies, setCompanies] = useState<CommunityDexCompany[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    void Promise.all([listCommunityQuotes(), listCommunityCompanies()]).then(
      ([q, c]) => {
        if (!alive) return;
        setQuotes(q);
        setCompanies(c);
        setLoading(false);
      },
    );
    return () => {
      alive = false;
    };
  }, []);

  // character_id(chr_xxx) → 회사 페이지 링크·표시명 매핑.
  const characterRef = useMemo(() => {
    const map = new Map<string, CharacterRef>();
    for (const company of getCompanyDefinitions()) {
      const character = getCharacterById(company.ceoId);
      if (character) {
        map.set(character.id, {
          companyId: company.id,
          name: character.name,
          emoji: character.emoji,
        });
      }
    }
    return map;
  }, []);

  if (loading) {
    return (
      <p className="py-10 text-center text-sm text-[var(--muted)]">
        커뮤니티 콘텐츠를 불러오는 중…
      </p>
    );
  }

  if (quotes.length === 0 && companies.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-8 text-center text-sm text-[var(--muted)]">
        아직 채택된 커뮤니티 콘텐츠가 없습니다. 홈 하단 ‘콘텐츠 요청’에서 캐릭터
        대사·유저 회사를 제안해 보세요.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {companies.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold">
            🏛️ 커뮤니티 기업 <span className="text-[var(--muted)]">({companies.length})</span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {companies.map((c) => {
              const ref = characterRef.get(c.characterId);
              const card = (
                <div className="h-full rounded-2xl border border-sky-400/25 bg-sky-400/5 p-3">
                  <p className="text-sm font-semibold">{c.companyName}</p>
                  {ref && (
                    <p className="mt-0.5 text-[11px] text-sky-300">
                      {ref.emoji} {ref.name}
                    </p>
                  )}
                  {c.concept && (
                    <p className="mt-1.5 text-xs leading-relaxed text-[var(--muted)]">
                      {c.concept}
                    </p>
                  )}
                </div>
              );
              return ref ? (
                <Link key={c.id} href={`/characters/${ref.companyId}`}>
                  {card}
                </Link>
              ) : (
                <div key={c.id}>{card}</div>
              );
            })}
          </div>
        </section>
      )}

      {quotes.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold">
            🗨️ 커뮤니티 대사 <span className="text-[var(--muted)]">({quotes.length})</span>
          </h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {quotes.map((q) => {
              const ref = characterRef.get(q.characterId);
              const card = (
                <div className="h-full rounded-2xl border border-emerald-400/25 bg-emerald-400/5 p-3">
                  <p className="text-sm italic text-[var(--foreground)]">
                    “{q.quote}”
                  </p>
                  {ref && (
                    <p className="mt-1 text-[11px] text-emerald-300">
                      {ref.emoji} {ref.name}
                    </p>
                  )}
                  {q.situation && (
                    <p className="mt-1 text-[11px] text-[var(--muted)]">
                      {q.situation}
                    </p>
                  )}
                </div>
              );
              return ref ? (
                <Link key={q.id} href={`/characters/${ref.companyId}`}>
                  {card}
                </Link>
              ) : (
                <div key={q.id}>{card}</div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

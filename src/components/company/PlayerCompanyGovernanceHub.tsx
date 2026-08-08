"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  listPlayerCompanyGovernanceDirectory,
  type PlayerCompanyGovernanceDirectoryItem,
} from "@/lib/supabase/playerCompanyGovernance";
import { PlayerCompanyGovernancePanel } from "./PlayerCompanyGovernancePanel";

export function PlayerCompanyGovernanceHub({
  selectedStockId,
}: {
  selectedStockId?: string;
}) {
  const [companies, setCompanies] = useState<
    PlayerCompanyGovernanceDirectoryItem[] | null
  >(null);
  const [now, setNow] = useState(0);

  useEffect(() => {
    setNow(Date.now());
    void listPlayerCompanyGovernanceDirectory().then(setCompanies);
  }, []);

  const selected = useMemo(
    () =>
      companies?.find(
        (company) => company.stockId === selectedStockId?.toLowerCase(),
      ),
    [companies, selectedStockId],
  );

  if (selectedStockId) {
    return (
      <div className="mx-auto max-w-4xl pb-24">
        <header className="mb-5 rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 to-violet-500/5 p-6">
          <Link href="/governance" className="text-xs font-bold text-cyan-300">
            ← 주주총회 회사 목록
          </Link>
          <p className="mt-4 text-xs font-bold text-cyan-300">회사별 주주총회</p>
          <h1 className="mt-1 text-3xl font-black">
            {selected?.companyName ?? selectedStockId.toUpperCase()}
          </h1>
          {selected && (
            <p className="mt-2 text-sm text-[var(--muted)]">
              {selected.ticker} · {selected.sector}
              {selected.subsector ? ` / ${selected.subsector}` : ""} · 원 창업주 @
              {selected.founderGameId}
            </p>
          )}
        </header>

        {companies === null || now === 0 ? (
          <div className="rounded-3xl border border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
            회사 의결권 원장을 불러오는 중…
          </div>
        ) : selected ? (
          <PlayerCompanyGovernancePanel
            stockId={selected.stockId}
            currentSession={Math.floor(now / SESSION_DURATION_MS)}
          />
        ) : (
          <div className="rounded-3xl border border-rose-400/30 bg-rose-500/5 p-8 text-center text-sm text-rose-200">
            운영 중인 상장 회사를 찾을 수 없습니다.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl pb-24">
      <header className="mb-5 rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 to-violet-500/5 p-6">
        <p className="text-xs font-bold text-cyan-300">회사와 의결권 분리</p>
        <h1 className="mt-1 text-3xl font-black">🏛️ 주주총회</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--muted)]">
          상장 플레이어 회사를 고른 뒤 그 회사의 안건만 확인하고 투표합니다. 90거래일
          장기주주는 투표할 수 있고, 실제 유통 보유량 3% 이상 주요 주주는 주주환원·CEO
          교체 등 새 안건도 직접 상정할 수 있습니다.
        </p>
      </header>

      {companies === null ? (
        <div className="rounded-3xl border border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
          상장 회사 명부를 불러오는 중…
        </div>
      ) : companies.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-[var(--border)] p-8 text-center text-sm text-[var(--muted)]">
          현재 주주총회를 운영하는 플레이어 회사가 없습니다.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {companies.map((company) => (
            <Link
              key={company.stockId}
              href={`/governance/${company.stockId}`}
              className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5 transition hover:-translate-y-0.5 hover:border-cyan-400/40"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-cyan-300">{company.ticker}</p>
                  <h2 className="mt-1 text-lg font-black">{company.companyName}</h2>
                </div>
                <span className="rounded-full bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-200">
                  {company.openProposalCount > 0
                    ? `진행 안건 ${company.openProposalCount}`
                    : "안건 없음"}
                </span>
              </div>
              <p className="mt-3 text-xs text-[var(--muted)]">
                {company.sector}{company.subsector ? ` · ${company.subsector}` : ""}
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                원 창업주 @{company.founderGameId}
              </p>
              <p className="mt-4 text-xs font-bold text-cyan-300">의결권 상세 보기 →</p>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

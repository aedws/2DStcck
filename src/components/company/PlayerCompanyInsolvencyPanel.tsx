"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatExactMoney } from "@/lib/market/exactAmount";
import {
  acquirePlayerCompanyControl,
  choosePlayerCompanyInsolvencyOption,
  getPlayerCompanyInsolvencyStatus,
  listMyControlledPlayerCompanies,
  listOpenPlayerCompanyAuctions,
  repayPlayerCompanyRescueLoan,
  type ControlledPlayerCompany,
  type PlayerCompanyAuction,
  type PlayerCompanyInsolvencyOption,
  type PlayerCompanyInsolvencySummary,
} from "@/lib/supabase/playerCompanyInsolvency";
import { formatExactShareQuantity } from "@/lib/supabase/playerCompanyOwnership";
import { useMarketStore } from "@/store/marketStore";
import { PlayerCompanyBoardPanel } from "./PlayerCompanyBoardPanel";
import { PlayerCompanyGovernancePanel } from "./PlayerCompanyGovernancePanel";

const OPTIONS: Array<{
  type: PlayerCompanyInsolvencyOption;
  icon: string;
  title: string;
  description: string;
  caution: string;
}> = [
  {
    type: "rehabilitation",
    icon: "🏛️",
    title: "법인 회생 관리",
    description: "24거래일 동안 법인을 보전하고 경영 정상화를 진행합니다.",
    caution: "회생 기간에는 회사 운영이 정지되며, 종료 뒤 자동으로 상장 상태로 복귀합니다.",
  },
  {
    type: "trust",
    icon: "🛡️",
    title: "지분 보호 신탁",
    description: "총 발행주식의 10%에 해당하는 계약 의결권을 경영권자에게 보호합니다.",
    caution: "실제 계좌 주식이나 배당권은 늘지 않으며, 주주총회 의결권에만 합산됩니다.",
  },
  {
    type: "rescue-loan",
    icon: "🏦",
    title: "긴급 회생대출",
    description: "누적 출자금의 최대 20%를 긴급 운영자금으로 받습니다.",
    caution: "24거래일 안에 원금과 이자 15%를 갚지 않으면 자동으로 공개매각됩니다.",
  },
  {
    type: "m-and-a",
    icon: "🤝",
    title: "공개매각·M&A",
    description: "회사는 존속시키고 공개 시장에서 새 경영권자를 찾습니다.",
    caution: "인수 완료 시 IPO 경영권과 10% 계약 의결권이 인수자에게 넘어갑니다.",
  },
];

const STATUS_LABEL: Record<string, string> = {
  rehabilitation: "회생 관리 중",
  trust: "보호 신탁 적용",
  "loan-active": "회생대출 상환 중",
  auction: "공개매각 중",
  transferred: "경영권 이전 완료",
  closed: "회생 절차 종료",
};

const CONTROL_LABEL: Record<string, string> = {
  founder: "원 창업주",
  trust: "보호 신탁",
  rehabilitation: "회생 관리",
  "rescue-loan": "회생대출",
  "m-and-a": "M&A 경영권",
};

function loanRepayment(principal: string): string {
  const amount = BigInt(principal || "0");
  return ((amount * 115n + 99n) / 100n).toString();
}

export function PlayerCompanyInsolvencyPanel({
  founderStockId,
  currentSession,
}: {
  founderStockId?: string;
  currentSession: number;
}) {
  const loadCloudSave = useMarketStore((state) => state.loadCloudSave);
  const [companies, setCompanies] = useState<ControlledPlayerCompany[]>([]);
  const [auctions, setAuctions] = useState<PlayerCompanyAuction[]>([]);
  const [selectedStockId, setSelectedStockId] = useState(
    founderStockId?.trim().toLowerCase() ?? "",
  );
  const [summary, setSummary] =
    useState<PlayerCompanyInsolvencySummary | null>(null);
  const [working, setWorking] = useState("");
  const [message, setMessage] = useState("");

  const refreshDirectory = useCallback(async () => {
    const [nextCompanies, nextAuctions] = await Promise.all([
      listMyControlledPlayerCompanies(),
      listOpenPlayerCompanyAuctions(),
    ]);
    setCompanies(nextCompanies);
    setAuctions(nextAuctions);
    setSelectedStockId((current) => {
      if (current && nextCompanies.some((company) => company.stockId === current)) {
        return current;
      }
      const preferred = founderStockId?.trim().toLowerCase();
      if (preferred && nextCompanies.some((company) => company.stockId === preferred)) {
        return preferred;
      }
      return nextCompanies[0]?.stockId ?? "";
    });
  }, [founderStockId]);

  const refreshSummary = useCallback(async () => {
    if (!selectedStockId) {
      setSummary(null);
      return;
    }
    setSummary(await getPlayerCompanyInsolvencyStatus(selectedStockId));
  }, [selectedStockId]);

  const refreshAll = useCallback(async () => {
    await refreshDirectory();
    await refreshSummary();
  }, [refreshDirectory, refreshSummary]);

  useEffect(() => {
    void refreshDirectory();
    const interval = window.setInterval(() => void refreshDirectory(), 30_000);
    return () => window.clearInterval(interval);
  }, [refreshDirectory]);

  useEffect(() => {
    void refreshSummary();
    const interval = window.setInterval(() => void refreshSummary(), 30_000);
    return () => window.clearInterval(interval);
  }, [refreshSummary]);

  const selected = useMemo(
    () => companies.find((company) => company.stockId === selectedStockId),
    [companies, selectedStockId],
  );
  const activeCase = summary?.insolvencyCase ?? null;
  const acquiredCompany = selected && !selected.isOriginalFounder;

  const choose = async (option: PlayerCompanyInsolvencyOption) => {
    if (!selectedStockId) return;
    setWorking(option);
    const result = await choosePlayerCompanyInsolvencyOption(
      selectedStockId,
      option,
    );
    setMessage(result.message);
    if (result.success) {
      await loadCloudSave();
      await refreshAll();
    }
    setWorking("");
  };

  const repay = async () => {
    if (!activeCase) return;
    setWorking(activeCase.id);
    const result = await repayPlayerCompanyRescueLoan(activeCase.id);
    setMessage(result.message);
    if (result.success) {
      await loadCloudSave();
      await refreshAll();
    }
    setWorking("");
  };

  const acquire = async (auction: PlayerCompanyAuction) => {
    if (
      !window.confirm(
        `${auction.companyName} (${auction.ticker}) 경영권을 ${formatExactMoney(auction.auctionPriceCentsExact)}에 인수하시겠습니까?`,
      )
    ) {
      return;
    }
    setWorking(auction.caseId);
    const result = await acquirePlayerCompanyControl(auction.caseId);
    setMessage(result.message);
    if (result.success) {
      await loadCloudSave();
      await refreshAll();
      setSelectedStockId(auction.stockId);
    }
    setWorking("");
  };

  if (!companies.length && !auctions.length) return null;

  return (
    <section className="mb-5 rounded-3xl border border-amber-400/30 bg-amber-400/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-bold text-amber-300">파산과 법인 존속 분리</p>
          <h2 className="mt-1 text-xl font-black">법인 회생·경영권 센터</h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--muted)]">
            개인 계좌가 강제청산돼도 상장 법인은 즉시 사라지지 않습니다. 원 창업주,
            현재 경영권자, 실제 보유주식과 계약 의결권을 각각 따로 관리합니다.
          </p>
        </div>
        {companies.length > 0 && (
          <span className="rounded-full bg-amber-400/10 px-3 py-1 text-xs font-bold text-amber-200">
            운영 회사 {companies.length}개
          </span>
        )}
      </div>

      {companies.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-xs font-bold text-[var(--muted)]">
            운영 회사 포트폴리오
          </p>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {companies.map((company) => (
              <button
                key={company.stockId}
                type="button"
                onClick={() => setSelectedStockId(company.stockId)}
                className={`min-w-44 rounded-2xl border p-3 text-left transition ${
                  selectedStockId === company.stockId
                    ? "border-amber-300 bg-amber-400/10"
                    : "border-[var(--border)] bg-[var(--background)]"
                }`}
              >
                <p className="font-black">{company.ticker}</p>
                <p className="mt-0.5 truncate text-xs">{company.companyName}</p>
                <p className="mt-2 text-[10px] text-[var(--muted)]">
                  {company.isOriginalFounder ? "설립 회사" : "인수 회사"} ·{" "}
                  {CONTROL_LABEL[company.controlSource] ?? company.controlSource}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {selected && (
        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="font-black">
                {selected.companyName}{" "}
                <span className="text-sm text-amber-300">{selected.ticker}</span>
              </p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                원 창업주 @{selected.originalFounderGameId} · {selected.sector}
              </p>
            </div>
            <div className="text-right text-xs">
              <p className="font-bold text-amber-200">
                {CONTROL_LABEL[selected.controlSource] ?? selected.controlSource}
              </p>
              <p className="mt-1 text-[var(--muted)]">
                계약 의결권{" "}
                {formatExactShareQuantity(selected.controlVoteWeightExact)}표
              </p>
            </div>
          </div>
          {acquiredCompany && (
            <p className="mt-3 rounded-xl bg-cyan-400/10 p-3 text-[11px] leading-relaxed text-cyan-200">
              인수 회사는 아래에서 이사회 결정과 주주총회 안건을 회사별로 행사합니다.
              실제 보유주식은 경제적 권리, 계약 의결권은 경영권 표결에만 적용됩니다.
              개인 지갑을 직접 차감하는 발행·배당·소각 버튼은 회사 간 중복 집행을 막기
              위해 인수 회사에서 잠깁니다.
            </p>
          )}
        </div>
      )}

      {summary?.eligible && (
        <div className="mt-4">
          <p className="text-sm font-black text-rose-300">
            강제청산 감지 · 이 회사의 보호 방식을 선택하세요
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {OPTIONS.map((option) => (
              <button
                key={option.type}
                type="button"
                disabled={Boolean(working)}
                onClick={() => void choose(option.type)}
                className="rounded-2xl border border-rose-400/20 bg-[var(--background)] p-4 text-left transition hover:border-rose-300 disabled:opacity-60"
              >
                <p className="font-black">
                  {option.icon} {option.title}
                </p>
                <p className="mt-2 text-xs leading-relaxed">
                  {option.description}
                </p>
                <p className="mt-2 text-[10px] leading-relaxed text-[var(--muted)]">
                  {option.caution}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {activeCase && (
        <div className="mt-4 rounded-2xl border border-violet-400/25 bg-violet-400/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-black">
              {STATUS_LABEL[activeCase.status] ?? activeCase.status}
            </p>
            {activeCase.resolvesSession && (
              <span className="text-xs text-violet-200">
                D-{Math.max(0, activeCase.resolvesSession - currentSession)}
              </span>
            )}
          </div>
          {activeCase.status === "trust" && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              보호된 계약 의결권{" "}
              {formatExactShareQuantity(activeCase.protectedVoteWeightExact)}표
            </p>
          )}
          {activeCase.status === "loan-active" && (
            <>
              <p className="mt-2 text-xs text-[var(--muted)]">
                대출 원금 {formatExactMoney(activeCase.rescueLoanCentsExact)} ·
                상환액{" "}
                {formatExactMoney(
                  loanRepayment(activeCase.rescueLoanCentsExact),
                )}{" "}
                · 만기까지 D-
                {Math.max(
                  0,
                  (activeCase.rescueLoanDueSession ?? currentSession) -
                    currentSession,
                )}
              </p>
              <button
                type="button"
                disabled={Boolean(working)}
                onClick={() => void repay()}
                className="mt-3 rounded-xl bg-violet-500 px-4 py-2 text-xs font-black text-white disabled:opacity-60"
              >
                원리금 상환
              </button>
            </>
          )}
          {activeCase.status === "auction" && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              공개매각가 {formatExactMoney(activeCase.auctionPriceCentsExact)} ·
              인수 완료 전까지 원 법인은 운영 정지 상태로 보전됩니다.
            </p>
          )}
        </div>
      )}

      {auctions.length > 0 && (
        <div className="mt-5 border-t border-[var(--border)] pt-4">
          <p className="font-black">공개매각 시장</p>
          <p className="mt-1 text-xs text-[var(--muted)]">
            인수자는 여러 회사를 운영할 수 있으며, 각 회사의 IPO 경영권은 하나의
            플레이어에게만 배정됩니다.
          </p>
          <div className="mt-3 grid gap-2">
            {auctions.map((auction) => (
              <div
                key={auction.caseId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[var(--background)] p-4"
              >
                <div>
                  <p className="font-bold">
                    {auction.companyName}{" "}
                    <span className="text-xs text-amber-300">
                      {auction.ticker}
                    </span>
                  </p>
                  <p className="mt-1 text-[10px] text-[var(--muted)]">
                    원 창업주 @{auction.originalFounderGameId} · 매각{" "}
                    {Math.max(0, currentSession - auction.openedSession)}거래일째
                  </p>
                </div>
                <button
                  type="button"
                  disabled={Boolean(working)}
                  onClick={() => void acquire(auction)}
                  className="rounded-xl bg-amber-400 px-4 py-2 text-xs font-black text-black disabled:opacity-60"
                >
                  {working === auction.caseId
                    ? "인수 처리 중…"
                    : `${formatExactMoney(auction.auctionPriceCentsExact)}에 인수`}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {message && (
        <p className="mt-4 rounded-xl bg-[var(--background)] p-3 text-xs text-amber-100">
          {message}
        </p>
      )}

      {acquiredCompany && selected && (
        <div className="mt-5 border-t border-[var(--border)] pt-5">
          <PlayerCompanyBoardPanel
            stockId={selected.stockId}
            currentSession={currentSession}
          />
          <PlayerCompanyGovernancePanel
            founderStockId={selected.stockId}
            currentSession={currentSession}
          />
        </div>
      )}
    </section>
  );
}

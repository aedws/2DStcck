"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  formatCompactMoney,
  formatPrice,
} from "@/lib/market/engine";
import {
  PLAYER_COMPANY_MIN_NET_WORTH,
  PLAYER_COMPANY_SECTORS,
  isPlayerCompanyIpoReady,
  playerCompanyFounderOwnership,
  playerCompanyFoundingCost,
  playerCompanyLevel,
  playerCompanyPrestige,
} from "@/lib/player/playerCompany";
import {
  COMPANY_FOUNDATION_STATUS_LABEL,
  listMyCompanyFoundationRequests,
  submitCompanyFoundationRequest,
  type CompanyFoundationRequest,
} from "@/lib/supabase/companyFoundationRequests";
import { submitStockRequest } from "@/lib/supabase/stockRequests";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { useMarketStore } from "@/store/marketStore";

const FOUNDATION_STATUS_STYLE: Record<
  CompanyFoundationRequest["status"],
  string
> = {
  pending: "bg-slate-500/15 text-[var(--muted)]",
  reviewing: "bg-sky-500/15 text-sky-400",
  accepted: "bg-emerald-500/15 text-emerald-400",
  rejected: "bg-rose-500/15 text-rose-400",
  shipped: "bg-violet-500/15 text-violet-300",
};

const STATUS_LABEL = {
  active: "운영 중",
  paused: "운영 정지",
  "ipo-requested": "IPO 심사 중",
} as const;

export default function CompanyPage() {
  const playerCompany = useMarketStore((state) => state.playerCompany);
  const cash = useMarketStore((state) => state.cash);
  const userId = useMarketStore((state) => state.userId);
  const cloudSyncReady = useMarketStore((state) => state.cloudSyncReady);
  const getTotalAssets = useMarketStore((state) => state.getTotalAssets);
  const foundCompany = useMarketStore((state) => state.foundPlayerCompany);
  const prepareCapitalCall = useMarketStore(
    (state) => state.preparePlayerCompanyCapitalCall,
  );
  const fundCapitalCall = useMarketStore(
    (state) => state.fundPlayerCompanyCapitalCall,
  );
  const diluteCapitalCall = useMarketStore(
    (state) => state.dilutePlayerCompanyCapitalCall,
  );
  const refuseCapitalCall = useMarketStore(
    (state) => state.refusePlayerCompanyCapitalCall,
  );
  const resumeCompany = useMarketStore((state) => state.resumePlayerCompany);
  const markIpoRequested = useMarketStore(
    (state) => state.markPlayerCompanyIpoRequested,
  );

  const [now, setNow] = useState(() => Date.now());
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [sector, setSector] = useState<string>(PLAYER_COMPANY_SECTORS[0]);
  const [subsector, setSubsector] = useState("");
  const [description, setDescription] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [message, setMessage] = useState("");
  const [submittingIpo, setSubmittingIpo] = useState(false);
  const [foundationRequests, setFoundationRequests] = useState<
    CompanyFoundationRequest[] | null
  >(null);
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [founding, setFounding] = useState(false);

  const refreshFoundationRequests = async () => {
    setFoundationRequests(await listMyCompanyFoundationRequests());
  };

  const netWorth = getTotalAssets();
  const foundingCost = playerCompanyFoundingCost(netWorth);
  const currentSession = Math.floor(now / SESSION_DURATION_MS);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!userId || !cloudSyncReady) {
      setFoundationRequests([]);
      return;
    }
    void refreshFoundationRequests();
  }, [userId, cloudSyncReady]);

  useEffect(() => {
    if (!playerCompany || playerCompany.status !== "active") return;
    prepareCapitalCall();
  }, [
    currentSession,
    playerCompany,
    prepareCapitalCall,
  ]);

  const companyStats = useMemo(() => {
    if (!playerCompany) return null;
    return {
      prestige: playerCompanyPrestige(playerCompany),
      level: playerCompanyLevel(playerCompany),
      ownership: playerCompanyFounderOwnership(playerCompany),
      resolvedRounds:
        playerCompany.fundedRounds + playerCompany.dilutionRounds,
      ipoReady: isPlayerCompanyIpoReady(playerCompany),
    };
  }, [playerCompany]);

  const activeFoundationRequest = useMemo(() => {
    if (!foundationRequests?.length) return null;
    return (
      foundationRequests.find((request) =>
        ["pending", "reviewing", "accepted"].includes(request.status),
      ) ?? null
    );
  }, [foundationRequests]);

  const latestRejectedFoundationRequest = useMemo(() => {
    if (!foundationRequests?.length) return null;
    return foundationRequests.find((request) => request.status === "rejected") ?? null;
  }, [foundationRequests]);

  useEffect(() => {
    const source = activeFoundationRequest?.company;
    if (!source) return;
    setName(source.name);
    setTicker(source.ticker);
    setSector(source.sector);
    setSubsector(source.subsector ?? "");
    setDescription(source.description ?? "");
  }, [activeFoundationRequest?.id]);

  const handleSubmitFoundationRequest = async () => {
    setMessage("");
    setSubmittingRequest(true);
    const result = await submitCompanyFoundationRequest({
      name,
      ticker,
      sector,
      subsector,
      description,
    });
    setMessage(result.message);
    if (result.success) {
      await refreshFoundationRequests();
    }
    setSubmittingRequest(false);
  };

  const handleFound = async () => {
    setMessage("");
    if (!activeFoundationRequest || activeFoundationRequest.status !== "accepted") {
      setMessage("관리자 허가가 완료된 뒤에만 설립할 수 있습니다.");
      return;
    }
    if (
      !window.confirm(
        `${formatPrice(foundingCost)}를 영구 소각해 ${name.trim()}을(를) 설립할까요?\n이 금액은 순자산과 회사 가치로 반환되지 않습니다.`,
      )
    ) {
      return;
    }
    setFounding(true);
    const result = await foundCompany(
      {
        name,
        ticker,
        sector,
        subsector,
        description,
      },
      activeFoundationRequest.id,
    );
    setMessage(result.message);
    if (result.success) {
      await refreshFoundationRequests();
    }
    setFounding(false);
  };

  const handleFund = () => {
    const amount = playerCompany?.pendingCapitalCall?.amount ?? 0;
    if (
      !window.confirm(
        `${formatPrice(amount)}를 영구 소각해 경영권과 성장 단계를 유지할까요?`,
      )
    ) {
      return;
    }
    setMessage(fundCapitalCall().message);
  };

  const handleDilute = () => {
    if (
      !window.confirm(
        "현금 출자 대신 기존 발행주식의 10%를 NPC 시장에 신주로 배정합니다. 창업주 지분이 희석됩니다.",
      )
    ) {
      return;
    }
    setMessage(diluteCapitalCall().message);
  };

  const handleRefuse = () => {
    if (!window.confirm("자본 확충을 거절하면 회사 운영과 IPO 진행이 정지됩니다.")) {
      return;
    }
    setMessage(refuseCapitalCall().message);
  };

  const handleIpoRequest = async () => {
    if (!playerCompany || !companyStats?.ipoReady || submittingIpo) return;
    if (
      !window.confirm(
        "IPO 심사를 신청할까요? 승인 후 정적 시장 업데이트와 체크포인트 재생성을 거쳐 거래가 시작됩니다.",
      )
    ) {
      return;
    }
    setSubmittingIpo(true);
    setMessage("");
    const result = await submitStockRequest({
      name: `${playerCompany.name} (${playerCompany.ticker})`,
      sector: playerCompany.sector,
      description: [
        "[플레이어 회사 IPO]",
        playerCompany.description,
        `세부 산업: ${playerCompany.subsector || "미지정"}`,
        `누적 소각: ${formatPrice(playerCompany.cumulativeCapitalBurned)}`,
        `창업주 지분: ${(companyStats.ownership * 100).toFixed(2)}%`,
        `총 발행주식: ${playerCompany.totalShares.toLocaleString()}주`,
        `회사 프레스티지: ${companyStats.prestige}`,
      ]
        .filter(Boolean)
        .join("\n"),
      costPaid: 0,
    });
    if (result.success) {
      const marked = markIpoRequested();
      setMessage(marked.message);
    } else {
      setMessage(result.message);
    }
    setSubmittingIpo(false);
  };

  const formLocked = Boolean(activeFoundationRequest);

  if (!playerCompany) {
    const eligible = netWorth >= PLAYER_COMPANY_MIN_NET_WORTH;
    const hasCash = cash >= foundingCost;
    return (
      <div className="mx-auto max-w-3xl pb-24">
        <header className="mb-6 rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-fuchsia-500/5 p-6">
          <p className="text-xs font-bold text-amber-300">초고액 자금 소각 콘텐츠</p>
          <h1 className="mt-1 text-3xl font-black">🏢 회사 설립</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            순자산 $1B 이상 창업주가 관리자 허가를 받은 뒤 자본을 영구 소각해
            비상장 회사를 설립합니다. 회사 가치는 순자산 랭킹에 합산되지 않으며,
            성장 성과는 프레스티지로 기록됩니다.
          </p>
        </header>

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <SummaryCard label="현재 순자산" value={formatCompactMoney(netWorth)} />
          <SummaryCard label="설립 출자금 20%" value={formatCompactMoney(foundingCost)} />
          <SummaryCard label="보유 현금" value={formatCompactMoney(cash)} />
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          {!userId || !cloudSyncReady ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center">
              <p className="text-sm font-bold">로그인 계정이 필요합니다.</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                회사 상태는 기존 지갑과 함께 클라우드에 저장됩니다.
              </p>
            </div>
          ) : !eligible ? (
            <div className="rounded-2xl border border-dashed border-amber-400/30 p-6 text-center">
              <p className="text-sm font-bold">순자산 $1B부터 설립 가능</p>
              <p className="mt-1 text-xs text-[var(--muted)]">
                현재 {formatCompactMoney(netWorth)} · 부족액{" "}
                {formatCompactMoney(
                  Math.max(0, PLAYER_COMPANY_MIN_NET_WORTH - netWorth),
                )}
              </p>
            </div>
          ) : foundationRequests === null ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
              허가 신청 내역을 불러오는 중…
            </div>
          ) : (
            <div className="space-y-4">
              {activeFoundationRequest && (
                <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-bold">회사 설립 허가 신청</p>
                    <span
                      className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold ${FOUNDATION_STATUS_STYLE[activeFoundationRequest.status]}`}
                    >
                      {COMPANY_FOUNDATION_STATUS_LABEL[activeFoundationRequest.status]}
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                    {activeFoundationRequest.status === "pending"
                      ? "관리자 검토 대기 중입니다. 허가 전에는 출자금 소각과 설립이 불가합니다."
                      : activeFoundationRequest.status === "reviewing"
                        ? "관리자가 심사 중입니다. 승인되면 아래에서 출자금을 소각해 설립할 수 있습니다."
                        : "허가가 완료되었습니다. 아래에서 출자금을 영구 소각해 회사를 설립하세요."}
                  </p>
                  <p className="mt-2 text-[11px] text-[var(--muted)]">
                    신청일{" "}
                    {new Date(activeFoundationRequest.createdAt).toLocaleString("ko-KR")}
                  </p>
                </div>
              )}

              {!activeFoundationRequest && latestRejectedFoundationRequest && (
                <div className="rounded-2xl border border-rose-400/30 bg-rose-400/5 p-4">
                  <p className="text-sm font-bold text-rose-300">이전 신청이 반려되었습니다</p>
                  {latestRejectedFoundationRequest.adminNote ? (
                    <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-[var(--muted)]">
                      {latestRejectedFoundationRequest.adminNote}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-[var(--muted)]">
                      사유가 기록되지 않았습니다. 내용을 수정해 다시 신청할 수 있습니다.
                    </p>
                  )}
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="회사명">
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value.slice(0, 30))}
                    placeholder="2~30자"
                    disabled={formLocked}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-70"
                  />
                </Field>
                <Field label="티커">
                  <input
                    value={ticker}
                    onChange={(event) =>
                      setTicker(
                        event.target.value
                          .toUpperCase()
                          .replace(/[^A-Z0-9]/g, "")
                          .slice(0, 6),
                      )
                    }
                    placeholder="영문·숫자 2~6자"
                    disabled={formLocked}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-70"
                  />
                </Field>
                <Field label="상위 섹터">
                  <select
                    value={sector}
                    onChange={(event) => setSector(event.target.value)}
                    disabled={formLocked}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-70"
                  >
                    {PLAYER_COMPANY_SECTORS.map((item) => (
                      <option key={item} value={item}>
                        {item}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="세부 산업">
                  <input
                    value={subsector}
                    onChange={(event) =>
                      setSubsector(event.target.value.slice(0, 40))
                    }
                    placeholder="선택 · 최대 40자"
                    disabled={formLocked}
                    className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-70"
                  />
                </Field>
              </div>
              <Field label="회사 소개">
                <textarea
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value.slice(0, 300))
                  }
                  rows={4}
                  placeholder="사업 내용과 회사 설정"
                  disabled={formLocked}
                  className="w-full resize-none rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-70"
                />
              </Field>
              {activeFoundationRequest?.status === "accepted" ? (
                <>
                  <label className="flex items-start gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/5 p-3 text-xs">
                    <input
                      type="checkbox"
                      checked={acknowledged}
                      onChange={(event) => setAcknowledged(event.target.checked)}
                      className="mt-0.5"
                    />
                    <span>
                      출자금 {formatPrice(foundingCost)}가 영구 소각되고 순자산으로
                      반환되지 않음을 확인했습니다.
                    </span>
                  </label>
                  <button
                    type="button"
                    disabled={
                      founding ||
                      !acknowledged ||
                      !hasCash ||
                      name.trim().length < 2 ||
                      ticker.length < 2
                    }
                    onClick={() => void handleFound()}
                    className="min-h-12 w-full rounded-2xl bg-amber-400 px-5 text-sm font-black text-black disabled:cursor-not-allowed disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
                  >
                    {founding
                      ? "설립 중…"
                      : hasCash
                        ? `${formatCompactMoney(foundingCost)} 영구 소각 후 설립`
                        : "설립 출자금에 필요한 현금 부족"}
                  </button>
                </>
              ) : !activeFoundationRequest ? (
                <button
                  type="button"
                  disabled={
                    submittingRequest ||
                    name.trim().length < 2 ||
                    ticker.length < 2
                  }
                  onClick={() => void handleSubmitFoundationRequest()}
                  className="min-h-12 w-full rounded-2xl bg-cyan-500 px-5 text-sm font-black text-white disabled:cursor-not-allowed disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
                >
                  {submittingRequest ? "허가 신청 중…" : "관리자 허가 신청"}
                </button>
              ) : (
                <p className="rounded-2xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
                  허가가 완료되면 이 화면에서 출자금 소각과 설립을 진행할 수 있습니다.
                </p>
              )}
            </div>
          )}
          {message && (
            <p className="mt-4 rounded-xl bg-[var(--background)] p-3 text-xs text-[var(--muted)]">
              {message}
            </p>
          )}
        </section>
      </div>
    );
  }

  const stats = companyStats!;
  const call = playerCompany.pendingCapitalCall;
  const sessionsLeft = Math.max(
    0,
    playerCompany.nextCapitalRoundSession - currentSession,
  );

  return (
    <div className="mx-auto max-w-4xl pb-24">
      <header className="mb-5 rounded-3xl border border-cyan-400/30 bg-gradient-to-br from-cyan-500/10 to-violet-500/5 p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-cyan-400/15 px-2.5 py-1 text-xs font-bold text-cyan-200">
                Lv.{stats.level}
              </span>
              <span className="rounded-full bg-[var(--surface)] px-2.5 py-1 text-xs text-[var(--muted)]">
                {STATUS_LABEL[playerCompany.status]}
              </span>
            </div>
            <h1 className="mt-3 text-3xl font-black">{playerCompany.name}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {playerCompany.ticker} · {playerCompany.sector}
              {playerCompany.subsector ? ` · ${playerCompany.subsector}` : ""}
            </p>
          </div>
          <Link
            href="/profile"
            className="rounded-xl bg-[var(--surface)] px-4 py-2 text-xs font-bold"
          >
            프로필 보기
          </Link>
        </div>
        {playerCompany.description && (
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            {playerCompany.description}
          </p>
        )}
      </header>

      <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryCard label="회사 프레스티지" value={stats.prestige.toLocaleString()} />
        <SummaryCard
          label="누적 자본 소각"
          value={formatCompactMoney(playerCompany.cumulativeCapitalBurned)}
        />
        <SummaryCard
          label="창업주 지분"
          value={`${(stats.ownership * 100).toFixed(2)}%`}
        />
        <SummaryCard
          label="총 발행주식"
          value={`${playerCompany.totalShares.toLocaleString()}주`}
        />
      </section>

      {call && (
        <section className="mb-5 rounded-3xl border border-amber-400/40 bg-amber-400/5 p-5">
          <p className="text-xs font-bold text-amber-300">정기 자본 확충</p>
          <h2 className="mt-1 text-xl font-black">
            순자산 5% · {formatCompactMoney(call.amount)}
          </h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            회차 시작 순자산 {formatCompactMoney(call.netWorthSnapshot)} 기준입니다.
            출자하면 현금이 영구 소각되고, 증자하면 신주가 NPC 시장에 배정되어
            창업주 지분이 희석됩니다.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button
              type="button"
              disabled={cash < call.amount}
              onClick={handleFund}
              className="min-h-12 rounded-xl bg-amber-400 px-4 text-sm font-black text-black disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
            >
              출자·소각
            </button>
            <button
              type="button"
              onClick={handleDilute}
              className="min-h-12 rounded-xl bg-cyan-500 px-4 text-sm font-black text-white"
            >
              10% 신주 발행
            </button>
            <button
              type="button"
              onClick={handleRefuse}
              className="min-h-12 rounded-xl bg-[var(--surface)] px-4 text-sm font-bold text-[var(--muted)]"
            >
              거절·운영 정지
            </button>
          </div>
        </section>
      )}

      {playerCompany.status === "paused" && (
        <section className="mb-5 rounded-3xl border border-red-400/30 bg-red-400/5 p-5">
          <h2 className="text-lg font-bold">⏸ 회사 운영 정지</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            성장과 IPO 진행이 멈췄습니다. 현재 순자산의 5%를 기준으로 자본 확충
            요구를 다시 만들 수 있습니다.
          </p>
          <button
            type="button"
            onClick={() => setMessage(resumeCompany().message)}
            className="mt-4 min-h-11 rounded-xl bg-red-400 px-4 text-sm font-black text-black"
          >
            운영 재개 절차
          </button>
        </section>
      )}

      {!call && playerCompany.status === "active" && (
        <section className="mb-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold">다음 자본 확충</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">
                {sessionsLeft}거래일 뒤 · 당시 개인 순자산의 5%
              </p>
            </div>
            <span className="text-2xl">🔥</span>
          </div>
        </section>
      )}

      <section className="mb-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-bold">주주 구성</h2>
        <div className="mt-4 h-4 overflow-hidden rounded-full bg-cyan-500/30">
          <div
            className="h-full bg-amber-400"
            style={{ width: `${stats.ownership * 100}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between text-xs text-[var(--muted)]">
          <span>창업주 {playerCompany.founderShares.toLocaleString()}주</span>
          <span>NPC 시장 {playerCompany.publicShares.toLocaleString()}주</span>
        </div>
      </section>

      <section className="rounded-3xl border border-violet-400/30 bg-violet-400/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold text-violet-300">정적 시장 편입</p>
            <h2 className="mt-1 text-xl font-black">IPO 준비</h2>
          </div>
          <span className="text-sm font-black text-violet-200">
            {stats.ipoReady ? "신청 가능" : `${stats.resolvedRounds}/4 라운드`}
          </span>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Requirement ok={playerCompany.fundedRounds >= 2} label="출자 소각 2회 이상" />
          <Requirement ok={stats.resolvedRounds >= 4} label="자본 확충 4회 이상" />
          <Requirement ok={stats.ownership >= 0.5} label="창업주 지분 50% 이상" />
          <Requirement ok={stats.prestige >= 300} label="회사 프레스티지 300 이상" />
        </div>
        {playerCompany.status === "ipo-requested" ? (
          <p className="mt-4 rounded-xl bg-violet-400/10 p-3 text-sm font-bold text-violet-200">
            IPO 심사 중입니다. 승인·정적 배포 전까지 거래할 수 없습니다.
          </p>
        ) : (
          <button
            type="button"
            disabled={!stats.ipoReady || submittingIpo}
            onClick={handleIpoRequest}
            className="mt-4 min-h-12 w-full rounded-xl bg-violet-500 px-4 text-sm font-black text-white disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
          >
            {submittingIpo ? "신청 중…" : "IPO 심사 신청"}
          </button>
        )}
      </section>

      {message && (
        <p className="mt-4 rounded-xl bg-[var(--surface)] p-3 text-xs text-[var(--muted)]">
          {message}
        </p>
      )}

    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-semibold text-[var(--muted)]">
        {label}
      </span>
      {children}
    </label>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-lg font-black tabular-nums" title={value}>
        {value}
      </p>
    </div>
  );
}

function Requirement({ ok, label }: { ok: boolean; label: string }) {
  return (
    <div
      className={`rounded-xl px-3 py-2 text-xs font-semibold ${
        ok
          ? "bg-emerald-400/10 text-emerald-300"
          : "bg-[var(--surface)] text-[var(--muted)]"
      }`}
    >
      {ok ? "✓" : "○"} {label}
    </div>
  );
}

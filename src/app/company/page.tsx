"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import { PlayerCompanyBoardPanel } from "@/components/company/PlayerCompanyBoardPanel";
import { PlayerCompanyGovernancePanel } from "@/components/company/PlayerCompanyGovernancePanel";
import { PlayerCompanyInsolvencyPanel } from "@/components/company/PlayerCompanyInsolvencyPanel";
import { PlayerCompanyOwnershipPanel } from "@/components/company/PlayerCompanyOwnershipPanel";
import { PlayerCompanyStrategyPanel } from "@/components/company/PlayerCompanyStrategyPanel";
import {
  COMPANY_TUTORIAL_STEPS,
  COMPANY_TUTORIAL_VERSION,
} from "@/data/featureTutorials";
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
  playerCompanyBookPricePerShare,
  playerCompanyCapitalRaisePrice,
  playerCompanyCapitalRaiseMaxShares,
  PLAYER_COMPANY_MAX_DIVIDEND_RATE,
} from "@/lib/player/playerCompany";
import {
  COMPANY_FOUNDATION_STATUS_LABEL,
  listMyCompanyFoundationRequests,
  selectCurrentCompanyFoundationRequest,
  submitCompanyFoundationRequest,
  type CompanyFoundationRequest,
} from "@/lib/supabase/companyFoundationRequests";
import { submitStockRequest } from "@/lib/supabase/stockRequests";
import {
  getPlayerCompanyFounderOwnershipSummary,
  type PlayerCompanyFounderOwnershipSummary,
} from "@/lib/supabase/playerCompanyOwnership";
import { useVisiblePolling } from "@/lib/ui/useVisiblePolling";
import {
  listPublicPlayerCompanies,
  type PublicPlayerCompany,
} from "@/lib/supabase/publicPlayerCompanies";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { sessionEta } from "@/lib/market/sessionTime";
import {
  LONG_TERM_SHAREHOLDER_SESSIONS,
  SHAREHOLDER_LETTER_BODY_MAX_LENGTH,
  SHAREHOLDER_LETTER_COOLDOWN_SESSIONS,
  SHAREHOLDER_LETTER_TITLE_MAX_LENGTH,
} from "@/lib/player/shareholderLetters";
import {
  getShareholderLetterStatus,
  sendShareholderLetter,
  type ShareholderLetterStatus,
} from "@/lib/supabase/shareholderLetters";
import { exactOwnershipPercent } from "@/lib/supabase/playerCompanyOwnership";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";

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
  listed: "상장 완료",
  "foundation-accepted": "설립 허가",
} as const;

export default function CompanyPage() {
  const playerCompany = useMarketStore((state) => state.playerCompany);
  // 상장 후에는 좌당 장부가를 실제 시장가로 표시·계산한다.
  const listedMarketPrice = useMarketStore((state) =>
    state.playerCompany?.status === "listed" &&
    state.playerCompany.ipoListingStockId
      ? state.stocks.find(
          (s) => s.id === state.playerCompany!.ipoListingStockId,
        )?.currentPrice
      : undefined,
  );
  const listedFounderHolding = useMarketStore((state) =>
    state.playerCompany?.status === "listed" &&
    state.playerCompany.ipoListingStockId
      ? state.holdings.find(
          (holding) =>
            holding.stockId === state.playerCompany!.ipoListingStockId,
        )
      : undefined,
  );
  const cash = useMarketStore((state) => state.cash);
  const userId = useMarketStore((state) => state.userId);
  const cloudSyncReady = useMarketStore((state) => state.cloudSyncReady);
  const [mounted, setMounted] = useState(false);
  const [manualTutorial, setManualTutorial] = useState(false);
  const onboarded = useSettingsStore((state) => state.onboarded);
  const companyTutorialSeen = useSettingsStore((state) => state.companyTutorialSeen);
  const setCompanyTutorialSeen = useSettingsStore(
    (state) => state.setCompanyTutorialSeen,
  );
  const companyTutorialVersion = useSettingsStore(
    (state) => state.companyTutorialVersion,
  );
  const setCompanyTutorialVersion = useSettingsStore(
    (state) => state.setCompanyTutorialVersion,
  );
  useEffect(() => setMounted(true), []);

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
  const issueShares = useMarketStore((state) => state.issuePlayerCompanyShares);
  const raiseCapital = useMarketStore(
    (state) => state.raisePlayerCompanyCapital,
  );
  const buybackShares = useMarketStore(
    (state) => state.buybackPlayerCompanyShares,
  );
  const retireShares = useMarketStore(
    (state) => state.retirePlayerCompanyShares,
  );
  const setDividendRate = useMarketStore(
    (state) => state.setPlayerCompanyDividendRate,
  );
  const declareDividend = useMarketStore(
    (state) => state.declarePlayerCompanyDividend,
  );
  const [manageQty, setManageQty] = useState("1000");
  const [dividendPct, setDividendPct] = useState("");
  const [declaring, setDeclaring] = useState(false);
  const [shareholderLetterTitle, setShareholderLetterTitle] = useState("");
  const [shareholderLetterBody, setShareholderLetterBody] = useState("");
  const [shareholderLetterStatus, setShareholderLetterStatus] =
    useState<ShareholderLetterStatus | null>(null);
  const [sendingShareholderLetter, setSendingShareholderLetter] = useState(false);
  const [capitalAction, setCapitalAction] = useState<
    "issue" | "capital_raise" | "buyback" | "retire" | null
  >(null);

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
  const [publicCompanies, setPublicCompanies] = useState<
    PublicPlayerCompany[] | null
  >(null);
  const [dividendOwnership, setDividendOwnership] =
    useState<PlayerCompanyFounderOwnershipSummary | null>(null);

  const refreshFoundationRequests = useCallback(async () => {
    setFoundationRequests(await listMyCompanyFoundationRequests());
  }, []);

  const netWorth = getTotalAssets();
  const foundingCost = playerCompanyFoundingCost(netWorth);
  const currentSession = Math.floor(now / SESSION_DURATION_MS);
  const listedStockId =
    playerCompany?.status === "listed"
      ? playerCompany.ipoListingStockId ?? ""
      : "";
  const listedFounderQuantityExact =
    listedFounderHolding?.quantityExact ??
    String(listedFounderHolding?.quantity ?? 0);
  const plannedDividendRate = playerCompany?.dividendRate ?? 0;
  const plannedDividendTotal = Math.round(
    Math.max(0, netWorth) * plannedDividendRate,
  );
  // 예상 좌당 배당은 명목 총발행이 아니라 실제 유통주식(창업주 실보유 + 다른 주주
  // 보유합) 기준으로 표시한다 — 실제 분배와 일치한다(버그리포트 c10d3202).
  const circulatingShares =
    playerCompany?.status === "listed"
      ? Number(listedFounderQuantityExact) +
        Number(dividendOwnership?.trackedPublicQuantityExact ?? 0)
      : (playerCompany?.totalShares ?? 0);
  const dividendShareBasis = Math.max(
    1,
    circulatingShares > 0
      ? circulatingShares
      : (playerCompany?.totalShares ?? 1),
  );
  const plannedDividendPerShare = playerCompany
    ? Math.floor(plannedDividendTotal / dividendShareBasis)
    : 0;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  // 아래 서버 조회들은 탭이 보일 때만 60초 주기로 폴링한다(배경 폴링 중단·주기
  // 완화로 전송량 절감). 조건 불충족 시 상태만 초기화한다.
  useEffect(() => {
    if (!listedStockId) setDividendOwnership(null);
  }, [listedStockId]);
  // 예상 좌당 배당을 실제 유통주식 기준으로 표시하기 위한 다른 주주 보유 집계.
  useVisiblePolling(
    () => {
      if (!listedStockId) return;
      void getPlayerCompanyFounderOwnershipSummary(listedStockId).then(
        setDividendOwnership,
      );
    },
    60_000,
    [listedStockId],
  );

  useVisiblePolling(
    () => void listPublicPlayerCompanies().then(setPublicCompanies),
    60_000,
    [],
  );

  useEffect(() => {
    if (!userId || !cloudSyncReady) setFoundationRequests([]);
  }, [userId, cloudSyncReady]);
  useVisiblePolling(
    () => {
      if (!userId || !cloudSyncReady) return;
      void refreshFoundationRequests();
    },
    60_000,
    [userId, cloudSyncReady, refreshFoundationRequests],
  );

  const refreshShareholderLetterStatus = useCallback(async () => {
    if (!userId || !cloudSyncReady || !listedStockId) {
      setShareholderLetterStatus(null);
      return;
    }
    setShareholderLetterStatus(await getShareholderLetterStatus(listedStockId));
  }, [userId, cloudSyncReady, listedStockId]);

  useEffect(() => {
    if (!listedStockId) setShareholderLetterStatus(null);
  }, [listedStockId]);
  useVisiblePolling(
    () => {
      if (!listedStockId) return;
      void refreshShareholderLetterStatus();
    },
    60_000,
    [listedStockId, refreshShareholderLetterStatus],
  );

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
    const ownership =
      playerCompany.status === "listed"
        ? exactOwnershipPercent(
            listedFounderQuantityExact,
            playerCompany.totalShares,
          ) / 100
        : playerCompanyFounderOwnership(playerCompany);
    return {
      prestige: playerCompanyPrestige(playerCompany),
      level: playerCompanyLevel(playerCompany),
      ownership,
      resolvedRounds:
        playerCompany.fundedRounds + playerCompany.dilutionRounds,
      ipoReady: isPlayerCompanyIpoReady(playerCompany),
    };
  }, [listedFounderQuantityExact, playerCompany]);

  const activeFoundationRequest = useMemo(() => {
    if (!foundationRequests?.length) return null;
    return selectCurrentCompanyFoundationRequest(foundationRequests);
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

  const handleCapitalAction = async (
    kind: "issue" | "capital_raise" | "buyback" | "retire",
  ) => {
    if (capitalAction) return;
    const quantity = Number(manageQty);
    setCapitalAction(kind);
    const result =
      kind === "issue"
        ? await issueShares(quantity)
        : kind === "capital_raise"
          ? await raiseCapital(quantity)
          : kind === "buyback"
            ? await buybackShares(quantity)
            : await retireShares(quantity);
    setMessage(result.message);
    setCapitalAction(null);
  };

  const handleShareholderLetter = async () => {
    if (!listedStockId || sendingShareholderLetter) return;
    const eligibleCount = shareholderLetterStatus?.eligibleCount ?? 0;
    if (
      !window.confirm(
        `현재 장기보유 주주 ${eligibleCount.toLocaleString()}명에게 CEO 서한을 보낼까요?\n발송 후 ${SHAREHOLDER_LETTER_COOLDOWN_SESSIONS}거래일 동안 새 서한을 보낼 수 없습니다.`,
      )
    ) {
      return;
    }
    setSendingShareholderLetter(true);
    const result = await sendShareholderLetter({
      stockId: listedStockId,
      title: shareholderLetterTitle,
      body: shareholderLetterBody,
    });
    setMessage(result.message);
    if (result.success) {
      setShareholderLetterTitle("");
      setShareholderLetterBody("");
      await refreshShareholderLetterStatus();
    }
    setSendingShareholderLetter(false);
  };

  const formLocked = Boolean(activeFoundationRequest);

  if (!playerCompany) {
    const eligible = netWorth >= PLAYER_COMPANY_MIN_NET_WORTH;
    const hasCash = cash >= foundingCost;
    const showCompanyTutorial =
      mounted &&
      onboarded &&
      (manualTutorial ||
        !companyTutorialSeen ||
        companyTutorialVersion < COMPANY_TUTORIAL_VERSION);
    return (
      <div className="mx-auto max-w-3xl pb-24">
        {showCompanyTutorial && (
          <FeatureTutorialModal
            steps={COMPANY_TUTORIAL_STEPS}
            onFinish={() => {
              setCompanyTutorialSeen(true);
              setCompanyTutorialVersion(COMPANY_TUTORIAL_VERSION);
              setManualTutorial(false);
            }}
          />
        )}
        <header className="mb-6 rounded-3xl border border-amber-400/30 bg-gradient-to-br from-amber-500/10 to-fuchsia-500/5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
          <p className="text-xs font-bold text-amber-300">초고액 자금 소각 콘텐츠</p>
          <h1 className="mt-1 text-3xl font-black">🏢 회사 설립</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            순자산 $1B 이상 창업주가 관리자 허가를 받은 뒤 자본을 영구 소각해
            비상장 회사를 설립합니다. 회사 가치는 순자산 랭킹에 합산되지 않으며,
            성장 성과는 프레스티지로 기록됩니다.
          </p>
            </div>
            <button
              type="button"
              onClick={() => setManualTutorial(true)}
              className="shrink-0 rounded-xl border border-amber-400/40 px-3 py-2 text-xs font-bold text-amber-200"
            >
              튜토리얼
            </button>
          </div>
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
        <PlayerCompanyInsolvencyPanel currentSession={currentSession} />
        <PlayerCompanyGovernancePanel currentSession={currentSession} />
        <PublicCompanyDirectory companies={publicCompanies} />
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
          label={
            playerCompany.status === "listed"
              ? "실제 창업주 지분"
              : "창업주 지분"
          }
          value={`${(stats.ownership * 100).toFixed(2)}%`}
        />
        <SummaryCard
          label="총 발행주식"
          value={`${playerCompany.totalShares.toLocaleString()}주`}
        />
      </section>

      <PlayerCompanyInsolvencyPanel
        founderStockId={listedStockId || undefined}
        currentSession={currentSession}
      />

      <PlayerCompanyStrategyPanel
        company={playerCompany}
        currentSession={currentSession}
      />

      {call && (
        <section className="mb-5 rounded-3xl border border-amber-400/40 bg-amber-400/5 p-5">
          <p className="text-xs font-bold text-amber-300">정기 자본 확충</p>
          <h2 className="mt-1 text-xl font-black">
            순자산 24% · {formatCompactMoney(call.amount)}
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
            성장과 IPO 진행이 멈췄습니다. 현재 순자산의 24%를 기준으로 자본 확충
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
                ⏱️ {sessionEta(sessionsLeft).countdown} · {sessionsLeft}거래일 뒤 ·
                당시 개인 순자산의 24%
              </p>
              <p className="mt-0.5 text-[10px] text-[var(--muted)]/70">
                {sessionEta(sessionsLeft).clock} · 하루에 한 번만 처리하면 됩니다
              </p>
            </div>
            <span className="text-2xl">🔥</span>
          </div>
        </section>
      )}

      {playerCompany.status === "listed" && listedStockId ? (
        <PlayerCompanyOwnershipPanel
          stockId={listedStockId}
          localFounderQuantityExact={listedFounderQuantityExact}
          totalSharesExact={String(playerCompany.totalShares)}
          currentSession={currentSession}
        />
      ) : (
        <section className="mb-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-bold">상장 전 주주 구성</h2>
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
      )}

      <section className="mb-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-bold">자본 관리</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          좌당 {playerCompany.status === "listed" ? "시장가" : "장부가"}{" "}
          {formatPrice(
            playerCompanyBookPricePerShare(playerCompany, listedMarketPrice),
          )}{" "}
          ·{" "}
          {playerCompany.status === "listed"
            ? "상장 후에는 실제 시장가로 처리하며, 서버 공통 기업행동이 약 15초 뒤 모든 계정의 주가에 동시에 반영됩니다(1회 최대 ±15%)."
            : "발행/소각은 순자산 중립, 자사주 매입은 장부가만큼 현금을 씁니다."}
        </p>
        <div className="mt-3">
          <label className="mb-1 block text-[11px] text-[var(--muted)]">
            좌수
          </label>
          <input
            inputMode="numeric"
            value={manageQty}
            onChange={(e) => setManageQty(e.target.value.replace(/[^0-9]/g, ""))}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums outline-none focus:border-[var(--accent)]"
          />
          <div className="mt-2 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => void handleCapitalAction("issue")}
              disabled={capitalAction !== null}
              className="rounded-xl border border-[var(--border)] py-2 text-xs font-semibold text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {capitalAction === "issue" ? "등록 중…" : "신주 발행"}
            </button>
            <button
              type="button"
              onClick={() => void handleCapitalAction("buyback")}
              disabled={capitalAction !== null}
              className="rounded-xl bg-emerald-500/15 py-2 text-xs font-semibold text-emerald-300"
            >
              {capitalAction === "buyback" ? "등록 중…" : "자사주 매입"}
            </button>
            <button
              type="button"
              onClick={() => void handleCapitalAction("retire")}
              disabled={capitalAction !== null}
              className="rounded-xl bg-rose-500/15 py-2 text-xs font-semibold text-rose-300"
            >
              {capitalAction === "retire" ? "등록 중…" : "공모주 소각"}
            </button>
          </div>
          {playerCompany.status === "listed" &&
            (listedMarketPrice ?? 0) > 0 && (
            <div className="mt-3 rounded-2xl border border-sky-400/25 bg-sky-400/5 p-4">
              <p className="text-sm font-black text-sky-200">프리미엄 유상증자</p>
              <p className="mt-1 text-[11px] leading-relaxed text-[var(--muted)]">
                창업주가 현재가 대비 +10%(좌당{" "}
                {formatPrice(
                  playerCompanyCapitalRaisePrice(listedMarketPrice ?? 0),
                )}
                )로 신주를 인수해 회사 자본금과 창업주 지분을 함께 늘립니다. 공모주
                유통량은 그대로이며, 발행주식수 증가로 공통 주가는 소폭 희석됩니다.
                1회 최대{" "}
                {playerCompanyCapitalRaiseMaxShares(playerCompany).toLocaleString(
                  "ko-KR",
                )}
                주(총발행 20%), 5거래일에 1회.
              </p>
              {Number(manageQty) > 0 && (
                <p className="mt-2 text-[11px] font-semibold text-sky-200">
                  예상 투입 자본 ={" "}
                  {formatPrice(
                    playerCompanyCapitalRaisePrice(listedMarketPrice ?? 0) *
                      Math.floor(Number(manageQty)),
                  )}
                </p>
              )}
              <button
                type="button"
                onClick={() => void handleCapitalAction("capital_raise")}
                disabled={capitalAction !== null}
                className="mt-3 w-full rounded-xl bg-sky-500/20 py-2 text-xs font-semibold text-sky-200 disabled:opacity-60"
              >
                {capitalAction === "capital_raise"
                  ? "등록 중…"
                  : `유상증자 (${(Number(manageQty) || 0).toLocaleString("ko-KR")}주 인수)`}
              </button>
            </div>
          )}
        </div>
        <div className="mt-4 border-t border-[var(--border)] pt-4">
          <div className="rounded-2xl border border-amber-400/25 bg-amber-400/5 p-4">
            <p className="text-sm font-black text-amber-200">
              특별배당 · 이번 1회 배당 예산
            </p>
            <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
              여기서 <b className="text-[var(--foreground)]">총자산</b>은 회사
              자산이 아니라 창업주인 <b className="text-[var(--foreground)]">내 계좌의
              현금·주식·ETF 등을 합친 전체 자산</b>입니다. 설정한 비율만큼의
              현금이 내 계좌에서 즉시 빠져나가 배당 재원이 됩니다.
            </p>
          </div>
          <label className="mb-1 mt-3 block text-[11px] text-[var(--muted)]">
            내 계좌 총자산 중 이번에 배당할 비율 % · 최대{" "}
            {(PLAYER_COMPANY_MAX_DIVIDEND_RATE * 100).toFixed(0)}%
          </label>
          <div className="flex gap-2">
            <input
              inputMode="decimal"
              value={dividendPct}
              placeholder={(plannedDividendRate * 100).toFixed(1)}
              onChange={(e) =>
                setDividendPct(e.target.value.replace(/[^0-9.]/g, ""))
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm tabular-nums outline-none focus:border-[var(--accent)]"
            />
            <button
              type="button"
              onClick={() => {
                setDividendRate(Number(dividendPct) / 100);
                setDividendPct("");
              }}
              className="shrink-0 rounded-xl bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white"
            >
              배당 금액 계산
            </button>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            <SummaryCard
              label="계산 기준: 내 계좌 총자산"
              value={formatCompactMoney(netWorth)}
            />
            <SummaryCard
              label="지금 내 현금에서 차감"
              value={
                plannedDividendRate > 0
                  ? formatCompactMoney(plannedDividendTotal)
                  : "-"
              }
            />
            <SummaryCard
              label="예상 좌당 배당"
              value={
                plannedDividendPerShare > 0
                  ? formatPrice(plannedDividendPerShare)
                  : "-"
              }
              detail={
                playerCompany?.status === "listed"
                  ? `실제 유통 ${Math.round(circulatingShares).toLocaleString()}주 기준`
                  : undefined
              }
            />
          </div>
          <div className="mt-3 rounded-xl bg-[var(--background)] p-3 text-[11px] leading-relaxed text-[var(--muted)]">
            <p>
              <b className="text-[var(--foreground)]">자동 반복되지 않습니다.</b>{" "}
              아래 버튼을 누를 때마다 배당 1건만 예약됩니다.
            </p>
            <p className="mt-1">
              위의 <b className="text-[var(--foreground)]">배당 금액 계산</b>은
              예상액만 보여주며 현금을 차감하지 않습니다. 실제 차감은 아래의{" "}
              <b className="text-[var(--foreground)]">1회 배당 예약</b> 버튼을
              확인해 누른 직후 이루어집니다.
            </p>
            <p className="mt-1">
              예약이 끝나면 설정값도 자동으로 0%로 돌아가므로, 한 번만 배당할
              계획이라면 별도로 0%를 다시 입력할 필요가 없습니다.
            </p>
            <p className="mt-1">
              예약된 재원은 다음 배당일부터 해당 회사 주주들에게 보유 좌수
              비례로 지급됩니다. 창업주도 주식을 보유하고 있으면 같은 기준으로
              배당을 받습니다.
            </p>
          </div>
          {plannedDividendRate > 0 && cash < plannedDividendTotal && (
            <p className="mt-2 rounded-xl bg-rose-400/10 p-3 text-xs font-bold text-rose-300">
              내 계좌 현금이 {formatCompactMoney(plannedDividendTotal - cash)}
              만큼 부족합니다. 총자산에 주식이 많아도 실제 차감은 현금으로만
              가능합니다.
            </p>
          )}
          {playerCompany.status === "listed" ? (
            <button
              type="button"
              disabled={
                declaring ||
                plannedDividendRate <= 0 ||
                cash < plannedDividendTotal
              }
              onClick={() => {
                if (
                  !window.confirm(
                    `내 계좌 현금 ${formatPrice(plannedDividendTotal)}를 이번 1회 배당 재원으로 사용하시겠습니까?\n\n예약 후 다음 배당은 자동 실행되지 않습니다.`,
                  )
                ) {
                  return;
                }
                setDeclaring(true);
                void declareDividend().finally(() => setDeclaring(false));
              }}
              className="mt-2 w-full rounded-xl bg-amber-500/90 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-500 disabled:opacity-40"
            >
              {declaring
                ? "1회 배당 예약 중…"
                : plannedDividendRate > 0
                  ? `${formatCompactMoney(plannedDividendTotal)}로 1회 배당 예약`
                  : "먼저 이번 배당 비율을 입력해 주세요"}
            </button>
          ) : (
            <p className="mt-2 text-[11px] text-[var(--muted)]">
              1회 배당 예약은 상장 완료 후 가능합니다.
            </p>
          )}
        </div>
      </section>

      {listedStockId && (
        <PlayerCompanyBoardPanel
          stockId={listedStockId}
          currentSession={currentSession}
        />
      )}
      <PlayerCompanyGovernancePanel
        founderStockId={listedStockId || undefined}
        currentSession={currentSession}
      />

      {playerCompany.status === "listed" && (
        <section className="mb-5 rounded-3xl border border-cyan-400/30 bg-cyan-400/5 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-cyan-300">주주 관계</p>
              <h2 className="mt-1 text-lg font-black">장기주주 CEO 서한</h2>
            </div>
            <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200">
              {shareholderLetterStatus
                ? `대상 ${shareholderLetterStatus.eligibleCount.toLocaleString()}명`
                : "대상 확인 중"}
            </span>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
            서버 저장 기준으로 보통주 1주 이상을 {LONG_TERM_SHAREHOLDER_SESSIONS}
            거래일 연속 보유한 주주에게 메시지 탭으로 전달합니다. 수신자 명단은
            공개되지 않으며 발송 당시 대상이 고정됩니다.
          </p>
          <div className="mt-4 space-y-2">
            <input
              value={shareholderLetterTitle}
              maxLength={SHAREHOLDER_LETTER_TITLE_MAX_LENGTH}
              onChange={(event) => setShareholderLetterTitle(event.target.value)}
              placeholder="서한 제목"
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm outline-none focus:border-cyan-400"
            />
            <textarea
              value={shareholderLetterBody}
              maxLength={SHAREHOLDER_LETTER_BODY_MAX_LENGTH}
              onChange={(event) => setShareholderLetterBody(event.target.value)}
              placeholder="장기보유 주주에게 전할 경영 현황과 감사 인사를 작성해 주세요."
              rows={5}
              className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm leading-relaxed outline-none focus:border-cyan-400"
            />
            <div className="flex items-center justify-between gap-3 text-[11px] text-[var(--muted)]">
              <span>외부 링크는 넣을 수 없습니다.</span>
              <span>
                {Array.from(shareholderLetterBody).length}/
                {SHAREHOLDER_LETTER_BODY_MAX_LENGTH}
              </span>
            </div>
          </div>
          {!shareholderLetterStatus?.canSend &&
            shareholderLetterStatus &&
            shareholderLetterStatus.eligibleCount > 0 && (
              <p className="mt-3 rounded-xl bg-amber-400/10 p-3 text-xs text-amber-200">
                다음 발송까지{" "}
                {Math.max(
                  0,
                  shareholderLetterStatus.nextSendSession - currentSession,
                )}
                거래일 ·{" "}
                {
                  sessionEta(
                    Math.max(
                      0,
                      shareholderLetterStatus.nextSendSession - currentSession,
                    ),
                    now,
                  ).countdown
                }
              </p>
            )}
          <button
            type="button"
            disabled={
              sendingShareholderLetter ||
              !shareholderLetterStatus?.canSend ||
              !shareholderLetterTitle.trim() ||
              !shareholderLetterBody.trim()
            }
            onClick={() => void handleShareholderLetter()}
            className="mt-3 w-full rounded-xl bg-cyan-500 py-2.5 text-sm font-black text-slate-950 transition hover:bg-cyan-400 disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
          >
            {sendingShareholderLetter
              ? "서한 발송 중…"
              : !shareholderLetterStatus
                ? "발송 상태 확인 중"
                : shareholderLetterStatus.eligibleCount
                  ? `${shareholderLetterStatus.eligibleCount.toLocaleString()}명에게 서한 보내기`
                  : "장기보유 대상 주주 없음"}
          </button>
        </section>
      )}

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
        {playerCompany.status === "listed" ? (
          <div className="mt-4 rounded-xl bg-emerald-400/10 p-3 text-sm font-bold text-emerald-300">
            상장이 완료됐습니다. 창업주 지분은 계좌의 보통주로 반영됐습니다.
            {playerCompany.ipoListingStockId && (
              <Link
                href={`/stock/${playerCompany.ipoListingStockId}`}
                className="ml-2 underline underline-offset-2"
              >
                종목 보기 →
              </Link>
            )}
          </div>
        ) : playerCompany.status === "ipo-requested" ? (
          <p className="mt-4 rounded-xl bg-violet-400/10 p-3 text-sm font-bold text-violet-200">
            IPO 심사·상장 대기 중입니다. 승인된 상장 시각 전까지 거래하거나
            창업주 지분을 받을 수 없습니다.
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

      <PublicCompanyDirectory companies={publicCompanies} />

    </div>
  );
}

function PublicCompanyDirectory({
  companies,
}: {
  companies: PublicPlayerCompany[] | null;
}) {
  return (
    <section className="mt-5 rounded-3xl border border-cyan-400/25 bg-[var(--surface)] p-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="text-xs font-bold text-cyan-300">PUBLIC COMPANY DIRECTORY</p>
          <h2 className="mt-1 text-xl font-black">플레이어 회사 명부</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            누가 어떤 회사를 설립했는지 모든 이용자에게 공개됩니다.
          </p>
        </div>
        <span className="rounded-full bg-cyan-400/10 px-3 py-1 text-xs font-bold text-cyan-200">
          {companies === null ? "불러오는 중" : `${companies.length}개 회사`}
        </span>
      </div>

      {companies === null ? (
        <p className="mt-4 rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--muted)]">
          공개 회사 명부를 불러오는 중…
        </p>
      ) : companies.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-[var(--border)] p-5 text-center text-sm text-[var(--muted)]">
          아직 공개된 플레이어 회사가 없습니다.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {companies.map((company) => (
            <article
              key={`${company.founderGameId}:${company.companyId}`}
              className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-4 py-3.5"
            >
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <h3 className="text-base font-black">
                  {company.name}({company.ticker})
                </h3>
                <span className="text-xs text-[var(--muted)]">
                  · {company.sector} / @{company.founderGameId}
                  {company.foundedAt
                    ? ` · ${new Date(company.foundedAt).toLocaleString("ko-KR")}`
                    : ""}
                </span>
              </div>
              <p className="mt-1.5 text-xs font-semibold text-cyan-300">
                {STATUS_LABEL[company.status]}
                {company.subsector ? ` / 세부 산업 · ${company.subsector}` : ""}
              </p>
              {company.description && (
                <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
                  {company.description}
                </p>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
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

function SummaryCard({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-lg font-black tabular-nums" title={value}>
        {value}
      </p>
      {detail && (
        <p className="mt-1 truncate text-[10px] text-[var(--muted)]" title={detail}>
          {detail}
        </p>
      )}
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

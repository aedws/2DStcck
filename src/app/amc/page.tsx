"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { FeatureTutorialModal } from "@/components/ui/FeatureTutorialModal";
import {
  AMC_ETF_TUTORIAL_STEPS,
  AMC_ETF_TUTORIAL_VERSION,
  AMC_TUTORIAL_STEPS,
  AMC_TUTORIAL_VERSION,
} from "@/data/featureTutorials";
import {
  AMC_ACTIVE_MAX_DIVIDEND_RATE,
  AMC_ACTIVE_MAX_FEE_RATE,
  AMC_DIVIDEND_INTERVALS,
  AMC_FOUNDING_BURN,
  AMC_GRACE_DAYS,
  AMC_MAX_DIVIDEND_INTERVAL_DAYS,
  AMC_MAX_HOLDING_WEIGHT,
  AMC_MAX_HOLDINGS,
  AMC_MIN_DIVIDEND_INTERVAL_DAYS,
  AMC_MIN_HOLDING_WEIGHT,
  AMC_MIN_HOLDINGS,
  AMC_MIN_NET_WORTH,
  AMC_REBALANCE_WINDOW_DAYS,
  AMC_SHARE_ADJUSTMENT_RATIOS,
  amcFundStockId,
  collectHoldingDividendCadences,
  computeAmcFundNavPerShare,
  computePassiveAmcAnnualDividendYield,
  equalWeightHoldings,
  maxFeeRateForStyle,
  type AmcDividendIntervalDays,
  type AmcFundStyle,
  type AmcShareAdjustmentRatio,
} from "@/lib/player/assetManager";
import {
  AMC_FOUNDATION_STATUS_LABEL,
  listMyAmcFoundationRequests,
  submitAmcFoundationRequest,
  type AmcFoundationRequest,
} from "@/lib/supabase/amcFoundationRequests";
import {
  AMC_ETF_LISTING_STATUS_LABEL,
  listMyAmcEtfListingRequests,
  type AmcEtfListingRequest,
} from "@/lib/supabase/amcEtfListingRequests";
import {
  listedFundToAmcState,
  type ListedAmcFund,
} from "@/lib/supabase/amcListedFunds";
import { formatCompactMoney, formatPrice } from "@/lib/market/engine";
import { instrumentTypeOf } from "@/lib/market/taxonomy";
import { isListed } from "@/lib/market/ipo";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { useMarketStore } from "@/store/marketStore";
import { useSettingsStore } from "@/store/settingsStore";
import { createAmcValuationPriceResolver } from "@/lib/player/amcPortfolio";

const fieldClass =
  "w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm outline-none focus:border-[var(--accent)] disabled:opacity-70";

type AmcHoldingKind =
  | "company"
  | "reserve"
  | "leverage"
  | "inverse"
  | "inverse2"
  | "covered-call";

const AMC_HOLDING_KIND_LABEL: Record<AmcHoldingKind, string> = {
  company: "기업",
  reserve: "금·단기채",
  leverage: "레버리지",
  inverse: "인버스",
  inverse2: "곱버스",
  "covered-call": "커버드콜",
};

const AMC_HOLDING_FILTERS: Array<{
  value: "all" | AmcHoldingKind;
  label: string;
}> = [
  { value: "all", label: "전체" },
  { value: "company", label: "기업" },
  { value: "reserve", label: "금·단기채" },
  { value: "leverage", label: "레버리지" },
  { value: "inverse", label: "인버스" },
  { value: "inverse2", label: "곱버스" },
  { value: "covered-call", label: "커버드콜" },
];

function amcHoldingKindOf(stock: {
  id: string;
  coveredCallUnderlyingId?: string;
  leverage?: number;
}): AmcHoldingKind {
  if (stock.id === "gldx" || stock.id === "sbnd") return "reserve";
  if (stock.coveredCallUnderlyingId) return "covered-call";
  if (stock.leverage === -2) return "inverse2";
  if (stock.leverage === -1) return "inverse";
  if ((stock.leverage ?? 0) > 1) return "leverage";
  return "company";
}

interface ShareAdjustmentDraft {
  autoSplit: boolean;
  splitPriceDollars: string;
  splitRatio: AmcShareAdjustmentRatio;
  autoReverseSplit: boolean;
  reverseSplitPriceDollars: string;
  reverseSplitRatio: AmcShareAdjustmentRatio;
}

function shareAdjustmentDraftOf(fund: {
  splitTriggerPrice?: number;
  splitRatio?: number;
  reverseSplitTriggerPrice?: number;
  reverseSplitRatio?: number;
}): ShareAdjustmentDraft {
  return {
    autoSplit: Boolean(fund.splitTriggerPrice),
    splitPriceDollars: String((fund.splitTriggerPrice ?? 500) / 100),
    splitRatio: AMC_SHARE_ADJUSTMENT_RATIOS.includes(
      fund.splitRatio as AmcShareAdjustmentRatio,
    )
      ? (fund.splitRatio as AmcShareAdjustmentRatio)
      : 5,
    autoReverseSplit: Boolean(fund.reverseSplitTriggerPrice),
    reverseSplitPriceDollars: String(
      (fund.reverseSplitTriggerPrice ?? 5) / 100,
    ),
    reverseSplitRatio: AMC_SHARE_ADJUSTMENT_RATIOS.includes(
      fund.reverseSplitRatio as AmcShareAdjustmentRatio,
    )
      ? (fund.reverseSplitRatio as AmcShareAdjustmentRatio)
      : 2,
  };
}

function equalWeightPercentages(stockIds: string[]): Record<string, string> {
  if (!stockIds.length) return {};
  const baseHundredths = Math.floor(10_000 / stockIds.length);
  let remainder = 10_000 - baseHundredths * stockIds.length;
  return Object.fromEntries(
    stockIds.map((stockId) => {
      const hundredths = baseHundredths + (remainder-- > 0 ? 1 : 0);
      return [stockId, (hundredths / 100).toFixed(2)];
    }),
  );
}

export default function AssetManagerPage() {
  const assetManager = useMarketStore((state) => state.assetManager);
  const listedAmcFunds = useMarketStore((state) => state.listedAmcFunds);
  const cash = useMarketStore((state) => state.cash);
  const stocks = useMarketStore((state) => state.stocks);
  const holdings = useMarketStore((state) => state.holdings);
  const userId = useMarketStore((state) => state.userId);
  const cloudSyncReady = useMarketStore((state) => state.cloudSyncReady);
  const getTotalAssets = useMarketStore((state) => state.getTotalAssets);
  const foundAssetManager = useMarketStore((state) => state.foundAssetManager);
  const createAmcFund = useMarketStore((state) => state.createAmcFund);
  const rebalanceAmcFund = useMarketStore((state) => state.rebalanceAmcFund);
  const updateAmcFundShareAdjustment = useMarketStore(
    (state) => state.updateAmcFundShareAdjustment,
  );
  const buyAmcFund = useMarketStore((state) => state.buyAmcFund);
  const sellAmcFund = useMarketStore((state) => state.sellAmcFund);
  const listAmcFundOnMarket = useMarketStore((state) => state.listAmcFundOnMarket);
  const requestAmcFundListing = useMarketStore(
    (state) => state.requestAmcFundListing,
  );
  const refreshListedAmcFunds = useMarketStore(
    (state) => state.refreshListedAmcFunds,
  );
  const [mounted, setMounted] = useState(false);
  const [manualAmcTutorial, setManualAmcTutorial] = useState(false);
  const [manualEtfTutorial, setManualEtfTutorial] = useState(false);
  const onboarded = useSettingsStore((state) => state.onboarded);
  const amcTutorialSeen = useSettingsStore((state) => state.amcTutorialSeen);
  const setAmcTutorialSeen = useSettingsStore((state) => state.setAmcTutorialSeen);
  const amcTutorialVersion = useSettingsStore((state) => state.amcTutorialVersion);
  const setAmcTutorialVersion = useSettingsStore(
    (state) => state.setAmcTutorialVersion,
  );
  const amcEtfTutorialSeen = useSettingsStore((state) => state.amcEtfTutorialSeen);
  const setAmcEtfTutorialSeen = useSettingsStore(
    (state) => state.setAmcEtfTutorialSeen,
  );
  const amcEtfTutorialVersion = useSettingsStore(
    (state) => state.amcEtfTutorialVersion,
  );
  const setAmcEtfTutorialVersion = useSettingsStore(
    (state) => state.setAmcEtfTutorialVersion,
  );
  useEffect(() => setMounted(true), []);


  const [requests, setRequests] = useState<AmcFoundationRequest[] | null>(null);
  const [listingRequests, setListingRequests] = useState<AmcEtfListingRequest[]>(
    [],
  );
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [detail, setDetail] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [founding, setFounding] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tradingId, setTradingId] = useState<string | null>(null);

  const [fundName, setFundName] = useState("");
  const [fundTicker, setFundTicker] = useState("");
  const [fundStyle, setFundStyle] = useState<AmcFundStyle>("passive");
  const [feeRatePct, setFeeRatePct] = useState("0.5");
  const [dividendIntervalDays, setDividendIntervalDays] =
    useState<AmcDividendIntervalDays>(60);
  const [dividendRatePct, setDividendRatePct] = useState("0");
  const [benchmarkId, setBenchmarkId] = useState("");
  const [comparisonStockId, setComparisonStockId] = useState("");
  const [seedDollars, setSeedDollars] = useState("1000");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [equalWeight, setEqualWeight] = useState(true);
  const [holdingWeightPct, setHoldingWeightPct] = useState<
    Record<string, string>
  >({});
  const [holdingSearch, setHoldingSearch] = useState("");
  const [holdingKind, setHoldingKind] = useState<
    "all" | AmcHoldingKind
  >("all");
  const [autoSplit, setAutoSplit] = useState(false);
  const [splitPriceDollars, setSplitPriceDollars] = useState("5");
  const [splitRatio, setSplitRatio] =
    useState<AmcShareAdjustmentRatio>(5);
  const [autoReverseSplit, setAutoReverseSplit] = useState(false);
  const [reverseSplitPriceDollars, setReverseSplitPriceDollars] = useState("0.05");
  const [reverseSplitRatio, setReverseSplitRatio] =
    useState<AmcShareAdjustmentRatio>(2);
  const [tradeQty, setTradeQty] = useState<Record<string, string>>({});
  /** 액티브 손바꿈 초안: fundId → stockId → 비중% 문자열 */
  const [rebalanceDraft, setRebalanceDraft] = useState<
    Record<string, Record<string, string>>
  >({});
  const [shareAdjustmentEditorId, setShareAdjustmentEditorId] = useState<
    string | null
  >(null);
  const [shareAdjustmentDrafts, setShareAdjustmentDrafts] = useState<
    Record<string, ShareAdjustmentDraft>
  >({});
  const [shareAdjustmentSavingId, setShareAdjustmentSavingId] = useState<
    string | null
  >(null);

  const netWorth = getTotalAssets();
  const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
  const seedCents = Math.round(Number(seedDollars) * 100);
  const estimatedSeedNavValue = Math.round(seedCents * 0.9);
  const estimatedInitialNav =
    estimatedSeedNavValue > 0
      ? Math.max(
          1,
          Math.round(
            estimatedSeedNavValue /
              Math.min(10_000, Math.max(1, estimatedSeedNavValue)),
          ),
        )
      : 0;
  const splitTriggerCents = Math.round(Number(splitPriceDollars) * 100);
  const reverseSplitTriggerCents = Math.round(
    Number(reverseSplitPriceDollars) * 100,
  );
  const shareAdjustmentInvalid =
    (autoSplit && !(splitTriggerCents > 0)) ||
    (autoReverseSplit && !(reverseSplitTriggerCents > 0)) ||
    (autoSplit &&
      autoReverseSplit &&
      reverseSplitTriggerCents >= splitTriggerCents);

  const eligibleHoldingStocks = useMemo(() => {
    const companyIds = new Set(
      stocks
        .filter((stock) => instrumentTypeOf(stock) === "company" && isListed(stock))
        .map((stock) => stock.id),
    );
    return stocks.filter((stock) => {
      if (!(stock.currentPrice > 0)) return false;
      if (companyIds.has(stock.id)) return true;
      if ((stock.id === "gldx" || stock.id === "sbnd") && isListed(stock)) {
        return true;
      }
      return Boolean(
        (stock.leverageUnderlyingId &&
          companyIds.has(stock.leverageUnderlyingId)) ||
          (stock.coveredCallUnderlyingId &&
            companyIds.has(stock.coveredCallUnderlyingId)),
      );
    });
  }, [stocks]);

  const visibleHoldingStocks = useMemo(() => {
    const query = holdingSearch.trim().toLowerCase();
    return eligibleHoldingStocks.filter((stock) => {
      const kind = amcHoldingKindOf(stock);
      if (holdingKind !== "all" && kind !== holdingKind) return false;
      if (!query) return true;
      return `${stock.ticker} ${stock.name} ${stock.sector} ${stock.subsector ?? ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [eligibleHoldingStocks, holdingKind, holdingSearch]);

  const benchmarkOptions = useMemo(
    () =>
      stocks.filter(
        (stock) =>
          (instrumentTypeOf(stock) === "etf" ||
            instrumentTypeOf(stock) === "index") &&
          stock.currentPrice > 0,
      ),
    [stocks],
  );

  const priceOf = (stockId: string) =>
    stocks.find((stock) => stock.id === stockId)?.currentPrice ?? 0;
  const initialPriceOf = (stockId: string) =>
    stocks.find((stock) => stock.id === stockId)?.initialPrice ?? 0;
  const valuationPriceOf = useMemo(
    () => createAmcValuationPriceResolver(stocks),
    [stocks],
  );

  const comparisonStockOptions = useMemo(
    () =>
      stocks.filter(
        (stock) =>
          instrumentTypeOf(stock) === "company" &&
          isListed(stock) &&
          stock.currentPrice > 0,
      ),
    [stocks],
  );

  const refreshRequests = async () => {
    setRequests(await listMyAmcFoundationRequests());
  };

  const refreshListingRequests = async () => {
    setListingRequests(await listMyAmcEtfListingRequests());
  };

  useEffect(() => {
    if (!userId) {
      setRequests([]);
      setListingRequests([]);
      return;
    }
    // cloudSyncReady 전이라도 상장 원장에서 내 ETF를 복구한다.
    void refreshListedAmcFunds();
    if (!cloudSyncReady) {
      setRequests([]);
      setListingRequests([]);
      return;
    }
    void refreshRequests();
    void refreshListingRequests();
  }, [userId, cloudSyncReady, refreshListedAmcFunds]);

  const activeRequest = useMemo(() => {
    if (!requests?.length) return null;
    return (
      requests.find((request) =>
        ["pending", "reviewing", "accepted"].includes(request.status),
      ) ?? null
    );
  }, [requests]);

  useEffect(() => {
    if (!activeRequest) return;
    setName(activeRequest.company.name);
    setTagline(activeRequest.company.tagline);
    setDetail(activeRequest.company.detail ?? "");
  }, [activeRequest?.id]);

  // 지갑 funds 가 비어도 상장 원장에 남은 내 ETF는 화면에 보이게 한다.
  const managedFunds = useMemo(() => {
    const byId = new Map(
      (assetManager?.funds ?? []).map((fund) => [fund.id, fund] as const),
    );
    if (userId) {
      for (const listed of listedAmcFunds) {
        if (listed.managerUserId !== userId || listed.status === "delisted") {
          continue;
        }
        if (!byId.has(listed.id)) {
          byId.set(listed.id, listedFundToAmcState(listed));
        }
      }
    }
    return [...byId.values()];
  }, [assetManager, listedAmcFunds, userId]);

  const chartPoints = useMemo(() => {
    if (!managedFunds.length) return [];
    const merged = new Map<number, { nav: number; count: number }>();
    for (const fund of managedFunds) {
      for (const point of fund.navHistory) {
        const bucket = Math.floor(point.t / 60_000) * 60_000;
        const prev = merged.get(bucket) ?? { nav: 0, count: 0 };
        merged.set(bucket, {
          nav: prev.nav + point.nav,
          count: prev.count + 1,
        });
      }
    }
    return [...merged.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([t, value]) => ({
        t,
        nav: Math.round(value.nav / Math.max(1, value.count)),
      }))
      .slice(-48);
  }, [managedFunds]);

  const marketplaceFunds = useMemo(() => {
    const ownIds = new Set(managedFunds.map((fund) => fund.id));
    return listedAmcFunds.filter(
      (fund) =>
        fund.status !== "delisted" &&
        !ownIds.has(fund.id) &&
        fund.managerUserId !== userId,
    );
  }, [listedAmcFunds, managedFunds, userId]);

  useEffect(() => {
    setHoldingWeightPct(equalWeightPercentages(selectedIds));
  }, [selectedIds]);

  const useEqualCreationWeights = fundStyle !== "passive" || equalWeight;
  const selectedHoldings = useMemo(
    () =>
      selectedIds.map((stockId) => ({
        stockId,
        weight: useEqualCreationWeights
          ? 1 / Math.max(selectedIds.length, 1)
          : Number(holdingWeightPct[stockId] ?? "") / 100,
      })),
    [holdingWeightPct, selectedIds, useEqualCreationWeights],
  );
  const selectedWeightTotal = selectedIds.reduce(
    (sum, stockId) => sum + Number(holdingWeightPct[stockId] ?? 0),
    0,
  );
  const manualWeightInvalid =
    fundStyle === "passive" &&
    !equalWeight &&
    (Math.abs(selectedWeightTotal - 100) > 0.005 ||
      selectedIds.some((stockId) => {
        const weight = Number(holdingWeightPct[stockId]);
        return (
          !Number.isFinite(weight) ||
          weight < AMC_MIN_HOLDING_WEIGHT * 100 ||
          weight > AMC_MAX_HOLDING_WEIGHT * 100
        );
      }));

  const stockOfSelected = (stockId: string) =>
    stocks.find((stock) => stock.id === stockId);

  const holdingCadences = useMemo(
    () => collectHoldingDividendCadences(selectedHoldings, stockOfSelected),
    [selectedHoldings, stocks],
  );

  const mixedDividendCadences =
    fundStyle === "passive" && holdingCadences.length > 1;

  useEffect(() => {
    if (fundStyle !== "passive") return;
    if (holdingCadences.length === 1) {
      setDividendIntervalDays(holdingCadences[0]!);
    } else if (holdingCadences.length === 0) {
      setDividendIntervalDays(60);
    }
  }, [fundStyle, holdingCadences]);

  const handleSubmitRequest = async () => {
    setSubmitting(true);
    setMessage("");
    const result = await submitAmcFoundationRequest({ name, tagline, detail });
    setMessage(result.message);
    if (result.success) await refreshRequests();
    setSubmitting(false);
  };

  const handleFound = async () => {
    if (!activeRequest || activeRequest.status !== "accepted") return;
    if (
      !window.confirm(
        `설립 소각 ${formatPrice(AMC_FOUNDING_BURN)}를 영구 소각하고 자산운용사를 설립할까요?`,
      )
    ) {
      return;
    }
    setFounding(true);
    const result = await foundAssetManager(
      { name, tagline, detail },
      activeRequest.id,
    );
    setMessage(result.message);
    if (result.success) await refreshRequests();
    setFounding(false);
  };

  const toggleHolding = (stockId: string) => {
    setSelectedIds((prev) =>
      prev.includes(stockId)
        ? prev.filter((id) => id !== stockId)
        : prev.length >= AMC_MAX_HOLDINGS
          ? prev
          : [...prev, stockId],
    );
  };

  const handleCreateFund = async () => {
    setCreating(true);
    const feeRate = Number(feeRatePct) / 100;
    const result = await createAmcFund({
      name: fundName,
      ticker: fundTicker,
      style: fundStyle,
      feeRate,
      benchmarkStockId: fundStyle === "active" ? benchmarkId : undefined,
      comparisonStockId: comparisonStockId || undefined,
      holdings: selectedHoldings,
      seedCash: seedCents,
      dividendIntervalDays,
      dividendRate:
        fundStyle === "active" ? Number(dividendRatePct) / 100 : 0,
      ...(autoSplit
        ? {
            splitTriggerPrice: splitTriggerCents,
            splitRatio,
          }
        : {}),
      ...(autoReverseSplit
        ? {
            reverseSplitTriggerPrice: reverseSplitTriggerCents,
            reverseSplitRatio,
          }
        : {}),
    });
    setMessage(result.message);
    if (result.success) {
      setFundName("");
      setFundTicker("");
      setSelectedIds([]);
      setEqualWeight(true);
      setHoldingWeightPct({});
      setDividendRatePct("0");
      setComparisonStockId("");
      void refreshListingRequests();
      void refreshListedAmcFunds();
    }
    setCreating(false);
  };

  const handleTrade = async (
    fundId: string,
    side: "buy" | "sell",
  ) => {
    setTradingId(fundId);
    const qty = Number(tradeQty[fundId] ?? "1");
    const result =
      side === "buy"
        ? await buyAmcFund(fundId, qty)
        : await sellAmcFund(fundId, qty);
    setMessage(result.message);
    setTradingId(null);
  };

  const marketplaceSection = (
    <section className="mb-5 rounded-3xl border border-amber-400/30 bg-amber-400/5 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">상장 ETF 마켓</h2>
          <p className="mt-1 text-xs text-[var(--muted)]">
            다른 계정 운용사의 공유 상장 펀드입니다. AUM(유통 좌수)은 전 계정
            매매가 합산되며, 운용료는 그 AUM 기준으로 차감됩니다.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void refreshListedAmcFunds()}
          className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs font-bold"
        >
          새로고침
        </button>
      </div>
      {!userId || !cloudSyncReady ? (
        <p className="mt-4 text-center text-sm text-[var(--muted)]">
          로그인 후 상장 ETF를 볼 수 있습니다.
        </p>
      ) : marketplaceFunds.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
          아직 다른 운용사의 상장 ETF가 없습니다.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {marketplaceFunds.map((fund) => (
            <ListedFundCard
              key={fund.id}
              fund={fund}
              holdingsQty={
                holdings.find(
                  (item) => item.stockId === amcFundStockId(fund.id),
                )?.quantity ?? 0
              }
              priceOf={priceOf}
              initialPriceOf={initialPriceOf}
              valuationPriceOf={valuationPriceOf}
              qty={tradeQty[fund.id] ?? "1"}
              onQty={(value) =>
                setTradeQty((prev) => ({
                  ...prev,
                  [fund.id]: value.replace(/[^0-9.]/g, ""),
                }))
              }
              busy={tradingId === fund.id}
              onBuy={() => void handleTrade(fund.id, "buy")}
              onSell={() => void handleTrade(fund.id, "sell")}
            />
          ))}
        </div>
      )}
    </section>
  );

  if (!assetManager) {
    const eligible = netWorth >= AMC_MIN_NET_WORTH;
    const formLocked = Boolean(activeRequest);
    const showAmcTutorial =
      mounted &&
      onboarded &&
      (manualAmcTutorial ||
        !amcTutorialSeen ||
        amcTutorialVersion < AMC_TUTORIAL_VERSION);
    return (
      <div className="mx-auto max-w-3xl pb-24">
        {showAmcTutorial && (
          <FeatureTutorialModal
            steps={AMC_TUTORIAL_STEPS}
            onFinish={() => {
              setAmcTutorialSeen(true);
              setAmcTutorialVersion(AMC_TUTORIAL_VERSION);
              setManualAmcTutorial(false);
            }}
          />
        )}
        <header className="mb-6 rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 to-cyan-500/5 p-6">
          <div className="flex items-start justify-between gap-3">
            <div>
          <p className="text-xs font-bold text-emerald-300">유저 ETF · 운용료 인컴</p>
          <h1 className="mt-1 text-3xl font-black">📕 자산운용사</h1>
          <p className="mt-3 text-sm leading-relaxed text-[var(--muted)]">
            순자산 $10,000 이상이면 허가 후 자산운용사를 설립할 수 있습니다.
            설립 즉시 $10,000가 소각되며, 상장 ETF는 이 탭에서만 보이고
            거래됩니다.
          </p>
            </div>
            <button
              type="button"
              onClick={() => setManualAmcTutorial(true)}
              className="shrink-0 rounded-xl border border-emerald-400/40 px-3 py-2 text-xs font-bold text-emerald-200"
            >
              튜토리얼
            </button>
          </div>
        </header>

        {marketplaceSection}

        <section className="mb-5 grid gap-3 sm:grid-cols-3">
          <Summary label="순자산" value={formatCompactMoney(netWorth)} />
          <Summary label="설립 소각" value={formatPrice(AMC_FOUNDING_BURN)} />
          <Summary label="보유 현금" value={formatCompactMoney(cash)} />
        </section>

        <section className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
          {!userId || !cloudSyncReady ? (
            <p className="text-center text-sm text-[var(--muted)]">
              로그인 계정이 필요합니다.
            </p>
          ) : !eligible ? (
            <p className="text-center text-sm text-[var(--muted)]">
              순자산 $10,000부터 설립 가능합니다.
            </p>
          ) : requests === null ? (
            <p className="text-center text-sm text-[var(--muted)]">불러오는 중…</p>
          ) : (
            <div className="space-y-4">
              {activeRequest && (
                <div className="rounded-2xl border border-emerald-400/30 bg-emerald-400/5 p-4 text-sm">
                  <div className="flex justify-between gap-2">
                    <p className="font-bold">설립 허가 신청</p>
                    <span className="text-xs font-semibold text-emerald-300">
                      {AMC_FOUNDATION_STATUS_LABEL[activeRequest.status]}
                    </span>
                  </div>
                </div>
              )}
              <Field label="운용사명 *">
                <input
                  value={name}
                  disabled={formLocked}
                  onChange={(event) => setName(event.target.value.slice(0, 40))}
                  className={fieldClass}
                  placeholder="2~40자"
                />
              </Field>
              <Field label="한 줄 소개 *">
                <input
                  value={tagline}
                  disabled={formLocked}
                  onChange={(event) => setTagline(event.target.value.slice(0, 80))}
                  className={fieldClass}
                  placeholder="필수 · 최대 80자"
                />
              </Field>
              <Field label="세부 소개 (자유)">
                <textarea
                  value={detail}
                  disabled={formLocked}
                  onChange={(event) => setDetail(event.target.value.slice(0, 500))}
                  rows={4}
                  className={`${fieldClass} resize-none`}
                  placeholder="선택 · 최대 500자"
                />
              </Field>
              {activeRequest?.status === "accepted" ? (
                <button
                  type="button"
                  disabled={founding || cash < AMC_FOUNDING_BURN}
                  onClick={() => void handleFound()}
                  className="min-h-12 w-full rounded-2xl bg-emerald-400 px-5 text-sm font-black text-black disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
                >
                  {founding ? "설립 중…" : `${formatPrice(AMC_FOUNDING_BURN)} 소각 후 설립`}
                </button>
              ) : !activeRequest ? (
                <button
                  type="button"
                  disabled={
                    submitting || name.trim().length < 2 || tagline.trim().length < 2
                  }
                  onClick={() => void handleSubmitRequest()}
                  className="min-h-12 w-full rounded-2xl bg-cyan-500 px-5 text-sm font-black text-white disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
                >
                  {submitting ? "신청 중…" : "관리자 허가 신청"}
                </button>
              ) : (
                <p className="text-center text-xs text-[var(--muted)]">
                  허가 완료 후 설립할 수 있습니다.
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

  const maxFeePct =
    maxFeeRateForStyle(fundStyle) === AMC_ACTIVE_MAX_FEE_RATE ? 3 : 0.5;

  const showEtfTutorial =
    mounted &&
    onboarded &&
    (manualEtfTutorial ||
      !amcEtfTutorialSeen ||
      amcEtfTutorialVersion < AMC_ETF_TUTORIAL_VERSION);
  return (
    <div className="mx-auto max-w-4xl pb-24">
      {showEtfTutorial && (
        <FeatureTutorialModal
          steps={AMC_ETF_TUTORIAL_STEPS}
          onFinish={() => {
            setAmcEtfTutorialSeen(true);
            setAmcEtfTutorialVersion(AMC_ETF_TUTORIAL_VERSION);
            setManualEtfTutorial(false);
          }}
        />
      )}
      <header className="mb-5 rounded-3xl border border-emerald-400/30 bg-gradient-to-br from-emerald-500/10 to-sky-500/5 p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
        <p className="text-xs font-bold text-emerald-300">ASSET MANAGER</p>
        <h1 className="mt-1 text-3xl font-black">{assetManager.name}</h1>
        <p className="mt-2 text-sm font-semibold">{assetManager.tagline}</p>
        {assetManager.detail && (
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--muted)]">
            {assetManager.detail}
          </p>
        )}
          </div>
          <button
            type="button"
            onClick={() => setManualEtfTutorial(true)}
            className="shrink-0 rounded-xl border border-cyan-400/40 px-3 py-2 text-xs font-bold text-cyan-200"
          >
            ETF 튜토리얼
          </button>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Summary
            label="누적 소각"
            value={formatCompactMoney(assetManager.cumulativeBurned)}
          />
          <Summary label="운용 펀드" value={`${managedFunds.length}개`} />
          <Summary
            label="누적 운용료"
            value={formatCompactMoney(
              managedFunds.reduce(
                (sum, fund) => sum + fund.cumulativeFeesPaid,
                0,
              ),
            )}
          />
          <Summary
            label="설립일"
            value={new Date(assetManager.foundedAt).toLocaleDateString("ko-KR")}
          />
        </div>
      </header>

      {marketplaceSection}

      <section className="mb-5 rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5">
        <h2 className="text-lg font-bold">운용사 실적</h2>
        <p className="mt-1 text-xs text-[var(--muted)]">
          운용 중 펀드의 좌당 NAV 평균 추이입니다. 유저 ETF는 이 탭에서만 확인할 수
          있습니다.
        </p>
        <NavSparkline points={chartPoints} />
      </section>

      <section className="mb-5 space-y-3">
        <h2 className="text-lg font-bold">내 유저 ETF</h2>
        {managedFunds.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-[var(--border)] p-6 text-center text-sm text-[var(--muted)]">
            아직 설정한 ETF가 없습니다. 아래에서 첫 펀드를 만드세요.
          </p>
        ) : (
          managedFunds.map((fund) => {
            const nav = computeAmcFundNavPerShare(
              fund,
              priceOf,
              initialPriceOf,
              valuationPriceOf,
            );
            const held =
              holdings.find((item) => item.stockId === amcFundStockId(fund.id))
                ?.quantity ?? 0;
            const aum = Math.round(nav * fund.totalShares);
            const sessionsLeft = Math.max(
              0,
              AMC_REBALANCE_WINDOW_DAYS -
                (currentSession - fund.lastRebalanceSession),
            );
            const graceLeft =
              fund.status === "grace" && fund.graceStartedSession != null
                ? Math.max(
                    0,
                    AMC_GRACE_DAYS - (currentSession - fund.graceStartedSession),
                  )
                : null;
            const onMarket = listedAmcFunds.some(
              (item) => item.id === fund.id && item.status !== "delisted",
            );
            const listing =
              listingRequests.find(
                (request) =>
                  request.payload.fundId === fund.id ||
                  request.id === fund.listingRequestId,
              ) ?? null;
            const adjustmentDraft =
              shareAdjustmentDrafts[fund.id] ?? shareAdjustmentDraftOf(fund);
            const adjustmentSplitCents = Math.round(
              Number(adjustmentDraft.splitPriceDollars) * 100,
            );
            const adjustmentReverseSplitCents = Math.round(
              Number(adjustmentDraft.reverseSplitPriceDollars) * 100,
            );
            const adjustmentInvalid =
              (adjustmentDraft.autoSplit && !(adjustmentSplitCents > 0)) ||
              (adjustmentDraft.autoReverseSplit &&
                !(adjustmentReverseSplitCents > 0)) ||
              (adjustmentDraft.autoSplit &&
                adjustmentDraft.autoReverseSplit &&
                adjustmentReverseSplitCents >= adjustmentSplitCents);
            const rebalanceWeightTotal = fund.holdings.reduce((sum, row) => {
              const draft = rebalanceDraft[fund.id]?.[row.stockId];
              return sum + (draft === undefined ? row.weight * 100 : Number(draft));
            }, 0);
            const rebalanceWeightInvalid =
              !Number.isFinite(rebalanceWeightTotal) ||
              Math.abs(rebalanceWeightTotal - 100) > 0.005;
            return (
              <div
                key={fund.id}
                className="rounded-3xl border border-[var(--border)] bg-[var(--surface)] p-5"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs text-[var(--muted)]">
                      {fund.style === "active" ? "액티브" : "패시브"} · 회차{" "}
                      {(fund.feeRate * 100).toFixed(2)}% · 배당{" "}
                      {fund.dividendIntervalDays}거래일
                      {fund.style === "active"
                        ? fund.dividendRate > 0
                          ? ` · ${(fund.dividendRate * 100).toFixed(2)}%`
                          : " · 없음"
                        : ""}
                    </p>
                    <h3 className="text-xl font-black">
                      {fund.name}{" "}
                      <span className="text-sm font-semibold text-[var(--muted)]">
                        {fund.ticker}
                      </span>
                    </h3>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      상태{" "}
                      {fund.status === "active"
                        ? "운영중"
                        : fund.status === "grace"
                          ? "유예"
                          : "상장폐지"}
                      {fund.style === "active" && fund.status === "active"
                        ? ` · 손바꿈 잔여 ${sessionsLeft}거래일`
                        : ""}
                      {fund.style === "passive"
                        ? " · 금액 비중 목표"
                        : ""}
                      {graceLeft != null ? ` · 유예 ${graceLeft}거래일` : ""}
                    </p>
                    <p className="mt-1 text-xs font-semibold text-cyan-200">
                      {onMarket
                        ? "AMC 마켓 상장됨"
                        : listing
                          ? `상장 ${AMC_ETF_LISTING_STATUS_LABEL[listing.status]}`
                          : "상장 미신청"}
                    </p>
                    <ShareAdjustmentLabel fund={fund} />
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[var(--muted)]">좌당 NAV</p>
                    <p className="text-lg font-black tabular-nums">
                      {formatPrice(nav)}
                    </p>
                    <p className="text-xs text-[var(--muted)]">
                      AUM {formatCompactMoney(aum)} · 보유{" "}
                      {held.toLocaleString("ko-KR")}좌
                    </p>
                  </div>
                </div>
                <Link
                  href={`/amc/trade?id=${encodeURIComponent(fund.id)}`}
                  className="mt-3 inline-flex min-h-10 items-center rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-4 text-xs font-bold text-cyan-200"
                >
                  차트·상세 매매 →
                </Link>
                <p className="mt-3 text-xs text-[var(--muted)]">
                  구성{" "}
                  {fund.holdings
                    .map((row) => {
                      const stock = stocks.find((item) => item.id === row.stockId);
                      return `${stock?.ticker ?? row.stockId} ${(row.weight * 100).toFixed(0)}%`;
                    })
                    .join(" · ")}
                </p>
                {fund.status !== "delisted" && (
                  <div className="mt-3 rounded-2xl border border-violet-400/25 bg-violet-400/5 p-3">
                    <button
                      type="button"
                      onClick={() => {
                        if (shareAdjustmentEditorId === fund.id) {
                          setShareAdjustmentEditorId(null);
                          return;
                        }
                        setShareAdjustmentDrafts((prev) => ({
                          ...prev,
                          [fund.id]: shareAdjustmentDraftOf(fund),
                        }));
                        setShareAdjustmentEditorId(fund.id);
                      }}
                      className="text-xs font-bold text-violet-200"
                    >
                      {shareAdjustmentEditorId === fund.id
                        ? "분할·병합 설정 닫기"
                        : "분할·병합 설정 수정"}
                    </button>
                    {shareAdjustmentEditorId === fund.id && (
                      <div className="mt-3 space-y-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                            <label className="flex items-center gap-2 text-xs font-bold">
                              <input
                                type="checkbox"
                                checked={adjustmentDraft.autoSplit}
                                onChange={(event) =>
                                  setShareAdjustmentDrafts((prev) => ({
                                    ...prev,
                                    [fund.id]: {
                                      ...adjustmentDraft,
                                      autoSplit: event.target.checked,
                                    },
                                  }))
                                }
                              />
                              일정 가격 이상 자동 분할
                            </label>
                            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                              <input
                                value={adjustmentDraft.splitPriceDollars}
                                onChange={(event) =>
                                  setShareAdjustmentDrafts((prev) => ({
                                    ...prev,
                                    [fund.id]: {
                                      ...adjustmentDraft,
                                      splitPriceDollars: event.target.value.replace(
                                        /[^0-9.]/g,
                                        "",
                                      ),
                                    },
                                  }))
                                }
                                disabled={!adjustmentDraft.autoSplit}
                                aria-label={`${fund.ticker} 자동 분할 가격`}
                                placeholder="가격 ($)"
                                className={fieldClass}
                              />
                              <select
                                value={adjustmentDraft.splitRatio}
                                onChange={(event) =>
                                  setShareAdjustmentDrafts((prev) => ({
                                    ...prev,
                                    [fund.id]: {
                                      ...adjustmentDraft,
                                      splitRatio: Number(
                                        event.target.value,
                                      ) as AmcShareAdjustmentRatio,
                                    },
                                  }))
                                }
                                disabled={!adjustmentDraft.autoSplit}
                                aria-label={`${fund.ticker} 자동 분할 배수`}
                                className={fieldClass}
                              >
                                {AMC_SHARE_ADJUSTMENT_RATIOS.map((ratio) => (
                                  <option key={ratio} value={ratio}>
                                    {ratio}:1
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                          <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                            <label className="flex items-center gap-2 text-xs font-bold">
                              <input
                                type="checkbox"
                                checked={adjustmentDraft.autoReverseSplit}
                                onChange={(event) =>
                                  setShareAdjustmentDrafts((prev) => ({
                                    ...prev,
                                    [fund.id]: {
                                      ...adjustmentDraft,
                                      autoReverseSplit: event.target.checked,
                                    },
                                  }))
                                }
                              />
                              일정 가격 이하 자동 병합
                            </label>
                            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                              <input
                                value={adjustmentDraft.reverseSplitPriceDollars}
                                onChange={(event) =>
                                  setShareAdjustmentDrafts((prev) => ({
                                    ...prev,
                                    [fund.id]: {
                                      ...adjustmentDraft,
                                      reverseSplitPriceDollars:
                                        event.target.value.replace(
                                          /[^0-9.]/g,
                                          "",
                                        ),
                                    },
                                  }))
                                }
                                disabled={!adjustmentDraft.autoReverseSplit}
                                aria-label={`${fund.ticker} 자동 병합 가격`}
                                placeholder="가격 ($)"
                                className={fieldClass}
                              />
                              <select
                                value={adjustmentDraft.reverseSplitRatio}
                                onChange={(event) =>
                                  setShareAdjustmentDrafts((prev) => ({
                                    ...prev,
                                    [fund.id]: {
                                      ...adjustmentDraft,
                                      reverseSplitRatio: Number(
                                        event.target.value,
                                      ) as AmcShareAdjustmentRatio,
                                    },
                                  }))
                                }
                                disabled={!adjustmentDraft.autoReverseSplit}
                                aria-label={`${fund.ticker} 자동 병합 배수`}
                                className={fieldClass}
                              >
                                {AMC_SHARE_ADJUSTMENT_RATIOS.map((ratio) => (
                                  <option key={ratio} value={ratio}>
                                    1:{ratio}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        </div>
                        {adjustmentInvalid && (
                          <p className="text-xs font-semibold text-rose-300">
                            가격을 확인해 주세요. 병합 가격은 분할 가격보다 낮아야
                            합니다.
                          </p>
                        )}
                        <button
                          type="button"
                          disabled={
                            adjustmentInvalid ||
                            shareAdjustmentSavingId === fund.id
                          }
                          onClick={() => {
                            setShareAdjustmentSavingId(fund.id);
                            void updateAmcFundShareAdjustment(fund.id, {
                              ...(adjustmentDraft.autoSplit
                                ? {
                                    splitTriggerPrice: adjustmentSplitCents,
                                    splitRatio: adjustmentDraft.splitRatio,
                                  }
                                : {}),
                              ...(adjustmentDraft.autoReverseSplit
                                ? {
                                    reverseSplitTriggerPrice:
                                      adjustmentReverseSplitCents,
                                    reverseSplitRatio:
                                      adjustmentDraft.reverseSplitRatio,
                                  }
                                : {}),
                            }).then((result) => {
                              setMessage(result.message);
                              setShareAdjustmentSavingId(null);
                              if (result.success) {
                                setShareAdjustmentEditorId(null);
                                void refreshListedAmcFunds();
                              }
                            });
                          }}
                          className="rounded-xl bg-violet-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                        >
                          {shareAdjustmentSavingId === fund.id
                            ? "저장 중…"
                            : "분할·병합 설정 저장"}
                        </button>
                      </div>
                    )}
                  </div>
                )}
                {!onMarket && fund.status !== "delisted" && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {listing?.status === "accepted" ? (
                      <button
                        type="button"
                        onClick={() =>
                          void listAmcFundOnMarket(fund.id).then((result) => {
                            setMessage(result.message);
                            if (result.success) {
                              void refreshListingRequests();
                              void refreshListedAmcFunds();
                            }
                          })
                        }
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white"
                      >
                        AMC 마켓에 상장
                      </button>
                    ) : listing &&
                      ["pending", "reviewing"].includes(listing.status) ? (
                      <p className="text-xs text-[var(--muted)]">
                        관리자 상장 허가를 기다리는 중입니다.
                      </p>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          void requestAmcFundListing(fund.id).then((result) => {
                            setMessage(result.message);
                            if (result.success) void refreshListingRequests();
                          })
                        }
                        className="rounded-xl border border-amber-400/40 px-4 py-2 text-sm font-bold text-amber-200"
                      >
                        {listing?.status === "rejected"
                          ? "상장 허가 재신청"
                          : "상장 허가 신청"}
                      </button>
                    )}
                    {listing?.status === "rejected" && listing.adminNote && (
                      <p className="w-full rounded-xl bg-rose-500/10 p-2 text-xs text-rose-200">
                        반려: {listing.adminNote}
                      </p>
                    )}
                  </div>
                )}
                {onMarket && fund.status !== "delisted" && (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap items-end gap-2">
                      <input
                        value={tradeQty[fund.id] ?? "1"}
                        onChange={(event) =>
                          setTradeQty((prev) => ({
                            ...prev,
                            [fund.id]: event.target.value.replace(/[^0-9.]/g, ""),
                          }))
                        }
                        className="w-28 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
                        placeholder="수량"
                      />
                      <button
                        type="button"
                        disabled={tradingId === fund.id}
                        onClick={() => void handleTrade(fund.id, "buy")}
                        className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
                      >
                        매수
                      </button>
                      <button
                        type="button"
                        disabled={tradingId === fund.id}
                        onClick={() => void handleTrade(fund.id, "sell")}
                        className="rounded-xl bg-[var(--background)] px-4 py-2 text-sm font-bold disabled:opacity-60"
                      >
                        매도
                      </button>
                    </div>
                    {fund.style === "active" || fund.style === "passive" ? (
                      <div className="rounded-2xl border border-cyan-400/30 bg-cyan-400/5 p-3">
                        <p className="text-xs font-bold text-cyan-200">
                          {fund.style === "active"
                            ? "액티브 금액 비중 조절 (합 100% · 종목별 1~50% · 한 종목 5%p 이상 변경)"
                            : "패시브 금액 비중 조절 (합 100% · 종목별 1~50% · 동일 좌수 아님)"}
                        </p>
                        <p className="mt-1 text-[11px] text-[var(--muted)]">
                          비중은 구성 종목의 금액(가치) 목표 비율입니다. 주당 매수
                          수량이 아닙니다.
                        </p>
                        <div className="mt-2 grid gap-2 sm:grid-cols-2">
                          {fund.holdings.map((row) => {
                            const stock = stocks.find(
                              (item) => item.id === row.stockId,
                            );
                            const draft =
                              rebalanceDraft[fund.id]?.[row.stockId] ??
                              String(Math.round(row.weight * 1000) / 10);
                            return (
                              <label
                                key={row.stockId}
                                className="flex items-center gap-2 text-xs"
                              >
                                <span className="min-w-0 flex-1 truncate font-semibold">
                                  {stock?.ticker ?? row.stockId}
                                </span>
                                <input
                                  type="number"
                                  min={AMC_MIN_HOLDING_WEIGHT * 100}
                                  max={AMC_MAX_HOLDING_WEIGHT * 100}
                                  step="0.1"
                                  value={draft}
                                  onChange={(event) => {
                                    const value = event.target.value.replace(
                                      /[^0-9.]/g,
                                      "",
                                    );
                                    setRebalanceDraft((prev) => ({
                                      ...prev,
                                      [fund.id]: {
                                        ...(prev[fund.id] ?? {}),
                                        [row.stockId]: value,
                                      },
                                    }));
                                  }}
                                  className="w-16 rounded-lg border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-right tabular-nums"
                                />
                                <span className="text-[var(--muted)]">%</span>
                              </label>
                            );
                          })}
                        </div>
                        <p
                          className={`mt-2 text-right text-xs font-black tabular-nums ${
                            rebalanceWeightInvalid
                              ? "text-rose-300"
                              : "text-emerald-300"
                          }`}
                        >
                          합계 {rebalanceWeightTotal.toFixed(2)}% / 100%
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {fund.style === "passive" && (
                            <button
                              type="button"
                              className="rounded-xl border border-emerald-400/40 px-4 py-2 text-sm font-bold text-emerald-200"
                              onClick={() => {
                                const equal = equalWeightHoldings(fund.holdings);
                                if (!equal) {
                                  setMessage("구성 종목 수를 확인해 주세요.");
                                  return;
                                }
                                void rebalanceAmcFund(fund.id, equal).then(
                                  (result) => {
                                    setMessage(result.message);
                                    if (result.success) {
                                      setRebalanceDraft((prev) => {
                                        const copy = { ...prev };
                                        delete copy[fund.id];
                                        return copy;
                                      });
                                    }
                                  },
                                );
                              }}
                            >
                              동일 비중 유지
                            </button>
                          )}
                          <button
                            type="button"
                            className="rounded-xl border border-cyan-400/40 px-4 py-2 text-sm font-bold text-cyan-200"
                            onClick={() => {
                              if (rebalanceWeightInvalid) {
                                setMessage("구성 비중 합계를 정확히 100%로 맞춰 주세요.");
                                return;
                              }
                              const draft = rebalanceDraft[fund.id] ?? {};
                              const next = fund.holdings.map((row) => {
                                const raw = draft[row.stockId];
                                const pct = raw === undefined ? NaN : Number(raw);
                                return {
                                  stockId: row.stockId,
                                  weight:
                                    raw !== undefined && Number.isFinite(pct)
                                      ? pct / 100
                                      : row.weight,
                                };
                              });
                              void rebalanceAmcFund(fund.id, next).then(
                                (result) => {
                                  setMessage(result.message);
                                  if (result.success) {
                                    setRebalanceDraft((prev) => {
                                      const copy = { ...prev };
                                      delete copy[fund.id];
                                      return copy;
                                    });
                                  }
                                },
                              );
                            }}
                          >
                            {fund.style === "active"
                              ? "비중 적용 · 손바꿈"
                              : "비중 적용"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>
            );
          })
        )}
      </section>

      <section className="rounded-3xl border border-cyan-400/30 bg-cyan-400/5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-lg font-bold">새 ETF 설정 · 상장 신청</h2>
            <p className="mt-1 text-xs text-[var(--muted)]">
              기업·기업 파생상품·금·단기채 {AMC_MIN_HOLDINGS}개 이상 · 시드 10%
              소각 / 90% NAV · 관리자 허가 후 AMC 마켓에 올립니다
            </p>
          </div>
          <button
            type="button"
            onClick={() => setManualEtfTutorial(true)}
            className="rounded-xl border border-cyan-400/40 px-3 py-1.5 text-xs font-bold text-cyan-200"
          >
            가이드
          </button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="펀드명">
            <input
              value={fundName}
              onChange={(event) => setFundName(event.target.value.slice(0, 40))}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="티커">
            <input
              value={fundTicker}
              onChange={(event) =>
                setFundTicker(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, "")
                    .slice(0, 6),
                )
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            />
          </Field>
          <Field label="유형">
            <select
              value={fundStyle}
              onChange={(event) => {
                const style = event.target.value as AmcFundStyle;
                setFundStyle(style);
                setFeeRatePct(style === "active" ? "3" : "0.5");
              }}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            >
              <option value="passive">패시브 (최대 0.5%)</option>
              <option value="active">액티브 (최대 3%)</option>
            </select>
          </Field>
          <Field label={`회차 운용료 % (≤${maxFeePct})`}>
            <input
              value={feeRatePct}
              onChange={(event) => setFeeRatePct(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            />
          </Field>
          {fundStyle === "active" && (
            <Field label="벤치마크">
              <select
                value={benchmarkId}
                onChange={(event) => setBenchmarkId(event.target.value)}
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
              >
                <option value="">선택</option>
                {benchmarkOptions.map((stock) => (
                  <option key={stock.id} value={stock.id}>
                    {stock.ticker} · {stock.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="시드 ($)">
            <input
              value={seedDollars}
              onChange={(event) =>
                setSeedDollars(event.target.value.replace(/[^0-9.]/g, ""))
              }
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            />
          </Field>
          <div className="rounded-2xl border border-violet-400/25 bg-violet-400/5 p-4 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-bold">자동 액면조정</p>
                <p className="mt-1 text-xs text-[var(--muted)]">
                  예상 최초 NAV {formatPrice(estimatedInitialNav)} · 분할·병합 시 전체
                  보유좌수만 같은 배수로 조정되고 평가금액은 유지됩니다.
                </p>
              </div>
              <span className="rounded-lg bg-violet-400/10 px-2.5 py-1 text-[11px] font-bold text-violet-200">
                선택 옵션
              </span>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={autoSplit}
                    onChange={(event) => setAutoSplit(event.target.checked)}
                  />
                  일정 가격 이상 자동 분할
                </label>
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={splitPriceDollars}
                    onChange={(event) =>
                      setSplitPriceDollars(
                        event.target.value.replace(/[^0-9.]/g, ""),
                      )
                    }
                    disabled={!autoSplit}
                    aria-label="자동 분할 가격"
                    placeholder="가격 ($)"
                    className={fieldClass}
                  />
                  <select
                    value={splitRatio}
                    onChange={(event) =>
                      setSplitRatio(
                        Number(event.target.value) as AmcShareAdjustmentRatio,
                      )
                    }
                    disabled={!autoSplit}
                    aria-label="자동 분할 배수"
                    className={fieldClass}
                  >
                    {AMC_SHARE_ADJUSTMENT_RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        {ratio}:1
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] p-3">
                <label className="flex items-center gap-2 text-xs font-bold">
                  <input
                    type="checkbox"
                    checked={autoReverseSplit}
                    onChange={(event) => setAutoReverseSplit(event.target.checked)}
                  />
                  일정 가격 이하 자동 병합
                </label>
                <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
                  <input
                    value={reverseSplitPriceDollars}
                    onChange={(event) =>
                      setReverseSplitPriceDollars(
                        event.target.value.replace(/[^0-9.]/g, ""),
                      )
                    }
                    disabled={!autoReverseSplit}
                    aria-label="자동 병합 가격"
                    placeholder="가격 ($)"
                    className={fieldClass}
                  />
                  <select
                    value={reverseSplitRatio}
                    onChange={(event) =>
                      setReverseSplitRatio(
                        Number(event.target.value) as AmcShareAdjustmentRatio,
                      )
                    }
                    disabled={!autoReverseSplit}
                    aria-label="자동 병합 배수"
                    className={fieldClass}
                  >
                    {AMC_SHARE_ADJUSTMENT_RATIOS.map((ratio) => (
                      <option key={ratio} value={ratio}>
                        1:{ratio}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            {shareAdjustmentInvalid && (
              <p className="mt-2 text-xs font-semibold text-rose-300">
                가격은 0보다 커야 하며, 자동 병합 가격은 자동 분할 가격보다 낮아야
                합니다.
              </p>
            )}
          </div>
          {mixedDividendCadences ? (
            <Field
              label={`배당 주기 (운용사 재량 · ${AMC_MIN_DIVIDEND_INTERVAL_DAYS}~${AMC_MAX_DIVIDEND_INTERVAL_DAYS}거래일)`}
            >
              <input
                type="number"
                min={AMC_MIN_DIVIDEND_INTERVAL_DAYS}
                max={AMC_MAX_DIVIDEND_INTERVAL_DAYS}
                step="1"
                value={dividendIntervalDays}
                onChange={(event) =>
                  setDividendIntervalDays(
                    Math.max(
                      AMC_MIN_DIVIDEND_INTERVAL_DAYS,
                      Math.min(
                        AMC_MAX_DIVIDEND_INTERVAL_DAYS,
                        Math.floor(Number(event.target.value) || 1),
                      ),
                    ),
                  )
                }
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
              />
              <p className="mt-1 text-[11px] text-[var(--muted)]">
                구성 종목의 지급 주기가 섞여 있어 운용사가 N거래일을 직접 정합니다.
              </p>
            </Field>
          ) : fundStyle === "active" ? (
            <Field label="배당 주기 (거래일)">
              <select
                value={dividendIntervalDays}
                onChange={(event) =>
                  setDividendIntervalDays(Number(event.target.value))
                }
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
              >
                {AMC_DIVIDEND_INTERVALS.map((days) => (
                  <option key={days} value={days}>
                    {days}거래일
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {fundStyle === "passive" && !mixedDividendCadences && (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-xs text-[var(--muted)]">
              배당 주기{" "}
              <span className="font-bold text-[var(--foreground)]">
                {dividendIntervalDays}거래일
              </span>
              {holdingCadences.length === 1
                ? " (구성 인컴 주기에 맞춤)"
                : " (배당·인컴 종목 없음 · 기본)"}
            </div>
          )}
          {fundStyle === "active" ? (
            <Field
              label={`회차 배당률 % (NAV·≤${AMC_ACTIVE_MAX_DIVIDEND_RATE * 100}, 0=없음)`}
            >
              <input
                value={dividendRatePct}
                onChange={(event) =>
                  setDividendRatePct(event.target.value.replace(/[^0-9.]/g, ""))
                }
                className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
              />
            </Field>
          ) : (
            <div className="rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-xs text-[var(--muted)] sm:col-span-2">
              패시브 배당은 구성 종목 평균 연율로 NAV에서 지급됩니다.
              {selectedIds.length >= AMC_MIN_HOLDINGS && (
                <>
                  {" "}
                  예상 연율{" "}
                  {(
                    computePassiveAmcAnnualDividendYield(
                      selectedHoldings,
                      priceOf,
                      stockOfSelected,
                    ) * 100
                  ).toFixed(2)}
                  %.
                </>
              )}
              {mixedDividendCadences && (
                <span className="mt-1 block text-amber-200">
                  구성에 {holdingCadences.join("·")}거래일 인컴이 섞여 있습니다.
                  위에서 운용할 N거래일 배당 주기를 직접 정하세요.
                </span>
              )}
            </div>
          )}
        </div>
        <div className="mt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[var(--muted)]">
              구성 종목 선택 ({selectedIds.length}/{AMC_MAX_HOLDINGS} · 금액 비중)
            </p>
            {selectedIds.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedIds([])}
                className="rounded-lg border border-[var(--border)] px-2.5 py-1 text-[11px] font-bold text-[var(--muted)]"
              >
                선택 초기화
              </button>
            )}
          </div>
          <input
            value={holdingSearch}
            onChange={(event) => setHoldingSearch(event.target.value)}
            placeholder="티커·회사명·업종 검색"
            className={`${fieldClass} mt-2`}
          />
          <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
            {AMC_HOLDING_FILTERS.map((filter) => (
              <button
                key={filter.value}
                type="button"
                onClick={() => setHoldingKind(filter.value)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-[11px] font-bold ${
                  holdingKind === filter.value
                    ? "bg-cyan-500 text-white"
                    : "border border-[var(--border)] bg-[var(--background)] text-[var(--muted)]"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {selectedIds.length > 0 && (
            <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1">
              {selectedIds.map((stockId) => {
                const stock = stocks.find((item) => item.id === stockId);
                if (!stock) return null;
                return (
                  <button
                    key={stockId}
                    type="button"
                    onClick={() => toggleHolding(stockId)}
                    className="shrink-0 rounded-lg bg-cyan-400/10 px-2.5 py-1 text-[11px] font-bold text-cyan-200"
                  >
                    {stock.ticker} ×
                  </button>
                );
              })}
            </div>
          )}
          <Field label="성과 비교 목표 주식">
            <select
              value={comparisonStockId}
              onChange={(event) => setComparisonStockId(event.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2.5 text-sm"
            >
              <option value="">나중에 설정</option>
              {comparisonStockOptions.map((stock) => (
                <option key={stock.id} value={stock.id}>
                  {stock.ticker} · {stock.name}
                </option>
              ))}
            </select>
          </Field>
          {fundStyle === "passive" && selectedIds.length > 0 && (
            <div className="mt-3 rounded-2xl border border-cyan-400/25 bg-cyan-400/5 p-3">
              <label className="flex cursor-pointer items-start gap-2 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={equalWeight}
                  onChange={(event) => {
                    const checked = event.target.checked;
                    setEqualWeight(checked);
                    if (!checked) {
                      setHoldingWeightPct(equalWeightPercentages(selectedIds));
                    }
                  }}
                  className="mt-0.5"
                />
                <span>
                  동일 비중으로 담기
                  <span className="mt-1 block font-normal text-[var(--muted)]">
                    해제하면 종목별 1~50% 범위에서 직접 입력하며 합계는 정확히
                    100%여야 합니다.
                  </span>
                </span>
              </label>
              {!equalWeight && (
                <>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {selectedIds.map((stockId) => {
                      const stock = stocks.find((item) => item.id === stockId);
                      return (
                        <label
                          key={stockId}
                          className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-xs"
                        >
                          <span className="min-w-0 flex-1 truncate font-bold">
                            {stock?.ticker ?? stockId}
                          </span>
                          <input
                            type="number"
                            min={AMC_MIN_HOLDING_WEIGHT * 100}
                            max={AMC_MAX_HOLDING_WEIGHT * 100}
                            step="0.01"
                            value={holdingWeightPct[stockId] ?? ""}
                            onChange={(event) =>
                              setHoldingWeightPct((prev) => ({
                                ...prev,
                                [stockId]: event.target.value,
                              }))
                            }
                            aria-label={`${stock?.ticker ?? stockId} 비중`}
                            className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-right tabular-nums"
                          />
                          <span className="text-[var(--muted)]">%</span>
                        </label>
                      );
                    })}
                  </div>
                  <p
                    className={`mt-2 text-right text-xs font-black tabular-nums ${
                      manualWeightInvalid ? "text-rose-300" : "text-emerald-300"
                    }`}
                  >
                    합계 {selectedWeightTotal.toFixed(2)}% / 100%
                  </p>
                </>
              )}
            </div>
          )}
          <div className="mt-2 grid max-h-72 grid-cols-1 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
            {visibleHoldingStocks.map((stock) => {
              const on = selectedIds.includes(stock.id);
              const kind = amcHoldingKindOf(stock);
              return (
                <button
                  key={stock.id}
                  type="button"
                  onClick={() => toggleHolding(stock.id)}
                  className={`rounded-xl border px-3 py-2 text-left text-xs ${
                    on
                      ? "border-cyan-400 bg-cyan-400/15 font-bold"
                      : "border-[var(--border)] bg-[var(--background)]"
                  }`}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-black">{stock.ticker}</span>
                    <span className="rounded bg-[var(--surface)] px-1.5 py-0.5 text-[10px] text-[var(--muted)]">
                      {AMC_HOLDING_KIND_LABEL[kind]}
                    </span>
                  </span>
                  <span className="mt-1 block truncate text-[11px] text-[var(--muted)]">
                    {stock.name}
                  </span>
                </button>
              );
            })}
            {visibleHoldingStocks.length === 0 && (
              <p className="col-span-full rounded-xl border border-dashed border-[var(--border)] p-4 text-center text-xs text-[var(--muted)]">
                검색 조건에 맞는 구성 종목이 없습니다.
              </p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void handleCreateFund()}
          disabled={
            creating ||
            selectedIds.length < AMC_MIN_HOLDINGS ||
            manualWeightInvalid ||
            shareAdjustmentInvalid
          }
          className="mt-4 min-h-12 w-full rounded-2xl bg-cyan-500 px-5 text-sm font-black text-white disabled:bg-[var(--border)] disabled:text-[var(--muted)]"
        >
          {creating ? "신청 중…" : "ETF 설정 · 상장 허가 신청 (시드 10% 소각)"}
        </button>
      </section>

      {message && (
        <p className="mt-4 rounded-xl bg-[var(--surface)] p-3 text-xs text-[var(--muted)]">
          {message}
        </p>
      )}
    </div>
  );
}

function ListedFundCard({
  fund,
  holdingsQty,
  priceOf,
  initialPriceOf,
  valuationPriceOf,
  qty,
  onQty,
  busy,
  onBuy,
  onSell,
}: {
  fund: ListedAmcFund;
  holdingsQty: number;
  priceOf: (stockId: string) => number;
  initialPriceOf: (stockId: string) => number;
  valuationPriceOf: (stockId: string) => number;
  qty: string;
  onQty: (value: string) => void;
  busy: boolean;
  onBuy: () => void;
  onSell: () => void;
}) {
  const state = listedFundToAmcState(fund);
  const nav = computeAmcFundNavPerShare(
    state,
    priceOf,
    initialPriceOf,
    valuationPriceOf,
  );
  const aum = Math.round(nav * fund.totalShares);
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--background)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] text-[var(--muted)]">
            {fund.managerName} · {fund.style === "active" ? "액티브" : "패시브"} ·
            회차 {(fund.feeRate * 100).toFixed(2)}% · 배당{" "}
            {fund.dividendIntervalDays}거래일
          </p>
          <h3 className="text-base font-black">
            {fund.name}{" "}
            <span className="text-xs font-semibold text-[var(--muted)]">
              {fund.ticker}
            </span>
          </h3>
          <p className="mt-1 text-xs text-[var(--muted)]">{fund.managerTagline}</p>
          <ShareAdjustmentLabel fund={fund} />
        </div>
        <div className="text-right">
          <p className="text-xs text-[var(--muted)]">좌당 NAV</p>
          <p className="font-black tabular-nums">{formatPrice(nav)}</p>
          <p className="text-[11px] text-[var(--muted)]">
            AUM {formatCompactMoney(aum)} · 보유{" "}
            {holdingsQty.toLocaleString("ko-KR")}좌
          </p>
        </div>
      </div>
      {fund.status !== "grace" && (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Link
            href={`/amc/trade?id=${encodeURIComponent(fund.id)}`}
            className="rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3 py-2 text-sm font-bold text-cyan-200"
          >
            차트·상세
          </Link>
          <input
            value={qty}
            onChange={(event) => onQty(event.target.value)}
            className="w-24 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            placeholder="수량"
          />
          <button
            type="button"
            disabled={busy}
            onClick={onBuy}
            className="rounded-xl bg-emerald-500 px-3 py-2 text-sm font-bold text-white disabled:opacity-60"
          >
            매수
          </button>
          <button
            type="button"
            disabled={busy || holdingsQty <= 0}
            onClick={onSell}
            className="rounded-xl border border-[var(--border)] px-3 py-2 text-sm font-bold disabled:opacity-60"
          >
            매도
          </button>
        </div>
      )}
      {fund.status === "grace" && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Link
            href={`/amc/trade?id=${encodeURIComponent(fund.id)}`}
            className="rounded-xl border border-cyan-400/35 bg-cyan-400/10 px-3 py-2 text-sm font-bold text-cyan-200"
          >
            차트·매도
          </Link>
          <p className="text-xs text-amber-300">
            유예 기간 — 신규 매수 불가 · 보유분은 매도 가능
          </p>
        </div>
      )}
    </div>
  );
}

function ShareAdjustmentLabel({
  fund,
}: {
  fund: {
    splitTriggerPrice?: number;
    splitRatio?: number;
    reverseSplitTriggerPrice?: number;
    reverseSplitRatio?: number;
  };
}) {
  if (!fund.splitTriggerPrice && !fund.reverseSplitTriggerPrice) return null;
  return (
    <p className="mt-1 text-[11px] font-semibold text-violet-300">
      자동 액면조정 ·{" "}
      {[
        fund.splitTriggerPrice
          ? `${formatPrice(fund.splitTriggerPrice)} 이상 ${fund.splitRatio ?? 2}:1 분할`
          : "",
        fund.reverseSplitTriggerPrice
          ? `${formatPrice(fund.reverseSplitTriggerPrice)} 이하 1:${fund.reverseSplitRatio ?? 2} 병합`
          : "",
      ]
        .filter(Boolean)
        .join(" · ")}
    </p>
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

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
      <p className="text-[11px] text-[var(--muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-black tabular-nums">{value}</p>
    </div>
  );
}

function NavSparkline({
  points,
}: {
  points: { t: number; nav: number }[];
}) {
  if (points.length < 2) {
    return (
      <div className="mt-4 flex h-40 items-center justify-center rounded-2xl border border-dashed border-[var(--border)] text-xs text-[var(--muted)]">
        운용 데이터가 쌓이면 차트가 표시됩니다.
      </div>
    );
  }
  const min = Math.min(...points.map((point) => point.nav));
  const max = Math.max(...points.map((point) => point.nav));
  const span = Math.max(1, max - min);
  const width = 320;
  const height = 120;
  const d = points
    .map((point, index) => {
      const x = (index / (points.length - 1)) * width;
      const y = height - ((point.nav - min) / span) * (height - 8) - 4;
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  return (
    <div className="mt-4 overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--background)] p-3">
      <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full">
        <path d={d} fill="none" stroke="rgb(52 211 153)" strokeWidth="2.5" />
      </svg>
      <div className="mt-1 flex justify-between text-[10px] text-[var(--muted)]">
        <span>{formatPrice(points[0]!.nav)}</span>
        <span>{formatPrice(points[points.length - 1]!.nav)}</span>
      </div>
    </div>
  );
}

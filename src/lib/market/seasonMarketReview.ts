import { STOCK_DEFINITIONS } from "@/data/stocks";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  cycleReturnForStock,
  getMarketCycleAtSession,
} from "@/lib/market/marketCycles";
import {
  crisisReturnForStock,
  getActiveMarketCrisis,
} from "@/lib/market/marketCrises";
import {
  getMarketRegimeAtSession,
  regimeReturnForStock,
} from "@/lib/market/marketRegimes";
import type { StockDefinition } from "@/lib/types/market";

const SESSION_SECONDS = SESSION_DURATION_MS / 1_000;
const TRADING_SESSIONS_PER_YEAR = 240;

export interface SeasonStateCount {
  id: string;
  name: string;
  emoji: string;
  sessions: number;
}

export interface SeasonAssetAssessment {
  stockId: string;
  ticker: string;
  name: string;
  mechanicalReturn: number;
  reason: string;
}

export interface SeasonMarketReview {
  sessions: number;
  headline: string;
  summary: string;
  bias: "bullish" | "neutral" | "bearish";
  benchmarkStateReturn: number;
  averageVolatilityMultiplier: number;
  dominantRegimes: SeasonStateCount[];
  dominantCycles: SeasonStateCount[];
  crisisSessions: number;
  crisisLabel: string | null;
  favorable: SeasonAssetAssessment[];
  unfavorable: SeasonAssetAssessment[];
}

function addCount(
  map: Map<string, SeasonStateCount>,
  item: { id: string; name: string; emoji: string },
) {
  const current = map.get(item.id);
  map.set(item.id, {
    id: item.id,
    name: item.name,
    emoji: item.emoji,
    sessions: (current?.sessions ?? 0) + 1,
  });
}

function compound(returns: number[]): number {
  return returns.reduce(
    (value, sessionReturn) => value * (1 + Math.max(-0.95, sessionReturn)),
    1,
  ) - 1;
}

function stockReason(
  stock: StockDefinition,
  favorable: boolean,
  dominantRegime: SeasonStateCount | undefined,
  dominantCycle: SeasonStateCount | undefined,
  crisisLabel: string | null,
): string {
  if ((stock.leverage ?? 0) < 0) {
    return favorable
      ? "시장 하락 압력을 역방향으로 추종"
      : "상승 국면을 역방향으로 추종해 불리";
  }
  if ((stock.leverage ?? 0) > 1) {
    return favorable
      ? `시장 우호 신호를 ${stock.leverage}배로 증폭`
      : `시장 역풍을 ${stock.leverage}배로 증폭`;
  }
  if (stock.coveredCallUnderlyingId) {
    return favorable
      ? "완만한 장세와 옵션 프리미엄 수취 효과"
      : "강한 방향 장세에서 제한된 참여율이 약점";
  }
  if (stock.sector === "채권") {
    return favorable
      ? "위험자산 약세를 반대로 받는 방어 자산"
      : "위험 선호 상승장에서 방어 노출이 불리";
  }
  if (crisisLabel) {
    return `${crisisLabel}의 ${stock.sector} 업종 민감도 반영`;
  }
  return `${dominantRegime?.name ?? "혼합 국면"}·${dominantCycle?.name ?? "순환 장세"} 노출 반영`;
}

function selectDistinct(
  items: SeasonAssetAssessment[],
  descending: boolean,
): SeasonAssetAssessment[] {
  const sorted = [...items].sort((a, b) =>
    descending
      ? b.mechanicalReturn - a.mechanicalReturn
      : a.mechanicalReturn - b.mechanicalReturn,
  );
  const selected: SeasonAssetAssessment[] = [];
  const families = new Set<string>();
  const exposureSectors = new Set<string>();
  for (const item of sorted) {
    const definition = STOCK_DEFINITIONS.find((stock) => stock.id === item.stockId);
    const underlyingId =
      definition?.coveredCallUnderlyingId ?? definition?.leverageUnderlyingId;
    const exposureSector =
      (underlyingId
        ? STOCK_DEFINITIONS.find((stock) => stock.id === underlyingId)?.sector
        : definition?.sector) ?? item.stockId;
    const family = !definition
      ? item.stockId
      : (definition.leverage ?? 0) < 0
        ? "inverse"
        : (definition.leverage ?? 0) > 1
          ? "long-leverage"
          : definition.coveredCallUnderlyingId
            ? "covered-call"
            : definition.sector === "채권"
              ? "bond"
              : definition.etfHoldings?.length
                ? "broad-etf"
                : `sector:${definition.sector}`;
    if (families.has(family) || exposureSectors.has(exposureSector)) continue;
    families.add(family);
    exposureSectors.add(exposureSector);
    selected.push(item);
    if (selected.length === 3) break;
  }
  return selected;
}

export function buildSeasonMarketReview(
  startSession: number,
  endSession: number,
): SeasonMarketReview {
  const normalizedEnd = Math.max(startSession + 1, endSession);
  const sessions = normalizedEnd - startSession;
  const regimeCounts = new Map<string, SeasonStateCount>();
  const cycleCounts = new Map<string, SeasonStateCount>();
  const crisisCounts = new Map<string, number>();
  const volatility: number[] = [];
  let crisisSessions = 0;

  const definitionsById = new Map(
    STOCK_DEFINITIONS.map((definition) => [definition.id, definition]),
  );
  const returnsById = new Map<string, number[]>();
  for (const definition of STOCK_DEFINITIONS) returnsById.set(definition.id, []);

  for (let session = startSession; session < normalizedEnd; session++) {
    const regime = getMarketRegimeAtSession(session);
    const cycle = getMarketCycleAtSession(session);
    const crisis = getActiveMarketCrisis(session);
    addCount(regimeCounts, regime);
    addCount(cycleCounts, cycle);
    if (crisis) {
      crisisSessions += 1;
      crisisCounts.set(
        crisis.theme.name,
        (crisisCounts.get(crisis.theme.name) ?? 0) + 1,
      );
    }
    volatility.push(
      Math.min(
        4.5,
        regime.volatilityMultiplier *
          cycle.volatilityMultiplier *
          (crisis?.phase.volatilityMultiplier ?? 1),
      ),
    );

    const sessionCache = new Map<string, number>();
    const stateReturn = (stock: StockDefinition, stack = new Set<string>()): number => {
      const cached = sessionCache.get(stock.id);
      if (cached !== undefined) return cached;
      if (stack.has(stock.id)) return 0;
      const nextStack = new Set(stack).add(stock.id);
      let value: number;

      if (stock.coveredCallUnderlyingId) {
        const underlying = definitionsById.get(stock.coveredCallUnderlyingId);
        const underlyingReturn = underlying ? stateReturn(underlying, nextStack) : 0;
        value =
          underlyingReturn * (stock.coveredCallUpsideCapture ?? 0.65) +
          (stock.coveredCallAnnualYield ?? 0) / 100 / TRADING_SESSIONS_PER_YEAR;
      } else if (stock.leverage !== undefined && stock.leverageUnderlyingId) {
        const underlying = definitionsById.get(stock.leverageUnderlyingId);
        value = (underlying ? stateReturn(underlying, nextStack) : 0) * stock.leverage;
      } else if (stock.etfHoldings?.length) {
        let weight = 0;
        let weightedReturn = 0;
        for (const holding of stock.etfHoldings) {
          const constituent = definitionsById.get(holding.stockId);
          if (!constituent) continue;
          weight += holding.weight;
          weightedReturn += holding.weight * stateReturn(constituent, nextStack);
        }
        value = weight > 0 ? weightedReturn / weight : 0;
      } else {
        value =
          regimeReturnForStock(regime, stock.sector, SESSION_SECONDS) +
          cycleReturnForStock(cycle, stock.sector, SESSION_SECONDS) +
          (crisis
            ? crisisReturnForStock(crisis, stock, SESSION_SECONDS)
            : 0);
      }
      sessionCache.set(stock.id, value);
      return value;
    };

    for (const definition of STOCK_DEFINITIONS) {
      returnsById.get(definition.id)!.push(stateReturn(definition));
    }
  }

  const dominantRegimes = [...regimeCounts.values()].sort(
    (a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name),
  );
  const dominantCycles = [...cycleCounts.values()].sort(
    (a, b) => b.sessions - a.sessions || a.name.localeCompare(b.name),
  );
  const crisisLabel = [...crisisCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  const benchmarkDefinition = definitionsById.get("vnasdaq");
  const benchmarkStateReturn = benchmarkDefinition
    ? compound(returnsById.get(benchmarkDefinition.id) ?? [])
    : 0;
  const averageVolatilityMultiplier =
    volatility.reduce((sum, value) => sum + value, 0) / volatility.length;
  const bias =
    benchmarkStateReturn >= 0.02
      ? "bullish"
      : benchmarkStateReturn <= -0.02
        ? "bearish"
        : "neutral";

  const candidates = STOCK_DEFINITIONS
    .filter((stock) => stock.sector !== "지수" && stock.sector !== "선물")
    .map((stock) => ({
      stockId: stock.id,
      ticker: stock.ticker,
      name: stock.name,
      mechanicalReturn: compound(returnsById.get(stock.id) ?? []),
      reason: "",
    }));
  const favorable = selectDistinct(candidates, true).map((item) => ({
    ...item,
    reason: stockReason(
      definitionsById.get(item.stockId)!,
      true,
      dominantRegimes[0],
      dominantCycles[0],
      crisisLabel,
    ),
  }));
  const favorableIds = new Set(favorable.map((item) => item.stockId));
  const unfavorable = selectDistinct(
    candidates.filter((item) => !favorableIds.has(item.stockId)),
    false,
  ).map((item) => ({
    ...item,
    reason: stockReason(
      definitionsById.get(item.stockId)!,
      false,
      dominantRegimes[0],
      dominantCycles[0],
      crisisLabel,
    ),
  }));

  const headline =
    bias === "bullish"
      ? "상승 우위 시장"
      : bias === "bearish"
        ? "하락·방어 우위 시장"
        : "방향성 혼합 시장";
  const summary = `${dominantRegimes[0]?.name ?? "혼합 국면"}이 ${dominantRegimes[0]?.sessions ?? 0}일로 가장 길었고, ${dominantCycles[0]?.name ?? "순환 장세"} 구간이 중심이었습니다.${crisisSessions > 0 ? ` 대형 위기 영향은 ${crisisSessions}일이었습니다.` : " 대형 위기 구간은 없었습니다."}`;

  return {
    sessions,
    headline,
    summary,
    bias,
    benchmarkStateReturn,
    averageVolatilityMultiplier,
    dominantRegimes,
    dominantCycles,
    crisisSessions,
    crisisLabel,
    favorable,
    unfavorable,
  };
}

import { SESSION_DURATION_MS } from "@/lib/market/constants";
import {
  getMarketEra,
  type EconomyAsUsualEraState,
  type MarketEra,
} from "@/lib/market/marketEras";
import type { MarketEvent, StockDefinition } from "@/lib/types/market";

type EconomyStock = Pick<
  StockDefinition,
  "id" | "sector" | "beta" | "instrumentType" | "marketTags"
>;

const NON_FINANCIAL_SECTORS = [
  "기술",
  "산업재",
  "식품·외식",
  "미디어·콘텐츠",
  "소비재·서비스",
  "헬스케어",
  "에너지·인프라",
  "에너지",
] as const;
const BUNDLED_FINANCIAL_COMPANIES = [
  "hinafg",
  "gsck",
  "faust",
  "wakamo",
  "honglu",
] as const;
const BANK_RUN_TARGETS = ["hinafg", "gsck", "honglu"] as const;
const LARGE_FINANCIAL_SURVIVORS = ["hinafg", "gsck", "honglu"] as const;
const CRISIS_PROFIT_MAKERS = new Set(["faust", "wakamo"]);
const SESSION_SECONDS = SESSION_DURATION_MS / 1_000;

function deterministicIndex(seed: number, salt: number, size: number): number {
  let hash = (2166136261 ^ seed ^ salt) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 15), 2246822507);
  hash = Math.imul(hash ^ (hash >>> 13), 3266489909);
  return ((hash ^ (hash >>> 16)) >>> 0) % size;
}

function perSession(value: number, dtSeconds: number): number {
  return value * (dtSeconds / SESSION_SECONDS);
}

function stateAt(
  era: MarketEra,
  session: number,
): EconomyAsUsualEraState | null {
  const state = era.economyAsUsual;
  if (
    era.archetypeId !== "economy-as-usual" ||
    !state?.hiddenScenarioId ||
    state.crisisStartSession === undefined ||
    session < state.crisisStartSession
  ) {
    return null;
  }
  return state;
}

export function economyAsUsualTargets(era: MarketEra) {
  return {
    fraudSector:
      NON_FINANCIAL_SECTORS[
        deterministicIndex(era.index, 211, NON_FINANCIAL_SECTORS.length)
      ],
    fraudFinancialId:
      BUNDLED_FINANCIAL_COMPANIES[
        deterministicIndex(
          era.index,
          307,
          BUNDLED_FINANCIAL_COMPANIES.length,
        )
      ],
    bankRunTargetId:
      BANK_RUN_TARGETS[
        deterministicIndex(era.index, 401, BANK_RUN_TARGETS.length)
      ],
    bankRunDelay: 1 + deterministicIndex(era.index, 503, 2),
    privateCreditLead: 2 + deterministicIndex(era.index, 601, 4),
  };
}

function isFraudTarget(era: MarketEra, stock: EconomyStock): boolean {
  const targets = economyAsUsualTargets(era);
  return (
    stock.sector === targets.fraudSector ||
    stock.id === targets.fraudFinancialId
  );
}

/**
 * 경제대그냥의 숨겨진 시나리오가 종목에 주는 가격 효과.
 * 결과는 전역 국면 번호와 세션의 순함수라 모든 계정에서 동일하다.
 */
export function economyAsUsualReturnForStock(
  era: MarketEra,
  session: number,
  stock: EconomyStock,
  dtSeconds: number,
): number {
  const state = stateAt(era, session);
  if (!state || state.crisisStartSession === undefined) return 0;

  const offset = session - state.crisisStartSession;
  const targets = economyAsUsualTargets(era);
  const isCompany = (stock.instrumentType ?? "company") === "company";
  const isFinancial = stock.sector === "금융";
  const isTechOrGrowth =
    stock.sector === "기술" ||
    stock.marketTags?.some((tag) =>
      ["기술", "성장", "소프트웨어", "클라우드", "바이오"].includes(tag),
    );

  switch (state.hiddenScenarioId) {
    case "liquidity-drought":
      if (!isCompany) return perSession(offset === 0 ? -0.025 : 0, dtSeconds);
      return perSession(offset === 0 ? -0.16 : -0.004, dtSeconds);

    case "giant-fraud":
      if (!isFraudTarget(era, stock)) return 0;
      return perSession(offset === 0 ? -0.22 : -0.012, dtSeconds);

    case "bank-run": {
      const failureOffset = targets.bankRunDelay;
      const systemCrashOffset = failureOffset + 1;
      if (stock.id === targets.bankRunTargetId) {
        return perSession(
          offset < failureOffset
            ? -0.015
            : offset === failureOffset
              ? -0.24
              : -0.018,
          dtSeconds,
        );
      }
      if (CRISIS_PROFIT_MAKERS.has(stock.id)) {
        return perSession(
          offset === failureOffset || offset === systemCrashOffset
            ? 0.15
            : offset > systemCrashOffset
              ? 0.012
              : 0,
          dtSeconds,
        );
      }
      if (offset === failureOffset && isFinancial) {
        return perSession(-0.14, dtSeconds);
      }
      if (offset === systemCrashOffset) {
        if ((stock.beta ?? 1) <= 0.75) return perSession(0.045, dtSeconds);
        return perSession(-0.12, dtSeconds);
      }
      if (
        offset >= failureOffset + 3 &&
        LARGE_FINANCIAL_SURVIVORS.includes(
          stock.id as (typeof LARGE_FINANCIAL_SURVIVORS)[number],
        )
      ) {
        return perSession(0.018, dtSeconds);
      }
      return 0;
    }

    case "private-credit":
      if (offset < targets.privateCreditLead) {
        return perSession(0.012, dtSeconds);
      }
      if (offset === targets.privateCreditLead) {
        return perSession(isFinancial || isTechOrGrowth ? -0.2 : -0.11, dtSeconds);
      }
      return perSession(
        isFinancial || isTechOrGrowth ? -0.018 : -0.009,
        dtSeconds,
      );
  }
  return 0;
}

/** 거대한 사기 대상은 국면 종료까지 배당을 중단한다. */
export function isEconomyAsUsualDividendRestricted(
  session: number,
  stock: EconomyStock,
): boolean {
  const era = getMarketEra(session);
  const state = stateAt(era, session);
  return Boolean(
    state?.hiddenScenarioId === "giant-fraud" && isFraudTarget(era, stock),
  );
}

/** 거대한 사기의 대상이 CROT일 때만 기존 일일 하한을 잠시 해제한다. */
export function isEconomyAsUsualDownsideFloorSuspended(
  era: MarketEra,
  session: number,
  stock: EconomyStock,
): boolean {
  const state = stateAt(era, session);
  return Boolean(
    stock.id === "carrot" &&
      state?.hiddenScenarioId === "giant-fraud" &&
      isFraudTarget(era, stock),
  );
}

function event(
  era: MarketEra,
  session: number,
  suffix: string,
  title: string,
  description: string,
): MarketEvent {
  return {
    id: `economy-as-usual-${era.index}-${suffix}`,
    title,
    description,
    affectedStockIds: [],
    impact: 0,
    timestamp: session * SESSION_DURATION_MS,
    category: "macro",
    tag: "경제위기",
  };
}

/** 위기 유형명은 숨기고, 발생한 현상만 뉴스로 보여준다. */
export function getEconomyAsUsualEventsForSession(
  session: number,
): MarketEvent[] {
  const era = getMarketEra(session);
  const state = stateAt(era, session);
  if (!state || state.crisisStartSession === undefined) return [];
  const offset = session - state.crisisStartSession;
  const targets = economyAsUsualTargets(era);

  switch (state.hiddenScenarioId) {
    case "liquidity-drought":
      return offset === 0
        ? [
            event(
              era,
              session,
              "rate-20",
              "중앙은행, 기준금리 20% 전격 인상",
              "스태그플레이션 징후에 대한 선제 대응이라는 설명과 함께 사상 최고 수준의 긴축이 시작됐습니다. 주식 전반에서 유동성이 빠르게 빠져나갑니다.",
            ),
          ]
        : [];

    case "giant-fraud":
      return offset === 0
        ? [
            event(
              era,
              session,
              "audit-gap",
              "대형 회계 공백, 산업과 금융권으로 번져",
              `${targets.fraudSector} 업종과 한 금융회사에서 연결된 손실 정황이 발견됐습니다. 감사가 끝날 때까지 배당이 제한되고 자산 가치 재평가가 이어집니다.`,
            ),
          ]
        : [];

    case "bank-run":
      if (offset === 0) {
        return [
          event(
            era,
            session,
            "solvency-rumor",
            "대형 금융회사 지급불능설 확산",
            "아직 확인되지 않은 소문이지만 예금과 단기자금이 빠르게 이동하며 금융권 전반의 긴장이 높아집니다.",
          ),
        ];
      }
      if (offset === targets.bankRunDelay) {
        return [
          event(
            era,
            session,
            "default",
            "금융회사 지급불능 선언, 뱅크런 현실화",
            "대규모 인출 요구를 버티지 못한 금융회사가 지급불능을 선언했습니다. 금융 섹터 전반에 강제 매도가 번집니다.",
          ),
        ];
      }
      if (offset === targets.bankRunDelay + 1) {
        return [
          event(
            era,
            session,
            "contagion",
            "신용 공포, 전 산업으로 확산",
            "금융권의 자금 경색이 기업 대출과 회사채 시장으로 번지며 비금융 업종까지 동반 급락합니다.",
          ),
        ];
      }
      if (offset === targets.bankRunDelay + 3) {
        return [
          event(
            era,
            session,
            "survivors",
            "대형 금융사 세 곳, 위기 자산 인수 경쟁",
            "자본 여력이 남은 대형 금융사들이 부실 자산과 우량 고객을 흡수하며 금융권 재편의 승자로 떠오릅니다.",
          ),
        ];
      }
      return [];

    case "private-credit":
      return offset === targets.privateCreditLead
        ? [
            event(
              era,
              session,
              "private-credit-news",
              "사모펀드 유동성 위기… 사모펀드들 파산하나",
              "상승장 이면에서 누적된 사모신용 손실이 드러났습니다. 금융·기술·성장주를 중심으로 위험 회피가 급속히 확산합니다.",
            ),
          ]
        : [];
  }
  return [];
}

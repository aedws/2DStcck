import { getActiveMarketCrisis } from "@/lib/market/marketCrises";
import { getMarketEra } from "@/lib/market/marketEras";

export type LiquidityCrisisKind =
  | "credit-crunch"
  | "bank-liquidity"
  | "liquidity-drought"
  | "sudden-bank-run";

export interface LiquidityCrisisOpportunity {
  crisisKey: string;
  kind: LiquidityCrisisKind;
  label: string;
  publicLabel: string;
  startSession: number;
  endSession: number;
  targetCentsExact: string;
  institutionalCentsExact: string;
}

const CRISIS_TARGET_CENTS: Record<LiquidityCrisisKind, bigint> = {
  // $1Q · $2Q · $3Q · $5Q. 개인 자본만으로 채워야 하는 몫은 각 목표의 70%다.
  "credit-crunch": 100_000_000_000_000_000n,
  "bank-liquidity": 200_000_000_000_000_000n,
  "liquidity-drought": 300_000_000_000_000_000n,
  "sudden-bank-run": 500_000_000_000_000_000n,
};

const CRISIS_LABELS: Record<LiquidityCrisisKind, string> = {
  "credit-crunch": "글로벌 신용 경색",
  "bank-liquidity": "은행 유동성 위기",
  "liquidity-drought": "유동성 가뭄",
  "sudden-bank-run": "갑작스러운 뱅크런",
};

function opportunity(
  crisisKey: string,
  kind: LiquidityCrisisKind,
  startSession: number,
  endSession: number,
  hidden: boolean,
): LiquidityCrisisOpportunity {
  const target = CRISIS_TARGET_CENTS[kind];
  // 연기금 12% + 월가 18%를 자동 투입한다. 나머지 70%는 플레이어 공동 자본 몫이다.
  const institutional = (target * 30n) / 100n;
  return {
    crisisKey,
    kind,
    label: CRISIS_LABELS[kind],
    publicLabel: hidden ? "정체 불명의 유동성 위기" : CRISIS_LABELS[kind],
    startSession,
    endSession,
    targetCentsExact: target.toString(),
    institutionalCentsExact: institutional.toString(),
  };
}

/**
 * 개인·기관 자본으로 진화할 수 있는 네 종류의 유동성 위기만 반환한다.
 * 경제대그냥의 비공개 위기는 기존 추론 플레이를 해치지 않도록 이름을 숨긴다.
 */
export function getLiquidityCrisisOpportunity(
  session: number,
): LiquidityCrisisOpportunity | null {
  const crisis = getActiveMarketCrisis(session);
  if (crisis && crisis.phase.id !== "recovery") {
    if (crisis.theme.id === "credit-crunch") {
      return opportunity(
        `market-crisis-${crisis.crisisNumber}`,
        "credit-crunch",
        crisis.startSession,
        crisis.endSession,
        false,
      );
    }
    if (crisis.theme.id === "bank-run") {
      return opportunity(
        `market-crisis-${crisis.crisisNumber}`,
        "bank-liquidity",
        crisis.startSession,
        crisis.endSession,
        false,
      );
    }
  }

  const era = getMarketEra(session);
  const hidden = era.economyAsUsual;
  if (
    hidden?.phase === "active" &&
    hidden.crisisStartSession !== undefined
  ) {
    if (hidden.hiddenScenarioId === "liquidity-drought") {
      return opportunity(
        `economy-era-${era.index}`,
        "liquidity-drought",
        hidden.crisisStartSession,
        era.endSession,
        true,
      );
    }
    if (hidden.hiddenScenarioId === "bank-run") {
      return opportunity(
        `economy-era-${era.index}`,
        "sudden-bank-run",
        hidden.crisisStartSession,
        era.endSession,
        true,
      );
    }
  }
  return null;
}

export function findUpcomingLiquidityCrisis(
  session: number,
  horizonSessions = 20,
): { opportunity: LiquidityCrisisOpportunity; sessionsUntil: number } | null {
  const horizon = Math.max(0, Math.floor(horizonSessions));
  for (let offset = 0; offset <= horizon; offset += 1) {
    const found = getLiquidityCrisisOpportunity(session + offset);
    if (found) return { opportunity: found, sessionsUntil: offset };
  }
  return null;
}


import {
  MARKET_EPOCH_MS,
  SESSION_DURATION_MS,
  SIM_TICK_MS,
} from "@/lib/market/constants";
import type { MarketEvent } from "@/lib/types/market";
import {
  getLiquidityCrisisOpportunity,
  type LiquidityCrisisKind,
} from "@/lib/market/liquidityCrisis";

export interface LiquidityInterventionState {
  crisisKey: string;
  kind: LiquidityCrisisKind;
  startSession: number;
  endSession: number;
  resolved: boolean;
  effectiveTick?: number;
}

let interventions: LiquidityInterventionState[] = [];

export function setLiquidityInterventions(
  input: readonly LiquidityInterventionState[],
): void {
  const seen = new Set<string>();
  interventions = input
    .filter((item) => {
      if (
        !item.crisisKey ||
        seen.has(item.crisisKey) ||
        !Number.isSafeInteger(item.startSession) ||
        !Number.isSafeInteger(item.endSession) ||
        item.endSession <= item.startSession
      ) {
        return false;
      }
      // 공개 RPC 입력을 임의로 조작해 가짜 위기 해결을 전역 시장에 주입할 수
      // 없도록, 결정론 시장이 계산한 실제 위기 정의와 완전히 같은 행만 받는다.
      const expected = getLiquidityCrisisOpportunity(item.startSession);
      if (
        !expected ||
        expected.crisisKey !== item.crisisKey ||
        expected.kind !== item.kind ||
        expected.startSession !== item.startSession ||
        expected.endSession !== item.endSession
      ) {
        return false;
      }
      seen.add(item.crisisKey);
      return true;
    })
    .map((item) => ({ ...item }))
    .sort((a, b) => a.startSession - b.startSession);
}

export function getLiquidityInterventions(): LiquidityInterventionState[] {
  return interventions;
}

export function resolvedLiquidityInterventionAt(
  session: number,
  tick: number,
): LiquidityInterventionState | null {
  return (
    interventions.find(
      (item) =>
        item.resolved &&
        item.effectiveTick !== undefined &&
        item.effectiveTick <= tick &&
        session >= item.startSession &&
        session < item.endSession,
    ) ?? null
  );
}

export function simTickAtTime(now: number): number {
  return Math.max(0, Math.floor((now - MARKET_EPOCH_MS) / SIM_TICK_MS));
}

/** 해결 직후 3거래일은 소방수 자금의 신뢰 회복 랠리를 더한다. */
export function liquidityRescueReturn(
  intervention: LiquidityInterventionState | null,
  session: number,
  dtSeconds: number,
): number {
  if (!intervention?.effectiveTick) return 0;
  const effectiveTime =
    MARKET_EPOCH_MS + intervention.effectiveTick * SIM_TICK_MS;
  const effectiveSession = Math.floor(effectiveTime / SESSION_DURATION_MS);
  const perSession = session - effectiveSession < 3 ? 0.012 : 0.002;
  return (
    perSession *
    (Math.max(0, dtSeconds) / (SESSION_DURATION_MS / 1_000))
  );
}

export function getLiquidityResolutionEventsForTick(
  previousTick: number,
  tick: number,
): MarketEvent[] {
  return interventions
    .filter(
      (item) =>
        item.resolved &&
        item.effectiveTick !== undefined &&
        item.effectiveTick > previousTick &&
        item.effectiveTick <= tick,
    )
    .map((item) => ({
      id: `liquidity-resolution-${item.crisisKey}`,
      title: "민간·기관 자본 집결, 유동성 위기 진화",
      description:
        "연기금과 월가의 선제 자금에 개인 투자자들의 대규모 자본이 합류했습니다. 연쇄 청산과 지급불능 전염이 멈추고 시장 신뢰가 회복되기 시작합니다.",
      affectedStockIds: [],
      impact: 0,
      timestamp:
        MARKET_EPOCH_MS + (item.effectiveTick ?? tick) * SIM_TICK_MS,
      category: "macro" as const,
      tag: "유동성 소방",
    }));
}

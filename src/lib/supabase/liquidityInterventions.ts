import type { LiquidityCrisisOpportunity } from "@/lib/market/liquidityCrisis";
import type { LiquidityInterventionState } from "@/lib/market/liquidityInterventions";
import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";

export interface LiquidityInterventionStatus
  extends LiquidityInterventionState {
  contributed: boolean;
  targetCentsExact?: string;
  institutionalCentsExact?: string;
  playerCentsExact?: string;
  totalCentsExact?: string;
  myCentsExact?: string;
}

export interface LiquidityContributionResult
  extends LiquidityInterventionStatus {
  cashExact: string;
  achievementIds: string[];
}

function exactString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value).toString();
  }
  if (typeof value === "string" && /^-?\d+$/.test(value)) return value;
  return undefined;
}

function parseStatus(
  value: Record<string, unknown> | null | undefined,
): LiquidityInterventionStatus | null {
  if (!value) return null;
  const state: LiquidityInterventionStatus = {
    crisisKey: String(value.crisis_key ?? ""),
    kind: String(value.kind ?? "") as LiquidityInterventionState["kind"],
    startSession: Number(value.start_session),
    endSession: Number(value.end_session),
    resolved: Boolean(value.resolved),
    contributed: Boolean(value.contributed),
    ...(Number.isSafeInteger(Number(value.effective_tick))
      ? { effectiveTick: Number(value.effective_tick) }
      : {}),
    ...(exactString(value.target_cents)
      ? { targetCentsExact: exactString(value.target_cents) }
      : {}),
    ...(exactString(value.institutional_cents)
      ? { institutionalCentsExact: exactString(value.institutional_cents) }
      : {}),
    ...(exactString(value.player_cents)
      ? { playerCentsExact: exactString(value.player_cents) }
      : {}),
    ...(exactString(value.total_cents)
      ? { totalCentsExact: exactString(value.total_cents) }
      : {}),
    ...(exactString(value.my_cents)
      ? { myCentsExact: exactString(value.my_cents) }
      : {}),
  };
  if (
    !state.crisisKey ||
    ![
      "credit-crunch",
      "bank-liquidity",
      "liquidity-drought",
      "sudden-bank-run",
    ].includes(state.kind) ||
    !Number.isSafeInteger(state.startSession) ||
    !Number.isSafeInteger(state.endSession)
  ) {
    return null;
  }
  return state;
}

function deploymentMessage(detail: string): string {
  if (
    detail.includes("does not exist") ||
    detail.includes("schema cache") ||
    detail.includes("PGRST202")
  ) {
    return "공동 유동성 원장을 준비 중입니다. 잠시 후 다시 시도해 주세요.";
  }
  return "유동성 원장에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.";
}

export async function listPublicLiquidityInterventions(): Promise<
  LiquidityInterventionState[]
> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "list_public_liquidity_interventions",
  );
  if (error || !data) return [];
  return (data as Record<string, unknown>[])
    .map((row) => parseStatus(row))
    .filter(
      (item): item is LiquidityInterventionStatus => item !== null,
    )
    .map((item) => ({
      crisisKey: item.crisisKey,
      kind: item.kind,
      startSession: item.startSession,
      endSession: item.endSession,
      resolved: item.resolved,
      ...(item.effectiveTick !== undefined
        ? { effectiveTick: item.effectiveTick }
        : {}),
    }));
}

export async function getLiquidityInterventionStatus(
  opportunity: LiquidityCrisisOpportunity,
): Promise<
  | { success: true; status: LiquidityInterventionStatus }
  | { success: false; message: string }
> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "get_liquidity_intervention_status",
    {
      p_crisis_key: opportunity.crisisKey,
      p_kind: opportunity.kind,
      p_start_session: opportunity.startSession,
      p_end_session: opportunity.endSession,
    },
  );
  if (error || !data) {
    return {
      success: false,
      message: deploymentMessage(error?.message ?? ""),
    };
  }
  const status = parseStatus(
    (Array.isArray(data) ? data[0] : data) as Record<string, unknown>,
  );
  return status
    ? { success: true, status }
    : { success: false, message: "유동성 원장 응답을 확인하지 못했습니다." };
}

export async function contributeLiquidityIntervention(
  opportunity: LiquidityCrisisOpportunity,
  amountCentsExact: string,
  requestId: string,
): Promise<
  | { success: true; result: LiquidityContributionResult }
  | { success: false; message: string }
> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인 후 자본을 투입할 수 있습니다." };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "contribute_liquidity_intervention",
    {
      p_request_id: requestId,
      p_crisis_key: opportunity.crisisKey,
      p_kind: opportunity.kind,
      p_start_session: opportunity.startSession,
      p_end_session: opportunity.endSession,
      p_amount_cents: amountCentsExact,
    },
  );
  if (error || !data) {
    const detail = error?.message ?? "";
    const message = detail.includes("minimum_contribution")
      ? "최소 투입액은 $1,000,000,000입니다."
      : detail.includes("insufficient_cash")
        ? "서버에 저장된 보유 현금이 부족합니다."
        : detail.includes("crisis_not_active")
          ? "이미 종료되었거나 아직 시작하지 않은 위기입니다."
          : detail.includes("already_resolved")
            ? "이미 진화된 유동성 위기입니다."
            : deploymentMessage(detail);
    return { success: false, message };
  }
  const row = (Array.isArray(data) ? data[0] : data) as Record<
    string,
    unknown
  >;
  const status = parseStatus(row);
  const cashExact = exactString(row.cash_exact);
  if (!status || !cashExact) {
    return { success: false, message: "자본 투입 결과를 확인하지 못했습니다." };
  }
  return {
    success: true,
    result: {
      ...status,
      cashExact,
      achievementIds: Array.isArray(row.achievement_ids)
        ? row.achievement_ids.filter(
            (id): id is string => typeof id === "string",
          )
        : [],
    },
  };
}

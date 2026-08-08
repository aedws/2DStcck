import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";
import { normalizeExactQuantity } from "@/lib/market/exactAmount";

export const PLAYER_COMPANY_QUARTER_SESSIONS = 24;
export const PLAYER_COMPANY_LONG_TERM_VOTE_SESSIONS = 90;
export const PLAYER_COMPANY_VOTE_WINDOW_SESSIONS = 24;

export type PlayerCompanyBoardDecisionType =
  | "research"
  | "dividend"
  | "buyback"
  | "acquisition";

export type PlayerCompanyProposalType =
  | "dividend"
  | "issue"
  | "retire"
  | "expansion"
  | "ceo_change"
  | "asset_sale";

export interface PlayerCompanyBoardDecision {
  id: string;
  stockId: string;
  ticker: string;
  decisionType: PlayerCompanyBoardDecisionType;
  selectedSession: number;
  resolveSession: number;
  status: "pending" | "resolved";
  outcomeLabel?: string;
  earningsGrowthDelta?: number;
  priceFactor?: number;
  reputationDelta?: number;
}

export interface PlayerCompanyGovernanceProposal {
  id: string;
  stockId: string;
  ticker: string;
  companyName: string;
  proposalType: PlayerCompanyProposalType;
  proposedValue: number;
  openedSession: number;
  closesSession: number;
  status: "open" | "passed" | "rejected";
  yesWeight: number;
  noWeight: number;
  eligible: boolean;
  votingWeightExact: string;
  isFounder: boolean;
  myVote: "yes" | "no" | null;
  reputationDelta?: number;
}

export interface PlayerCompanyGovernanceDirectoryItem {
  stockId: string;
  ticker: string;
  companyName: string;
  founderGameId: string;
  sector: string;
  subsector?: string;
  description?: string;
  openProposalCount: number;
}

const text = (value: unknown) =>
  typeof value === "string" ? value.trim() : "";
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

function parseBoardDecision(
  row: Record<string, unknown>,
): PlayerCompanyBoardDecision | null {
  const decisionType = text(
    row.decision_type,
  ) as PlayerCompanyBoardDecisionType;
  const status = text(row.status) as PlayerCompanyBoardDecision["status"];
  const id = text(row.id);
  const stockId = text(row.stock_id);
  if (
    !id ||
    !stockId ||
    !["research", "dividend", "buyback", "acquisition"].includes(
      decisionType,
    ) ||
    !["pending", "resolved"].includes(status)
  ) {
    return null;
  }
  return {
    id,
    stockId,
    ticker: text(row.ticker).toUpperCase(),
    decisionType,
    selectedSession: Math.floor(number(row.selected_session)),
    resolveSession: Math.floor(number(row.resolve_session)),
    status,
    ...(text(row.outcome_label)
      ? { outcomeLabel: text(row.outcome_label) }
      : {}),
    ...(Number.isFinite(Number(row.earnings_growth_delta))
      ? { earningsGrowthDelta: number(row.earnings_growth_delta) }
      : {}),
    ...(Number.isFinite(Number(row.price_factor))
      ? { priceFactor: number(row.price_factor) }
      : {}),
    ...(Number.isFinite(Number(row.reputation_delta))
      ? { reputationDelta: number(row.reputation_delta) }
      : {}),
  };
}

function parseProposal(
  row: Record<string, unknown>,
): PlayerCompanyGovernanceProposal | null {
  const id = text(row.id);
  const stockId = text(row.stock_id);
  const proposalType = text(row.proposal_type) as PlayerCompanyProposalType;
  const status = text(row.status) as PlayerCompanyGovernanceProposal["status"];
  if (
    !id ||
    !stockId ||
    ![
      "dividend",
      "issue",
      "retire",
      "expansion",
      "ceo_change",
      "asset_sale",
    ].includes(proposalType) ||
    !["open", "passed", "rejected"].includes(status)
  ) {
    return null;
  }
  const rawVote = text(row.my_vote);
  return {
    id,
    stockId,
    ticker: text(row.ticker).toUpperCase(),
    companyName: text(row.company_name) || text(row.ticker).toUpperCase(),
    proposalType,
    proposedValue: number(row.proposed_value),
    openedSession: Math.floor(number(row.opened_session)),
    closesSession: Math.floor(number(row.closes_session)),
    status,
    yesWeight: number(row.yes_weight),
    noWeight: number(row.no_weight),
    eligible: Boolean(row.eligible),
    votingWeightExact: normalizeExactQuantity(row.voting_weight),
    isFounder: Boolean(row.is_founder),
    myVote: rawVote === "yes" || rawVote === "no" ? rawVote : null,
    ...(Number.isFinite(Number(row.reputation_delta))
      ? { reputationDelta: number(row.reputation_delta) }
      : {}),
  };
}

function parseDirectoryItem(
  row: Record<string, unknown>,
): PlayerCompanyGovernanceDirectoryItem | null {
  const stockId = text(row.stock_id);
  const ticker = text(row.ticker).toUpperCase();
  const companyName = text(row.company_name);
  if (!stockId || !ticker || !companyName) return null;
  return {
    stockId,
    ticker,
    companyName,
    founderGameId: text(row.founder_game_id) || "unknown",
    sector: text(row.sector) || "기타",
    ...(text(row.subsector) ? { subsector: text(row.subsector) } : {}),
    ...(text(row.description) ? { description: text(row.description) } : {}),
    openProposalCount: Math.max(0, Math.floor(number(row.open_proposal_count))),
  };
}

export async function listPlayerCompanyGovernanceDirectory(): Promise<
  PlayerCompanyGovernanceDirectoryItem[]
> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "list_player_company_governance_directory",
  );
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[])
    .map(parseDirectoryItem)
    .filter(
      (item): item is PlayerCompanyGovernanceDirectoryItem => item !== null,
    );
}

export async function listPlayerCompanyBoardDecisions(
  stockId: string,
): Promise<PlayerCompanyBoardDecision[]> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("player_company_board_decisions")
    .select("*")
    .eq("stock_id", stockId.trim().toLowerCase())
    .order("resolve_session", { ascending: false })
    .limit(8);
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[])
    .map(parseBoardDecision)
    .filter(
      (decision): decision is PlayerCompanyBoardDecision => decision !== null,
    );
}

export async function choosePlayerCompanyBoardDecision(
  stockId: string,
  decisionType: PlayerCompanyBoardDecisionType,
): Promise<
  | { success: true; decision: PlayerCompanyBoardDecision; message: string }
  | { success: false; message: string }
> {
  const auth = await getCurrentAuth();
  if (!auth) {
    return { success: false, message: "로그인한 상장 회사 창업주만 선택할 수 있습니다." };
  }
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "choose_player_company_board_decision",
    {
      p_stock_id: stockId.trim().toLowerCase(),
      p_decision_type: decisionType,
    },
  );
  if (error || !data) {
    const detail = error?.message ?? "";
    if (detail.includes("already_chosen")) {
      return { success: false, message: "이번 분기 경영 선택은 이미 확정됐습니다." };
    }
    if (detail.includes("not_founder")) {
      return { success: false, message: "인증된 상장 회사 창업주만 선택할 수 있습니다." };
    }
    return { success: false, message: "이사회 경영 선택을 저장하지 못했습니다." };
  }
  const decision = parseBoardDecision(
    (Array.isArray(data) ? data[0] : data) as Record<string, unknown>,
  );
  return decision
    ? {
        success: true,
        decision,
        message: "이사회 선택을 확정했습니다. 다음 분기 실적에 결과가 반영됩니다.",
      }
    : { success: false, message: "이사회 선택 결과를 확인하지 못했습니다." };
}

/** 접속 중인 아무 클라이언트가 호출해도 만기 결과를 한 번만 공통 원장에 반영한다. */
export async function resolveDuePlayerCompanyGovernance(): Promise<void> {
  const supabase = createClient();
  await supabase.rpc("resolve_due_player_company_governance");
}

export async function listPlayerCompanyGovernanceProposals(): Promise<
  PlayerCompanyGovernanceProposal[]
> {
  const auth = await getCurrentAuth();
  if (!auth) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "list_player_company_governance_proposals",
  );
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[])
    .map(parseProposal)
    .filter(
      (proposal): proposal is PlayerCompanyGovernanceProposal =>
        proposal !== null,
    );
}

export async function createPlayerCompanyGovernanceProposal(input: {
  stockId: string;
  proposalType: PlayerCompanyProposalType;
  proposedValue: number;
}): Promise<{ success: boolean; message: string }> {
  const auth = await getCurrentAuth();
  if (!auth) return { success: false, message: "로그인이 필요합니다." };
  const supabase = createClient();
  const { error } = await supabase.rpc(
    "create_player_company_governance_proposal",
    {
      p_stock_id: input.stockId.trim().toLowerCase(),
      p_proposal_type: input.proposalType,
      p_proposed_value: input.proposedValue,
    },
  );
  if (!error) {
    return {
      success: true,
      message: `주주총회 안건이 열렸습니다. ${PLAYER_COMPANY_VOTE_WINDOW_SESSIONS}거래일 동안 투표할 수 있습니다.`,
    };
  }
  const detail = error.message ?? "";
  if (detail.includes("open_proposal_exists")) {
    return { success: false, message: "이미 진행 중인 주주총회 안건이 있습니다." };
  }
  if (
    detail.includes("not_major_shareholder") ||
    detail.includes("not_proposer")
  ) {
    return {
      success: false,
      message:
        "경영권자 또는 90거래일 이상 보유한 실제 지분 3% 이상 주요 주주만 안건을 상정할 수 있습니다.",
    };
  }
  return { success: false, message: "주주총회 안건을 열지 못했습니다." };
}

export async function castPlayerCompanyGovernanceVote(
  proposalId: string,
  vote: "yes" | "no",
): Promise<{ success: boolean; message: string }> {
  const auth = await getCurrentAuth();
  if (!auth) return { success: false, message: "로그인이 필요합니다." };
  const supabase = createClient();
  const { error } = await supabase.rpc("cast_player_company_governance_vote", {
    p_proposal_id: proposalId,
    p_vote: vote,
  });
  if (!error) {
    return {
      success: true,
      message: vote === "yes" ? "찬성표를 행사했습니다." : "반대표를 행사했습니다.",
    };
  }
  const detail = error.message ?? "";
  if (detail.includes("not_eligible")) {
    return {
      success: false,
      message: `창업주 또는 ${PLAYER_COMPANY_LONG_TERM_VOTE_SESSIONS}거래일 이상 연속 보유한 주주만 투표할 수 있습니다.`,
    };
  }
  if (detail.includes("vote_closed")) {
    return { success: false, message: "투표가 이미 마감됐습니다." };
  }
  return { success: false, message: "투표를 저장하지 못했습니다." };
}

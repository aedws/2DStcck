import { normalizeExactAmount } from "@/lib/market/exactAmount";
import { createClient } from "@/lib/supabase/client";
import { getCurrentAuth } from "@/lib/supabase/stockRequests";

export type PlayerCompanyInsolvencyOption =
  | "rehabilitation"
  | "trust"
  | "rescue-loan"
  | "m-and-a";

export type PlayerCompanyInsolvencyStatus =
  | "rehabilitation"
  | "trust"
  | "loan-active"
  | "auction"
  | "transferred"
  | "closed";

export interface PlayerCompanyInsolvencyCase {
  id: string;
  optionType: PlayerCompanyInsolvencyOption;
  status: PlayerCompanyInsolvencyStatus;
  openedSession: number;
  resolvesSession?: number;
  protectedVoteWeightExact: string;
  rescueLoanCentsExact: string;
  rescueLoanDueSession?: number;
  auctionPriceCentsExact: string;
  buyerId?: string;
}

export interface PlayerCompanyInsolvencySummary {
  stockId: string;
  currentSession: number;
  eligible: boolean;
  marginCallAtMs: number;
  controlSource: string;
  controlVoteWeightExact: string;
  insolvencyCase: PlayerCompanyInsolvencyCase | null;
}

export interface ControlledPlayerCompany {
  stockId: string;
  ticker: string;
  companyName: string;
  sector: string;
  originalFounderGameId: string;
  isOriginalFounder: boolean;
  controlSource: string;
  controlVoteWeightExact: string;
  acquiredSession?: number;
}

export interface PlayerCompanyAuction {
  caseId: string;
  stockId: string;
  ticker: string;
  companyName: string;
  originalFounderGameId: string;
  auctionPriceCentsExact: string;
  openedSession: number;
}

const text = (value: unknown) =>
  typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};
const exact = (value: unknown) => normalizeExactAmount(text(value) || "0");

function parseCase(value: unknown): PlayerCompanyInsolvencyCase | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const id = text(row.id);
  const optionType = text(row.optionType) as PlayerCompanyInsolvencyOption;
  const status = text(row.status) as PlayerCompanyInsolvencyStatus;
  if (
    !id ||
    !["rehabilitation", "trust", "rescue-loan", "m-and-a"].includes(
      optionType,
    ) ||
    ![
      "rehabilitation",
      "trust",
      "loan-active",
      "auction",
      "transferred",
      "closed",
    ].includes(status)
  ) {
    return null;
  }
  const resolvesSession = Math.floor(number(row.resolvesSession));
  const rescueLoanDueSession = Math.floor(number(row.rescueLoanDueSession));
  return {
    id,
    optionType,
    status,
    openedSession: Math.floor(number(row.openedSession)),
    ...(resolvesSession > 0 ? { resolvesSession } : {}),
    protectedVoteWeightExact: exact(row.protectedVoteWeight),
    rescueLoanCentsExact: exact(row.rescueLoanCents),
    ...(rescueLoanDueSession > 0 ? { rescueLoanDueSession } : {}),
    auctionPriceCentsExact: exact(row.auctionPriceCents),
    ...(text(row.buyerId) ? { buyerId: text(row.buyerId) } : {}),
  };
}

function parseSummary(value: unknown): PlayerCompanyInsolvencySummary | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const stockId = text(row.stockId);
  if (!stockId) return null;
  return {
    stockId,
    currentSession: Math.floor(number(row.currentSession)),
    eligible: Boolean(row.eligible),
    marginCallAtMs: Math.floor(number(row.marginCallAtMs)),
    controlSource: text(row.controlSource),
    controlVoteWeightExact: exact(row.controlVoteWeight),
    insolvencyCase: parseCase(row.case),
  };
}

export async function getPlayerCompanyInsolvencyStatus(
  stockId: string,
): Promise<PlayerCompanyInsolvencySummary | null> {
  if (!(await getCurrentAuth())) return null;
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "get_player_company_insolvency_status",
    { p_stock_id: stockId.trim().toLowerCase() },
  );
  return error ? null : parseSummary(data);
}

export async function choosePlayerCompanyInsolvencyOption(
  stockId: string,
  option: PlayerCompanyInsolvencyOption,
): Promise<{ success: boolean; message: string }> {
  if (!(await getCurrentAuth())) {
    return { success: false, message: "로그인이 필요합니다." };
  }
  const supabase = createClient();
  const { error } = await supabase.rpc(
    "choose_player_company_insolvency_option",
    {
      p_stock_id: stockId.trim().toLowerCase(),
      p_option: option,
    },
  );
  if (!error) {
    return {
      success: true,
      message:
        option === "rehabilitation"
          ? "24거래일 법인 회생관리를 시작했습니다."
          : option === "trust"
            ? "총 의결권 10%를 보호신탁에 격리했습니다."
            : option === "rescue-loan"
              ? "긴급 회생대출을 실행했습니다. 24거래일 안에 상환해야 합니다."
              : "경영권 공개매각을 시작했습니다.",
    };
  }
  const detail = error.message ?? "";
  if (detail.includes("already_handled")) {
    return { success: false, message: "이번 파산 건은 이미 처리했습니다." };
  }
  if (detail.includes("no_bankruptcy_event")) {
    return { success: false, message: "처리할 강제청산 기록이 없습니다." };
  }
  if (detail.includes("not_controller")) {
    return { success: false, message: "현재 경영권자만 선택할 수 있습니다." };
  }
  return { success: false, message: "파산 처리 방식을 저장하지 못했습니다." };
}

export async function repayPlayerCompanyRescueLoan(
  caseId: string,
): Promise<{ success: boolean; message: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("repay_player_company_rescue_loan", {
    p_case_id: caseId,
  });
  if (!error) return { success: true, message: "회생대출 원리금을 상환했습니다." };
  return {
    success: false,
    message: error.message?.includes("insufficient_cash")
      ? "회생대출 원리금을 상환할 현금이 부족합니다."
      : "회생대출을 상환하지 못했습니다.",
  };
}

export async function listMyControlledPlayerCompanies(): Promise<
  ControlledPlayerCompany[]
> {
  if (!(await getCurrentAuth())) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "list_my_controlled_player_companies",
  );
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).flatMap((row) => {
    const stockId = text(row.stock_id);
    const ticker = text(row.ticker).toUpperCase();
    if (!stockId || !ticker) return [];
    const acquiredSession = Math.floor(number(row.acquired_session));
    return [{
      stockId,
      ticker,
      companyName: text(row.company_name) || ticker,
      sector: text(row.sector) || "기타",
      originalFounderGameId: text(row.original_founder_game_id) || "unknown",
      isOriginalFounder: Boolean(row.is_original_founder),
      controlSource: text(row.control_source),
      controlVoteWeightExact: exact(row.control_vote_weight),
      ...(acquiredSession > 0 ? { acquiredSession } : {}),
    }];
  });
}

export async function listOpenPlayerCompanyAuctions(): Promise<
  PlayerCompanyAuction[]
> {
  if (!(await getCurrentAuth())) return [];
  const supabase = createClient();
  const { data, error } = await supabase.rpc(
    "list_open_player_company_auctions",
  );
  if (error || !Array.isArray(data)) return [];
  return (data as Record<string, unknown>[]).flatMap((row) => {
    const caseId = text(row.case_id);
    const stockId = text(row.stock_id);
    const ticker = text(row.ticker).toUpperCase();
    if (!caseId || !stockId || !ticker) return [];
    return [{
      caseId,
      stockId,
      ticker,
      companyName: text(row.company_name) || ticker,
      originalFounderGameId: text(row.original_founder_game_id) || "unknown",
      auctionPriceCentsExact: exact(row.auction_price_cents),
      openedSession: Math.floor(number(row.opened_session)),
    }];
  });
}

export async function acquirePlayerCompanyControl(
  caseId: string,
): Promise<{ success: boolean; message: string }> {
  const supabase = createClient();
  const { error } = await supabase.rpc("acquire_player_company_control", {
    p_case_id: caseId,
  });
  if (!error) {
    return {
      success: true,
      message: "M&A 대금을 지급하고 IPO 경영권·계약 의결권을 인수했습니다.",
    };
  }
  const detail = error.message ?? "";
  return {
    success: false,
    message: detail.includes("insufficient_cash")
      ? "인수대금을 지급할 현금이 부족합니다."
      : detail.includes("self_acquisition")
        ? "현재 경영권자는 자기 회사 경영권을 다시 인수할 수 없습니다."
        : detail.includes("auction_closed")
          ? "이미 종료된 공개매각입니다."
          : "경영권을 인수하지 못했습니다.",
  };
}

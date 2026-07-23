import { COMPANY_SECTOR_ORDER } from "@/lib/market/taxonomy";
import type { Holding, StockState } from "@/lib/types/market";

export const PLAYER_COMPANY_MIN_NET_WORTH = 100_000_000_000; // $1B
export const PLAYER_COMPANY_FOUNDING_RATE = 0.2;
export const PLAYER_COMPANY_CAPITAL_CALL_RATE = 0.05;
export const PLAYER_COMPANY_CAPITAL_CALL_INTERVAL = 5;
export const PLAYER_COMPANY_DILUTION_RATE = 0.1;
export const PLAYER_COMPANY_INITIAL_SHARES = 100_000;
export const PLAYER_COMPANY_MAX_PRESTIGE = 500;
export const PLAYER_COMPANY_PRESTIGE_BURN_UNIT = 5_000_000; // $50K

export const PLAYER_COMPANY_SECTORS = COMPANY_SECTOR_ORDER.filter(
  (sector) => sector !== "채권",
);

export type PlayerCompanyStatus =
  | "active"
  | "paused"
  | "ipo-requested"
  | "listed";

export interface PlayerCompanyCapitalCall {
  id: string;
  dueSession: number;
  netWorthSnapshot: number;
  amount: number;
  createdAt: number;
}

export interface PlayerCompanyState {
  id: string;
  name: string;
  ticker: string;
  sector: string;
  subsector?: string;
  description?: string;
  status: PlayerCompanyStatus;
  foundedAt: number;
  foundedSession: number;
  foundingNetWorth: number;
  foundingCost: number;
  cumulativeCapitalBurned: number;
  totalShares: number;
  founderShares: number;
  publicShares: number;
  fundedRounds: number;
  dilutionRounds: number;
  refusedRounds: number;
  lastCapitalRoundSession: number;
  nextCapitalRoundSession: number;
  pendingCapitalCall: PlayerCompanyCapitalCall | null;
  lastActionAt: number;
  ipoRequestedAt?: number;
  /** 승인된 정적 시장 종목 id. 운영 배포가 끝나기 전에는 비어 있다. */
  ipoListingStockId?: string;
  /** 실제 개장 시각. 이 시각 전에는 회사 상태와 창업주 지분을 상장 처리하지 않는다. */
  ipoListingAt?: number;
  /** 창업주 보통주가 계좌에 한 번 반영된 시각. 재접속·다기기 중복 지급 방지용. */
  founderSharesGrantedAt?: number;
}

export interface FoundPlayerCompanyInput {
  name: string;
  ticker: string;
  sector: string;
  subsector?: string;
  description?: string;
}

export type PlayerCompanyActionResult = {
  success: boolean;
  message: string;
  company?: PlayerCompanyState;
  cash?: number;
  burned?: number;
};

const finiteNonNegative = (value: unknown, fallback = 0) => {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : fallback;
};

const finiteInteger = (value: unknown, fallback = 0) =>
  Math.max(0, Math.floor(finiteNonNegative(value, fallback)));

export function playerCompanyFoundingCost(netWorth: number): number {
  if (!Number.isFinite(netWorth) || netWorth <= 0) return 0;
  return Math.round(netWorth * PLAYER_COMPANY_FOUNDING_RATE);
}

export function playerCompanyCapitalCallAmount(netWorth: number): number {
  if (!Number.isFinite(netWorth) || netWorth <= 0) return 0;
  return Math.round(netWorth * PLAYER_COMPANY_CAPITAL_CALL_RATE);
}

export function playerCompanyFounderOwnership(
  company: Pick<PlayerCompanyState, "founderShares" | "totalShares">,
): number {
  if (company.totalShares <= 0) return 0;
  return Math.max(0, Math.min(1, company.founderShares / company.totalShares));
}

export function playerCompanyPrestige(
  company: PlayerCompanyState | null | undefined,
): number {
  if (!company) return 0;
  const burnScore =
    Math.log10(
      1 +
        finiteNonNegative(company.cumulativeCapitalBurned) /
          PLAYER_COMPANY_PRESTIGE_BURN_UNIT,
    ) * 80;
  const score =
    burnScore +
    finiteInteger(company.fundedRounds) * 25 +
    finiteInteger(company.dilutionRounds) * 10 -
    finiteInteger(company.refusedRounds) * 15;
  return Math.max(
    0,
    Math.min(PLAYER_COMPANY_MAX_PRESTIGE, Math.round(score)),
  );
}

export function playerCompanyLevel(
  company: PlayerCompanyState | null | undefined,
): number {
  return company
    ? Math.min(10, 1 + Math.floor(playerCompanyPrestige(company) / 50))
    : 0;
}

export function isPlayerCompanyIpoReady(
  company: PlayerCompanyState | null | undefined,
): boolean {
  if (!company || company.status !== "active") return false;
  const resolvedRounds = company.fundedRounds + company.dilutionRounds;
  return (
    company.fundedRounds >= 2 &&
    resolvedRounds >= 4 &&
    playerCompanyFounderOwnership(company) >= 0.5 &&
    playerCompanyPrestige(company) >= 300
  );
}

export function foundPlayerCompany(
  input: FoundPlayerCompanyInput,
  netWorth: number,
  cash: number,
  currentSession: number,
  now = Date.now(),
  reservedTickers: readonly string[] = [],
): PlayerCompanyActionResult {
  const name = input.name.trim();
  const ticker = input.ticker.trim().toUpperCase();
  const subsector = input.subsector?.trim();
  const description = input.description?.trim();

  if (!Number.isFinite(netWorth) || netWorth < PLAYER_COMPANY_MIN_NET_WORTH) {
    return {
      success: false,
      message: "회사 설립은 순자산 $1B 이상부터 가능합니다.",
    };
  }
  if (name.length < 2 || name.length > 30) {
    return { success: false, message: "회사명은 2~30자로 입력해 주세요." };
  }
  if (!/^[A-Z0-9]{2,6}$/.test(ticker)) {
    return {
      success: false,
      message: "티커는 영문 대문자·숫자 2~6자로 입력해 주세요.",
    };
  }
  if (reservedTickers.some((reserved) => reserved.toUpperCase() === ticker)) {
    return { success: false, message: "이미 사용 중인 티커입니다." };
  }
  if (!PLAYER_COMPANY_SECTORS.includes(
    input.sector as (typeof PLAYER_COMPANY_SECTORS)[number],
  )) {
    return { success: false, message: "선택할 수 없는 회사 섹터입니다." };
  }
  if ((subsector?.length ?? 0) > 40) {
    return { success: false, message: "세부 산업은 40자까지 입력할 수 있습니다." };
  }
  if ((description?.length ?? 0) > 300) {
    return { success: false, message: "회사 소개는 300자까지 입력할 수 있습니다." };
  }

  const foundingCost = playerCompanyFoundingCost(netWorth);
  if (!Number.isFinite(cash) || cash < foundingCost) {
    return {
      success: false,
      message: `설립 출자금으로 순자산의 20%에 해당하는 현금이 필요합니다.`,
    };
  }

  const company: PlayerCompanyState = {
    id: `player-company-${now}`,
    name,
    ticker,
    sector: input.sector,
    ...(subsector ? { subsector } : {}),
    ...(description ? { description } : {}),
    status: "active",
    foundedAt: now,
    foundedSession: currentSession,
    foundingNetWorth: netWorth,
    foundingCost,
    cumulativeCapitalBurned: foundingCost,
    totalShares: PLAYER_COMPANY_INITIAL_SHARES,
    founderShares: PLAYER_COMPANY_INITIAL_SHARES,
    publicShares: 0,
    fundedRounds: 0,
    dilutionRounds: 0,
    refusedRounds: 0,
    lastCapitalRoundSession: currentSession,
    nextCapitalRoundSession:
      currentSession + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
    pendingCapitalCall: null,
    lastActionAt: now,
  };

  return {
    success: true,
    message: `${name} 설립 완료 · 출자금이 영구 소각되었습니다.`,
    company,
    cash: cash - foundingCost,
    burned: foundingCost,
  };
}

export function preparePlayerCompanyCapitalCall(
  company: PlayerCompanyState,
  netWorth: number,
  currentSession: number,
  now = Date.now(),
): PlayerCompanyState {
  if (
    company.status !== "active" ||
    company.pendingCapitalCall ||
    currentSession < company.nextCapitalRoundSession
  ) {
    return company;
  }
  const amount = playerCompanyCapitalCallAmount(netWorth);
  if (amount <= 0) return company;
  return {
    ...company,
    pendingCapitalCall: {
      id: `company-call-${company.id}-${currentSession}`,
      dueSession: currentSession,
      netWorthSnapshot: netWorth,
      amount,
      createdAt: now,
    },
    lastActionAt: now,
  };
}

export function fundPlayerCompanyCapitalCall(
  company: PlayerCompanyState,
  cash: number,
  currentSession: number,
  now = Date.now(),
): PlayerCompanyActionResult {
  const call = company.pendingCapitalCall;
  if (!call) return { success: false, message: "처리할 자본 확충 요구가 없습니다." };
  if (!Number.isFinite(cash) || cash < call.amount) {
    return { success: false, message: "자본 확충에 필요한 현금이 부족합니다." };
  }
  const next: PlayerCompanyState = {
    ...company,
    status: "active",
    cumulativeCapitalBurned:
      company.cumulativeCapitalBurned + call.amount,
    fundedRounds: company.fundedRounds + 1,
    lastCapitalRoundSession: currentSession,
    nextCapitalRoundSession:
      currentSession + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
    pendingCapitalCall: null,
    lastActionAt: now,
  };
  return {
    success: true,
    message: "자본 확충 완료 · 출자금이 영구 소각되었습니다.",
    company: next,
    cash: cash - call.amount,
    burned: call.amount,
  };
}

export function dilutePlayerCompanyCapitalCall(
  company: PlayerCompanyState,
  currentSession: number,
  now = Date.now(),
): PlayerCompanyActionResult {
  if (!company.pendingCapitalCall) {
    return { success: false, message: "처리할 자본 확충 요구가 없습니다." };
  }
  const issuedShares = Math.max(
    1,
    Math.ceil(company.totalShares * PLAYER_COMPANY_DILUTION_RATE),
  );
  const next: PlayerCompanyState = {
    ...company,
    status: "active",
    totalShares: company.totalShares + issuedShares,
    publicShares: company.publicShares + issuedShares,
    dilutionRounds: company.dilutionRounds + 1,
    lastCapitalRoundSession: currentSession,
    nextCapitalRoundSession:
      currentSession + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
    pendingCapitalCall: null,
    lastActionAt: now,
  };
  return {
    success: true,
    message: `NPC 시장에 신주 ${issuedShares.toLocaleString()}주를 배정했습니다.`,
    company: next,
  };
}

export function refusePlayerCompanyCapitalCall(
  company: PlayerCompanyState,
  currentSession: number,
  now = Date.now(),
): PlayerCompanyActionResult {
  if (!company.pendingCapitalCall) {
    return { success: false, message: "처리할 자본 확충 요구가 없습니다." };
  }
  return {
    success: true,
    message: "자본 확충을 거절해 회사 운영이 정지되었습니다.",
    company: {
      ...company,
      status: "paused",
      refusedRounds: company.refusedRounds + 1,
      lastCapitalRoundSession: currentSession,
      nextCapitalRoundSession:
        currentSession + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
      pendingCapitalCall: null,
      lastActionAt: now,
    },
  };
}

export function resumePlayerCompany(
  company: PlayerCompanyState,
  netWorth: number,
  currentSession: number,
  now = Date.now(),
): PlayerCompanyActionResult {
  if (company.status !== "paused") {
    return { success: false, message: "운영 정지 상태가 아닙니다." };
  }
  const amount = playerCompanyCapitalCallAmount(netWorth);
  if (amount <= 0) {
    return { success: false, message: "자본 확충 금액을 계산할 수 없습니다." };
  }
  return {
    success: true,
    message: "운영 재개를 위한 자본 확충 요구가 생성되었습니다.",
    company: {
      ...company,
      status: "active",
      pendingCapitalCall: {
        id: `company-resume-${company.id}-${currentSession}`,
        dueSession: currentSession,
        netWorthSnapshot: netWorth,
        amount,
        createdAt: now,
      },
      lastActionAt: now,
    },
  };
}

export function markPlayerCompanyIpoRequested(
  company: PlayerCompanyState,
  now = Date.now(),
): PlayerCompanyActionResult {
  if (!isPlayerCompanyIpoReady(company)) {
    return { success: false, message: "아직 IPO 신청 조건을 충족하지 못했습니다." };
  }
  return {
    success: true,
    message: "IPO 심사 신청이 접수되었습니다.",
    company: {
      ...company,
      status: "ipo-requested",
      pendingCapitalCall: null,
      ipoRequestedAt: now,
      lastActionAt: now,
    },
  };
}

export interface PlayerCompanyIpoReconcileResult {
  company: PlayerCompanyState;
  holdings: Holding[];
  grantedShares: number;
}

/**
 * 운영 승인을 받은 플레이어 회사 IPO를 개장 시각에만 상장 처리한다.
 *
 * 정적 종목 정의가 먼저 배포돼도 listingEpochMs 전에는 아무 변화가 없다. 개장 뒤에는
 * 창업주 지분을 공모가 평단으로 한 번만 계좌에 옮기고 `listed` 상태를 저장한다.
 * 기존 보유분이 있으면 목표 창업주 지분까지의 부족분만 채워 다기기 재시도에도
 * 좌수가 불어나지 않는다.
 */
export function reconcilePlayerCompanyIpo(
  company: PlayerCompanyState | null | undefined,
  holdings: Holding[],
  stocks: StockState[],
  now = Date.now(),
): PlayerCompanyIpoReconcileResult | null {
  if (!company) return null;
  const stock = stocks.find(
    (item) =>
      item.id === company.ipoListingStockId ||
      (item.ticker.toUpperCase() === company.ticker.toUpperCase() &&
        item.leverage === undefined &&
        !item.coveredCallUnderlyingId),
  );
  if (!stock) return null;
  const listingAt = company.ipoListingAt ?? stock.listingEpochMs;
  if (!listingAt || now < listingAt) return null;
  if (company.founderSharesGrantedAt && company.status === "listed") {
    return { company, holdings, grantedShares: 0 };
  }

  const founderShares = Math.max(0, Math.floor(company.founderShares));
  const existing = holdings.find((item) => item.stockId === stock.id);
  const grantedShares = Math.max(
    0,
    founderShares - Math.max(0, existing?.quantity ?? 0),
  );
  let nextHoldings = holdings;
  if (grantedShares > 0) {
    if (existing) {
      const quantity = existing.quantity + grantedShares;
      nextHoldings = holdings.map((item) =>
        item.stockId === stock.id
          ? {
              ...item,
              quantity,
              quantityExact: String(quantity),
              averagePrice:
                (item.averagePrice * item.quantity +
                  stock.initialPrice * grantedShares) /
                quantity,
            }
          : item,
      );
    } else {
      nextHoldings = [
        ...holdings,
        {
          stockId: stock.id,
          quantity: founderShares,
          quantityExact: String(founderShares),
          averagePrice: stock.initialPrice,
        },
      ];
    }
  }

  return {
    company: {
      ...company,
      status: "listed",
      ipoListingStockId: stock.id,
      ipoListingAt: listingAt,
      founderSharesGrantedAt: company.founderSharesGrantedAt ?? now,
      pendingCapitalCall: null,
      lastActionAt: Math.max(company.lastActionAt, now),
    },
    holdings: nextHoldings,
    grantedShares,
  };
}

export function normalizePlayerCompany(
  value: unknown,
): PlayerCompanyState | null {
  if (!value || typeof value !== "object") return null;
  const source = value as Partial<PlayerCompanyState>;
  const name = typeof source.name === "string" ? source.name.trim().slice(0, 30) : "";
  const ticker =
    typeof source.ticker === "string"
      ? source.ticker.trim().toUpperCase().slice(0, 6)
      : "";
  if (!name || !/^[A-Z0-9]{2,6}$/.test(ticker)) return null;

  const status: PlayerCompanyStatus = [
    "active",
    "paused",
    "ipo-requested",
    "listed",
  ].includes(source.status ?? "")
    ? source.status!
    : "active";
  const totalShares = Math.max(
    PLAYER_COMPANY_INITIAL_SHARES,
    finiteInteger(source.totalShares, PLAYER_COMPANY_INITIAL_SHARES),
  );
  const founderShares = Math.min(
    totalShares,
    finiteInteger(source.founderShares, PLAYER_COMPANY_INITIAL_SHARES),
  );
  const publicShares = Math.min(
    totalShares - founderShares,
    finiteInteger(source.publicShares, totalShares - founderShares),
  );
  const foundedSession = finiteInteger(source.foundedSession);
  const pending = source.pendingCapitalCall;
  const pendingCapitalCall =
    pending &&
    typeof pending.id === "string" &&
    finiteNonNegative(pending.amount) > 0
      ? {
          id: pending.id,
          dueSession: finiteInteger(pending.dueSession),
          netWorthSnapshot: finiteNonNegative(pending.netWorthSnapshot),
          amount: finiteNonNegative(pending.amount),
          createdAt: finiteNonNegative(pending.createdAt),
        }
      : null;

  return {
    id:
      typeof source.id === "string" && source.id
        ? source.id
        : `player-company-${finiteNonNegative(source.foundedAt)}`,
    name,
    ticker,
    sector:
      typeof source.sector === "string" &&
      PLAYER_COMPANY_SECTORS.includes(
        source.sector as (typeof PLAYER_COMPANY_SECTORS)[number],
      )
        ? source.sector
        : PLAYER_COMPANY_SECTORS[0],
    ...(typeof source.subsector === "string" && source.subsector.trim()
      ? { subsector: source.subsector.trim().slice(0, 40) }
      : {}),
    ...(typeof source.description === "string" && source.description.trim()
      ? { description: source.description.trim().slice(0, 300) }
      : {}),
    status,
    foundedAt: finiteNonNegative(source.foundedAt),
    foundedSession,
    foundingNetWorth: finiteNonNegative(source.foundingNetWorth),
    foundingCost: finiteNonNegative(source.foundingCost),
    cumulativeCapitalBurned: finiteNonNegative(
      source.cumulativeCapitalBurned,
      finiteNonNegative(source.foundingCost),
    ),
    totalShares,
    founderShares,
    publicShares,
    fundedRounds: finiteInteger(source.fundedRounds),
    dilutionRounds: finiteInteger(source.dilutionRounds),
    refusedRounds: finiteInteger(source.refusedRounds),
    lastCapitalRoundSession: finiteInteger(
      source.lastCapitalRoundSession,
      foundedSession,
    ),
    nextCapitalRoundSession: finiteInteger(
      source.nextCapitalRoundSession,
      foundedSession + PLAYER_COMPANY_CAPITAL_CALL_INTERVAL,
    ),
    pendingCapitalCall,
    lastActionAt: finiteNonNegative(source.lastActionAt, source.foundedAt),
    ...(finiteNonNegative(source.ipoRequestedAt) > 0
      ? { ipoRequestedAt: finiteNonNegative(source.ipoRequestedAt) }
      : {}),
    ...(typeof source.ipoListingStockId === "string" &&
    source.ipoListingStockId.trim()
      ? { ipoListingStockId: source.ipoListingStockId.trim().slice(0, 80) }
      : {}),
    ...(finiteNonNegative(source.ipoListingAt) > 0
      ? { ipoListingAt: finiteNonNegative(source.ipoListingAt) }
      : {}),
    ...(finiteNonNegative(source.founderSharesGrantedAt) > 0
      ? {
          founderSharesGrantedAt: finiteNonNegative(
            source.founderSharesGrantedAt,
          ),
        }
      : {}),
  };
}

export const PLAYER_COMPANY_MANAGEMENT_VERSION = 1;
export const PLAYER_COMPANY_QUARTER_SESSIONS = 24;
export const PLAYER_COMPANY_BOND_MATURITY_SESSIONS = 96;
export const PLAYER_COMPANY_SUPPLY_CONTRACT_SESSIONS = 96;

export type PlayerCompanyCreditRating =
  | "AAA"
  | "AA"
  | "A"
  | "BBB"
  | "BB"
  | "B"
  | "CCC"
  | "정크";

export type PlayerCompanyCrisisStrategy =
  | "restructuring"
  | "cash-defense"
  | "aggressive-investment"
  | "supply-diversification";

export type PlayerCompanySupplyType =
  | "energy"
  | "food"
  | "logistics"
  | "semiconductor";

export interface PlayerCompanyGuidance {
  announcedSession: number;
  resolveSession: number;
  revenueGrowthTarget: number;
  operatingMarginTarget: number;
  status: "pending" | "met" | "missed";
  actualRevenueGrowth?: number;
  actualOperatingMargin?: number;
}

export interface PlayerCompanyBond {
  id: string;
  issuedSession: number;
  maturitySession: number;
  principal: number;
  couponRate: number;
  repaid: boolean;
}

export interface PlayerCompanySupplyContract {
  id: string;
  type: PlayerCompanySupplyType;
  signedSession: number;
  expiresSession: number;
  resilience: number;
}

export interface PlayerCompanyCrisisDecision {
  crisisKey: string;
  crisisLabel: string;
  strategy: PlayerCompanyCrisisStrategy;
  selectedSession: number;
  outcome: string;
}

export interface PlayerCompanyManagementEvent {
  id: string;
  session: number;
  title: string;
  description: string;
  tone: "positive" | "neutral" | "negative";
}

export interface PlayerCompanyManagementState {
  version: 1;
  treasury: number;
  debt: number;
  creditScore: number;
  guidanceCredibility: number;
  regularDividendEnabled: boolean;
  regularDividendRate: number;
  nextRegularDividendSession: number;
  lastRegularDividendSession?: number;
  missedRegularDividends: number;
  talentRetention: number;
  employeeMorale: number;
  stockOptionPoolRate: number;
  cumulativeTalentDepartures: number;
  supplyResilience: number;
  bonds: PlayerCompanyBond[];
  supplyContracts: PlayerCompanySupplyContract[];
  guidance?: PlayerCompanyGuidance;
  crisisDecisions: PlayerCompanyCrisisDecision[];
  history: PlayerCompanyManagementEvent[];
  lastQuarterSession: number;
  lastAdvancedSession: number;
}

export interface PlayerCompanyManagementContext {
  companyId: string;
  ticker: string;
  sector: string;
  capital: number;
  reputation: number;
  currentSession: number;
}

export interface PlayerCompanyManagementResult {
  success: boolean;
  message: string;
  management: PlayerCompanyManagementState;
  reputationDelta?: number;
}

const finite = (value: unknown, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const nonNegative = (value: unknown, fallback = 0) =>
  Math.max(0, finite(value, fallback));

const integer = (value: unknown, fallback = 0) =>
  Math.max(0, Math.floor(nonNegative(value, fallback)));

const clamp = (value: number, min: number, max: number) =>
  Math.max(min, Math.min(max, value));

function unit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4294967296;
}

function event(
  state: PlayerCompanyManagementState,
  input: Omit<PlayerCompanyManagementEvent, "id">,
): PlayerCompanyManagementState {
  const entry: PlayerCompanyManagementEvent = {
    ...input,
    id: `${input.session}-${input.title}-${state.history.length}`,
  };
  return { ...state, history: [entry, ...state.history].slice(0, 20) };
}

export function createPlayerCompanyManagement(
  context: PlayerCompanyManagementContext,
): PlayerCompanyManagementState {
  const capital = Math.max(1, context.capital);
  return {
    version: PLAYER_COMPANY_MANAGEMENT_VERSION,
    treasury: capital * 0.35,
    debt: 0,
    creditScore: 82,
    guidanceCredibility: 70,
    regularDividendEnabled: false,
    regularDividendRate: 0,
    nextRegularDividendSession:
      context.currentSession + PLAYER_COMPANY_QUARTER_SESSIONS,
    missedRegularDividends: 0,
    talentRetention: 86,
    employeeMorale: 75,
    stockOptionPoolRate: 0,
    cumulativeTalentDepartures: 0,
    supplyResilience: 20,
    bonds: [],
    supplyContracts: [],
    crisisDecisions: [],
    history: [],
    lastQuarterSession: context.currentSession,
    lastAdvancedSession: context.currentSession,
  };
}

function normalizeGuidance(value: unknown): PlayerCompanyGuidance | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Partial<PlayerCompanyGuidance>;
  if (
    !["pending", "met", "missed"].includes(source.status ?? "") ||
    !Number.isFinite(Number(source.resolveSession))
  ) {
    return undefined;
  }
  return {
    announcedSession: integer(source.announcedSession),
    resolveSession: integer(source.resolveSession),
    revenueGrowthTarget: clamp(finite(source.revenueGrowthTarget), -20, 100),
    operatingMarginTarget: clamp(finite(source.operatingMarginTarget), -30, 80),
    status: source.status!,
    ...(Number.isFinite(Number(source.actualRevenueGrowth))
      ? { actualRevenueGrowth: finite(source.actualRevenueGrowth) }
      : {}),
    ...(Number.isFinite(Number(source.actualOperatingMargin))
      ? { actualOperatingMargin: finite(source.actualOperatingMargin) }
      : {}),
  };
}

export function normalizePlayerCompanyManagement(
  value: unknown,
  context: PlayerCompanyManagementContext,
): PlayerCompanyManagementState {
  const fallback = createPlayerCompanyManagement(context);
  if (!value || typeof value !== "object") return fallback;
  const source = value as Partial<PlayerCompanyManagementState>;
  const bonds = Array.isArray(source.bonds)
    ? source.bonds
        .filter((item): item is PlayerCompanyBond =>
          Boolean(item && typeof item.id === "string"),
        )
        .slice(-20)
        .map((item) => ({
          id: item.id.slice(0, 100),
          issuedSession: integer(item.issuedSession),
          maturitySession: integer(item.maturitySession),
          principal: nonNegative(item.principal),
          couponRate: clamp(finite(item.couponRate), 0, 1),
          repaid: Boolean(item.repaid),
        }))
    : [];
  const supplyContracts = Array.isArray(source.supplyContracts)
    ? source.supplyContracts
        .filter(
          (item): item is PlayerCompanySupplyContract =>
            Boolean(
              item &&
                typeof item.id === "string" &&
                ["energy", "food", "logistics", "semiconductor"].includes(
                  item.type,
                ),
            ),
        )
        .slice(-12)
        .map((item) => ({
          id: item.id.slice(0, 100),
          type: item.type,
          signedSession: integer(item.signedSession),
          expiresSession: integer(item.expiresSession),
          resilience: clamp(integer(item.resilience), 0, 100),
        }))
    : [];
  const crisisDecisions = Array.isArray(source.crisisDecisions)
    ? source.crisisDecisions
        .filter(
          (item): item is PlayerCompanyCrisisDecision =>
            Boolean(
              item &&
                typeof item.crisisKey === "string" &&
                typeof item.crisisLabel === "string" &&
                [
                  "restructuring",
                  "cash-defense",
                  "aggressive-investment",
                  "supply-diversification",
                ].includes(item.strategy),
            ),
        )
        .slice(-20)
    : [];
  const history = Array.isArray(source.history)
    ? source.history
        .filter(
          (item): item is PlayerCompanyManagementEvent =>
            Boolean(
              item &&
                typeof item.id === "string" &&
                typeof item.title === "string" &&
                typeof item.description === "string",
            ),
        )
        .slice(0, 20)
        .map((item) => ({
          ...item,
          session: integer(item.session),
          tone: ["positive", "neutral", "negative"].includes(item.tone)
            ? item.tone
            : "neutral",
        }))
    : [];

  return {
    version: PLAYER_COMPANY_MANAGEMENT_VERSION,
    treasury: nonNegative(source.treasury, fallback.treasury),
    debt: nonNegative(source.debt),
    creditScore: clamp(integer(source.creditScore, 82), 0, 100),
    guidanceCredibility: clamp(
      integer(source.guidanceCredibility, 70),
      0,
      100,
    ),
    regularDividendEnabled: Boolean(source.regularDividendEnabled),
    regularDividendRate: clamp(finite(source.regularDividendRate), 0, 0.1),
    nextRegularDividendSession: integer(
      source.nextRegularDividendSession,
      fallback.nextRegularDividendSession,
    ),
    ...(Number.isFinite(Number(source.lastRegularDividendSession))
      ? { lastRegularDividendSession: integer(source.lastRegularDividendSession) }
      : {}),
    missedRegularDividends: integer(source.missedRegularDividends),
    talentRetention: clamp(integer(source.talentRetention, 86), 0, 100),
    employeeMorale: clamp(integer(source.employeeMorale, 75), 0, 100),
    stockOptionPoolRate: clamp(finite(source.stockOptionPoolRate), 0, 0.1),
    cumulativeTalentDepartures: integer(source.cumulativeTalentDepartures),
    supplyResilience: clamp(integer(source.supplyResilience, 20), 0, 100),
    bonds,
    supplyContracts,
    ...(normalizeGuidance(source.guidance)
      ? { guidance: normalizeGuidance(source.guidance) }
      : {}),
    crisisDecisions,
    history,
    lastQuarterSession: integer(
      source.lastQuarterSession,
      fallback.lastQuarterSession,
    ),
    lastAdvancedSession: integer(
      source.lastAdvancedSession,
      fallback.lastAdvancedSession,
    ),
  };
}

export function playerCompanyCreditScore(
  management: PlayerCompanyManagementState,
  context: Pick<PlayerCompanyManagementContext, "capital" | "reputation">,
): number {
  const assets = Math.max(1, context.capital + management.treasury);
  const debtRatio = management.debt / assets;
  const cashRatio = management.treasury / assets;
  const raw =
    52 +
    cashRatio * 80 -
    debtRatio * 120 +
    management.guidanceCredibility * 0.18 +
    management.talentRetention * 0.09 +
    context.reputation * 0.08 -
    management.missedRegularDividends * 5;
  return clamp(Math.round(raw), 0, 100);
}

export function playerCompanyCreditRating(
  score: number,
): PlayerCompanyCreditRating {
  if (score >= 92) return "AAA";
  if (score >= 84) return "AA";
  if (score >= 74) return "A";
  if (score >= 64) return "BBB";
  if (score >= 54) return "BB";
  if (score >= 44) return "B";
  if (score >= 32) return "CCC";
  return "정크";
}

export function playerCompanyBondCouponRate(
  rating: PlayerCompanyCreditRating,
  benchmarkRatePercent: number,
): number {
  const spread: Record<PlayerCompanyCreditRating, number> = {
    AAA: 0.6,
    AA: 1.0,
    A: 1.6,
    BBB: 2.5,
    BB: 4.2,
    B: 6.5,
    CCC: 10,
    정크: 16,
  };
  return clamp((Math.max(0, benchmarkRatePercent) + spread[rating]) / 100, 0, 0.3);
}

export function playerCompanyHallOfFameScore(
  management: PlayerCompanyManagementState,
  context: Pick<PlayerCompanyManagementContext, "capital" | "reputation">,
): number {
  const rating = playerCompanyCreditScore(management, context);
  return Math.max(
    0,
    Math.round(
      Math.log10(1 + Math.max(0, context.capital)) * 70 +
        context.reputation * 2 +
        management.guidanceCredibility * 1.5 +
        management.talentRetention +
        management.supplyResilience +
        rating * 2 -
        management.missedRegularDividends * 20,
    ),
  );
}

export function announcePlayerCompanyGuidance(
  management: PlayerCompanyManagementState,
  context: PlayerCompanyManagementContext,
  revenueGrowthTarget: number,
  operatingMarginTarget: number,
): PlayerCompanyManagementResult {
  if (management.guidance?.status === "pending") {
    return {
      success: false,
      message: "이미 다음 분기 실적 가이던스가 발표되어 있습니다.",
      management,
    };
  }
  if (
    !Number.isFinite(revenueGrowthTarget) ||
    revenueGrowthTarget < -20 ||
    revenueGrowthTarget > 100 ||
    !Number.isFinite(operatingMarginTarget) ||
    operatingMarginTarget < -30 ||
    operatingMarginTarget > 80
  ) {
    return {
      success: false,
      message: "매출 성장률은 -20~100%, 영업이익률은 -30~80%로 입력해 주세요.",
      management,
    };
  }
  let next: PlayerCompanyManagementState = {
    ...management,
    guidance: {
      announcedSession: context.currentSession,
      resolveSession:
        context.currentSession + PLAYER_COMPANY_QUARTER_SESSIONS,
      revenueGrowthTarget,
      operatingMarginTarget,
      status: "pending",
    },
  };
  next = event(next, {
    session: context.currentSession,
    title: "다음 분기 실적 가이던스 발표",
    description: `매출 성장 ${revenueGrowthTarget.toFixed(1)}%, 영업이익률 ${operatingMarginTarget.toFixed(1)}%를 목표로 제시했습니다.`,
    tone: "neutral",
  });
  return {
    success: true,
    message: "가이던스를 발표했습니다. 24거래일 뒤 달성 여부가 공개됩니다.",
    management: next,
  };
}

export function issuePlayerCompanyBond(
  management: PlayerCompanyManagementState,
  context: PlayerCompanyManagementContext,
  capitalRate: number,
  benchmarkRatePercent: number,
): PlayerCompanyManagementResult {
  if (![0.05, 0.1, 0.2].includes(capitalRate)) {
    return { success: false, message: "발행 규모를 다시 선택해 주세요.", management };
  }
  if (
    management.bonds.some(
      (bond) =>
        !bond.repaid && bond.issuedSession === context.currentSession,
    )
  ) {
    return {
      success: false,
      message: "회사채는 한 거래일에 한 번만 발행할 수 있습니다.",
      management,
    };
  }
  const assets = Math.max(1, context.capital + management.treasury);
  if ((management.debt + context.capital * capitalRate) / assets > 1.5) {
    return {
      success: false,
      message: "발행 후 부채비율이 150%를 넘는 회사채는 인수되지 않습니다.",
      management,
    };
  }
  const score = playerCompanyCreditScore(management, context);
  const rating = playerCompanyCreditRating(score);
  if (rating === "정크" && capitalRate > 0.05) {
    return {
      success: false,
      message: "정크 등급에서는 자본의 5%까지만 회사채를 발행할 수 있습니다.",
      management,
    };
  }
  const principal = Math.max(1, Math.round(context.capital * capitalRate));
  const couponRate = playerCompanyBondCouponRate(rating, benchmarkRatePercent);
  const bond: PlayerCompanyBond = {
    id: `bond-${context.companyId}-${context.currentSession}`,
    issuedSession: context.currentSession,
    maturitySession:
      context.currentSession + PLAYER_COMPANY_BOND_MATURITY_SESSIONS,
    principal,
    couponRate,
    repaid: false,
  };
  let next: PlayerCompanyManagementState = {
    ...management,
    treasury: management.treasury + principal,
    debt: management.debt + principal,
    bonds: [...management.bonds, bond].slice(-20),
    creditScore: clamp(score - Math.round(capitalRate * 45), 0, 100),
  };
  next = event(next, {
    session: context.currentSession,
    title: `${rating} 등급 회사채 발행`,
    description: `자본의 ${(capitalRate * 100).toFixed(0)}%를 연 ${(couponRate * 100).toFixed(2)}%로 조달했습니다. 96거래일 뒤 만기입니다.`,
    tone: capitalRate >= 0.2 ? "negative" : "neutral",
  });
  return {
    success: true,
    message: `회사채 발행 완료 · 연 ${(couponRate * 100).toFixed(2)}% · 96거래일 만기`,
    management: next,
  };
}

export function setPlayerCompanyRegularDividendPolicy(
  management: PlayerCompanyManagementState,
  context: PlayerCompanyManagementContext,
  enabled: boolean,
  rate: number,
): PlayerCompanyManagementResult {
  const normalized = clamp(rate, 0, 0.1);
  if (enabled && normalized <= 0) {
    return {
      success: false,
      message: "정기배당 비율을 0%보다 크게 설정해 주세요.",
      management,
    };
  }
  let next: PlayerCompanyManagementState = {
    ...management,
    regularDividendEnabled: enabled,
    regularDividendRate: enabled ? normalized : 0,
    nextRegularDividendSession: enabled
      ? Math.max(
          context.currentSession + 1,
          management.nextRegularDividendSession ||
            context.currentSession + PLAYER_COMPANY_QUARTER_SESSIONS,
        )
      : context.currentSession + PLAYER_COMPANY_QUARTER_SESSIONS,
  };
  next = event(next, {
    session: context.currentSession,
    title: enabled ? "정기배당 정책 채택" : "정기배당 정책 중단",
    description: enabled
      ? `24거래일마다 창업주 계좌 총자산의 ${(normalized * 100).toFixed(2)}%를 배당 재원으로 예약합니다.`
      : "자동 정기배당을 중단했습니다. 배당 연속 기록과 주주 신뢰에 영향을 줄 수 있습니다.",
    tone: enabled ? "positive" : "negative",
  });
  return {
    success: true,
    message: enabled
      ? "정기배당 정책을 저장했습니다."
      : "정기배당 정책을 중단했습니다.",
    management: next,
    reputationDelta: enabled ? 1 : -2,
  };
}

export function signPlayerCompanySupplyContract(
  management: PlayerCompanyManagementState,
  context: PlayerCompanyManagementContext,
  type: PlayerCompanySupplyType,
): PlayerCompanyManagementResult {
  const active = management.supplyContracts.some(
    (contract) =>
      contract.type === type && contract.expiresSession > context.currentSession,
  );
  if (active) {
    return { success: false, message: "같은 공급망 계약이 이미 유효합니다.", management };
  }
  const cost = Math.max(1, context.capital * 0.03);
  if (management.treasury < cost) {
    return {
      success: false,
      message: "계약 보증금으로 회사 자본의 3%에 해당하는 회사 현금이 필요합니다.",
      management,
    };
  }
  const resilienceByType: Record<PlayerCompanySupplyType, number> = {
    energy: 14,
    food: 10,
    logistics: 12,
    semiconductor: 13,
  };
  const contract: PlayerCompanySupplyContract = {
    id: `supply-${type}-${context.currentSession}`,
    type,
    signedSession: context.currentSession,
    expiresSession:
      context.currentSession + PLAYER_COMPANY_SUPPLY_CONTRACT_SESSIONS,
    resilience: resilienceByType[type],
  };
  let next: PlayerCompanyManagementState = {
    ...management,
    treasury: management.treasury - cost,
    supplyResilience: clamp(
      management.supplyResilience + resilienceByType[type],
      0,
      100,
    ),
    supplyContracts: [...management.supplyContracts, contract].slice(-12),
  };
  next = event(next, {
    session: context.currentSession,
    title: "장기 공급계약 체결",
    description: `${supplyTypeLabel(type)} 공급망을 96거래일 동안 확보했습니다. 위기 손실 방어력이 높아집니다.`,
    tone: "positive",
  });
  return {
    success: true,
    message: `${supplyTypeLabel(type)} 공급계약 체결 · 회복력 +${resilienceByType[type]}`,
    management: next,
  };
}

export function setPlayerCompanyStockOptionPolicy(
  management: PlayerCompanyManagementState,
  context: PlayerCompanyManagementContext,
  rate: number,
): PlayerCompanyManagementResult {
  if (!Number.isFinite(rate) || rate < 0 || rate > 0.1) {
    return {
      success: false,
      message: "스톡옵션 풀은 총주식의 0~10%로 설정해 주세요.",
      management,
    };
  }
  const previous = management.stockOptionPoolRate;
  const delta = rate - previous;
  let next: PlayerCompanyManagementState = {
    ...management,
    stockOptionPoolRate: rate,
    talentRetention: clamp(
      management.talentRetention + Math.round(delta * 180),
      0,
      100,
    ),
    employeeMorale: clamp(
      management.employeeMorale + Math.round(delta * 130),
      0,
      100,
    ),
  };
  next = event(next, {
    session: context.currentSession,
    title: "임직원 스톡옵션 정책 변경",
    description: `옵션 풀을 총주식의 ${(rate * 100).toFixed(1)}%로 설정했습니다. 인재 유지에는 유리하지만 향후 희석 부담이 생깁니다.`,
    tone: rate > previous ? "positive" : rate < previous ? "negative" : "neutral",
  });
  return {
    success: true,
    message: "스톡옵션 정책을 저장했습니다.",
    management: next,
  };
}

export function choosePlayerCompanyCrisisStrategy(
  management: PlayerCompanyManagementState,
  context: PlayerCompanyManagementContext,
  crisisKey: string,
  crisisLabel: string,
  strategy: PlayerCompanyCrisisStrategy,
): PlayerCompanyManagementResult {
  if (
    management.crisisDecisions.some(
      (decision) => decision.crisisKey === crisisKey,
    )
  ) {
    return { success: false, message: "이번 위기 대응안은 이미 확정됐습니다.", management };
  }
  const capital = Math.max(1, context.capital);
  let treasuryDelta = 0;
  let talentDelta = 0;
  let moraleDelta = 0;
  let resilienceDelta = 0;
  let creditDelta = 0;
  let reputationDelta = 0;
  let outcome = "";
  if (strategy === "restructuring") {
    treasuryDelta = capital * 0.08;
    talentDelta = -12;
    moraleDelta = -18;
    creditDelta = 5;
    reputationDelta = -3;
    outcome = "비용 구조는 개선됐지만 핵심 인재 이탈 위험이 커졌습니다.";
  } else if (strategy === "cash-defense") {
    creditDelta = 7;
    moraleDelta = -4;
    resilienceDelta = 5;
    reputationDelta = 1;
    outcome = "현금과 신용등급을 지켰지만 단기 성장 기회를 일부 포기했습니다.";
  } else if (strategy === "aggressive-investment") {
    const cost = capital * 0.12;
    if (management.treasury < cost) {
      return {
        success: false,
        message: "공격적 투자에는 회사 자본의 12%에 해당하는 회사 현금이 필요합니다.",
        management,
      };
    }
    const success =
      unit(`${context.companyId}:${crisisKey}:aggressive`) <
      0.42 + management.talentRetention / 500;
    treasuryDelta = -cost;
    creditDelta = success ? 2 : -8;
    reputationDelta = success ? 8 : -6;
    moraleDelta = success ? 10 : -8;
    outcome = success
      ? "불황기 투자가 성공해 경쟁사 점유율과 회사 명성을 확보했습니다."
      : "투자 회수가 늦어져 현금과 시장 신뢰가 함께 약해졌습니다.";
  } else {
    const cost = capital * 0.07;
    if (management.treasury < cost) {
      return {
        success: false,
        message: "공급망 다변화에는 회사 자본의 7%에 해당하는 회사 현금이 필요합니다.",
        management,
      };
    }
    treasuryDelta = -cost;
    resilienceDelta = 20;
    creditDelta = 3;
    reputationDelta = 4;
    outcome = "조달처를 분산해 원자재·전쟁·물류 충격의 손실을 줄였습니다.";
  }
  const decision: PlayerCompanyCrisisDecision = {
    crisisKey,
    crisisLabel,
    strategy,
    selectedSession: context.currentSession,
    outcome,
  };
  let next: PlayerCompanyManagementState = {
    ...management,
    treasury: Math.max(0, management.treasury + treasuryDelta),
    talentRetention: clamp(management.talentRetention + talentDelta, 0, 100),
    employeeMorale: clamp(management.employeeMorale + moraleDelta, 0, 100),
    supplyResilience: clamp(
      management.supplyResilience + resilienceDelta,
      0,
      100,
    ),
    creditScore: clamp(management.creditScore + creditDelta, 0, 100),
    crisisDecisions: [...management.crisisDecisions, decision].slice(-20),
  };
  next = event(next, {
    session: context.currentSession,
    title: `${crisisLabel} 비상 이사회`,
    description: outcome,
    tone: reputationDelta >= 3 ? "positive" : reputationDelta < 0 ? "negative" : "neutral",
  });
  return {
    success: true,
    message: outcome,
    management: next,
    reputationDelta,
  };
}

export function advancePlayerCompanyManagement(
  management: PlayerCompanyManagementState,
  context: PlayerCompanyManagementContext,
): PlayerCompanyManagementResult {
  if (context.currentSession <= management.lastAdvancedSession) {
    return { success: false, message: "정산할 새 거래일이 없습니다.", management };
  }
  let next = {
    ...management,
    bonds: management.bonds.map((bond) => ({ ...bond })),
    supplyContracts: management.supplyContracts.filter(
      (contract) => contract.expiresSession > context.currentSession,
    ),
    lastAdvancedSession: context.currentSession,
  };
  let reputationDelta = 0;

  for (const bond of next.bonds) {
    if (bond.repaid || bond.maturitySession > context.currentSession) continue;
    const repayment = bond.principal * (1 + bond.couponRate);
    if (next.treasury >= repayment) {
      next.treasury -= repayment;
      next.debt = Math.max(0, next.debt - bond.principal);
      bond.repaid = true;
      next.creditScore = clamp(next.creditScore + 3, 0, 100);
      next = event(next, {
        session: bond.maturitySession,
        title: "회사채 만기 상환",
        description: "원금과 이자를 정상 상환해 신용평가가 개선됐습니다.",
        tone: "positive",
      });
    } else {
      next.creditScore = clamp(next.creditScore - 20, 0, 100);
      reputationDelta -= 8;
      next = event(next, {
        session: bond.maturitySession,
        title: "회사채 상환 부족",
        description: "회사 현금이 원리금보다 부족해 신용등급과 시장 신뢰가 급락했습니다.",
        tone: "negative",
      });
    }
  }

  if (
    next.guidance?.status === "pending" &&
    next.guidance.resolveSession <= context.currentSession
  ) {
    const quarter = next.guidance.resolveSession;
    const talentBoost = (next.talentRetention - 70) * 0.08;
    const supplyBoost = next.supplyResilience * 0.025;
    const revenueGrowth =
      -3 +
      unit(`${context.companyId}:${quarter}:revenue`) * 24 +
      talentBoost +
      supplyBoost;
    const operatingMargin =
      3 +
      unit(`${context.companyId}:${quarter}:margin`) * 19 +
      talentBoost * 0.6 -
      (next.debt / Math.max(1, context.capital)) * 8;
    const met =
      revenueGrowth >= next.guidance.revenueGrowthTarget &&
      operatingMargin >= next.guidance.operatingMarginTarget;
    next.guidance = {
      ...next.guidance,
      status: met ? "met" : "missed",
      actualRevenueGrowth: revenueGrowth,
      actualOperatingMargin: operatingMargin,
    };
    next.guidanceCredibility = clamp(
      next.guidanceCredibility + (met ? 8 : -13),
      0,
      100,
    );
    reputationDelta += met ? 6 : -8;
    next.treasury = Math.max(
      0,
      next.treasury +
        context.capital *
          (Math.max(-0.1, operatingMargin / 100) * 0.22),
    );
    next = event(next, {
      session: quarter,
      title: met ? "실적 가이던스 달성" : "실적 가이던스 미달",
      description: `실제 매출 성장 ${revenueGrowth.toFixed(1)}%, 영업이익률 ${operatingMargin.toFixed(1)}%로 집계됐습니다.`,
      tone: met ? "positive" : "negative",
    });
  }

  const elapsedQuarters = Math.floor(
    (context.currentSession - next.lastQuarterSession) /
      PLAYER_COMPANY_QUARTER_SESSIONS,
  );
  if (elapsedQuarters > 0) {
    const optionBoost = next.stockOptionPoolRate * 120;
    for (let index = 1; index <= Math.min(elapsedQuarters, 12); index += 1) {
      const quarterSession =
        next.lastQuarterSession + index * PLAYER_COMPANY_QUARTER_SESSIONS;
      const departurePressure =
        9 -
        optionBoost -
        (next.employeeMorale - 50) * 0.08 +
        unit(`${context.companyId}:${quarterSession}:talent`) * 7;
      const departures = Math.max(0, Math.round(departurePressure));
      next.cumulativeTalentDepartures += departures;
      next.talentRetention = clamp(
        next.talentRetention + Math.round(optionBoost * 0.35) - departures,
        0,
        100,
      );
      next.employeeMorale = clamp(
        next.employeeMorale + Math.round(optionBoost * 0.2) - Math.ceil(departures / 2),
        0,
        100,
      );
    }
    next.lastQuarterSession +=
      elapsedQuarters * PLAYER_COMPANY_QUARTER_SESSIONS;
  }
  next.creditScore = playerCompanyCreditScore(next, context);
  return {
    success: true,
    message: "회사 분기 재무·인재 상태를 최신 거래일로 정산했습니다.",
    management: next,
    ...(reputationDelta ? { reputationDelta } : {}),
  };
}

export function markPlayerCompanyRegularDividendResult(
  management: PlayerCompanyManagementState,
  context: PlayerCompanyManagementContext,
  success: boolean,
  reason?: string,
): PlayerCompanyManagementState {
  let next: PlayerCompanyManagementState = {
    ...management,
    nextRegularDividendSession:
      context.currentSession + PLAYER_COMPANY_QUARTER_SESSIONS,
    ...(success
      ? { lastRegularDividendSession: context.currentSession }
      : {
          missedRegularDividends: management.missedRegularDividends + 1,
          guidanceCredibility: clamp(management.guidanceCredibility - 5, 0, 100),
        }),
  };
  next = event(next, {
    session: context.currentSession,
    title: success ? "정기배당 예약 완료" : "정기배당 미실시",
    description: success
      ? `정책 비율 ${(management.regularDividendRate * 100).toFixed(2)}%의 배당이 다음 배당일에 지급됩니다.`
      : reason || "현금 부족 또는 배당 예약 실패로 정기배당 연속 기록이 중단됐습니다.",
    tone: success ? "positive" : "negative",
  });
  return next;
}

export function supplyTypeLabel(type: PlayerCompanySupplyType): string {
  return {
    energy: "에너지",
    food: "식품",
    logistics: "물류",
    semiconductor: "반도체",
  }[type];
}

export function crisisStrategyLabel(strategy: PlayerCompanyCrisisStrategy): string {
  return {
    restructuring: "구조조정",
    "cash-defense": "현금 방어",
    "aggressive-investment": "공격적 투자",
    "supply-diversification": "공급망 다변화",
  }[strategy];
}

import { getCharacterById } from "@/data/characters";
import { getCompanyDefinitions } from "@/data/stocks";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import { seededRand } from "@/lib/market/engine";
import type { Character, MarketEvent, StockDefinition } from "@/lib/types/market";

/** 기업행동 하나가 예고→조건 공개→결과로 진행되는 간격. */
export const CORPORATE_ACTION_WINDOW_SESSIONS = 10;

export type CorporateActionKind =
  | "buyback"
  | "acquisition"
  | "rights_issue"
  | "spin_off";

export interface CorporateActionArc {
  id: string;
  windowStart: number;
  reviewSession: number;
  resolveSession: number;
  company: StockDefinition;
  character?: Character;
  kind: CorporateActionKind;
  positive: boolean;
  signalPositive: boolean;
  impact: number;
}

// 기존 저장 시장과 신규 접속자의 가격 경로가 갈라지지 않도록 배포 이후의
// 첫 정각부터 사건을 시작한다. 2026-07-14 03:00 KST.
export const CORPORATE_ACTION_EPOCH_SESSION = Math.floor(
  Date.UTC(2026, 6, 13, 18, 0, 0) / SESSION_DURATION_MS,
);

export function corporateActionWindowStart(session: number): number {
  if (session <= CORPORATE_ACTION_EPOCH_SESSION) {
    return CORPORATE_ACTION_EPOCH_SESSION;
  }
  const elapsed = session - CORPORATE_ACTION_EPOCH_SESSION;
  return (
    CORPORATE_ACTION_EPOCH_SESSION +
    Math.floor(elapsed / CORPORATE_ACTION_WINDOW_SESSIONS) *
      CORPORATE_ACTION_WINDOW_SESSIONS
  );
}

export function getCorporateActionArcForWindow(
  windowStart: number,
): CorporateActionArc {
  const rand = seededRand(windowStart, "corporate-action-arc");
  const companies = getCompanyDefinitions().filter(
    (company) => company.ceoId && !company.etfHoldings?.length,
  );
  const company =
    companies[Math.floor(rand() * companies.length)] ?? companies[0];
  const kinds: CorporateActionKind[] = [
    "buyback",
    "acquisition",
    "rights_issue",
    "spin_off",
  ];
  const kind = kinds[Math.floor(rand() * kinds.length)] ?? "buyback";
  const positiveChance: Record<CorporateActionKind, number> = {
    buyback: 0.68,
    acquisition: 0.55,
    rights_issue: 0.42,
    spin_off: 0.6,
  };
  const positive = rand() < positiveChance[kind];
  const signalReliable = rand() < 0.72;
  const signalPositive = signalReliable ? positive : !positive;

  return {
    id: `corp-${windowStart}-${company.id}-${kind}`,
    windowStart,
    reviewSession: windowStart + 3,
    resolveSession: windowStart + 6,
    company,
    character: getCharacterById(company.ceoId),
    kind,
    positive,
    signalPositive,
    impact: (0.04 + rand() * 0.025) * (positive ? 1 : -1),
  };
}

export function getCorporateActionArcAtSession(
  session: number,
): CorporateActionArc {
  return getCorporateActionArcForWindow(corporateActionWindowStart(session));
}

function actionName(kind: CorporateActionKind): string {
  const names: Record<CorporateActionKind, string> = {
    buyback: "자사주 매입",
    acquisition: "대형 인수합병",
    rights_issue: "유상증자",
    spin_off: "핵심 사업 분할",
  };
  return names[kind];
}

function openingCopy(arc: CorporateActionArc): [string, string, string] {
  const name = arc.company.name;
  const copy: Record<CorporateActionKind, [string, string, string]> = {
    buyback: [
      `${name}, 대규모 자사주 매입 검토`,
      "이사회가 유통 주식 수를 줄이는 자사주 매입안을 검토하기 시작했습니다. 규모와 소각 여부는 아직 정해지지 않았습니다.",
      "주주가치와 재무 여력을 함께 따져 최종 규모를 결정하겠습니다.",
    ],
    acquisition: [
      `${name}, 전략적 대형 인수 추진`,
      "신규 성장동력 확보를 위한 인수 협상이 시작됐습니다. 인수가격과 자금 조달 조건이 성패를 가를 전망입니다.",
      "외형보다 장기 시너지가 분명한 거래만 성사시키겠습니다.",
    ],
    rights_issue: [
      `${name}, 성장 투자 목적 유상증자 검토`,
      "대규모 설비와 연구개발 자금을 마련하기 위한 신주 발행안이 검토되고 있습니다. 기존 주주 희석 우려도 제기됩니다.",
      "조달 자금의 수익성과 주주 희석을 모두 공개하겠습니다.",
    ],
    spin_off: [
      `${name}, 핵심 사업 분할안 공개`,
      "사업별 가치를 분리해 평가받기 위한 조직 분할안이 공개됐습니다. 중복 비용과 지배구조 변화가 쟁점입니다.",
      "각 사업이 독립적으로 더 빠르게 성장할 구조를 만들겠습니다.",
    ],
  };
  return copy[arc.kind];
}

function reviewCopy(arc: CorporateActionArc): [string, string, string] {
  const name = arc.company.name;
  const positive = arc.signalPositive;
  const action = actionName(arc.kind);
  return positive
    ? [
        `${name} ${action}, 주주 친화 조건 윤곽`,
        "공개된 중간 조건에서 재무 부담은 예상보다 작고 주당 가치 개선 가능성이 확인됐습니다. 최종 이사회 결의는 남아 있습니다.",
        "시장이 우려한 위험을 줄이면서 계획의 핵심 효과는 지켰습니다.",
      ]
    : [
        `${name} ${action}, 비용·희석 우려 확대`,
        "중간 검토에서 자금 부담과 주당 가치 희석 가능성이 부각됐습니다. 최종 조건이 달라질 여지는 남아 있습니다.",
        "불리한 조건을 그대로 밀어붙이지 않고 마지막까지 조정하겠습니다.",
      ];
}

function resolutionCopy(arc: CorporateActionArc): [string, string, string] {
  const name = arc.company.name;
  const action = actionName(arc.kind);
  return arc.positive
    ? [
        `${name} ${action}, 최종안 주주가치 개선 판정`,
        "최종 이사회 결의와 세부 조건이 공개됐습니다. 재무 부담보다 성장·주당 가치 개선 효과가 크다는 평가가 우세합니다.",
        "약속한 조건을 지켰습니다. 이제 실행 결과로 증명하겠습니다.",
      ]
    : [
        `${name} ${action}, 최종 조건 실망`,
        "최종안에서 높은 비용과 주주가치 희석이 확인됐습니다. 시장은 기대했던 개선 효과보다 재무 위험을 크게 반영하고 있습니다.",
        "결과에 대한 책임을 피하지 않고 후속 보완책을 마련하겠습니다.",
      ];
}

/** 해당 거래일에 공개할 기업행동 단계. 단계가 없는 날은 null. */
export function getCorporateActionEventForSession(
  session: number,
): MarketEvent | null {
  if (session < CORPORATE_ACTION_EPOCH_SESSION) return null;
  const arc = getCorporateActionArcAtSession(session);
  const speaker = arc.character
    ? `${arc.character.emoji} ${arc.character.name}`
    : undefined;
  const common = {
    affectedStockIds: [arc.company.id],
    timestamp: session * SESSION_DURATION_MS,
    category: "company" as const,
    quoteBy: speaker,
  };

  if (session === arc.windowStart) {
    const [title, description, quote] = openingCopy(arc);
    return {
      ...common,
      id: `${arc.id}-proposal`,
      title,
      description,
      quote,
      impact: 0,
      tag: "기업행동",
      storyStageLabel: "기업행동 1단계 · 제안",
    };
  }
  if (session === arc.reviewSession) {
    const [title, description, quote] = reviewCopy(arc);
    return {
      ...common,
      id: `${arc.id}-review`,
      title,
      description,
      quote,
      impact: arc.signalPositive ? 0.012 : -0.012,
      tag: "조건 공개",
      storyStageLabel: "기업행동 2단계 · 검토",
    };
  }
  if (session === arc.resolveSession) {
    const [title, description, quote] = resolutionCopy(arc);
    return {
      ...common,
      id: `${arc.id}-resolution`,
      title,
      description,
      quote,
      impact: arc.impact,
      tag: arc.positive ? "가치 개선" : "가치 훼손",
      storyStageLabel: "기업행동 3단계 · 결의",
    };
  }
  return null;
}

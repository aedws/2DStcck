import { getCharacterById } from "@/data/characters";
import { getCompanyDefinitions } from "@/data/stocks";
import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "@/lib/market/constants";
import { seededRand } from "@/lib/market/engine";
import type { Character, MarketEvent, StockDefinition } from "@/lib/types/market";

/** 한 연속 사건이 차지하는 거래일 수. 투자 의뢰 회차와 같은 그리드를 쓴다. */
export const STORY_WINDOW_SESSIONS = 5;

export type StoryTheme = "contract" | "earnings" | "product" | "scandal";

export interface MarketStoryArc {
  id: string;
  windowStart: number;
  clueSession: number;
  resolveSession: number;
  company: StockDefinition;
  character?: Character;
  theme: StoryTheme;
  positive: boolean;
  impact: number;
  cluePositive: boolean;
  confidence: number;
}

const EPOCH_SESSION = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);

export function storyWindowStart(session: number): number {
  const elapsed = session - EPOCH_SESSION;
  return EPOCH_SESSION + Math.floor(elapsed / STORY_WINDOW_SESSIONS) * STORY_WINDOW_SESSIONS;
}

function reliabilityFor(character?: Character): number {
  if (!character) return 0.58;
  let reliability = 0.64;
  const reliable = new Set(["성실", "천재", "워커홀릭", "원칙주의", "냉철"]);
  const noisy = new Set(["사고뭉치", "도박사", "회피형", "변덕", "폭주"]);
  for (const trait of character.traits) {
    if (reliable.has(trait)) reliability += 0.055;
    if (noisy.has(trait)) reliability -= 0.055;
  }
  return Math.min(0.86, Math.max(0.48, reliability));
}

/** 회차마다 모든 플레이어에게 동일한 회사·결말·단서를 생성한다. */
export function getStoryArcForWindow(windowStart: number): MarketStoryArc {
  const rand = seededRand(windowStart, "character-story-arc");
  const companies = getCompanyDefinitions().filter((company) => company.ceoId);
  const company = companies[Math.floor(rand() * companies.length)] ?? companies[0];
  const character = getCharacterById(company?.ceoId);
  const themes: StoryTheme[] = ["contract", "earnings", "product", "scandal"];
  const theme = themes[Math.floor(rand() * themes.length)] ?? "earnings";
  const positive = rand() >= (theme === "scandal" ? 0.58 : 0.43);
  const confidence = reliabilityFor(character);
  const cluePositive = rand() < confidence ? positive : !positive;

  return {
    id: `story-${windowStart}-${company.id}`,
    windowStart,
    clueSession: windowStart + 2,
    resolveSession: windowStart + 4,
    company,
    character,
    theme,
    positive,
    impact: (0.055 + rand() * 0.025) * (positive ? 1 : -1),
    cluePositive,
    confidence: Math.round(confidence * 100),
  };
}

export function getStoryArcAtSession(session: number): MarketStoryArc {
  return getStoryArcForWindow(storyWindowStart(session));
}

function themeNoun(theme: StoryTheme): string {
  switch (theme) {
    case "contract":
      return "대형 계약";
    case "earnings":
      return "분기 실적";
    case "product":
      return "비밀 신제품";
    case "scandal":
      return "경영진 의혹";
  }
}

function resolutionCopy(arc: MarketStoryArc): { title: string; description: string } {
  const company = arc.company.name;
  if (arc.positive) {
    const copy: Record<StoryTheme, [string, string]> = {
      contract: [`${company}, 초대형 계약 최종 체결`, "협상 타결이 공식 확인되며 장기 매출 기대가 크게 높아졌습니다."],
      earnings: [`${company}, 깜짝 실적 발표`, "매출과 이익이 시장 예상을 웃돌며 재평가가 시작됐습니다."],
      product: [`${company}, 비밀 신제품 호평`, "공개된 신제품의 초기 반응이 기대를 크게 웃돌고 있습니다."],
      scandal: [`${company}, 경영진 의혹 해소`, "감사 결과 핵심 의혹이 사실이 아닌 것으로 확인됐습니다."],
    };
    const [title, description] = copy[arc.theme];
    return { title, description };
  }
  const copy: Record<StoryTheme, [string, string]> = {
    contract: [`${company}, 대형 계약 협상 결렬`, "핵심 조건에서 이견을 좁히지 못해 계약이 무산됐습니다."],
    earnings: [`${company}, 실적 쇼크 확인`, "비용 급증과 매출 둔화가 동시에 확인되며 전망치가 낮아졌습니다."],
    product: [`${company}, 신제품 출시 연기`, "완성도 문제로 출시 일정이 미뤄지며 투자 심리가 위축됐습니다."],
    scandal: [`${company}, 경영진 의혹 사실로`, "내부 조사에서 핵심 의혹이 확인돼 경영 공백 우려가 커졌습니다."],
  };
  const [title, description] = copy[arc.theme];
  return { title, description };
}

/** 해당 거래일 시작에 공개할 사건 단계. 단계가 없는 날은 null. */
export function getStoryEventForSession(session: number): MarketEvent | null {
  const arc = getStoryArcAtSession(session);
  const timestamp = session * SESSION_DURATION_MS;
  const speaker = arc.character
    ? `${arc.character.emoji} ${arc.character.name}`
    : undefined;
  const common = {
    affectedStockIds: [arc.company.id],
    timestamp,
    category: "company" as const,
    storyId: arc.id,
    storyWindowStart: arc.windowStart,
    storyResolveSession: arc.resolveSession,
  };

  if (session === arc.windowStart) {
    return {
      ...common,
      id: `${arc.id}-rumor`,
      title: `${arc.company.name}, ${themeNoun(arc.theme)} 관련 긴급 발표 예고`,
      description: `${arc.character?.name ?? "경영진"}이 며칠 안에 중대한 발표를 하겠다고 밝혔습니다. 아직 방향은 확인되지 않았습니다.`,
      impact: 0,
      tag: "예고",
      quote: "지금은 자세히 말할 수 없지만, 곧 결과로 보여드리겠습니다.",
      quoteBy: speaker,
      storyStage: "rumor",
      storyStageLabel: "1단계 · 루머",
    };
  }

  if (session === arc.clueSession) {
    const positive = arc.cluePositive;
    return {
      ...common,
      id: `${arc.id}-clue`,
      title: `${arc.company.name}, 발표 전 ${positive ? "긍정" : "불안"} 신호 포착`,
      description: positive
        ? `관계자 움직임과 경영진 발언은 낙관적인 결말을 가리킵니다. 다만 발언 신뢰도는 ${arc.confidence}%입니다.`
        : `일정 지연과 경영진의 모호한 답변이 포착됐습니다. 다만 발언 신뢰도는 ${arc.confidence}%입니다.`,
      impact: positive ? 0.012 : -0.012,
      tag: "단서",
      quote: positive
        ? "계획대로 진행 중입니다. 지나친 걱정은 하지 않아도 됩니다."
        : "확정된 것은 없습니다. 추측성 보도에는 답하지 않겠습니다.",
      quoteBy: speaker,
      storyStage: "clue",
      storyStageLabel: "2단계 · 단서",
      storyConfidence: arc.confidence,
    };
  }

  if (session === arc.resolveSession) {
    const copy = resolutionCopy(arc);
    return {
      ...common,
      id: `${arc.id}-resolution`,
      title: copy.title,
      description: copy.description,
      impact: arc.impact,
      tag: arc.positive ? "호재 확정" : "악재 확정",
      quote: arc.positive
        ? "기다려 준 주주들에게 결과로 보답하겠습니다."
        : "결과를 무겁게 받아들이고 수습에 최선을 다하겠습니다.",
      quoteBy: speaker,
      storyStage: "resolution",
      storyStageLabel: "3단계 · 결말",
    };
  }

  return null;
}

export function storyStageAtSession(
  arc: MarketStoryArc,
  session: number,
): "rumor" | "clue" | "resolution" {
  if (session >= arc.resolveSession) return "resolution";
  if (session >= arc.clueSession) return "clue";
  return "rumor";
}

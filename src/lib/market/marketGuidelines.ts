import { getCharacterById } from "@/data/characters";
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import type { MarketEra } from "@/lib/market/marketEras";

/**
 * 시장 국면(에라)에 따른 캐릭터(기업) 운영 지침 태그.
 *
 * 캐릭터 성향(traits)과 현재 국면을 결정론적으로 조합해 5개 지침 중 하나를 고른다.
 * 전역 국면의 순함수라 모두가 같은 캐릭터의 같은 지침을 본다(공정). 국면 시작 전
 * (era.index < 0)에는 '기계적 중립'으로, 가격 계산에 아무 영향이 없다.
 */
export type GuidelineTagId =
  | "defensive"
  | "aggressive"
  | "shareholder"
  | "management"
  | "neutral";

export interface GuidelineDef {
  id: GuidelineTagId;
  name: string;
  emoji: string;
  desc: string;
  /** 해당 기업 종목 변동성 배율(중립 1) */
  volMul: number;
  /** 방향성 편향: 거래일당(중립 0) */
  driftBiasPerSession: number;
}

export const GUIDELINES: Record<GuidelineTagId, GuidelineDef> = {
  defensive: { id: "defensive", name: "방어적", emoji: "🛡️", desc: "변동성을 낮추고 하락을 방어합니다.", volMul: 0.8, driftBiasPerSession: 0 },
  aggressive: { id: "aggressive", name: "공격적", emoji: "🚀", desc: "성장에 베팅해 변동성과 기대수익이 큽니다.", volMul: 1.35, driftBiasPerSession: 0.008 },
  shareholder: { id: "shareholder", name: "주주보호", emoji: "🤝", desc: "주주가치를 지키며 완만히 우상향합니다.", volMul: 0.85, driftBiasPerSession: 0.004 },
  management: { id: "management", name: "경영우선", emoji: "🏢", desc: "경영진 판단을 우선해 주주가치는 다소 후순위입니다.", volMul: 1.1, driftBiasPerSession: -0.004 },
  neutral: { id: "neutral", name: "기계적 중립", emoji: "⚖️", desc: "국면과 무관하게 지수를 따라갑니다.", volMul: 1, driftBiasPerSession: 0 },
};

const TAG_ORDER: GuidelineTagId[] = ["defensive", "aggressive", "shareholder", "management", "neutral"];

type Weights = Record<GuidelineTagId, number>;
const zeroWeights = (): Weights => ({ defensive: 0, aggressive: 0, shareholder: 0, management: 0, neutral: 0 });

/**
 * 국면이 지침을 주도하고(강한 가중치), 성격은 방향을 살짝 튼다(약한 가중치).
 * 대부분의 캐릭터는 국면을 따라 지침이 바뀌지만, 한 방향으로 성향이 강한
 * 소수 캐릭터(예: 은둔형+회피형)는 자기 색을 유지할 수 있다.
 */
const TRAIT_AFFINITY: Record<string, Partial<Weights>> = {
  도박사: { aggressive: 2 },
  카리스마: { aggressive: 2 },
  사고뭉치: { management: 1 },
  워커홀릭: { management: 2 },
  천재: { neutral: 1 },
  성실: { shareholder: 2 },
  주주보호: { shareholder: 5 },
  은둔형: { defensive: 2 },
  회피형: { defensive: 2 },
};

/** 국면 아키타입 → 지침 가중치 (주 성격 +3, 부 성격 +1) */
const ERA_AFFINITY: Record<string, Partial<Weights>> = {
  bull: { aggressive: 3, shareholder: 1 },
  bear: { defensive: 3, shareholder: 1 },
  highvol: { neutral: 3, defensive: 1 },
  calm: { shareholder: 3, defensive: 1 },
  recovery: { aggressive: 3, shareholder: 1 },
  choppy: { neutral: 3, management: 1 },
};

const traitWeightCache = new Map<string, Weights>();
function traitWeights(ceoId: string): Weights {
  const cached = traitWeightCache.get(ceoId);
  if (cached) return cached;
  const w = zeroWeights();
  for (const trait of getCharacterById(ceoId)?.traits ?? []) {
    const aff = TRAIT_AFFINITY[trait];
    if (aff) for (const [tag, v] of Object.entries(aff)) w[tag as GuidelineTagId] += v ?? 0;
  }
  traitWeightCache.set(ceoId, w);
  return w;
}

const resultCache = new Map<string, GuidelineTagId>();

/** 캐릭터의 이번 국면 운영 지침. 국면 시작 전이면 기계적 중립(무효과). */
export function getCharacterGuideline(ceoId: string, era: MarketEra): GuidelineDef {
  if (era.index < 0) return GUIDELINES.neutral;
  const key = `${ceoId}|${era.archetypeId}`;
  let picked = resultCache.get(key);
  if (!picked) {
    const w = { ...traitWeights(ceoId) };
    const eraAff = ERA_AFFINITY[era.archetypeId];
    if (eraAff) for (const [tag, v] of Object.entries(eraAff)) w[tag as GuidelineTagId] += v ?? 0;
    picked = "neutral";
    let best = -Infinity;
    for (const tag of TAG_ORDER) {
      if (w[tag] > best) {
        best = w[tag];
        picked = tag;
      }
    }
    resultCache.set(key, picked);
  }
  return GUIDELINES[picked];
}

const NEUTRAL_MODS = { volMul: 1, driftPerSecond: 0 };

/** 가격 엔진용 지침 배율. 국면 시작 전이면 배율 1·편향 0(결과 불변). */
export function getGuidelineModifiers(
  ceoId: string,
  era: MarketEra,
): { volMul: number; driftPerSecond: number } {
  if (era.index < 0) return NEUTRAL_MODS;
  const g = getCharacterGuideline(ceoId, era);
  return {
    volMul: g.volMul,
    driftPerSecond: g.driftBiasPerSession / (SESSION_DURATION_MS / 1000),
  };
}

/**
 * 프레스티지(수집) 점수 — "돈은 연료, 점수는 수집·경쟁" 정체성의 대표 지표.
 *
 * 순수 함수이며 기존 상태를 읽기만 한다(경제·시장·저장 로직 무영향). 어떤 값이
 * 비어 있거나 형식이 달라도 예외 없이 0으로 처리하도록 방어적으로 작성한다.
 * 가중치는 표시용 v1 기준이며 이후 자유롭게 튜닝할 수 있다.
 */
import {
  INVESTMENT_STYLES,
  masteryLevel,
  type InvestmentMasteryState,
} from "@/lib/market/investmentMastery";
import {
  INVESTMENT_SEASON_TIERS,
  type InvestmentSeasonState,
} from "@/lib/market/investmentSeasons";
import { getTopLuxuryTier } from "@/lib/market/luxury";
import type { CharacterProgressMap } from "@/lib/types/market";
import type { OwnedLuxury } from "@/lib/types/luxury";
import type { SeasonRewardId } from "@/lib/player/seasonRewards";

export interface PrestigeInput {
  achievements?: string[];
  characterProgress?: CharacterProgressMap;
  unlockedSeasonRewardIds?: SeasonRewardId[];
  investmentMastery?: InvestmentMasteryState;
  investmentSeason?: InvestmentSeasonState;
  ownedLuxuries?: OwnedLuxury[];
  reputation?: number;
}

export interface PrestigeBreakdown {
  total: number;
  /** 구성 점수 (합이 total) */
  characters: number;
  achievements: number;
  season: number;
  mastery: number;
  luxury: number;
  reputation: number;
  /** 표시용 부가 정보 */
  bondedCharacters: number;
  bestSeasonTierIndex: number;
}

const clampAffinity = (value: unknown) =>
  Math.max(0, Math.min(100, Number(value) || 0));

export function computePrestige(input: PrestigeInput): PrestigeBreakdown {
  // 캐릭터 수집: 넓이(호감도 10당 1점) + 깊이(30/50/100 마일스톤 보너스)
  let characters = 0;
  let bondedCharacters = 0;
  for (const progress of Object.values(input.characterProgress ?? {})) {
    const affinity = clampAffinity(progress?.affinity);
    characters += Math.floor(affinity / 10);
    if (affinity >= 30) characters += 5;
    if (affinity >= 50) {
      characters += 10;
      bondedCharacters += 1;
    }
    if (affinity >= 100) characters += 25;
  }

  const achievements = (input.achievements?.length ?? 0) * 10;

  // 시즌: 역대 최고 티어 + 해금 프레임 수
  let bestSeasonTierIndex = -1;
  for (const result of input.investmentSeason?.history ?? []) {
    const index = INVESTMENT_SEASON_TIERS.findIndex(
      (tier) => tier.id === result?.tierId,
    );
    if (index > bestSeasonTierIndex) bestSeasonTierIndex = index;
  }
  const season =
    Math.max(0, bestSeasonTierIndex) * 40 +
    (input.unlockedSeasonRewardIds?.length ?? 0) * 15;

  // 숙련도: 6개 스타일 레벨 합
  const xp = input.investmentMastery?.xp;
  let masteryLevels = 0;
  for (const style of INVESTMENT_STYLES) {
    masteryLevels += masteryLevel(Number(xp?.[style.id]) || 0);
  }
  const mastery = masteryLevels * 8;

  // 사치재: 최고 등급 + 개수
  const owned = input.ownedLuxuries ?? [];
  const luxury = getTopLuxuryTier(owned) * 20 + owned.length * 3;

  const reputation = Math.max(0, Math.round(Number(input.reputation) || 0));

  const total =
    characters + achievements + season + mastery + luxury + reputation;

  return {
    total,
    characters,
    achievements,
    season,
    mastery,
    luxury,
    reputation,
    bondedCharacters,
    bestSeasonTierIndex,
  };
}

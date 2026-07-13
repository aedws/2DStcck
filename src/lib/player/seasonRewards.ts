import type {
  InvestmentSeasonResult,
  InvestmentSeasonTierId,
} from "@/lib/market/investmentSeasons";

export type SeasonRewardId = `season-frame-${InvestmentSeasonTierId}`;

export interface SeasonReward {
  id: SeasonRewardId;
  tierId: InvestmentSeasonTierId;
  name: string;
  emoji: string;
  description: string;
  frameClass: string;
}

const TIER_ORDER: InvestmentSeasonTierId[] = [
  "bronze",
  "silver",
  "gold",
  "platinum",
  "diamond",
  "master",
];

export const SEASON_REWARDS: SeasonReward[] = [
  {
    id: "season-frame-bronze",
    tierId: "bronze",
    name: "브론즈 도전자 프레임",
    emoji: "🥉",
    description: "첫 시즌 완주를 증명하는 영구 인장입니다.",
    frameClass: "border-orange-700/70 bg-orange-700/[0.07] ring-orange-700/20",
  },
  {
    id: "season-frame-silver",
    tierId: "silver",
    name: "실버 생존자 프레임",
    emoji: "🥈",
    description: "시장과의 경쟁을 버텨낸 투자자 프레임입니다.",
    frameClass: "border-slate-300/70 bg-slate-300/[0.07] ring-slate-300/20",
  },
  {
    id: "season-frame-gold",
    tierId: "gold",
    name: "골드 추격자 프레임",
    emoji: "🥇",
    description: "벤치마크를 끝까지 추격한 기록을 남깁니다.",
    frameClass: "border-yellow-400/70 bg-yellow-400/[0.07] ring-yellow-400/20",
  },
  {
    id: "season-frame-platinum",
    tierId: "platinum",
    name: "플래티넘 초과 프레임",
    emoji: "💠",
    description: "지수를 넘어선 시즌의 영구 보상입니다.",
    frameClass: "border-cyan-300/70 bg-cyan-300/[0.07] ring-cyan-300/20",
  },
  {
    id: "season-frame-diamond",
    tierId: "diamond",
    name: "다이아몬드 운용자 프레임",
    emoji: "💎",
    description: "강한 초과수익 시즌을 달성한 투자자에게 주어집니다.",
    frameClass: "border-blue-400/70 bg-blue-400/[0.08] ring-blue-400/25",
  },
  {
    id: "season-frame-master",
    tierId: "master",
    name: "마스터 왕관 프레임",
    emoji: "👑",
    description: "최상위 시즌 티어를 달성한 영구 왕관입니다.",
    frameClass: "border-pink-400/80 bg-pink-400/[0.08] ring-pink-400/30",
  },
];

export function getSeasonReward(id: string | null | undefined): SeasonReward | null {
  return SEASON_REWARDS.find((reward) => reward.id === id) ?? null;
}

/** 한 티어를 달성하면 그 티어까지의 하위 프레임도 영구 해금한다. */
export function rewardIdsThroughTier(tierId: InvestmentSeasonTierId): SeasonRewardId[] {
  const tierIndex = TIER_ORDER.indexOf(tierId);
  return SEASON_REWARDS
    .filter((reward) => TIER_ORDER.indexOf(reward.tierId) <= tierIndex)
    .map((reward) => reward.id);
}

export function mergeSeasonRewards(
  current: SeasonRewardId[],
  tierId: InvestmentSeasonTierId,
): SeasonRewardId[] {
  return [...new Set([...current, ...rewardIdsThroughTier(tierId)])];
}

export function normalizeSeasonRewardIds(value: unknown): SeasonRewardId[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (id): id is SeasonRewardId => typeof id === "string" && getSeasonReward(id) !== null,
  );
}

export function rewardsFromSeasonHistory(
  history: InvestmentSeasonResult[],
  current: SeasonRewardId[] = [],
): SeasonRewardId[] {
  return history.reduce(
    (unlocked, season) => mergeSeasonRewards(unlocked, season.tierId),
    current,
  );
}

export function normalizeSelectedSeasonFrame(
  value: unknown,
  unlocked: SeasonRewardId[],
): SeasonRewardId | null {
  return typeof value === "string" && unlocked.includes(value as SeasonRewardId)
    ? value as SeasonRewardId
    : null;
}

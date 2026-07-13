/** 업적 판정에 쓰는 현재 상태 요약 */
export interface AchievementContext {
  netWorth: number;
  initialCash: number;
  tradeCount: number;
  hasShorted: boolean;
  hasOption: boolean;
  hasPumpTraded: boolean;
  usedMargin: boolean;
  marginCalled: boolean;
  luxuryCount: number;
  wonJackpot: boolean;
}

export interface Achievement {
  id: string;
  title: string;
  detail: string;
  emoji: string;
  check: (c: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_trade",
    title: "첫 거래",
    detail: "처음으로 주문을 체결했습니다.",
    emoji: "📈",
    check: (c) => c.tradeCount >= 1,
  },
  {
    id: "active_trader",
    title: "활발한 트레이더",
    detail: "누적 25회 이상 거래했습니다.",
    emoji: "🔁",
    check: (c) => c.tradeCount >= 25,
  },
  {
    id: "first_luxury",
    title: "첫 사치품",
    detail: "상점에서 사치재를 처음 구매했습니다.",
    emoji: "⌚",
    check: (c) => c.luxuryCount >= 1,
  },
  {
    id: "collector",
    title: "수집가",
    detail: "사치재 5종 이상을 보유했습니다.",
    emoji: "🛍️",
    check: (c) => c.luxuryCount >= 5,
  },
  {
    id: "short_seller",
    title: "공매도 개시",
    detail: "처음으로 공매도를 걸었습니다.",
    emoji: "🐻",
    check: (c) => c.hasShorted,
  },
  {
    id: "options_trader",
    title: "옵션 입문",
    detail: "옵션 포지션을 보유했습니다.",
    emoji: "🎯",
    check: (c) => c.hasOption,
  },
  {
    id: "margin_user",
    title: "레버리지 사용",
    detail: "마진(신용)으로 매수했습니다.",
    emoji: "⚡",
    check: (c) => c.usedMargin,
  },
  {
    id: "survivor",
    title: "마진콜 생존",
    detail: "강제청산을 겪고도 게임을 이어갑니다.",
    emoji: "🩹",
    check: (c) => c.marginCalled,
  },
  {
    id: "degen",
    title: "급등주 참전",
    detail: "초고위험 급등주를 거래했습니다.",
    emoji: "🎰",
    check: (c) => c.hasPumpTraded,
  },
  {
    id: "jackpot",
    title: "복권 잭팟",
    detail: "복권 잭팟($500,000)에 당첨됐습니다.",
    emoji: "🎟️",
    check: (c) => c.wonJackpot,
  },
  {
    id: "profit_50",
    title: "순자산 +50%",
    detail: "순자산이 시작 자본의 1.5배가 되었습니다.",
    emoji: "💹",
    check: (c) => c.netWorth >= c.initialCash * 1.5,
  },
  {
    id: "double_up",
    title: "자산 2배",
    detail: "순자산이 시작 자본의 2배가 되었습니다.",
    emoji: "💰",
    check: (c) => c.netWorth >= c.initialCash * 2,
  },
  {
    id: "whale",
    title: "고래",
    detail: "순자산이 시작 자본의 5배가 되었습니다.",
    emoji: "🐋",
    check: (c) => c.netWorth >= c.initialCash * 5,
  },
  {
    id: "tycoon",
    title: "억만장자",
    detail: "순자산이 시작 자본의 10배가 되었습니다.",
    emoji: "👑",
    check: (c) => c.netWorth >= c.initialCash * 10,
  },
];

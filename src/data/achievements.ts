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
  /** 최대 단일 캐릭터(기업) 종목이 순자산에서 차지하는 비율 (0~1) */
  topCharacterShare: number;
  /** 상위 서로 다른 2캐릭터 종목 합산 비율 (2캐릭터 미만이면 0) */
  topTwoCharacterShare: number;
  /** 상위 서로 다른 3캐릭터 종목 합산 비율 (3캐릭터 미만이면 0) */
  topThreeCharacterShare: number;
  /** 보유 중인 서로 다른 캐릭터(기업) 수 */
  heldCharacterCount: number;
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
  {
    id: "one_and_only",
    title: "원 앤 온리",
    detail: "단일 캐릭터 기업 종목이 순자산의 45% 이상을 차지합니다.",
    emoji: "💍",
    check: (c) => c.topCharacterShare >= 0.45,
  },
  {
    id: "twin_star",
    title: "트윈 스타",
    detail: "서로 다른 두 캐릭터 기업 종목이 순자산의 70% 이상을 차지합니다.",
    emoji: "✌️",
    check: (c) => c.topTwoCharacterShare >= 0.7,
  },
  {
    id: "triple_harmonia",
    title: "트리플 하르모니아",
    detail:
      "서로 다른 세 캐릭터 기업 종목이 순자산의 75% 이상을 차지합니다. (4캐릭터 이상 보유 시 비활성)",
    emoji: "🎼",
    check: (c) => c.heldCharacterCount <= 3 && c.topThreeCharacterShare >= 0.75,
  },
];

import type { LuxuryItem } from "@/lib/types/luxury";

/**
 * 사치재 카탈로그. 가격 단위는 내부 센트($1 = 100).
 * 재화(현금)로 구매하며, 보유 사치재의 가치는 순자산에 합산되어 랭킹에 반영된다.
 * 즉 "사도 순자산이 줄지 않고" 대신 랭킹 보드에 과시 뱃지로 노출된다.
 *
 * 시작 자산 $100,000 · 20거래일마다 급여 $10,000 기준으로
 * 소품(수천 달러) → 차 → 집 → 초호화(수천만 달러)까지 장기 목표를 배치한다.
 */
export const LUXURY_ITEMS: LuxuryItem[] = [
  // ── 소품 (입문) ──
  {
    id: "watch",
    name: "명품 시계",
    category: "소품",
    tier: 1,
    price: 800_000, // $8,000
    emoji: "⌚",
    description: "첫 수익을 기념하는 스위스제 오토매틱 시계.",
  },
  {
    id: "handbag",
    name: "리미티드 핸드백",
    category: "소품",
    tier: 1,
    price: 1_500_000, // $15,000
    emoji: "👜",
    description: "웨이팅 리스트로만 살 수 있는 한정판 가방.",
  },
  {
    id: "jewelry",
    name: "다이아 목걸이",
    category: "소품",
    tier: 2,
    price: 4_500_000, // $45,000
    emoji: "💎",
    description: "3캐럿 브릴리언트 컷. 조명 아래서 존재감이 다르다.",
  },
  // ── 자동차 ──
  {
    id: "sports_car",
    name: "스포츠카",
    category: "자동차",
    tier: 2,
    price: 9_000_000, // $90,000
    emoji: "🏎️",
    description: "0-100km/h 3.5초. 주말 드라이브용.",
  },
  {
    id: "supercar",
    name: "슈퍼카",
    category: "자동차",
    tier: 3,
    price: 45_000_000, // $450,000
    emoji: "🚗",
    description: "한정 생산 미드십. 소유 자체가 자격 증명.",
  },
  // ── 부동산 ──
  {
    id: "apartment",
    name: "시티 펜트하우스",
    category: "부동산",
    tier: 3,
    price: 120_000_000, // $1.2M
    emoji: "🏙️",
    description: "도심 최상층. 통유리 너머로 스카이라인이 펼쳐진다.",
  },
  {
    id: "mansion",
    name: "교외 대저택",
    category: "부동산",
    tier: 4,
    price: 500_000_000, // $5M
    emoji: "🏰",
    description: "프라이빗 게이트와 정원이 딸린 대저택.",
  },
  // ── 초호화 (엔드게임) ──
  {
    id: "yacht",
    name: "슈퍼요트",
    category: "초호화",
    tier: 4,
    price: 1_500_000_000, // $15M
    emoji: "🛥️",
    description: "선원이 상주하는 60m 요트. 지중해의 여름.",
  },
  {
    id: "jet",
    name: "프라이빗 제트",
    category: "초호화",
    tier: 5,
    price: 4_000_000_000, // $40M
    emoji: "✈️",
    description: "대륙을 넘나드는 개인 제트기. 시간의 사치.",
  },
  {
    id: "island",
    name: "프라이빗 아일랜드",
    category: "초호화",
    tier: 5,
    price: 12_000_000_000, // $120M
    emoji: "🏝️",
    description: "지도에 이름을 올린 나만의 섬. 부의 정점.",
  },
];

export const LUXURY_BY_ID = new Map(LUXURY_ITEMS.map((item) => [item.id, item]));

/** 카테고리 표시 순서 */
export const LUXURY_CATEGORY_ORDER: LuxuryItem["category"][] = [
  "소품",
  "자동차",
  "부동산",
  "초호화",
];

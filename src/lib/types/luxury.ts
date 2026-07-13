/** 사치재(재화 sink) 정의. 가격 단위는 내부 센트($1 = 100). */
export interface LuxuryItem {
  id: string;
  name: string;
  category: "소품" | "자동차" | "부동산" | "초호화";
  /** 과시 등급 1~5. 랭킹 뱃지·정렬에 사용. */
  tier: number;
  price: number;
  emoji: string;
  description: string;
}

/** 유저가 보유한 사치재 1점. 아이템당 최대 1개(수집형). */
export interface OwnedLuxury {
  id: string;
  purchasedAt: number;
  /** 구매 당시 가격(센트). 순자산 합산·정렬에 사용해 카탈로그 변경과 무관하게 안정적. */
  paidPrice: number;
}

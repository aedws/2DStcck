// AUTO-GENERATED from src/data/generated.ts — edit the original and run `npm run sync:functions`
// AUTO-GENERATED from data/companies.csv — 직접 수정 금지, `npm run import:companies` 로 재생성
import type { Character, StockDefinition } from "./types.ts";

export const CSV_COMPANIES: StockDefinition[] = [
  {
    "id": "ridc",
    "ticker": "RIDC",
    "name": "RIO Defense Corporation",
    "sector": "방산",
    "initialPrice": 98000,
    "volatility": 0.03,
    "drift": 0.0005,
    "beta": 0.7,
    "description": "궤도 방위 시스템과 전술 AI를 개발하는 방산 기업.",
    "eventBias": {
      "수주": 4,
      "스캔들": 0.5
    },
    "ceoId": "chr_ridc"
  }
];

export const CSV_CHARACTERS: Character[] = [
  {
    "id": "chr_ridc",
    "name": "츠카츠키 리오",
    "title": "CEO",
    "traits": [
      "천재",
      "은둔형",
      "회피형"
    ],
    "bio": "모습을 드러내지 않고 태스크 목록만으로 회사 전체를 지휘하는 은둔형 천재.",
    "emoji": "🛰️"
  }
];

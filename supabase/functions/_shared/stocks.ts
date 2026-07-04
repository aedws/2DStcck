// AUTO-GENERATED from src/data/stocks.ts — edit the original and run `npm run sync:functions`
import type { StockDefinition } from "./types.ts";

export const INITIAL_CASH = 10_000_000;

export const STOCK_DEFINITIONS: StockDefinition[] = [
  {
    id: "vtech",
    ticker: "VTECH",
    name: "Virtual Tech",
    sector: "기술",
    initialPrice: 85000,
    volatility: 0.035,
    drift: 0.0008,
  },
  {
    id: "venergy",
    ticker: "VNRG",
    name: "Virtual Energy",
    sector: "에너지",
    initialPrice: 42000,
    volatility: 0.028,
    drift: 0.0003,
  },
  {
    id: "vhealth",
    ticker: "VHLT",
    name: "Virtual Health",
    sector: "헬스케어",
    initialPrice: 63000,
    volatility: 0.022,
    drift: 0.0005,
  },
  {
    id: "vretail",
    ticker: "VRTL",
    name: "Virtual Retail",
    sector: "소비재",
    initialPrice: 28000,
    volatility: 0.03,
    drift: 0.0002,
  },
  {
    id: "vfinance",
    ticker: "VFIN",
    name: "Virtual Finance",
    sector: "금융",
    initialPrice: 51000,
    volatility: 0.025,
    drift: 0.0004,
  },
  {
    id: "vmedia",
    ticker: "VMDA",
    name: "Virtual Media",
    sector: "미디어",
    initialPrice: 19000,
    volatility: 0.04,
    drift: 0.0001,
  },
];

export const MARKET_EVENT_POOL: Omit<
  import("./types.ts").MarketEvent,
  "id" | "timestamp"
>[] = [
  {
    title: "금리 인하 기대",
    description: "중앙은행의 완화적 통화정책 기대감이 시장 전반에 확산됩니다.",
    affectedStockIds: ["vfinance", "vtech", "vretail"],
    impact: 0.04,
  },
  {
    title: "유가 급등",
    description: "국제 유가 상승으로 에너지 섹터가 강세를 보입니다.",
    affectedStockIds: ["venergy"],
    impact: 0.06,
  },
  {
    title: "규제 강화 우려",
    description: "플랫폼 규제 논의로 기술주에 매도 압력이 나타납니다.",
    affectedStockIds: ["vtech", "vmedia"],
    impact: -0.05,
  },
  {
    title: "신약 승인",
    description: "헬스케어 기업의 임상 성공 소식이 주가를 끌어올립니다.",
    affectedStockIds: ["vhealth"],
    impact: 0.07,
  },
  {
    title: "소비 둔화",
    description: "소매 판매 지표 부진으로 소비재 섹터가 약세입니다.",
    affectedStockIds: ["vretail"],
    impact: -0.04,
  },
  {
    title: "실적 시즌 호조",
    description: "주요 기업들의 분기 실적이 시장 예상을 상회했습니다.",
    affectedStockIds: ["vtech", "vfinance", "vhealth"],
    impact: 0.03,
  },
  {
    title: "광고 수요 감소",
    description: "디지털 광고 지출 축소로 미디어 섹터가 하락합니다.",
    affectedStockIds: ["vmedia"],
    impact: -0.045,
  },
  {
    title: "시장 전반 조정",
    description: "투자 심리 위축으로 전 종목에 조정 압력이 가해집니다.",
    affectedStockIds: ["vtech", "venergy", "vhealth", "vretail", "vfinance", "vmedia"],
    impact: -0.025,
  },
];

// AUTO-GENERATED from src/lib/types/market.ts — edit the original and run `npm run sync:functions`
/** 캐릭터 성격 태그 — 이벤트 가중치로 연결될 훅 */
export type TraitTag =
  | "천재"
  | "은둔형"
  | "회피형"
  | "사고뭉치"
  | "카리스마"
  | "워커홀릭"
  | "도박사"
  | "성실";

export interface Character {
  id: string;
  /** 캐릭터 이름 */
  name: string;
  /** "CEO", "창업자" 등 */
  title: string;
  traits: TraitTag[];
  /** 한 줄 설정 */
  bio: string;
  /** avatar는 나중에. MVP는 이모지 플레이스홀더 */
  emoji: string;
}

export type EventCategory = "macro" | "sector" | "company";

export interface StockDefinition {
  id: string;
  ticker: string;
  name: string;
  sector: string;
  initialPrice: number;
  volatility: number;
  drift: number;
  /** 추세 종목(지수·선물): 사인파 기반 추세 강도 */
  trendStrength?: number;
  /** 경영 캐릭터 (characters.ts 참조) */
  ceoId?: string;
  /** 회사 한 줄 소개 */
  description?: string;
  /** 시장(선물) 민감도. 1 = 시장과 동일 — MVP에선 엔진 미연결, 값만 채워둠 */
  beta?: number;
  /** 이벤트 태그별 발생 가중치 (기본 1). 예: { 수주: 4, 스캔들: 0.5 } */
  eventBias?: Record<string, number>;
}

/** 이벤트 생성 템플릿 — {company}, {ceo} 치환 변수 지원 */
export interface EventTemplate {
  category: EventCategory;
  /** eventBias 매칭 키: "금리", "수주", "스캔들" 등 */
  tag: string;
  title: string;
  description: string;
  impact: number;
  /** macro: 고정 대상 종목 (생략 시 전 종목) */
  affectedStockIds?: string[];
  /** sector: 해당 섹터 전 종목 대상 */
  sector?: string;
  /** company 이벤트 중 {ceo} 문구 사용 → CEO 있는 회사만 대상 */
  requiresCeo?: boolean;
}

export interface OrderBookLevel {
  price: number;
  quantity: number;
}

export interface OrderBook {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
}

export interface StockState extends StockDefinition {
  currentPrice: number;
  /** 전일 종가 — 등락률 기준 */
  prevDayClose: number;
  /** 당일 시초가 */
  dayOpen: number;
  priceHistory: PricePoint[];
  /** 1분봉 (서버가 직접 관리, 최근 240개) */
  candles: Candle[];
  orderBook: OrderBook;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

export interface Candle {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface Holding {
  stockId: string;
  quantity: number;
  averagePrice: number;
}

export type TradeType = "buy" | "sell";

export interface Trade {
  id: string;
  stockId: string;
  ticker: string;
  type: TradeType;
  quantity: number;
  price: number;
  total: number;
  timestamp: number;
}

export interface MarketEvent {
  id: string;
  title: string;
  description: string;
  affectedStockIds: string[];
  impact: number;
  timestamp: number;
  category?: EventCategory;
  tag?: string;
}

export interface MarketSnapshot {
  tick: number;
  marketStartedAt: number;
  cash: number;
  holdings: Holding[];
  trades: Trade[];
  stocks: StockState[];
  events: MarketEvent[];
  initialCash: number;
}

export interface OrderResult {
  success: boolean;
  message: string;
}

export type OrderType =
  | "buy_market"
  | "sell_market"
  | "buy_current"
  | "sell_current";

export interface OpenOrder {
  id: string;
  stockId: string;
  ticker: string;
  side: TradeType;
  price: number;
  quantity: number;
  createdAt: number;
}

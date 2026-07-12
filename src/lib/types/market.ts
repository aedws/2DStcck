/** 캐릭터 성격 태그 — 이벤트 가중치로 연결될 훅.
 * 아래는 자동완성용 추천 목록이고, CSV로 임의 태그도 허용된다. */
export type TraitTag =
  | "천재"
  | "은둔형"
  | "회피형"
  | "사고뭉치"
  | "카리스마"
  | "워커홀릭"
  | "도박사"
  | "성실"
  | (string & {});

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
  /** 기업 로고 경로/URL. 비우면 /logos/<id>.png 관례 경로 시도, 없으면 티커 이니셜 */
  logo?: string;
  /** 시장(선물) 민감도. 1 = 시장과 동일 — MVP에선 엔진 미연결, 값만 채워둠 */
  beta?: number;
  /** 이벤트 태그별 발생 가중치 (기본 1). 예: { 수주: 4, 스캔들: 0.5 } */
  eventBias?: Record<string, number>;
  /** ETF 구성종목 (설정 시 NAV 추종 모드 — 가격이 구성종목 가중 수익률을 따라감) */
  etfHoldings?: EtfConstituent[];
  /** 합성 ETF: V-NASDAQ 틱 수익률 × 배수 추종 (-1 인버스, -2 곱버스, 2 레버리지) */
  leverage?: number;
  /** 커버드콜 ETF의 기초자산 종목 id */
  coveredCallUnderlyingId?: string;
  /** 커버드콜 ETF의 연 환산 목표 분배율(%). 실제 월 분배금은 옵션 프리미엄처럼 변동한다. */
  coveredCallAnnualYield?: number;
  /** 커버드콜 ETF의 기초자산 상승 참여율(0~1). 하락은 100% 반영한다. */
  coveredCallUpsideCapture?: number;
  /** 일반 주식·ETF의 분기 주당 배당금(센트). 60거래일마다 지급한다. */
  quarterlyDividend?: number;
}

export interface EtfConstituent {
  stockId: string;
  /** 보유 비중 (합계 1로 정규화되어 저장됨) */
  weight: number;
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
  /** 정수 센트 가격에 아직 반영되지 않은 커버드콜 옵션 프리미엄(0 이상 1 미만 센트) */
  coveredCallPremiumReserve?: number;
  /** NAV 추종 ETF가 지급한 누적 주당 분배금. 원 NAV에서 차감해 배당락 스냅백을 막는다. */
  navDistributionAdjustment?: number;
  /** 전일 종가 — 등락률 기준 */
  prevDayClose: number;
  /** 당일 시초가 */
  dayOpen: number;
  /** 현재 거래일 번호 = floor(now / SESSION_DURATION_MS). 바뀌면 새 거래일 */
  daySessionId?: number;
  priceHistory: PricePoint[];
  /** 1분봉 (서버가 직접 관리, 최근 240개) */
  candles: Candle[];
  /** 게임 거래일(3시간) 기준 일봉. 주봉·월봉 집계의 원본 */
  dailyCandles: Candle[];
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

export type CashPaymentKind = "salary" | "covered_call" | "dividend";

/** 급여·커버드콜 분배금·일반 배당의 현금 지급 내역 */
export interface CashPayment {
  id: string;
  kind: CashPaymentKind;
  sourceId: string;
  ticker?: string;
  dueSession: number;
  quantity?: number;
  amountPerShare?: number;
  amount: number;
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
  /** 마지막 월급 지급 기준 거래일. 이 시점부터 20거래일마다 고정급 지급 */
  lastSalarySession: number;
  /** 마지막으로 처리한 커버드콜 월 분배 기준 거래일 */
  lastMonthlyDistributionSession: number;
  /** 마지막으로 처리한 일반 종목 분기 배당 기준 거래일 */
  lastQuarterlyDividendSession: number;
  holdings: Holding[];
  trades: Trade[];
  cashPayments: CashPayment[];
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

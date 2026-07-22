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

/**
 * 캐릭터별 뉴스 대사 오버라이드. 특정 캐릭터가 특정 태그·방향의 뉴스에서
 * 남길 전용 한마디. 없으면 공용 태그 풀(eventQuotes)로 자동 폴백한다.
 * tag "*" 는 해당 캐릭터의 기본 대사로, 전용 태그가 없는 뉴스에 쓰인다.
 */
export interface CharacterQuoteEntry {
  /** 대상 캐릭터 id (generated.ts의 chr_<ticker>) */
  characterId: string;
  /** 이벤트 태그(수주·신제품·실적·스캔들·행보·…) 또는 "*"(기본) */
  tag: string;
  /** 뉴스 방향 */
  direction: "positive" | "negative";
  /** 대사 후보(여러 개면 seeded rand로 하나 선택) */
  quotes: string[];
}

export type InstrumentType =
  | "company"
  | "etf"
  | "index"
  | "future"
  | "strategy";

export type StrategyType =
  | "leverage"
  | "inverse"
  | "inverse-2x"
  | "covered-call";

export type FundType =
  | "broad"
  | "growth"
  | "sector"
  | "bond"
  | "commodity"
  | "income";

export interface StockDefinition {
  id: string;
  ticker: string;
  name: string;
  /** 화면 1차 분류. 경제 섹터와 상품 구조를 섞지 않는다. */
  instrumentType?: InstrumentType;
  /** ETF의 운용 목적 분류. */
  fundType?: FundType;
  /** 레버리지·인버스·커버드콜 등 전략상품의 구조. */
  strategyType?: StrategyType;
  sector: string;
  /** 선택형 세부 산업 분류. 비어 있으면 상위 섹터만 사용한다. */
  subsector?: string;
  /** 기존 섹터 사건·위기 민감도를 보존하는 내부 시장 태그. */
  marketTags?: string[];
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
  /** 합성 ETF: 기초자산 틱 수익률 × 배수 추종 (-1 인버스, -2 곱버스, 2 레버리지) */
  leverage?: number;
  /** 레버리지·인버스 ETF의 기초자산 종목 id */
  leverageUnderlyingId?: string;
  /** 전 종목 공통 규칙으로 자동 생성된 파생상품 여부 */
  universalDerivative?: boolean;
  /** 커버드콜 ETF의 기초자산 종목 id */
  coveredCallUnderlyingId?: string;
  /** 커버드콜 ETF의 연 환산 목표 분배율(%). 실제 월 분배금은 옵션 프리미엄처럼 변동한다. */
  coveredCallAnnualYield?: number;
  /** 커버드콜 ETF의 기초자산 상승·하락 참여율(0~1). */
  coveredCallUpsideCapture?: number;
  /** 커버드콜 현금 분배 주기. 기존 지수형은 20일, 단일 종목형은 5일. */
  coveredCallDistributionIntervalDays?: number;
  /** 일반 주식·ETF의 분기 주당 배당금(센트). 60거래일마다 지급한다. */
  quarterlyDividend?: number;
  /**
   * IPO 상장 예정 시각(ms). 설정 시 이 시각 전에는 상장 전(비거래·비노출)이며
   * IPO 탭에 카운트다운으로만 보인다. 이 시각부터 공모가(initialPrice)로 개장해
   * 결정론 시뮬레이션에 참여한다. 비우면 기원점부터 상장된 것으로 본다.
   */
  listingEpochMs?: number;
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
  /** sector 이벤트의 내부 시장 태그(표시용 상위 섹터와 분리 가능) */
  sector?: string;
  /** company: 특정 기업 전용 사건이면 해당 종목 id로 대상을 고정 */
  companyId?: string;
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
  /** 30초봉. 1·3·5·10·30분봉 집계의 원본. */
  candles: Candle[];
  /** 게임 거래일(1시간) 기준 일봉. 주·월·연봉 집계의 원본. */
  dailyCandles: Candle[];
  orderBook: OrderBook;
}

export interface PricePoint {
  timestamp: number;
  price: number;
}

/** 순자산 추이 한 점 — 에쿼티 커브·랭킹 스냅샷의 원본 */
export interface NetWorthPoint {
  /** 기록 시각(ms) */
  t: number;
  /** 총 순자산(현금 + 주식 평가 + 사치재 가치, 센트) */
  value: number;
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
  /** 현물은 최대 소수점 6자리까지 보유할 수 있다. */
  quantity: number;
  averagePrice: number;
  /**
   * 레버리지·인버스 ETF 보유분에 마지막으로 적용된 액면분할·병합 배수.
   * 시세가 밴드를 벗어나 배수가 바뀌면 좌수 ×(신/구)·평단 ÷(신/구)로 정산한다.
   * 없으면 1(분할 전)로 간주한다. 일반 종목에는 쓰이지 않는다.
   */
  splitMultiplier?: number;
}

export type MarginLeverage = 2 | 3 | 4 | 5;

/** 거래일 단위 자동 소수점 매수 계획. 자동 매수는 미수를 사용하지 않는다. */
export interface RecurringInvestment {
  id: string;
  stockId: string;
  amount: number;
  intervalSessions: 1 | 5 | 20;
  nextSession: number;
  enabled: boolean;
  createdAt: number;
  lastExecutedSession?: number;
  lastStatus?: "filled" | "insufficient_cash" | "unavailable";
}

/** 공매도 포지션 — 빌려서 판 주식. 되사서(cover) 갚으며, 하락 시 이익. */
export interface ShortPosition {
  stockId: string;
  /** 공매도 수량 (양수) */
  quantity: number;
  /** 평균 진입(매도) 단가 */
  averagePrice: number;
}

/** 금리 단계: 1=완화, 2=중립, 3=긴축 */
export type RateLevel = 1 | 2 | 3;

export type OptionKind = "call" | "put";
export type OptionSide = "long" | "short";

/** 옵션 포지션 (유럽식 현금정산, 1계약 = 기초자산 1주) */
export interface OptionPosition {
  id: string;
  stockId: string;
  kind: OptionKind;
  /** long=매수(프리미엄 지불), short=발행/매도(프리미엄 수취·증거금) */
  side: OptionSide;
  /** 행사가 (센트) */
  strike: number;
  /** 만기 거래일 번호 */
  expirySession: number;
  /** 계약 수 */
  quantity: number;
  /** 개시 시 계약당 프리미엄 (센트) */
  openPremium: number;
  openedAt: number;
  /**
   * 개시 시점 기초자산(레버리지·인버스 ETF)의 액면분할 배수. 분할·병합으로 표시가
   * 밴드가 바뀌어도 옵션 손익이 왜곡되지 않도록, 평가 시 (현재배수/개시배수)로
   * 기초자산가를 보정한다. 일반 종목은 항상 1. 없으면(구 데이터) 1로 간주한다.
   */
  openSplitMultiplier?: number;
}

export type TradeType =
  | "buy"
  | "sell"
  | "short"
  | "cover"
  | "option_buy"
  | "option_write"
  | "option_close"
  | "option_expire";

export interface Trade {
  id: string;
  stockId: string;
  ticker: string;
  type: TradeType;
  quantity: number;
  price: number;
  total: number;
  timestamp: number;
  /** 옵션 거래일 때 계약 식별·손익 재생에 사용한다. */
  optionId?: string;
  optionKind?: OptionKind;
  optionSide?: OptionSide;
  strike?: number;
  expirySession?: number;
}

export type CashPaymentKind =
  | "salary"
  | "covered_call"
  | "dividend"
  | "interest"
  | "lottery"
  | "attendance"
  | "preferred_dividend"
  // 플레이어 회사 설립·자본 확충으로 영구 소각한 현금.
  | "company_capital"
  // 노동 소득(미니게임) — 시즌·투자 성과 평가에서 제외되는 외생 소득.
  | "minigame"
  // 버그 수정 보상(운영 지급) — 투자 성과가 아니므로 시즌·랭킹에서 제외한다.
  | "compensation";

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
  /** 회사 이벤트일 때 그 회사 캐릭터의 한마디 */
  quote?: string;
  /** 대사 화자 (이모지 + 이름) */
  quoteBy?: string;
  /** 3단계 연속 시장 사건 식별자와 현재 단계. */
  storyId?: string;
  storyStage?: "rumor" | "clue" | "resolution";
  storyStageLabel?: string;
  storyWindowStart?: number;
  storyResolveSession?: number;
  /** 단서 단계에서 표시하는 발언 신뢰도(0~100). */
  storyConfidence?: number;
}

/**
 * 관계 보상으로 그 기업이 발행해 선물하는 우선주. 시장에서 매매할 수 없고
 * 동맹(호감 100) 도달 시 캐릭터당 1좌 발행된다. 고정 액면가로 총자산·랭킹에
 * 반영되며 분기마다 고배당을 지급한다. (결정론 가격엔진과 무관한 지갑 자산)
 */
export interface PreferredShare {
  characterId: string;
  companyId: string;
  ticker: string;
  companyName: string;
  emoji: string;
  /** 발행 좌수 (기본 1좌) */
  shares: number;
  /** 좌당 액면가 (총자산 반영용) */
  faceValue: number;
  /** 좌당 분기 배당액 */
  dividendPerShare: number;
  issuedSession: number;
  issuedAt: number;
}

/** 연금 복권 당첨으로 받는 정기 연금. 5거래일마다 정액을 지급한다. */
export interface PensionAnnuity {
  id: string;
  /** 회차당 지급액 (센트) */
  amountPerPeriod: number;
  /** 총 지급 회차 */
  totalPeriods: number;
  /** 이미 지급된 회차 */
  paidPeriods: number;
  /** 지급 그리드 기준 시작 거래일 (정렬됨) */
  startSession: number;
  /** 지급 간격 (거래일) */
  intervalDays: number;
  label: string;
}

export type StoryDecisionKind = "bullish" | "bearish" | "observe" | "bond";
export type StoryDecisionStatus = "active" | "resolved";

/** 연속 시장 사건의 단서를 본 뒤 결말 전에 고르는 플레이어 판단. */
export interface StoryDecision {
  id: string;
  storyId: string;
  companyId: string;
  windowStart: number;
  resolveSession: number;
  kind: StoryDecisionKind;
  selectedAt: number;
  status: StoryDecisionStatus;
  resolvedAt?: number;
  outcomePositive?: boolean;
  /** 결말 정산으로 증감한 평판. 실패 시 음수가 될 수 있다. */
  reputationDelta?: number;
  /** 호감도 100 특별 선택으로 획득한 확정 최상급 판정. */
  topGrade?: boolean;
}

export type InvestmentMissionKind = "growth" | "benchmark" | "risk" | "character";
export type InvestmentMissionStatus = "active" | "completed" | "failed";

/** 5거래일 단위 투자 의뢰 진행 상태. 현금 대신 평판을 보상한다. */
export interface InvestmentMission {
  id: string;
  kind: InvestmentMissionKind;
  /** 같은 목표 유형 안에서 회차마다 달라지는 의뢰 문구·보상 변형. */
  offerId?: string;
  windowStart: number;
  endSession: number;
  acceptedAt: number;
  startEquity: number;
  startBenchmarkPrice: number;
  minEquity: number;
  status: InvestmentMissionStatus;
  reward: number;
  /** 이 의뢰를 맡긴 캐릭터와 소속 회사. 구버전 저장분은 없을 수 있다. */
  issuerCharacterId?: string;
  issuerCompanyId?: string;
  completedAt?: number;
  playerReturn?: number;
  benchmarkReturn?: number;
}

export interface InvestmentMissionHistory {
  id: string;
  kind: InvestmentMissionKind;
  offerId?: string;
  windowStart: number;
  status: Exclude<InvestmentMissionStatus, "active">;
  reward: number;
  completedAt: number;
  playerReturn: number;
  benchmarkReturn: number;
  issuerCharacterId?: string;
  issuerCompanyId?: string;
}

/** 캐릭터가 플레이어에게 쌓은 업무 신뢰와 개인적 호감. */
export interface CharacterProgress {
  characterId: string;
  trust: number;
  affinity: number;
  /** 직접 주식의 연속 장기 보유 거래일(5일마다 호감도 정산). */
  holdingSessions: number;
  lastHoldingSession?: number;
  /** 호감도 100을 최초 달성한 거래일. 진행 중 사건의 막판 해금을 막는다. */
  bondedAtSession?: number;
}

export type CharacterProgressMap = Record<string, CharacterProgress>;

export interface MarketSnapshot {
  marketVersion: number;
  /**
   * 지갑 스키마 세대. `WALLET_EPOCH` 미만(또는 없음)이면 로컬·클라우드 지갑을
   * 초기화한다. 시장 체크포인트와 독립.
   */
  walletEpoch: number;
  /** 저장 당시 거래일 길이. 시장 버전과 별도로 시간축 마이그레이션을 판정한다. */
  sessionDurationMs: number;
  tick: number;
  marketStartedAt: number;
  cash: number;
  /** 마지막 월급 지급 기준 거래일. 이 시점부터 20거래일마다 고정급 지급 */
  lastSalarySession: number;
  /** 마지막으로 처리한 커버드콜 월 분배 기준 거래일 */
  lastMonthlyDistributionSession: number;
  /** 마지막으로 처리한 단일 종목 커버드콜 5일 분배 기준 거래일 */
  lastSingleCoveredCallDistributionSession: number;
  /** 마지막으로 처리한 일반 종목 분기 배당 기준 거래일 */
  lastQuarterlyDividendSession: number;
  holdings: Holding[];
  /** 공매도 포지션 */
  shorts: ShortPosition[];
  /** 옵션 포지션 */
  options: OptionPosition[];
  trades: Trade[];
  cashPayments: CashPayment[];
  stocks: StockState[];
  events: MarketEvent[];
  initialCash: number;
  /** 마지막으로 마진 이자·대여수수료를 정산한 거래일 */
  lastInterestSession: number;
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

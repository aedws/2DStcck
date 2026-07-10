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

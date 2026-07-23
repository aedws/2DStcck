import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import { INITIAL_CASH, STOCK_DEFINITIONS } from "@/data/stocks";
import { getCharacterById } from "@/data/characters";
import {
  clearLegacyMarketStorage,
  marketStorageKey,
  safeMarketStorage,
} from "@/lib/storage/safeLocalStorage";
import {
  createInitialStockState,
  formatPrice,
  getMarketBuyPrice,
  getMarketSellPrice,
  leverageMultiplierFor,
  seededRand,
} from "@/lib/market/engine";
import { instrumentTypeOf } from "@/lib/market/taxonomy";
import { withCharacterQuote } from "@/data/eventQuotes";
import { applyDefinitionOverlay } from "@/lib/market/definitionOverlay";
import {
  executeBuy,
  executeSell,
  isValidShareQuantity,
  isOrderSuccess,
  normalizeShareQuantity,
  shareOrderTotal,
} from "@/lib/market/trading";
import type {
  CashPayment,
  CharacterProgressMap,
  Holding,
  MarketSnapshot,
  NetWorthPoint,
  InvestmentMission,
  InvestmentMissionHistory,
  InvestmentMissionKind,
  MarketEvent,
  MarginLeverage,
  OpenOrder,
  OrderResult,
  OrderType,
  PensionAnnuity,
  PreferredShare,
  RecurringInvestment,
  StoryDecision,
  StoryDecisionKind,
  StockState,
  Trade,
} from "@/lib/types/market";
import type { OwnedLuxury } from "@/lib/types/luxury";
import { LUXURY_BY_ID } from "@/data/luxuries";
import {
  getLuxuryValue,
  getLuxuryShowcase,
  getTopLuxuryTier,
  scaledLuxuryPrice,
} from "@/lib/market/luxury";
import {
  computeEquity,
  grossExposure,
  shortLiability,
  marginDebit,
  accrueBorrowCost,
  DEFAULT_MARGIN_LEVERAGE,
  maintenanceMarginForLeverage,
  normalizeMarginLeverage,
} from "@/lib/market/margin";
import {
  coverShort,
  isShortSuccess,
  openShort,
} from "@/lib/market/shorting";
import {
  getBenchmark,
  getRateLevel,
  getPrevRateLevel,
  getAnnualRatePercent,
  buildRateChangeEvent,
} from "@/lib/market/interestRate";
import {
  getPumpSpawnEvent,
  delistedPumpFinalPrice,
  isPumpStock,
  replaceActivePumpStocks,
} from "@/lib/market/pumpStocks";
import { isListed } from "@/lib/market/ipo";
import {
  OPERATIONAL_COMPENSATIONS,
  settleOperationalCompensations,
} from "@/lib/market/operationalCompensation";
import {
  getRoomItem,
  getRoomTheme,
  isValidRoomPlacement,
  nextRoomExpansion,
  normalizeOwnedRoomThemes,
  normalizeRoomItems,
  normalizeRoomLevel,
  normalizeRoomThemeId,
  roomMaxItemsForLevel,
  roomItemCells,
  roomItemLayer,
  ROOM_SELL_RATIO,
  ROOM_THEME_BY_ID,
  type PlacedRoomItem,
  type RoomRotation,
} from "@/data/roomItems";
import type {
  ShortPosition,
  RateLevel,
  OptionPosition,
  OptionKind,
} from "@/lib/types/market";
import {
  optionPremium,
  positionMark,
  intrinsic,
  effectiveOptionUnderlyingPrice,
  underlyingSplitMultiplier,
  optionsEquityDelta,
  optionsGrossExposure,
  shortMarginPerContract,
} from "@/lib/market/options";
import { generateOrderBook } from "@/lib/market/orderBook";
import {
  MARKET_EPOCH_MS,
  MARKET_SIM_VERSION,
  SESSION_DURATION_MS,
  WALLET_EPOCH,
  OVERFLOW_RECOVERY_GRANT_CENTS,
  PERSISTED_DAILY_CANDLES,
  OVERFLOW_BROKEN_NET_WORTH_FLOOR,
} from "@/lib/market/constants";
import { settleLocalCashflows } from "@/lib/market/cashflows";
import {
  alignSessionToGrid,
  createGenesisStocks,
  currentSimTick,
  replayMarket,
  simTickTime,
} from "@/lib/market/localSim";
import {
  getBundledMarketCheckpoint,
  hydrateMarketCheckpoint,
  reconstructDerivativeSeries,
  type MarketCheckpoint,
} from "@/lib/market/marketCheckpoint";
import {
  COVERED_CALL_INTERVAL_DAYS,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
} from "@/lib/market/distributions";
import {
  loadGameSave,
  saveGameSave,
  syncLeaderboard as syncLeaderboardSnapshot,
} from "@/lib/supabase/cloudSave";
import { ACHIEVEMENTS } from "@/data/achievements";
import { TARGETED_ACCOUNT_ACTIONS } from "@/data/serviceNotice";
import { useSettingsStore } from "@/store/settingsStore";
import {
  STOCK_REQUEST_COST,
  STOCK_REQUEST_COOLDOWN_DAYS,
} from "@/lib/supabase/stockRequests";
import {
  listMyCompanyFoundationRequests,
  markCompanyFoundationShipped,
  verifyCompanyFoundationApproval,
} from "@/lib/supabase/companyFoundationRequests";
import { useToastStore } from "@/store/toastStore";
import { playSound } from "@/lib/ui/sound";
import {
  drawLotto,
  drawPension,
  LOTTERY_INTERVAL_DAYS,
  LOTTERY_MAX_PER_WINDOW,
  LOTTERY_TICKET_PRICE,
  PENSION_TICKET_PRICE,
  type LottoResult,
} from "@/lib/market/lottery";
import {
  createInvestmentMission,
  resolveMissionIssuer,
  updateInvestmentMission,
} from "@/lib/market/missions";
import {
  createDailyOperation,
  getDailyOperationOffer,
  getDailyOperationOffers,
  normalizeDailyOperation,
  normalizeDailyOperationHistory,
  updateDailyOperation,
  type DailyOperation,
  type DailyOperationId,
} from "@/lib/market/dailyOperations";
import {
  createStoryDecision,
  getStoryArcAtSession,
  getStoryArcForWindow,
  getStoryDecisionOffer,
  resolveStoryDecision,
} from "@/lib/market/storyArcs";
import {
  accrueLongHoldingAffinity,
  addCharacterProgress,
  addStorySupportAffinity,
  canUseBondChoice,
  countFavoriteRelationships,
  getCharacterProgress,
  getRelationshipTier,
  normalizeCharacterProgressMap,
  resolveSingleCharacterLongEtfId,
  SINGLE_CHARACTER_ETF_ISSUANCE_AFFINITY,
  settleMissionRelationship,
} from "@/lib/market/characterProgress";
import {
  getActivePreferredShares,
  getPreferredShareValue,
  normalizePreferredShares,
  PREFERRED_DIVERSIFY_CHARACTERS,
  PREFERRED_SALE_GRACE_SESSIONS,
  reconcilePreferredShares,
} from "@/lib/player/preferredShares";
import { computeCharacterConcentration } from "@/lib/market/characterConcentration";
import {
  ROOM_RESIDENT_LIMIT,
  canInviteRoomResident,
  normalizeRoomResidentCharacterIds,
} from "@/lib/player/roomResidents";
import {
  createInitialMastery,
  normalizeInvestmentMastery,
  updateInvestmentMastery,
  type InvestmentMasteryState,
} from "@/lib/market/investmentMastery";
import {
  calculateSeasonGoalAllocation,
  createInitialInvestmentSeasonState,
  getInvestmentSeasonTier,
  getSeasonRivalPerformance,
  getSeasonTrait,
  markSeasonCeremonySeen as markCeremonySeen,
  normalizeInvestmentSeasonState,
  selectSeasonGoal,
  selectSeasonTrait,
  seasonExternalCashTotal,
  updateInvestmentSeason,
  type SeasonGoalId,
  type SeasonTraitId,
  type InvestmentSeasonState,
} from "@/lib/market/investmentSeasons";
import {
  MIN_RECURRING_AMOUNT,
  normalizeRecurringInvestments,
  processRecurringInvestments,
} from "@/lib/market/recurringInvestments";
import {
  buildTradingStats,
  claimAttendanceState,
  getPlayerTitle,
  normalizeAttendance,
  unlockedPlayerTitles,
  type AttendanceState,
} from "@/lib/player/playerProfile";
import {
  getPortfolioStrategy,
  normalizePortfolioStrategyId,
  type PortfolioStrategyId,
} from "@/lib/market/portfolioStrategies";
import { computePrestige } from "@/lib/player/prestige";
import { reconcileAmcLedgerCash } from "@/lib/player/amcLedger";
import {
  createAmcValuationPriceResolver,
  getAmcCharacterLinkedHoldings,
  getAmcPortfolioValue,
  mergeAmcPortfolioFunds,
} from "@/lib/player/amcPortfolio";
import {
  getSeasonReward,
  mergeSeasonRewards,
  normalizeSeasonRewardIds,
  normalizeSelectedSeasonFrame,
  rewardsFromSeasonHistory,
  type SeasonRewardId,
} from "@/lib/player/seasonRewards";
import {
  dilutePlayerCompanyCapitalCall as diluteCompanyCapitalCall,
  foundPlayerCompany as createPlayerCompany,
  fundPlayerCompanyCapitalCall as fundCompanyCapitalCall,
  markPlayerCompanyIpoRequested as markCompanyIpoRequested,
  normalizePlayerCompany,
  preparePlayerCompanyCapitalCall as prepareCompanyCapitalCall,
  refusePlayerCompanyCapitalCall as refuseCompanyCapitalCall,
  resumePlayerCompany as resumeCompany,
  type FoundPlayerCompanyInput,
  type PlayerCompanyState,
} from "@/lib/player/playerCompany";
import {
  AMC_FEE_INTERVAL_DAYS,
  AMC_REBALANCE_WINDOW_DAYS,
  amcFundStockId,
  autoRebalancePassiveFunds,
  computeAmcFundBasketPriceFactor,
  computeAmcFundNavPerShare,
  createAmcFund as createManagedFund,
  evaluateAmcCompliance,
  foundAssetManager as createAssetManager,
  isAmcFundStockId,
  isAmcShareAdjustmentCoolingDown,
  markAmcFundVoluntarilyDelisted,
  normalizeAssetManager,
  parseAmcFundId,
  rebalanceAmcFund as rebalanceManagedFund,
  updateAmcShareAdjustmentSettings as updateManagedFundShareAdjustment,
  updateAmcComparisonStock as updateManagedFundComparisonStock,
  resolveAmcDividendPeriodRate,
  settleAmcManagementFees,
  settleAmcManagerDividends,
  upgradeAmcFundHoldingBases,
  type AmcHoldingWeight,
  type AssetManagerState,
  type CreateAmcFundInput,
  type FoundAssetManagerInput,
  type UpdateAmcShareAdjustmentInput,
  type UpdateAmcComparisonStockInput,
} from "@/lib/player/assetManager";
import {
  listMyAmcFoundationRequests,
  markAmcFoundationShipped,
  verifyAmcFoundationApproval,
} from "@/lib/supabase/amcFoundationRequests";
import {
  listMyAmcEtfListingRequests,
  markAmcEtfListingShipped,
  reconcileOwnedListingRequestsIntoManager,
  submitAmcEtfListingRequest,
  verifyAmcEtfListingApproval,
} from "@/lib/supabase/amcEtfListingRequests";
import {
  adjustAmcListedFundShares,
  bootstrapAmcPosition,
  fetchMyAmcLedger,
  fetchListedAmcFundsByIds,
  fetchListedAmcFundsByManager,
  fetchLiveListedAmcFunds,
  listedFundToAmcState,
  mergeListedAumIntoManager,
  publishAmcListedFund,
  rebuildAssetManagerFromOwnedListed,
  settleAmcListedFund,
  syncAmcListedFundMeta,
  tradeAmcListedFund,
  updateAmcListedFundShareAdjustment,
  updateAmcListedFundComparisonStock,
  voluntarilyDelistAmcListedFund,
  upsertListedCache,
  type ListedAmcFund,
} from "@/lib/supabase/amcListedFunds";
import {
  recoverAssetManagerFromServerRecords,
  recoverPlayerCompanyFromServerRecords,
} from "@/lib/player/serverEntityRecovery";

// 시장은 항상 로컬 결정론으로 계산된다. Supabase는 로그인·지갑 저장·랭킹
// (계정 레이어) 전용이며 별도 "서버 모드"는 없다.

interface MarketStore extends MarketSnapshot {
  userId: string | null;
  isReady: boolean;
  /** 로그인 지갑을 클라우드에서 확인한 뒤에만 자동 저장을 허용한다. */
  cloudSyncReady: boolean;
  refreshingAmcLedger: boolean;
  /** 미체결 지정가 주문 */
  openOrders: OpenOrder[];
  /** 보유 사치재 (재화 sink) — 가치는 순자산에 합산되어 랭킹에 반영 */
  ownedLuxuries: OwnedLuxury[];
  /** 순자산 추이 기록 (에쿼티 커브·랭킹 스냅샷) */
  netWorthHistory: NetWorthPoint[];
  /** 마지막 강제청산(마진콜) 시각 — 배너 표시용 (없으면 null) */
  marginCallAt: number | null;
  /** 기본은 해제이며, 켠 경우에만 선택 배율까지 총노출을 허용한다. */
  marginEnabled: boolean;
  marginLeverage: MarginLeverage;
  setMarginEnabled: (enabled: boolean) => OrderResult;
  setMarginLeverage: (leverage: MarginLeverage) => OrderResult;
  /** 현금 전용 거래일 단위 자동 소수점 매수 계획. */
  recurringInvestments: RecurringInvestment[];
  createRecurringInvestment: (
    stockId: string,
    amount: number,
    intervalSessions: 1 | 5 | 20,
  ) => OrderResult;
  toggleRecurringInvestment: (planId: string) => void;
  cancelRecurringInvestment: (planId: string) => void;
  attendance: AttendanceState;
  selectedTitleId: string;
  claimDailyAttendance: () => OrderResult;
  /**
   * 로그인 계정이 대상 조치(TARGETED_ACCOUNT_ACTIONS)에 있으면 지갑을 초기화하고
   * 보상을 지급한다. 이미 적용한 버전이면 무시(멱등). 리셋이 적용됐으면 true.
   */
  applyTargetedAccountReset: () => boolean;
  selectPlayerTitle: (titleId: string) => OrderResult;
  /** 수락 시점부터 정확히 1거래일 동안 진행하는 단기 작전. */
  dailyOperation: DailyOperation | null;
  dailyOperationHistory: DailyOperation[];
  acceptDailyOperation: (offerId: DailyOperationId) => OrderResult;
  /** 별도 전략 화면에서 선언하는 현재 포트폴리오 운용 기준. */
  selectedPortfolioStrategyId: PortfolioStrategyId;
  portfolioStrategySelectedAt: number;
  selectPortfolioStrategy: (strategyId: PortfolioStrategyId) => OrderResult;
  /** 시즌 티어로 영구 해금한 프로필 프레임과 현재 장착 프레임. */
  unlockedSeasonRewardIds: SeasonRewardId[];
  selectedSeasonFrameId: SeasonRewardId | null;
  selectSeasonFrame: (frameId: SeasonRewardId | null) => OrderResult;
  /** 사치재 구매: 현금 차감 후 보유 목록에 추가 (아이템당 1개) */
  purchaseLuxury: (itemId: string) => OrderResult;
  /** 보유 사치재 총 가치(센트) */
  getLuxuryValue: () => number;
  /** 마이룸에 배치된 가구 (재화 sink — 순자산·랭킹 미합산). */
  myRoomItems: PlacedRoomItem[];
  /** 마이룸 확장 단계 (0 = 기본 방). */
  myRoomLevel: number;
  /** 다음 단계 방 크기 확장권 구매 (1회성, 환불 없음). */
  expandMyRoom: () => OrderResult;
  /** 적용 중인 숙소 테마 id. */
  myRoomTheme: string;
  /** 보유(구매)한 숙소 테마 id 목록. */
  myRoomOwnedThemes: string[];
  /** 친밀도로 초대해 상주 중인 CEO 캐릭터 id 목록. */
  myRoomResidentCharacterIds: string[];
  inviteRoomResident: (characterId: string) => OrderResult;
  dismissRoomResident: (characterId: string) => OrderResult;
  /** 숙소 테마 구매(1회성) 후 즉시 적용. */
  buyRoomTheme: (themeId: string) => OrderResult;
  /** 보유한 숙소 테마로 교체. */
  selectRoomTheme: (themeId: string) => OrderResult;
  /** 마이룸 가구 구매 + 지정 칸에 배치 (현금 차감). */
  buyRoomItem: (itemId: string, x: number, y: number, rotation?: RoomRotation) => OrderResult;
  /** 배치된 가구를 다른 칸으로 이동. */
  moveRoomItem: (index: number, x: number, y: number, rotation?: RoomRotation) => OrderResult;
  /** 배치된 다칸 가구를 90도 회전. */
  rotateRoomItem: (index: number) => OrderResult;
  /** 같은 보유 가구 구성의 저장된 배치·회전을 한 번에 적용. */
  applyRoomLayout: (items: PlacedRoomItem[]) => OrderResult;
  /** 배치된 가구 되팔기 — 구매가의 50% 환불, 나머지는 소각. */
  sellRoomItem: (index: number) => OrderResult;
  /** 공매도 개시 (시장가) */
  openShortPosition: (stockId: string, quantity: number) => OrderResult;
  /** 공매도 청산(cover, 시장가) */
  coverShortPosition: (stockId: string, quantity: number) => OrderResult;
  /** 추가 매수·공매도 여력 (현금 환산, 마진 포함) */
  getBuyingPower: () => number;
  /** 자기자본(순자산) = 현금 + 롱 + 사치재 − 공매도 부채 */
  getEquity: () => number;
  /** 현재 금리 단계 (1완화·2중립·3긴축) */
  getRateLevel: () => RateLevel;
  /** 달성한 업적 id 목록 */
  achievements: string[];
  /** 현재 상태 기준으로 새 업적을 판정·해금 (토스트) */
  checkAchievements: () => void;
  /** 현재 복권 회차 시작 거래일 */
  lotteryWindowStart: number;
  /** 현재 회차에 구매한 복권 장수 (일반+연금 합산) */
  lotteryTicketsBought: number;
  /** 잭팟 당첨 이력 (업적용) */
  wonJackpot: boolean;
  /** 연금 복권 당첨으로 받는 정기 연금 목록 */
  pensionAnnuities: PensionAnnuity[];
  /** 5거래일 투자 의뢰·평판 진행 상태 */
  investmentMission: InvestmentMission | null;
  missionHistory: InvestmentMissionHistory[];
  reputation: number;
  /** 캐릭터별 업무 신뢰도·개인 호감도. */
  characterProgress: CharacterProgressMap;
  /** 동맹 관계 보상으로 발행받은 우선주 (매매불가 지갑 자산). */
  preferredShares: PreferredShare[];
  /** 한 번이라도 우선주가 발행된 캐릭터 id (매각 후 재발행 방지). */
  preferredIssuedCharacterIds: string[];
  /** 유의미 분산(5캐릭터↑)이 시작된 거래일 — 5거래일 유예 후 휴면분 매각. null이면 미분산. */
  preferredDiversifiedSince: number | null;
  readCharacterMessageIds: string[];
  /** 운영자 회신을 이미 처리(보상 지급·표시)한 버그 리포트 id. 중복 지급 방지. */
  resolvedBugReportIds: string[];
  /** 운영자 회신을 이미 처리한 피드백 id. 중복 지급 방지. */
  resolvedFeedbackIds: string[];
  /** 반려 회신·환불을 이미 처리한 IPO 요청 id. 중복 환불 방지. */
  resolvedStockRequestIds: string[];
  /** 이미 받은 전 계정 운영 보상(롤백 보상 등) id. 중복 지급 방지. */
  claimedCompensationIds: string[];
  /**
   * 운영자가 처리한 버그 리포트 회신을 반영한다. 수정 완료(fixed)엔 보상을
   * 지급하고, 이미 처리한 id 는 건너뛴다(멱등). 새로 처리한 회신 목록을 돌려준다.
   */
  resolveBugReports: (
    responses: {
      id: string;
      title: string;
      status: "fixed" | "wontfix";
      message: string | null;
      rewardCents: number;
    }[],
  ) => {
    id: string;
    title: string;
    status: "fixed" | "wontfix";
    message: string | null;
    rewardCents: number;
  }[];
  /**
   * 운영자가 처리한 피드백 회신을 반영한다. 반영 완료(done)엔 보상을 지급하고,
   * 이미 처리한 id 는 건너뛴다(멱등). 새로 처리한 회신 목록을 돌려준다.
   */
  resolveFeedbackResponses: (
    responses: {
      id: string;
      title: string;
      status: "done" | "declined";
      message: string | null;
      rewardCents: number;
    }[],
  ) => {
    id: string;
    title: string;
    status: "done" | "declined";
    message: string | null;
    rewardCents: number;
  }[];
  /** 반려된 IPO 요청의 사유를 전달하고 신청 비용을 한 번만 환불한다. */
  resolveStockRequestResponses: (
    responses: {
      id: string;
      title: string;
      status: "rejected";
      message: string | null;
      refundCents: number;
    }[],
  ) => {
    id: string;
    title: string;
    status: "rejected";
    message: string | null;
    refundCents: number;
  }[];
  investmentMastery: InvestmentMasteryState;
  /** 20거래일 지수 대비 티어 시즌과 최근 결과. */
  investmentSeason: InvestmentSeasonState;
  selectInvestmentSeasonGoal: (goalId: SeasonGoalId, targetWeight: number) => OrderResult;
  selectInvestmentSeasonTrait: (traitId: SeasonTraitId) => OrderResult;
  markSeasonCeremonySeen: (seasonId: string) => void;
  markCharacterMessageRead: (messageId: string) => void;
  markAllCharacterMessagesRead: (messageIds: string[]) => void;
  acceptInvestmentMission: (kind: InvestmentMissionKind) => OrderResult;
  /** 현재 연속 사건에 내린 판단과 최근 정산 기록. */
  storyDecision: StoryDecision | null;
  storyDecisionHistory: StoryDecision[];
  chooseStoryDecision: (kind: StoryDecisionKind) => OrderResult;
  /** 숫자 복권 1장 구매 (1~45 중 5개 픽). 즉석 추첨 결과 반환 */
  buyLottoTicket: (picks: number[]) => LottoResult;
  /** 연금 복권 1장 구매. 당첨 시 정기 연금 지급 */
  buyPensionTicket: () => LottoResult;
  /** 이번 회차 남은 복권 장수 */
  getLotteryTicketsLeft: () => number;
  /** 미니게임(노동 소득) 현금 지급. 시즌·투자 성과에서 제외되는 외생 소득. */
  awardMinigameCash: (amount: number, label: string) => void;
  /** 초고액 계정 전용 비상장 회사. 회사 가치는 순자산에 합산하지 않는다. */
  playerCompany: PlayerCompanyState | null;
  /** 서버 신청·결제 기록으로 유실된 회사 객체를 복원한다. */
  refreshServerPlayerCompany: () => Promise<void>;
  foundPlayerCompany: (
    input: FoundPlayerCompanyInput,
    approvalRequestId: string,
  ) => Promise<OrderResult>;
  preparePlayerCompanyCapitalCall: () => void;
  fundPlayerCompanyCapitalCall: () => OrderResult;
  dilutePlayerCompanyCapitalCall: () => OrderResult;
  refusePlayerCompanyCapitalCall: () => OrderResult;
  resumePlayerCompany: () => OrderResult;
  markPlayerCompanyIpoRequested: () => OrderResult;
  /** 자산운용사·유저 ETF. 보유 좌의 NAV 평가액도 총자산·랭킹에 합산한다. */
  assetManager: AssetManagerState | null;
  /** 공유 상장된 유저 ETF(타 계정 포함). AMC 탭 마켓·AUM 동기화용. */
  listedAmcFunds: ListedAmcFund[];
  refreshListedAmcFunds: () => Promise<void>;
  foundAssetManager: (
    input: FoundAssetManagerInput,
    approvalRequestId: string,
  ) => Promise<OrderResult>;
  createAmcFund: (input: CreateAmcFundInput) => Promise<OrderResult>;
  /** ETF 상장 허가 재신청 (반려·미신청). */
  requestAmcFundListing: (fundId: string) => Promise<OrderResult>;
  /** 상장 허가된 ETF를 공유 마켓에 올립니다. */
  listAmcFundOnMarket: (fundId: string) => Promise<OrderResult>;
  rebalanceAmcFund: (
    fundId: string,
    holdings: AmcHoldingWeight[],
  ) => Promise<OrderResult>;
  voluntarilyDelistAmcFund: (fundId: string) => Promise<OrderResult>;
  updateAmcFundShareAdjustment: (
    fundId: string,
    input: UpdateAmcShareAdjustmentInput,
  ) => Promise<OrderResult>;
  updateAmcFundComparisonStock: (
    fundId: string,
    input: UpdateAmcComparisonStockInput,
  ) => Promise<OrderResult>;
  buyAmcFund: (fundId: string, quantity: number) => Promise<OrderResult>;
  sellAmcFund: (fundId: string, quantity: number) => Promise<OrderResult>;
  /** 마지막 종목 추가 요청 거래일 (쿨다운용). 없으면 미요청. */
  lastStockRequestSession?: number;
  /** 종목 추가 요청 가능 여부(현금·쿨다운) */
  canRequestStock: () => { ok: boolean; reason?: string; daysLeft?: number };
  /** 종목 추가 요청 비용 차감·쿨다운 기록 (Supabase 저장 성공 후 호출) */
  chargeStockRequest: () => void;
  /** 옵션 매수 (프리미엄 지불) */
  buyOption: (
    stockId: string,
    kind: OptionKind,
    strike: number,
    expirySession: number,
    quantity: number,
  ) => OrderResult;
  /** 옵션 발행/매도 (프리미엄 수취·증거금) */
  writeOption: (
    stockId: string,
    kind: OptionKind,
    strike: number,
    expirySession: number,
    quantity: number,
  ) => OrderResult;
  /** 옵션 포지션 청산 (long은 되팔기, short은 되사기) */
  closeOption: (optionId: string, quantity: number) => OrderResult;
  placeLimitOrder: (
    stockId: string,
    price: number,
    quantity: number,
    side: "buy" | "sell",
  ) => Promise<OrderResult>;
  cancelOrder: (orderId: string) => Promise<void>;
  setReady: (ready: boolean) => void;
  setUserId: (id: string | null) => void;
  setCloudSyncReady: (ready: boolean) => void;
  /** 로그인 시 클라우드 저장분(지갑)을 불러와 반영 */
  loadCloudSave: () => Promise<"loaded" | "created" | "offline">;
  /** 현재 지갑을 클라우드에 저장 (로그인 시에만) */
  /** 지갑을 클라우드에 저장한다. 실패(오프라인 등) 시 false — 호출부가 재시도한다. */
  saveCloud: () => Promise<boolean>;
  /** 큰 지갑 JSON을 다시 올리지 않고 현재 공개 랭킹 스냅샷만 갱신한다. */
  syncLeaderboardNow: () => Promise<boolean>;
  placeOrder: (
    stockId: string,
    quantity: number,
    orderType: OrderType,
  ) => Promise<OrderResult>;
  tickMarket: () => void;
  /** Web Worker가 계산한 공통 시장 체크포인트를 지갑과 분리해 반영한다. */
  applyMarketCheckpoint: (checkpoint: MarketCheckpoint) => void;
  /** 주문 전·복원 직후 밀린 급여와 투자 분배금을 정산 */
  settleCashflows: () => void;
  buyMarket: (stockId: string, quantity: number) => OrderResult;
  sellMarket: (stockId: string, quantity: number) => OrderResult;
  buyCurrent: (stockId: string, quantity: number) => OrderResult;
  sellCurrent: (stockId: string, quantity: number) => OrderResult;
  reset: () => void;
  getTotalAssets: () => number;
  getStockById: (id: string) => StockState | undefined;
}

function createInitialState(): MarketSnapshot & {
  userId: string | null;
  isReady: boolean;
  cloudSyncReady: boolean;
  refreshingAmcLedger: boolean;
  openOrders: OpenOrder[];
  ownedLuxuries: OwnedLuxury[];
  netWorthHistory: NetWorthPoint[];
  marginCallAt: number | null;
  marginEnabled: boolean;
  marginLeverage: MarginLeverage;
  recurringInvestments: RecurringInvestment[];
  attendance: AttendanceState;
  selectedTitleId: string;
  dailyOperation: DailyOperation | null;
  dailyOperationHistory: DailyOperation[];
  selectedPortfolioStrategyId: PortfolioStrategyId;
  portfolioStrategySelectedAt: number;
  unlockedSeasonRewardIds: SeasonRewardId[];
  selectedSeasonFrameId: SeasonRewardId | null;
  achievements: string[];
  lotteryWindowStart: number;
  lotteryTicketsBought: number;
  wonJackpot: boolean;
  pensionAnnuities: PensionAnnuity[];
  lastStockRequestSession?: number;
  investmentMission: InvestmentMission | null;
  missionHistory: InvestmentMissionHistory[];
  reputation: number;
  characterProgress: CharacterProgressMap;
  preferredShares: PreferredShare[];
  preferredIssuedCharacterIds: string[];
  preferredDiversifiedSince: number | null;
  readCharacterMessageIds: string[];
  resolvedBugReportIds: string[];
  resolvedFeedbackIds: string[];
  resolvedStockRequestIds: string[];
  claimedCompensationIds: string[];
  myRoomItems: PlacedRoomItem[];
  myRoomLevel: number;
  myRoomTheme: string;
  myRoomOwnedThemes: string[];
  myRoomResidentCharacterIds: string[];
  investmentMastery: InvestmentMasteryState;
  investmentSeason: InvestmentSeasonState;
  storyDecision: StoryDecision | null;
  storyDecisionHistory: StoryDecision[];
  playerCompany: PlayerCompanyState | null;
  assetManager: AssetManagerState | null;
  listedAmcFunds: ListedAmcFund[];
} {
  const now = Date.now();
  const initialMarket = hydrateMarketCheckpoint(getBundledMarketCheckpoint());
  return {
    marketVersion: MARKET_SIM_VERSION,
    walletEpoch: WALLET_EPOCH,
    sessionDurationMs: SESSION_DURATION_MS,
    tick: initialMarket.tick,
    // 시장은 항상 고정 기원점 기반 결정론 — 모든 클라이언트가 동일한 시장을 본다
    marketStartedAt: MARKET_EPOCH_MS,
    cash: INITIAL_CASH,
    amcLedgerBalance: 0,
    amcLedgerRevision: 0,
    initialCash: INITIAL_CASH,
    lastSalarySession: Math.floor(now / SESSION_DURATION_MS),
    // 분배·배당 회차는 기원점 절대 그리드에 정렬 (배당락 시점과 일치)
    lastMonthlyDistributionSession: alignSessionToGrid(
      Math.floor(now / SESSION_DURATION_MS),
      COVERED_CALL_INTERVAL_DAYS,
    ),
    lastSingleCoveredCallDistributionSession: alignSessionToGrid(
      Math.floor(now / SESSION_DURATION_MS),
      SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
    ),
    lastQuarterlyDividendSession: alignSessionToGrid(
      Math.floor(now / SESSION_DURATION_MS),
      QUARTERLY_DIVIDEND_INTERVAL_DAYS,
    ),
    holdings: [],
    shorts: [],
    options: [],
    lastInterestSession: Math.floor(now / SESSION_DURATION_MS),
    trades: [],
    cashPayments: [],
    stocks: initialMarket.stocks,
    events: initialMarket.events,
    userId: null,
    isReady: false,
    cloudSyncReady: false,
    refreshingAmcLedger: false,
    openOrders: [],
    ownedLuxuries: [],
    netWorthHistory: [],
    marginCallAt: null,
    marginEnabled: false,
    marginLeverage: DEFAULT_MARGIN_LEVERAGE,
    recurringInvestments: [],
    attendance: normalizeAttendance(undefined),
    selectedTitleId: "rookie",
    dailyOperation: null,
    dailyOperationHistory: [],
    selectedPortfolioStrategyId: "index_core",
    portfolioStrategySelectedAt: 0,
    unlockedSeasonRewardIds: [],
    selectedSeasonFrameId: null,
    achievements: [],
    lotteryWindowStart: alignSessionToGrid(
      Math.floor(now / SESSION_DURATION_MS),
      LOTTERY_INTERVAL_DAYS,
    ),
    lotteryTicketsBought: 0,
    wonJackpot: false,
    pensionAnnuities: [],
    investmentMission: null,
    missionHistory: [],
    reputation: 0,
    characterProgress: {},
    preferredShares: [],
    preferredIssuedCharacterIds: [],
    preferredDiversifiedSince: null,
    readCharacterMessageIds: [],
    resolvedBugReportIds: [],
    resolvedFeedbackIds: [],
    resolvedStockRequestIds: [],
    // 신규 계정은 기존 운영 보상 지급 대상이 아니므로 전부 수령 완료로 시작한다.
    claimedCompensationIds: OPERATIONAL_COMPENSATIONS.map(
      (compensation) => compensation.id,
    ),
    myRoomItems: [],
    myRoomLevel: 0,
    myRoomTheme: normalizeRoomThemeId(undefined),
    myRoomOwnedThemes: normalizeOwnedRoomThemes(undefined),
    myRoomResidentCharacterIds: [],
    investmentMastery: createInitialMastery(),
    investmentSeason: createInitialInvestmentSeasonState(),
    storyDecision: null,
    storyDecisionHistory: [],
    playerCompany: null,
    assetManager: null,
    listedAmcFunds: [],
  };
}

/**
 * 지갑의 마지막 유저 활동 시각(거래·현금 지급·사건 판단 기준).
 * 클라우드 저장분과 로컬 캐시 중 어느 쪽이 최신 기록인지 판정할 때 쓴다.
 */
function latestWalletActivityMs(wallet: {
  trades?: Trade[];
  cashPayments?: CashPayment[];
  storyDecision?: StoryDecision | null;
  storyDecisionHistory?: StoryDecision[];
  playerCompany?: PlayerCompanyState | null;
  assetManager?: AssetManagerState | null;
}): number {
  const candidates = [
    wallet.trades?.[0]?.timestamp,
    wallet.cashPayments?.[0]?.timestamp,
    wallet.storyDecision?.selectedAt,
    wallet.storyDecisionHistory?.[0]?.selectedAt,
    wallet.playerCompany?.lastActionAt,
    wallet.assetManager?.lastActionAt,
  ];
  return candidates.reduce<number>(
    (max, value) =>
      typeof value === "number" && Number.isFinite(value) && value > max
        ? value
        : max,
    0,
  );
}

function canPlaceRoomItemAt(
  items: PlacedRoomItem[],
  itemId: string,
  x: number,
  y: number,
  level: number,
  rotation: RoomRotation = 0,
  excludeIndex = -1,
): boolean {
  const item = getRoomItem(itemId);
  if (!item || !isValidRoomPlacement(item, x, y, level, rotation)) return false;
  const cells = roomItemCells(item, x, y, rotation);
  const keys = new Set(cells.map((cell) => `${cell.x}:${cell.y}`));
  const layer = roomItemLayer(item);
  let hasSupport = !item.requiresSupport;
  for (let index = 0; index < items.length; index++) {
    if (index === excludeIndex) continue;
    const placed = items[index];
    const other = getRoomItem(placed.itemId);
    if (!other) continue;
    const otherCells = roomItemCells(
      other,
      placed.x,
      placed.y,
      placed.rotation ?? 0,
    );
    const overlaps = otherCells.some((cell) => keys.has(`${cell.x}:${cell.y}`));
    if (!overlaps) continue;
    if (roomItemLayer(other) === layer) return false;
    if (item.requiresSupport && roomItemLayer(other) === "furniture") hasSupport = true;
  }
  return hasSupport;
}

function ensureEventDialogue(event: MarketEvent): MarketEvent {
  return withCharacterQuote(
    event,
    seededRand(event.timestamp, `event-dialogue:${event.id}`),
  );
}

/** 순자산 기록 최소 간격(ms) — 과도한 기록으로 저장소가 비대해지는 것을 막는다. */
const NET_WORTH_SAMPLE_MS = 30 * 60 * 1000;
const MAX_NET_WORTH_POINTS = 240;

/** 마지막 기록 이후 충분히 지났으면 순자산 스냅샷을 한 점 덧붙인다. */
function appendNetWorthPoint(
  history: NetWorthPoint[],
  value: number,
  now: number,
): NetWorthPoint[] {
  const last = history[history.length - 1];
  if (last && now - last.t < NET_WORTH_SAMPLE_MS) return history;
  return [...history, { t: now, value }].slice(-MAX_NET_WORTH_POINTS);
}

/** 현재 기준금리(연 소수) */
function currentRateDecimal(stocks: StockState[]): number {
  return getAnnualRatePercent(getRateLevel(getBenchmark(stocks))) / 100;
}

interface MarginContext {
  prices: Record<string, number>;
  equity: number;
  exposure: number;
}

/** 옵션까지 포함한 자기자본·총노출 (마진·청산 판단의 단일 진실) */
function marginContext(s: {
  cash: number;
  holdings: Holding[];
  shorts: ShortPosition[];
  options: OptionPosition[];
  stocks: StockState[];
  ownedLuxuries: OwnedLuxury[];
}): MarginContext {
  const prices = Object.fromEntries(s.stocks.map((x) => [x.id, x.currentPrice]));
  const luxuryVal = getLuxuryValue(s.ownedLuxuries);
  // 옵션 마크는 장중 잔존만기(소수 거래일)로 평가해 0DTE의 시간가치 소멸을
  // 실시간 반영한다. 만기 '정산' 판정만 정수 거래일 경계를 쓴다.
  const session = Date.now() / SESSION_DURATION_MS;
  const rate = currentRateDecimal(s.stocks);
  const stockEquity = computeEquity(
    s.cash,
    s.holdings,
    s.shorts,
    prices,
    luxuryVal,
  );
  const optDelta = optionsEquityDelta(s.options, s.stocks, session, rate);
  const exposure =
    grossExposure(s.holdings, s.shorts, prices) +
    optionsGrossExposure(s.options, s.stocks, session, rate);
  return { prices, equity: stockEquity + optDelta, exposure };
}

type MarginAwareState = Parameters<typeof marginContext>[0] & {
  marginEnabled?: boolean;
  marginLeverage?: MarginLeverage;
};

function effectiveLeverage(s: MarginAwareState): number {
  return s.marginEnabled ? normalizeMarginLeverage(s.marginLeverage) : 1;
}

function fullBuyingPower(s: MarginAwareState): number {
  const { equity, exposure } = marginContext(s);
  return Math.max(0, effectiveLeverage(s) * equity - exposure);
}

/** 현물 매수는 미수 해제 시 현금과 1배 노출 한도를 모두 넘지 못한다. */
function longBuyingPower(s: MarginAwareState): number {
  const capacity = fullBuyingPower(s);
  return s.marginEnabled ? capacity : Math.max(0, Math.min(s.cash, capacity));
}

function fullEquityOf(s: Parameters<typeof marginContext>[0]): number {
  return marginContext(s).equity;
}

function userEtfRelationshipHoldingsOf(
  state: Pick<MarketStore, "holdings" | "stocks" | "assetManager" | "listedAmcFunds">,
) {
  const funds = mergeAmcPortfolioFunds(
    state.assetManager?.funds ?? [],
    state.listedAmcFunds.map(listedFundToAmcState),
  );
  return getAmcCharacterLinkedHoldings(state.holdings, funds, state.stocks);
}

function userEtfPortfolioValueOf(
  state: Pick<
    MarketStore,
    "holdings" | "stocks" | "assetManager" | "listedAmcFunds"
  >,
): number {
  const funds = mergeAmcPortfolioFunds(
    state.assetManager?.funds ?? [],
    state.listedAmcFunds.map(listedFundToAmcState),
  );
  return getAmcPortfolioValue(state.holdings, funds, state.stocks);
}

function relationshipEquityOf(
  state: Pick<MarketStore, "holdings" | "stocks" | "assetManager" | "listedAmcFunds"> &
    Parameters<typeof marginContext>[0],
): { equity: number; userEtfHoldings: ReturnType<typeof userEtfRelationshipHoldingsOf> } {
  const userEtfHoldings = userEtfRelationshipHoldingsOf(state);
  return {
    equity:
      fullEquityOf(state) +
      userEtfHoldings.reduce((sum, holding) => sum + holding.value, 0),
    userEtfHoldings,
  };
}

interface OverflowRepair {
  broken: boolean;
  cash: number;
  holdings: Holding[];
  shorts: ShortPosition[];
  options: OptionPosition[];
  marginEnabled: boolean;
}

/**
 * 2^53(≈$90.07조) 정수 경계를 넘겨 자산 계산이 깨진 계정을 복구한다. 자금 상한을
 * 없애기 전, 오버플로우로 순자산이 비정상 마이너스가 되거나 NaN/Infinity로 오염된
 * 계정에 한해 오염된 파생 부채(공매도·옵션·미수)를 청산하고 $10,000,000 복구
 * 지원금을 지급한다. 판정 자체가 멱등성 — 복구 뒤엔 유한·양수라 다시 발동하지
 * 않으며, 정상 플레이의 소소한 마이너스(공매도·마진 손실)는 대상이 아니다. */
function recoverFromOverflow(state: {
  cash: number;
  holdings: Holding[];
  shorts: ShortPosition[];
  options: OptionPosition[];
  stocks: StockState[];
  ownedLuxuries: OwnedLuxury[];
  marginEnabled: boolean;
}): OverflowRepair {
  const holdingFinite = (h: Holding) =>
    Number.isFinite(h.quantity) && Number.isFinite(h.averagePrice);
  const shortFinite = (s: ShortPosition) =>
    Number.isFinite(s.quantity) && Number.isFinite(s.averagePrice);
  const optionFinite = (o: OptionPosition) =>
    Number.isFinite(o.strike) &&
    Number.isFinite(o.quantity) &&
    Number.isFinite(o.openPremium);

  const cleanHoldings = state.holdings.filter(holdingFinite);
  const cleanShorts = state.shorts.filter(shortFinite);
  const cleanOptions = state.options.filter(optionFinite);
  const hadCorruptPosition =
    cleanHoldings.length !== state.holdings.length ||
    cleanShorts.length !== state.shorts.length ||
    cleanOptions.length !== state.options.length;
  const cashFinite = Number.isFinite(state.cash);

  // 오염 포지션을 걷어낸 상태에서 순자산을 다시 평가한다.
  const equity = fullEquityOf({
    ...state,
    cash: cashFinite ? state.cash : 0,
    holdings: cleanHoldings,
    shorts: cleanShorts,
    options: cleanOptions,
  });
  const broken =
    !cashFinite ||
    hadCorruptPosition ||
    !Number.isFinite(equity) ||
    equity < OVERFLOW_BROKEN_NET_WORTH_FLOOR;

  if (!broken) {
    return {
      broken: false,
      cash: state.cash,
      holdings: state.holdings,
      shorts: state.shorts,
      options: state.options,
      marginEnabled: state.marginEnabled,
    };
  }

  // 파손 계정은 오염된 파생 부채를 전부 청산하고 유한한 현물만 남긴 뒤 복구
  // 지원금으로 재출발시킨다. 결과가 유한·양수라 다시 발동하지 않는다.
  return {
    broken: true,
    cash: OVERFLOW_RECOVERY_GRANT_CENTS,
    holdings: cleanHoldings,
    shorts: [],
    options: [],
    marginEnabled: false,
  };
}

function fullNeedsLiquidation(s: MarginAwareState): boolean {
  const { equity, exposure } = marginContext(s);
  if (exposure <= 0) return false;
  const maintenance = maintenanceMarginForLeverage(effectiveLeverage(s));
  return equity < maintenance * exposure;
}

interface InterestOutcome {
  cash?: number;
  cashPayments?: CashPayment[];
  lastInterestSession: number;
}

/** 경과 거래일만큼 마진 이자·공매도 대여수수료를 현금에서 차감한다. */
function settleInterest(
  state: Pick<
    MarketStore,
    "cash" | "shorts" | "stocks" | "cashPayments" | "lastInterestSession"
  >,
  currentSession: number,
  now: number,
): InterestOutcome | null {
  const elapsed = currentSession - (state.lastInterestSession ?? currentSession);
  if (elapsed <= 0) return null;
  const prices = Object.fromEntries(
    state.stocks.map((s) => [s.id, s.currentPrice]),
  );
  const debit = marginDebit(state.cash);
  const shortVal = shortLiability(state.shorts, prices);
  const level = getRateLevel(getBenchmark(state.stocks));
  const cost = accrueBorrowCost(
    debit,
    shortVal,
    getAnnualRatePercent(level),
    elapsed,
  );
  if (cost <= 0) return { lastInterestSession: currentSession };
  const payment: CashPayment = {
    id: `interest-${currentSession}`,
    kind: "interest",
    sourceId: "margin",
    dueSession: currentSession,
    amount: -cost,
    timestamp: now,
  };
  return {
    cash: state.cash - cost,
    cashPayments: [payment, ...state.cashPayments].slice(0, 200),
    lastInterestSession: currentSession,
  };
}

/** 만기 도달 옵션을 내재가치로 현금정산하고 제거한다. */
function settleExpiredOptions(
  cash: number,
  options: OptionPosition[],
  stocks: StockState[],
  currentSession: number,
  now: number,
): { cash: number; options: OptionPosition[]; trades: Trade[] } {
  let nextCash = cash;
  const remaining: OptionPosition[] = [];
  const trades: Trade[] = [];
  for (const pos of options) {
    if (pos.expirySession > currentSession) {
      remaining.push(pos);
      continue;
    }
    const stock = stocks.find((s) => s.id === pos.stockId);
    const iv = stock
      ? intrinsic(
          pos.kind,
          effectiveOptionUnderlyingPrice(pos, stock, stocks),
          pos.strike,
        )
      : 0;
    nextCash += (pos.side === "long" ? iv : -iv) * pos.quantity;
    trades.push({
      id: `option-expire-${now}-${pos.id}`,
      stockId: pos.stockId,
      ticker: stock?.ticker ?? pos.stockId.toUpperCase(),
      type: "option_expire",
      quantity: pos.quantity,
      price: iv,
      total: iv * pos.quantity,
      timestamp: now,
      optionId: pos.id,
      optionKind: pos.kind,
      optionSide: pos.side,
      strike: pos.strike,
      expirySession: pos.expirySession,
    });
  }
  return { cash: nextCash, options: remaining, trades };
}

/** 유지증거금 미달 시 롱·공매도·옵션 전 포지션을 현재가/마크로 강제 청산한다. */
function liquidatePositions(
  cash: number,
  holdings: Holding[],
  shorts: ShortPosition[],
  options: OptionPosition[],
  stocks: StockState[],
  trades: Trade[],
  now: number,
): {
  cash: number;
  holdings: Holding[];
  shorts: ShortPosition[];
  options: OptionPosition[];
  trades: Trade[];
} {
  const priceOf = (id: string) =>
    stocks.find((s) => s.id === id)?.currentPrice ?? 0;
  let nextCash = cash;
  let nextTrades = trades;
  const mk = (
    stockId: string,
    ticker: string,
    type: "sell" | "cover",
    quantity: number,
    price: number,
  ): Trade => ({
    id: `liq-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    stockId,
    ticker,
    type,
    quantity,
    price,
    total: price * quantity,
    timestamp: now,
  });
  for (const h of holdings) {
    const price = getMarketSellPrice(priceOf(h.stockId));
    nextCash += price * h.quantity;
    const ticker = stocks.find((s) => s.id === h.stockId)?.ticker ?? h.stockId;
    nextTrades = [mk(h.stockId, ticker, "sell", h.quantity, price), ...nextTrades];
  }
  for (const sh of shorts) {
    const price = getMarketBuyPrice(priceOf(sh.stockId));
    nextCash -= price * sh.quantity;
    const ticker = stocks.find((s) => s.id === sh.stockId)?.ticker ?? sh.stockId;
    nextTrades = [mk(sh.stockId, ticker, "cover", sh.quantity, price), ...nextTrades];
  }
  // 옵션은 현재 마크로 청산 (long=수취, short=지불). 장중 잔존만기로 평가.
  const session = now / SESSION_DURATION_MS;
  const rate = currentRateDecimal(stocks);
  for (const pos of options) {
    const stock = stocks.find((s) => s.id === pos.stockId);
    if (!stock) continue;
    const mark = positionMark(pos, stock, session, rate, stocks);
    nextCash += (pos.side === "long" ? mark : -mark) * pos.quantity;
    nextTrades = [
      {
        id: `liq-option-${now}-${pos.id}`,
        stockId: pos.stockId,
        ticker: stock.ticker,
        type: "option_close",
        quantity: pos.quantity,
        price: mark,
        total: mark * pos.quantity,
        timestamp: now,
        optionId: pos.id,
        optionKind: pos.kind,
        optionSide: pos.side,
        strike: pos.strike,
        expirySession: pos.expirySession,
      },
      ...nextTrades,
    ];
  }
  return {
    cash: nextCash,
    holdings: [],
    shorts: [],
    options: [],
    trades: nextTrades,
  };
}

function migrateStock(stock: StockState & { previousClose?: number }): StockState {
  const withBook = stock.orderBook?.bids?.length
    ? stock
    : { ...stock, orderBook: generateOrderBook(stock.currentPrice) };

  return applyDefinitionOverlay({
    ...withBook,
    prevDayClose:
      withBook.prevDayClose ??
      withBook.previousClose ??
      withBook.currentPrice,
    dayOpen: withBook.dayOpen ?? withBook.currentPrice,
    candles: withBook.candles ?? [],
    dailyCandles: withBook.dailyCandles ?? [],
  });
}

interface SplitEvent {
  ticker: string;
  ratio: number;
}

/**
 * 레버리지·인버스 ETF 보유분을 현재 분할·병합 배수에 맞춰 정산한다.
 * 표시가는 매 틱 밴드로 재계산되므로(computeLeveragedPrice), 좌수도 같은 배수로
 * 함께 움직여야 포지션 가치가 연속된다. 배수는 기초자산의 거래일별 누적 경로에서
 * 정해진 현재 원가격으로 계산하므로, 접속 공백도 목표 배수로 한 번에 정산한다.
 * (좌수 × 신/구, 평단 ÷ 신/구 → 손익·가치 불변)
 */
function reconcileLeverageSplits(
  holdings: Holding[],
  stocks: StockState[],
): { holdings: Holding[]; changed: boolean; events: SplitEvent[] } {
  const byId = new Map(stocks.map((s) => [s.id, s]));
  const targetById = new Map<string, number>();
  for (const s of stocks) {
    if (s.leverage === undefined || !s.leverageUnderlyingId) continue;
    const underlying = byId.get(s.leverageUnderlyingId);
    if (!underlying) continue;
    targetById.set(s.id, leverageMultiplierFor(s, underlying));
  }
  let changed = false;
  const events: SplitEvent[] = [];
  const next = holdings.map((h) => {
    const target = targetById.get(h.stockId);
    if (target === undefined) return h;
    const applied = h.splitMultiplier ?? 1;
    if (!(target > 0) || !(applied > 0) || target === applied) {
      return h.splitMultiplier === target ? h : { ...h, splitMultiplier: target };
    }
    const ratio = target / applied;
    changed = true;
    events.push({ ticker: byId.get(h.stockId)?.ticker ?? h.stockId, ratio });
    return {
      ...h,
      quantity: h.quantity * ratio,
      averagePrice: h.averagePrice / ratio,
      splitMultiplier: target,
    };
  });
  // splitMultiplier만 채워진(값 정산 없는) 변경은 changed로 치지 않아 불필요한
  // 저장·리렌더를 막는다. 하지만 좌수가 바뀌면 반드시 반영해야 한다.
  return { holdings: changed ? next : holdings, changed, events };
}

/**
 * 갓 체결된 레버리지 ETF 보유분에 '현재 분할·병합 배수'를 각인한다.
 * 매수는 이미 표시가(밴드) 기준 좌수로 들어오므로, splitMultiplier를 현재 배수로
 * 세팅해 두어야 다음 tick 정산이 이 좌수를 다시 배수만큼 잘못 늘리지 않는다.
 * (구버전 undefined 보유분은 로드 시 1→현재 배수로 한 번 환산된다.)
 */
function stampLeverageMultiplier(
  holdings: Holding[],
  stockId: string,
  stocks: StockState[],
): Holding[] {
  const stock = stocks.find((s) => s.id === stockId);
  if (!stock || stock.leverage === undefined || !stock.leverageUnderlyingId) {
    return holdings;
  }
  const underlying = stocks.find((s) => s.id === stock.leverageUnderlyingId);
  if (!underlying) return holdings;
  const m = leverageMultiplierFor(stock, underlying);
  return holdings.map((h) =>
    h.stockId === stockId ? { ...h, splitMultiplier: m } : h,
  );
}

function applyLocalBuySell(
  set: (partial: Partial<MarketStore>) => void,
  get: () => MarketStore,
  mode: "buyMarket" | "sellMarket" | "buyCurrent" | "sellCurrent",
  stockId: string,
  quantity: number,
): OrderResult {
  // 지급 경계 뒤 첫 매매라면 기존 보유 수량으로 먼저 정산한다.
  get().settleCashflows();
  const state = get();
  const stock = state.stocks.find((s) => s.id === stockId);
  if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
  if (stock.sector === "선물" || stock.sector === "지수") {
    return {
      success: false,
      message: "지수·선물은 직접 거래할 수 없습니다. ETF를 이용해 주세요.",
    };
  }
  if (!isListed(stock)) {
    return {
      success: false,
      message: "아직 상장 전인 종목입니다. IPO 탭에서 상장 시각을 확인하세요.",
    };
  }

  let price: number;
  let label: string;

  switch (mode) {
    case "buyMarket":
      price = getMarketBuyPrice(stock.currentPrice);
      label = "시장가 매수";
      break;
    case "sellMarket":
      price = getMarketSellPrice(stock.currentPrice);
      label = "시장가 매도";
      break;
    case "buyCurrent":
      price = stock.currentPrice;
      label = "현재가 매수";
      break;
    case "sellCurrent":
      price = stock.currentPrice;
      label = "현재가 판매";
      break;
  }

  if (price <= 0) return { success: false, message: "체결 가능한 호가가 없습니다." };
  if (!isValidShareQuantity(quantity)) {
    return {
      success: false,
      message: "수량은 0.001주 이상, 소수점 6자리까지 입력해 주세요.",
    };
  }

  if (mode.startsWith("buy")) {
    const buyingPower = longBuyingPower(state);
    const total = shareOrderTotal(price, quantity);
    if (total > buyingPower) {
      return { success: false, message: "매수여력이 부족합니다." };
    }
    // 예산 한도는 매수여력으로 이미 판정했으므로 executeBuy 내부 현금 판정은
    // 무한대로 열어둔다(거액 주문이 정수 상한에 걸려 '돈 부족'으로 오거부되지 않게).
    const merged = executeBuy(
      Number.POSITIVE_INFINITY,
      state.holdings,
      stockId,
      stock.ticker,
      price,
      quantity,
      Date.now(),
    );
    if (!isOrderSuccess(merged)) return merged;
    set({
      cash: state.cash - total,
      holdings: stampLeverageMultiplier(merged.holdings, stockId, state.stocks),
      trades: [merged.trade, ...state.trades],
    });
    get().checkAchievements();
    return {
      success: true,
      message:
        state.cash - total < 0
          ? `${label} · 미수 사용 (${formatPrice(price)})`
          : `${label} (${formatPrice(price)})`,
    };
  }

  const result = executeSell(
    state.cash,
    state.holdings,
    stockId,
    stock.ticker,
    price,
    quantity,
    Date.now(),
  );
  if (!isOrderSuccess(result)) return result;
  set({
    cash: result.cash,
    holdings: result.holdings,
    trades: [result.trade, ...state.trades],
  });
  get().checkAchievements();
  return {
    success: true,
    message: `${label} (${formatPrice(price)})`,
  };
}

export const useMarketStore = create<MarketStore>()(
  persist(
    (set, get) => ({
      ...createInitialState(),

      setReady: (ready) => set({ isReady: ready }),
      setUserId: (userId) =>
        set({ userId, cloudSyncReady: userId === null }),
      setCloudSyncReady: (cloudSyncReady) => set({ cloudSyncReady }),
      setMarginEnabled: (enabled) => {
        const state = get();
        if (state.marginEnabled === enabled) {
          return {
            success: true,
            message: enabled ? "미수가 이미 켜져 있습니다." : "미수가 이미 꺼져 있습니다.",
          };
        }
        if (!enabled) {
          const { equity, exposure } = marginContext(state);
          if (state.cash < 0 || exposure > equity + 1) {
            return {
              success: false,
              message: "사용 중인 미수·레버리지를 먼저 상환해야 끌 수 있습니다.",
            };
          }
        }
        set({ marginEnabled: enabled });
        return {
          success: true,
          message: enabled
            ? `미수 ${state.marginLeverage * 100}%를 켰습니다.`
            : "미수를 껐습니다. 이제 보유 현금 안에서만 매수합니다.",
        };
      },
      setMarginLeverage: (leverage) => {
        const normalized = normalizeMarginLeverage(leverage);
        if (normalized !== leverage) {
          return { success: false, message: "미수 한도는 200~500% 중에서 선택해 주세요." };
        }
        const state = get();
        if (state.marginEnabled) {
          const { equity, exposure } = marginContext(state);
          if (exposure > normalized * equity + 1) {
            return {
              success: false,
              message: "현재 노출을 줄인 뒤 미수 한도를 낮춰 주세요.",
            };
          }
        }
        set({ marginLeverage: normalized });
        return {
          success: true,
          message: `미수 한도를 ${normalized * 100}%로 설정했습니다.`,
        };
      },
      createRecurringInvestment: (stockId, amount, intervalSessions) => {
        const state = get();
        const stock = state.stocks.find((item) => item.id === stockId);
        if (!stock || stock.sector === "지수" || stock.sector === "선물") {
          return { success: false, message: "이 종목은 모으기를 설정할 수 없습니다." };
        }
        if (!Number.isFinite(amount) || Math.round(amount) < MIN_RECURRING_AMOUNT) {
          return { success: false, message: "모으기 금액은 회차당 $1 이상이어야 합니다." };
        }
        if (![1, 5, 20].includes(intervalSessions)) {
          return { success: false, message: "모으기 주기를 확인해 주세요." };
        }
        if (state.recurringInvestments.some((plan) => plan.stockId === stockId)) {
          return { success: false, message: "이 종목에는 이미 모으기 계획이 있습니다." };
        }
        const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
        const plan: RecurringInvestment = {
          id: `recurring-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          stockId,
          amount: Math.round(amount),
          intervalSessions,
          nextSession: currentSession + intervalSessions,
          enabled: true,
          createdAt: Date.now(),
        };
        set({ recurringInvestments: [...state.recurringInvestments, plan] });
        return {
          success: true,
          message: `${intervalSessions}거래일마다 ${formatPrice(plan.amount)} 모으기를 시작했습니다.`,
        };
      },
      toggleRecurringInvestment: (planId) =>
        set((state) => ({
          recurringInvestments: state.recurringInvestments.map((plan) =>
            plan.id === planId ? { ...plan, enabled: !plan.enabled } : plan,
          ),
        })),
      cancelRecurringInvestment: (planId) =>
        set((state) => ({
          recurringInvestments: state.recurringInvestments.filter(
            (plan) => plan.id !== planId,
          ),
        })),
      claimDailyAttendance: () => {
        const state = get();
        const claimed = claimAttendanceState(state.attendance);
        if (!claimed) {
          return { success: false, message: "오늘 출석 보상은 이미 받았습니다." };
        }
        const now = Date.now();
        const payment: CashPayment = {
          id: `attendance-${claimed.state.lastClaimDate}`,
          kind: "attendance",
          sourceId: "daily-attendance",
          dueSession: Math.floor(now / SESSION_DURATION_MS),
          amount: claimed.reward,
          timestamp: now,
        };
        set({
          cash: state.cash + claimed.reward,
          attendance: claimed.state,
          cashPayments: [payment, ...state.cashPayments].slice(0, 200),
        });
        useToastStore.getState().push(
          `📅 ${claimed.state.streak}일 연속 출석 · ${formatPrice(claimed.reward)} 지급`,
          "success",
        );
        playSound("cash");
        return { success: true, message: "출석 보상을 받았습니다." };
      },
      applyTargetedAccountReset: () => {
        const state = get();
        const userId = state.userId;
        if (!userId) return false;
        const action = TARGETED_ACCOUNT_ACTIONS[userId];
        if (!action) return false;
        // 멱등 게이트: 세대가 지나도 만료되지 않는 설정 플래그로 판정한다.
        const settings = useSettingsStore.getState();
        if (settings.appliedAccountResetVersion >= action.resetVersion) {
          return false;
        }
        const now = Date.now();
        // 리셋과 보상을 원자적으로 처리한다. 보상 내역은 지급 기록으로 남긴다.
        const compensation: CashPayment[] =
          action.compensationAmount > 0
            ? [
                {
                  id: `account-reset-v${action.resetVersion}`,
                  kind: "compensation",
                  sourceId: "account-reset",
                  dueSession: Math.floor(now / SESSION_DURATION_MS),
                  amount: action.compensationAmount,
                  timestamp: now,
                },
              ]
            : [];
        set({
          cash: state.initialCash + action.compensationAmount,
          holdings: [],
          trades: [],
          options: [],
          shorts: [],
          openOrders: [],
          ownedLuxuries: [],
          cashPayments: compensation,
          playerCompany: null,
          assetManager: null,
          listedAmcFunds: [],
        });
        settings.setAppliedAccountResetVersion(action.resetVersion);
        if (action.compensationAmount > 0) {
          useToastStore.getState().push(
            `🔧 계정 정상화 · 보상 ${formatPrice(action.compensationAmount)} 지급`,
            "success",
          );
          playSound("cash");
        }
        return true;
      },
      selectPlayerTitle: (titleId) => {
        const state = get();
        const unlocked = unlockedPlayerTitles({
          tradeCount: buildTradingStats(state.trades).tradeCount,
          attendanceStreak: state.attendance.streak,
          attendanceTotalDays: state.attendance.totalDays,
          netWorth: fullEquityOf(state),
          initialCash: state.initialCash,
          seasonState: state.investmentSeason,
          mastery: state.investmentMastery,
          favoriteCount: countFavoriteRelationships(state.characterProgress),
        });
        if (!unlocked.some((title) => title.id === titleId)) {
          return { success: false, message: "아직 해금되지 않은 칭호입니다." };
        }
        set({ selectedTitleId: titleId });
        const title = getPlayerTitle(titleId);
        useToastStore.getState().push(
          `${title.emoji} 대표 칭호 · ${title.name}`,
          "success",
        );
        return { success: true, message: "대표 칭호를 변경했습니다." };
      },
      acceptDailyOperation: (offerId) => {
        const state = get();
        const now = Date.now();
        const session = Math.floor(now / SESSION_DURATION_MS);
        if (state.dailyOperation?.status === "active") {
          return { success: false, message: "이미 진행 중인 오늘의 작전이 있습니다." };
        }
        if (state.dailyOperation?.startSession === session) {
          return { success: false, message: "이번 거래일의 작전은 이미 수행했습니다." };
        }
        if (!getDailyOperationOffers(session).some((offer) => offer.id === offerId)) {
          return { success: false, message: "이번 거래일에 제시된 작전이 아닙니다." };
        }
        const equity = fullEquityOf(state);
        const benchmark = getBenchmark(state.stocks);
        if (!Number.isFinite(equity) || equity <= 0 || !benchmark) {
          return { success: false, message: "시장과 순자산 정보를 확인하지 못했습니다." };
        }
        const operation = createDailyOperation(
          offerId,
          session,
          equity,
          benchmark.currentPrice,
          now,
        );
        set({ dailyOperation: operation });
        const offer = getDailyOperationOffer(offerId);
        useToastStore.getState().push(
          `${offer.emoji} 오늘의 작전 시작 · ${offer.title}`,
          "success",
        );
        return { success: true, message: "1거래일 미니 목표를 시작했습니다." };
      },
      selectPortfolioStrategy: (strategyId) => {
        const strategy = getPortfolioStrategy(strategyId);
        if (strategy.id !== strategyId) {
          return { success: false, message: "선택할 수 없는 포트폴리오 전략입니다." };
        }
        set({
          selectedPortfolioStrategyId: strategy.id,
          portfolioStrategySelectedAt: Date.now(),
        });
        useToastStore.getState().push(
          `${strategy.emoji} 포트폴리오 전략 · ${strategy.name}`,
          "success",
        );
        return { success: true, message: "포트폴리오 운용 전략을 변경했습니다." };
      },
      selectSeasonFrame: (frameId) => {
        const state = get();
        if (frameId !== null && !state.unlockedSeasonRewardIds.includes(frameId)) {
          return { success: false, message: "아직 해금되지 않은 시즌 프레임입니다." };
        }
        set({ selectedSeasonFrameId: frameId });
        const reward = getSeasonReward(frameId);
        useToastStore.getState().push(
          reward ? `${reward.emoji} 프로필 프레임 · ${reward.name}` : "기본 프로필 프레임으로 변경했습니다.",
          "success",
        );
        return { success: true, message: "시즌 프레임을 변경했습니다." };
      },
      markCharacterMessageRead: (messageId) =>
        set((state) => ({
          readCharacterMessageIds: state.readCharacterMessageIds.includes(messageId)
            ? state.readCharacterMessageIds
            : [messageId, ...state.readCharacterMessageIds].slice(0, 300),
        })),
      markAllCharacterMessagesRead: (messageIds) =>
        set((state) => ({
          readCharacterMessageIds: [
            ...new Set([...messageIds, ...state.readCharacterMessageIds]),
          ].slice(0, 300),
        })),
      resolveBugReports: (responses) => {
        const state = get();
        const already = new Set(state.resolvedBugReportIds);
        const fresh = responses.filter((r) => !already.has(r.id));
        if (fresh.length === 0) return [];
        const now = Date.now();
        const dueSession = Math.floor(now / SESSION_DURATION_MS);
        // 수정 완료 보상은 운영 지급(compensation) — 시즌·랭킹 성과에서 제외된다.
        const rewardPayments: CashPayment[] = fresh
          .filter((r) => r.status === "fixed" && r.rewardCents > 0)
          .map((r) => ({
            id: `bug-bounty-${r.id}`,
            kind: "compensation",
            sourceId: "bug-report",
            dueSession,
            amount: r.rewardCents,
            timestamp: now,
          }));
        const totalReward = rewardPayments.reduce((sum, p) => sum + p.amount, 0);
        set({
          cash: state.cash + totalReward,
          cashPayments: [...rewardPayments, ...state.cashPayments],
          resolvedBugReportIds: [
            ...fresh.map((r) => r.id),
            ...state.resolvedBugReportIds,
          ].slice(0, 300),
        });
        if (totalReward > 0) {
          playSound("cash");
        }
        void get().saveCloud();
        return fresh;
      },
      resolveFeedbackResponses: (responses) => {
        const state = get();
        const already = new Set(state.resolvedFeedbackIds);
        const fresh = responses.filter((r) => !already.has(r.id));
        if (fresh.length === 0) return [];
        const now = Date.now();
        const dueSession = Math.floor(now / SESSION_DURATION_MS);
        // 반영 완료 보상은 운영 지급(compensation) — 시즌·랭킹 성과에서 제외된다.
        const rewardPayments: CashPayment[] = fresh
          .filter((r) => r.status === "done" && r.rewardCents > 0)
          .map((r) => ({
            id: `feedback-reward-${r.id}`,
            kind: "compensation",
            sourceId: "feedback",
            dueSession,
            amount: r.rewardCents,
            timestamp: now,
          }));
        const totalReward = rewardPayments.reduce((sum, p) => sum + p.amount, 0);
        set({
          cash: state.cash + totalReward,
          cashPayments: [...rewardPayments, ...state.cashPayments],
          resolvedFeedbackIds: [
            ...fresh.map((r) => r.id),
            ...state.resolvedFeedbackIds,
          ].slice(0, 300),
        });
        if (totalReward > 0) {
          playSound("cash");
        }
        void get().saveCloud();
        return fresh;
      },
      resolveStockRequestResponses: (responses) => {
        const state = get();
        const already = new Set(state.resolvedStockRequestIds);
        const fresh = responses.filter((r) => !already.has(r.id));
        if (fresh.length === 0) return [];
        const now = Date.now();
        const dueSession = Math.floor(now / SESSION_DURATION_MS);
        const refundPayments: CashPayment[] = fresh
          .filter((r) => r.refundCents > 0)
          .map((r) => ({
            id: `ipo-refund-${r.id}`,
            kind: "compensation",
            sourceId: "stock-request-refund",
            dueSession,
            amount: r.refundCents,
            timestamp: now,
          }));
        const totalRefund = refundPayments.reduce((sum, p) => sum + p.amount, 0);
        const companyIpoRejected =
          state.playerCompany?.status === "ipo-requested" &&
          fresh.some(
            (response) =>
              response.title ===
              `${state.playerCompany!.name} (${state.playerCompany!.ticker})`,
          );
        set({
          cash: state.cash + totalRefund,
          cashPayments: [...refundPayments, ...state.cashPayments],
          playerCompany: companyIpoRejected
            ? {
                ...state.playerCompany!,
                status: "active",
                ipoRequestedAt: undefined,
                lastActionAt: now,
              }
            : state.playerCompany,
          resolvedStockRequestIds: [
            ...fresh.map((r) => r.id),
            ...state.resolvedStockRequestIds,
          ].slice(0, 300),
        });
        if (totalRefund > 0) playSound("cash");
        void get().saveCloud();
        return fresh;
      },
      selectInvestmentSeasonGoal: (goalId, targetWeight) => {
        const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
        const next = selectSeasonGoal(
          get().investmentSeason,
          goalId,
          targetWeight,
          currentSession,
        );
        if (!next) {
          return {
            success: false,
            message: "이번 시즌 목표는 이미 확정됐거나 선택할 수 없습니다.",
          };
        }
        set({ investmentSeason: next });
        useToastStore.getState().push(
          `🏆 시즌 목표 확정 · 목표 비중 ${(targetWeight * 100).toFixed(0)}%`,
          "success",
        );
        return { success: true, message: "시즌 목표를 확정했습니다." };
      },
      selectInvestmentSeasonTrait: (traitId) => {
        const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
        const next = selectSeasonTrait(
          get().investmentSeason,
          traitId,
          currentSession,
        );
        if (!next) {
          return {
            success: false,
            message: "이번 시즌 특성은 이미 확정됐거나 선택할 수 없습니다.",
          };
        }
        const trait = getSeasonTrait(next.current?.traitId);
        set({ investmentSeason: next });
        useToastStore.getState().push(
          `🃏 시즌 특성 확정 · ${trait?.name ?? traitId}`,
          "success",
        );
        return { success: true, message: "시즌 특성을 확정했습니다." };
      },
      markSeasonCeremonySeen: (seasonId) =>
        set((state) => ({
          investmentSeason: markCeremonySeen(state.investmentSeason, seasonId),
        })),

      loadCloudSave: async () => {
        if (!get().userId) return "offline";
        const loaded = await loadGameSave();
        if (loaded.status === "error") {
          // 네트워크 오류를 '저장 없음'으로 오인해 로컬 지갑을 덮어쓰지 않는다.
          return "offline";
        }
        const wallet = loaded.status === "loaded" ? loaded.wallet : null;
        if (!wallet || (wallet.walletEpoch ?? 0) < WALLET_EPOCH) {
          // 첫 로그인·구세대 저장분: 현재(이미 epoch 리셋된) 로컬 지갑을 클라우드에 올린다.
          // 구세대 클라우드가 로컬을 다시 오염시키지 않도록 적용하지 않는다.
          // 실제 이전 클라우드 지갑을 버리는 경우(전체 초기화)엔 리셋 보상으로
          // 마스터 프레임을 지급한다 — 다른 기기 로컬이 새것이어도 보상이 붙게.
          if (wallet) {
            // 지갑 세대 리셋은 현금·거래만 초기화한다. 서버 허가를 거쳐 만든 회사와
            // 운용사까지 버리면 관리자 신청 기록과 실제 화면이 갈라지므로 보존한다.
            const legacyPlayerCompany = normalizePlayerCompany(wallet.playerCompany);
            const legacyAssetManager = normalizeAssetManager(wallet.assetManager);
            set((state) => ({
              ...(wallet.walletEpoch !== undefined
                ? {
                    unlockedSeasonRewardIds: mergeSeasonRewards(
                      state.unlockedSeasonRewardIds,
                      "master",
                    ),
                    selectedSeasonFrameId:
                      state.selectedSeasonFrameId ?? "season-frame-master",
                  }
                : {}),
              playerCompany: state.playerCompany ?? legacyPlayerCompany,
              assetManager: state.assetManager ?? legacyAssetManager,
            }));
          }
          await get().refreshServerPlayerCompany();
          await get().refreshListedAmcFunds();
          set({ cloudSyncReady: true });
          await get().saveCloud();
          return "created";
        }

        // 이 기기(같은 계정의 로컬 캐시)에 클라우드 저장 시각 이후의 매매·지급·
        // 사건 판단 기록이 남아 있으면 클라우드가 낡은 것이다 — 직전 저장이
        // 실패했거나 저장 전에 탭이 종료된 경우다. 이때 클라우드를 적용하면
        // 방금 한 거래가 통째로 사라지므로, 최신 로컬을 지키고 즉시 올린다.
        const localState = get();
        const cloudUpdatedAt =
          loaded.status === "loaded" ? loaded.updatedAt : 0;
        const localActivity = latestWalletActivityMs(localState);
        if (
          localState.walletEpoch === WALLET_EPOCH &&
          localActivity > Math.max(latestWalletActivityMs(wallet), cloudUpdatedAt)
        ) {
          await get().refreshServerPlayerCompany();
          await get().refreshListedAmcFunds();
          set({ cloudSyncReady: true });
          await get().saveCloud();
          useToastStore.getState().push(
            "☁️ 클라우드 저장분보다 최신인 이 기기 기록을 복구해 저장했습니다.",
            "success",
          );
          return "loaded";
        }

        // 로그인 계정은 클라우드 지갑이 원본이다. 기기별 로컬 캐시는 절대
        // 클라우드보다 우선하지 않으며, 적용 후 밀린 급여·배당만 정산한다.
        const nowSession = Math.floor(Date.now() / SESSION_DURATION_MS);
        const cloudClockChanged =
          (wallet.sessionDurationMs ?? 3 * 60 * 60 * 1000) !==
          SESSION_DURATION_MS;
        const previousNowSession = Math.floor(Date.now() / (3 * 60 * 60 * 1000));
        const rebaseWindow = (start: number, end: number) => {
          const duration = Math.max(1, end - start);
          const elapsed = Math.max(0, Math.min(duration, previousNowSession - start));
          const rebasedStart = nowSession - elapsed;
          return { start: rebasedStart, end: rebasedStart + duration };
        };
        const cloudMission =
          cloudClockChanged && wallet.investmentMission?.status === "active"
            ? (() => {
                const window = rebaseWindow(
                  wallet.investmentMission!.windowStart,
                  wallet.investmentMission!.endSession,
                );
                return {
                  ...wallet.investmentMission!,
                  windowStart: window.start,
                  endSession: window.end,
                };
              })()
            : wallet.investmentMission ?? null;
        const normalizedCloudSeason = normalizeInvestmentSeasonState(
          wallet.investmentSeason,
        );
        const cloudSeason =
          cloudClockChanged && normalizedCloudSeason.current
            ? (() => {
                const previous = normalizedCloudSeason.current!;
                const window = rebaseWindow(previous.startSession, previous.endSession);
                const rebaseOptional = (session: number | undefined) =>
                  session === undefined
                    ? undefined
                    : window.start +
                      Math.max(
                        0,
                        Math.min(
                          window.end - window.start,
                          session - previous.startSession,
                        ),
                      );
                return {
                  ...normalizedCloudSeason,
                  current: {
                    ...previous,
                    startSession: window.start,
                    endSession: window.end,
                    goalSelectedAtSession: rebaseOptional(
                      previous.goalSelectedAtSession,
                    ),
                    goalLastCheckedSession: rebaseOptional(
                      previous.goalLastCheckedSession,
                    ),
                  },
                };
              })()
            : normalizedCloudSeason;
        const cloudSeasonRewardIds = rewardsFromSeasonHistory(
          cloudSeason.history,
          normalizeSeasonRewardIds(wallet.unlockedSeasonRewardIds),
        );
        const normalizedCloudProgress = normalizeCharacterProgressMap(
          wallet.characterProgress,
        );
        const cloudCharacterProgress = cloudClockChanged
          ? Object.fromEntries(
              Object.entries(normalizedCloudProgress).map(([id, progress]) => [
                id,
                {
                  ...progress,
                  lastHoldingSession:
                    progress.lastHoldingSession === undefined
                      ? undefined
                      : nowSession -
                        Math.max(
                          0,
                          previousNowSession - progress.lastHoldingSession,
                        ),
                },
              ]),
            )
          : normalizedCloudProgress;
        // 분배 체크포인트도 클라우드 값을 원본으로 쓴다. 구 저장분에 값이 없으면
        // 현재 회차에서 시작해 중복 지급을 막고, 다른 기기 로컬 값은 섞지 않는다.
        const cloudSession = (value: number | undefined) =>
          Number.isFinite(value) ? Math.floor(value!) : nowSession;
        // 오버플로우로 깨진 클라우드 지갑도 복구 지원금으로 재출발시킨다(멱등).
        const cloudRepair = recoverFromOverflow({
          cash: Number(wallet.cash ?? 0),
          holdings: reconcileLeverageSplits(
            wallet.holdings ?? [],
            get().stocks,
          ).holdings,
          shorts: wallet.shorts ?? [],
          options: wallet.options ?? [],
          stocks: get().stocks,
          ownedLuxuries: wallet.ownedLuxuries ?? [],
          marginEnabled: wallet.marginEnabled === true,
        });
        // 발행량 제한 롤백 보상 등 전 계정 운영 보상을 1회 지급한다(멱등).
        const cloudCompensation = settleOperationalCompensations({
          cash: cloudRepair.cash,
          cashPayments: wallet.cashPayments ?? [],
          claimedCompensationIds: wallet.claimedCompensationIds,
        });
        set({
          walletEpoch: WALLET_EPOCH,
          cash: cloudCompensation.cash,
          amcLedgerBalance: Number.isFinite(wallet.amcLedgerBalance)
            ? Math.round(wallet.amcLedgerBalance!)
            : 0,
          amcLedgerRevision: Number.isFinite(wallet.amcLedgerRevision)
            ? Math.max(0, Math.floor(wallet.amcLedgerRevision!))
            : 0,
          initialCash: wallet.initialCash,
          holdings: cloudRepair.holdings,
          trades: wallet.trades ?? [],
          openOrders: wallet.openOrders ?? [],
          cashPayments: cloudCompensation.cashPayments,
          claimedCompensationIds: cloudCompensation.claimedCompensationIds,
          lastSalarySession: cloudClockChanged
            ? nowSession
            : cloudSession(wallet.lastSalarySession),
          lastMonthlyDistributionSession: cloudClockChanged
            ? alignSessionToGrid(nowSession, COVERED_CALL_INTERVAL_DAYS)
            : cloudSession(wallet.lastMonthlyDistributionSession),
          lastSingleCoveredCallDistributionSession: cloudClockChanged
            ? alignSessionToGrid(
                nowSession,
                SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
              )
            : cloudSession(wallet.lastSingleCoveredCallDistributionSession),
          lastQuarterlyDividendSession: cloudClockChanged
            ? alignSessionToGrid(nowSession, QUARTERLY_DIVIDEND_INTERVAL_DAYS)
            : cloudSession(wallet.lastQuarterlyDividendSession),
          ownedLuxuries: wallet.ownedLuxuries ?? [],
          shorts: cloudRepair.shorts,
          options: cloudRepair.options,
          achievements: wallet.achievements ?? [],
          lotteryWindowStart:
            cloudClockChanged
              ? alignSessionToGrid(nowSession, LOTTERY_INTERVAL_DAYS)
              : wallet.lotteryWindowStart ??
            alignSessionToGrid(
              nowSession,
              LOTTERY_INTERVAL_DAYS,
            ),
          lotteryTicketsBought: cloudClockChanged
            ? 0
            : wallet.lotteryTicketsBought ?? 0,
          wonJackpot: wallet.wonJackpot ?? false,
          pensionAnnuities: wallet.pensionAnnuities ?? [],
          lastStockRequestSession: wallet.lastStockRequestSession,
          investmentMission: cloudMission,
          missionHistory: wallet.missionHistory ?? [],
          reputation: wallet.reputation ?? 0,
          characterProgress: cloudCharacterProgress,
          // 발행·매각은 직후 tick 정산에서 처리 — 여기선 기존 우선주만 보존한다.
          preferredShares: normalizePreferredShares(wallet.preferredShares),
          preferredIssuedCharacterIds: Array.isArray(wallet.preferredIssuedCharacterIds)
            ? wallet.preferredIssuedCharacterIds.filter((id): id is string => typeof id === "string")
            : [],
          preferredDiversifiedSince:
            typeof wallet.preferredDiversifiedSince === "number"
              ? wallet.preferredDiversifiedSince
              : null,
          readCharacterMessageIds: wallet.readCharacterMessageIds ?? [],
          resolvedBugReportIds: wallet.resolvedBugReportIds ?? [],
          resolvedFeedbackIds: wallet.resolvedFeedbackIds ?? [],
          resolvedStockRequestIds: wallet.resolvedStockRequestIds ?? [],
          myRoomItems: normalizeRoomItems(
            wallet.myRoomItems,
            normalizeRoomLevel(wallet.myRoomLevel),
          ),
          myRoomLevel: normalizeRoomLevel(wallet.myRoomLevel),
          myRoomTheme: normalizeRoomThemeId(wallet.myRoomTheme),
          myRoomOwnedThemes: normalizeOwnedRoomThemes(wallet.myRoomOwnedThemes),
          myRoomResidentCharacterIds: normalizeRoomResidentCharacterIds(
            wallet.myRoomResidentCharacterIds,
          ),
          investmentMastery: normalizeInvestmentMastery(
            wallet.investmentMastery,
          ),
          investmentSeason: cloudSeason,
          storyDecision: cloudClockChanged ? null : wallet.storyDecision ?? null,
          storyDecisionHistory: wallet.storyDecisionHistory ?? [],
          playerCompany: normalizePlayerCompany(wallet.playerCompany),
          assetManager: normalizeAssetManager(wallet.assetManager),
          listedAmcFunds: [],
          marginEnabled: cloudRepair.marginEnabled,
          marginLeverage: normalizeMarginLeverage(wallet.marginLeverage),
          recurringInvestments: normalizeRecurringInvestments(
            wallet.recurringInvestments,
          ),
          attendance: normalizeAttendance(wallet.attendance),
          selectedTitleId: getPlayerTitle(wallet.selectedTitleId).id,
          dailyOperation: normalizeDailyOperation(wallet.dailyOperation),
          dailyOperationHistory: normalizeDailyOperationHistory(
            wallet.dailyOperationHistory,
          ),
          selectedPortfolioStrategyId: normalizePortfolioStrategyId(
            wallet.selectedPortfolioStrategyId,
          ),
          portfolioStrategySelectedAt: Number.isFinite(
            wallet.portfolioStrategySelectedAt,
          )
            ? wallet.portfolioStrategySelectedAt!
            : 0,
          unlockedSeasonRewardIds: cloudSeasonRewardIds,
          selectedSeasonFrameId: normalizeSelectedSeasonFrame(
            wallet.selectedSeasonFrameId,
            cloudSeasonRewardIds,
          ),
          lastInterestSession:
            cloudClockChanged
              ? nowSession
              : cloudSession(wallet.lastInterestSession),
        });
        if (cloudCompensation.grantedCents > 0) {
          useToastStore.getState().push(
            `⏪ 롤백 보상 ${formatPrice(cloudCompensation.grantedCents)} 지급`,
            "success",
          );
          playSound("cash");
        }
        if (cloudCompensation.reconciledCents > 0) {
          useToastStore.getState().push(
            `🧾 중복 운영 보상 ${formatPrice(cloudCompensation.reconciledCents)} 정정`,
            "info",
          );
        }
        // 빈 회사·funds 클라우드가 저장되기 전에 서버 신청 기록에서 복구한다.
        await get().refreshServerPlayerCompany();
        await get().refreshListedAmcFunds();
        return "loaded";
      },

      saveCloud: async () => {
        if (!get().userId || !get().cloudSyncReady) return false;
        const s = get();
        const saved = await saveGameSave({
          walletEpoch: WALLET_EPOCH,
          sessionDurationMs: SESSION_DURATION_MS,
          cash: s.cash,
          amcLedgerBalance: s.amcLedgerBalance,
          amcLedgerRevision: s.amcLedgerRevision,
          initialCash: s.initialCash,
          holdings: s.holdings,
          // 단타 위주 계정은 하루 100건을 쉽게 넘긴다 — 당일 내역이 밀려나지
          // 않도록 여유 있게 보존한다.
          trades: s.trades.slice(0, 500),
          openOrders: s.openOrders,
          cashPayments: s.cashPayments.slice(0, 50),
          lastSalarySession: s.lastSalarySession,
          lastMonthlyDistributionSession: s.lastMonthlyDistributionSession,
          lastSingleCoveredCallDistributionSession:
            s.lastSingleCoveredCallDistributionSession,
          lastQuarterlyDividendSession: s.lastQuarterlyDividendSession,
          ownedLuxuries: s.ownedLuxuries,
          shorts: s.shorts,
          options: s.options,
          achievements: s.achievements,
          lotteryWindowStart: s.lotteryWindowStart,
          lotteryTicketsBought: s.lotteryTicketsBought,
          wonJackpot: s.wonJackpot,
          pensionAnnuities: s.pensionAnnuities,
          lastStockRequestSession: s.lastStockRequestSession,
          investmentMission: s.investmentMission,
          missionHistory: s.missionHistory,
          reputation: s.reputation,
          characterProgress: s.characterProgress,
          preferredShares: s.preferredShares,
          preferredIssuedCharacterIds: s.preferredIssuedCharacterIds,
          preferredDiversifiedSince: s.preferredDiversifiedSince,
          readCharacterMessageIds: s.readCharacterMessageIds,
          resolvedBugReportIds: s.resolvedBugReportIds,
          resolvedFeedbackIds: s.resolvedFeedbackIds,
          resolvedStockRequestIds: s.resolvedStockRequestIds,
          claimedCompensationIds: s.claimedCompensationIds,
          myRoomItems: s.myRoomItems,
          myRoomLevel: s.myRoomLevel,
          myRoomTheme: s.myRoomTheme,
          myRoomOwnedThemes: s.myRoomOwnedThemes,
          myRoomResidentCharacterIds: s.myRoomResidentCharacterIds,
          investmentMastery: s.investmentMastery,
          investmentSeason: s.investmentSeason,
          storyDecision: s.storyDecision,
          storyDecisionHistory: s.storyDecisionHistory,
          playerCompany: s.playerCompany,
          assetManager: s.assetManager,
          marginEnabled: s.marginEnabled,
          marginLeverage: s.marginLeverage,
          recurringInvestments: s.recurringInvestments,
          attendance: s.attendance,
          selectedTitleId: s.selectedTitleId,
          dailyOperation: s.dailyOperation,
          dailyOperationHistory: s.dailyOperationHistory,
          selectedPortfolioStrategyId: s.selectedPortfolioStrategyId,
          portfolioStrategySelectedAt: s.portfolioStrategySelectedAt,
          unlockedSeasonRewardIds: s.unlockedSeasonRewardIds,
          selectedSeasonFrameId: s.selectedSeasonFrameId,
          lastInterestSession: s.lastInterestSession,
        });

        if (saved) await get().syncLeaderboardNow();
        return saved;
      },

      syncLeaderboardNow: async () => {
        if (!get().userId || !get().cloudSyncReady) return false;
        const s = get();
        // 공유 리더보드 갱신: 큰 지갑 본문과 분리된 순자산·수익률·과시 요약만
        // 제출한다. 서버는 game_saves의 STORED 요약 열로 무결성을 검증한다.
        const netWorth = s.getTotalAssets();
        const tradingStats = buildTradingStats(s.trades.slice(0, 500));
        const playerTitle = getPlayerTitle(s.selectedTitleId);
        const seasonFrame = getSeasonReward(s.selectedSeasonFrameId);
        const roomShowcase = s.myRoomItems
          .map((placed) => getRoomItem(placed.itemId))
          .filter((item) => item?.category === "프리미엄")
          .map((item) => item!.emoji)
          .filter((emoji, index, all) => all.indexOf(emoji) === index)
          .slice(0, 3);
        const showcase = [
          ...(s.playerCompany ? ["🏢"] : []),
          ...getLuxuryShowcase(s.ownedLuxuries),
          ...roomShowcase,
        ].slice(0, 5);
        return syncLeaderboardSnapshot({
          netWorth,
          returnRate:
            s.initialCash > 0
              ? ((netWorth - s.initialCash) / s.initialCash) * 100
              : 0,
          initialCash: s.initialCash,
          marketSession: Math.floor(Date.now() / SESSION_DURATION_MS),
          topTier: getTopLuxuryTier(s.ownedLuxuries),
          // 서버 무결성 열은 실제 사치재 배열 길이를 검증한다. 마이룸 프리미엄
          // 가구는 showcase 아이콘으로만 공개하고 이 검증 수에는 섞지 않는다.
          luxuryCount: s.ownedLuxuries.length,
          showcase,
          reputation: s.reputation,
          title: `${seasonFrame ? `${seasonFrame.emoji} ` : ""}${playerTitle.emoji} ${playerTitle.name}`,
          tradeCount: tradingStats.tradeCount,
          winRate: tradingStats.winRate,
          prestige: computePrestige({
            achievements: s.achievements,
            characterProgress: s.characterProgress,
            unlockedSeasonRewardIds: s.unlockedSeasonRewardIds,
            investmentMastery: s.investmentMastery,
            investmentSeason: s.investmentSeason,
            ownedLuxuries: s.ownedLuxuries,
            reputation: s.reputation,
            playerCompany: s.playerCompany,
          }).total,
        });
      },

      placeOrder: async (stockId, quantity, orderType) => {
        if (isAmcFundStockId(stockId)) {
          return {
            success: false,
            message: "유저 ETF는 자산운용사 탭에서만 거래할 수 있습니다.",
          };
        }
        const sector = get().getStockById(stockId)?.sector;
        if (sector === "선물" || sector === "지수") {
          return {
            success: false,
            message: "지수·선물은 직접 거래할 수 없습니다. ETF를 이용해 주세요.",
          };
        }
        switch (orderType) {
          case "buy_market":
            return get().buyMarket(stockId, quantity);
          case "sell_market":
            return get().sellMarket(stockId, quantity);
          case "buy_current":
            return get().buyCurrent(stockId, quantity);
          case "sell_current":
            return get().sellCurrent(stockId, quantity);
        }
      },

      placeLimitOrder: async (stockId, price, quantity, side) => {
        const limitSector = get().getStockById(stockId)?.sector;
        if (limitSector === "선물" || limitSector === "지수") {
          return {
            success: false,
            message: "지수·선물은 직접 거래할 수 없습니다. ETF를 이용해 주세요.",
          };
        }

        // 대기 주문을 로컬에 저장 → tickMarket이 가격 도달 시 체결
        const state = get();
        const stock = state.stocks.find((s) => s.id === stockId);
        if (!stock) {
          return { success: false, message: "종목을 찾을 수 없습니다." };
        }
        if (!isListed(stock)) {
          return {
            success: false,
            message: "아직 상장 전인 종목입니다. IPO 탭에서 상장 시각을 확인하세요.",
          };
        }
        if (!isValidShareQuantity(quantity)) {
          return {
            success: false,
            message: "수량은 0.001주 이상, 소수점 6자리까지 입력해 주세요.",
          };
        }
        const normalizedQuantity = normalizeShareQuantity(quantity);
        if (side === "buy") {
          const reserved = state.openOrders
            .filter((order) => order.side === "buy")
            .reduce(
              (sum, order) =>
                sum + shareOrderTotal(order.price, order.quantity),
              0,
            );
          if (
            shareOrderTotal(price, normalizedQuantity) >
            Math.max(0, longBuyingPower(state) - reserved)
          ) {
            return {
              success: false,
              message: state.marginEnabled
                ? "매수여력이 부족합니다."
                : "보유 현금이 부족합니다.",
            };
          }
        }
        if (side === "sell") {
          const held = state.holdings.find((h) => h.stockId === stockId);
          if (!held || held.quantity < quantity) {
            return { success: false, message: "보유 수량이 부족합니다." };
          }
        }
        const order: OpenOrder = {
          id: `order-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          stockId,
          ticker: stock.ticker,
          side,
          price,
          quantity: normalizedQuantity,
          createdAt: Date.now(),
        };
        set({ openOrders: [order, ...state.openOrders] });
        return {
          success: true,
          message: `지정가 ${side === "buy" ? "매수" : "매도"} 대기 (${formatPrice(price)} × ${normalizedQuantity.toLocaleString()}주)`,
        };
      },

      cancelOrder: async (orderId) => {
        set({ openOrders: get().openOrders.filter((o) => o.id !== orderId) });
      },

      tickMarket: () => {
        const state = get();
        const { tick, stocks, events, openOrders } = state;
        const now = Date.now();
        // 결정론 공통 시장: 벽시계 기준 목표 틱까지 리플레이.
        // 오래 접속하지 않았어도 같은 시각이면 모든 클라이언트가 같은 상태에 도달한다.
        const targetTick = currentSimTick(now);
        if (targetTick <= tick) return;
        // 신선/무효 상태(tick 0)에서 고정 기원점부터 현재까지 수십만 틱을 한 번에
        // 리플레이하면 메인 스레드가 길게 멈춰 시장이 안 뜨는 것처럼 보인다(날짜가
        // 지날수록 악화). 한 번에 처리하는 틱 수를 제한하고, 남은 구간은 다음 틱
        // 호출에서 이어서 따라잡는다 — 결정론 리플레이라 나눠도 결과가 동일하다.
        // 긴 공백은 MarketRealtime의 Web Worker가 처리한다. Worker를 쓸 수 없는
        // 환경에서도 메인 스레드 한 번의 계산이 긴 작업이 되지 않도록 작게 제한한다.
        const MAX_CATCHUP_TICKS = 250;
        const stepTarget = Math.min(targetTick, tick + MAX_CATCHUP_TICKS);
        // 급등주는 벽시계의 순함수로 다시 만들기 때문에 일반 시장 리플레이에
        // 넣지 않는다. 이전 구현은 저장된 급등주를 리플레이한 뒤 다시 덧붙여
        // 같은 종목을 매 틱 복제했다.
        const regularStocks = stocks.filter((stock) => !isPumpStock(stock));
        const replayed = replayMarket(regularStocks, events, tick, stepTarget);
        const nextTick = stepTarget;
        const allEvents = replayed.events;
        // 결정론 급등주(최대 2거래일 내 무작위 시각 상장폐지)를 고정 시장에 얹는다
        const combinedStocks = replaceActivePumpStocks(replayed.stocks, now);

        // 로컬 지정가 대기 주문: 가격 도달 시 체결 (잔고 부족 시 자동 취소)
        let cash = state.cash;
        let holdings = state.holdings;
        let trades = state.trades;
        let remainingOrders = openOrders;
        if (openOrders.length > 0) {
          remainingOrders = [];
          for (const order of openOrders) {
            const stock = combinedStocks.find((s) => s.id === order.stockId);
            const crossed =
              stock !== undefined &&
              (order.side === "buy"
                ? stock.currentPrice <= order.price
                : stock.currentPrice >= order.price);
            if (!stock) continue; // 상장폐지된 종목의 주문은 폐기
            if (!crossed) {
              remainingOrders.push(order);
              continue;
            }
            let result;
            if (order.side === "buy") {
              const total = shareOrderTotal(stock.currentPrice, order.quantity);
              const buyingPower = longBuyingPower({
                ...state,
                cash,
                holdings,
                stocks: combinedStocks,
              });
              result =
                total <= buyingPower
                  ? executeBuy(
                      Number.POSITIVE_INFINITY,
                      holdings,
                      order.stockId,
                      order.ticker,
                      stock.currentPrice,
                      order.quantity,
                      now,
                    )
                  : { success: false, message: "매수여력이 부족합니다." };
              if (isOrderSuccess(result)) {
                result = { ...result, cash: cash - total };
              }
            } else {
              result = executeSell(
                cash,
                holdings,
                order.stockId,
                order.ticker,
                stock.currentPrice,
                order.quantity,
                now,
              );
            }
            if (isOrderSuccess(result)) {
              cash = result.cash;
              holdings =
                order.side === "buy"
                  ? stampLeverageMultiplier(
                      result.holdings,
                      order.stockId,
                      combinedStocks,
                    )
                  : result.holdings;
              trades = [result.trade, ...trades];
            }
            // 실패(잔고·수량 부족)한 주문은 서버 모드와 동일하게 자동 취소
          }
        }

        const currentSession = Math.floor(now / SESSION_DURATION_MS);

        // 급등주 상장폐지 정산: 폐지된 급등주 보유분을 최종가로 강제 매도
        holdings = holdings.filter((h) => {
          const finalPrice = delistedPumpFinalPrice(h.stockId, now);
          if (finalPrice === null) return true;
          cash += finalPrice * h.quantity;
          trades = [
            {
              id: `delist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              stockId: h.stockId,
              ticker: h.stockId.toUpperCase(),
              type: "sell",
              quantity: h.quantity,
              price: finalPrice,
              total: finalPrice * h.quantity,
              timestamp: now,
            },
            ...trades,
          ];
          return false;
        });

        const settled = settleLocalCashflows(
          { ...state, stocks: combinedStocks, cash, holdings },
          currentSession,
          now,
        );
        cash = settled.cash;
        let cashPayments = settled.cashPayments;
        let shorts = state.shorts;

        // 만기 도달 옵션 현금정산
        const expired = settleExpiredOptions(
          cash,
          state.options,
          combinedStocks,
          currentSession,
          now,
        );
        cash = expired.cash;
        let options = expired.options;
        if (expired.trades.length > 0) {
          trades = [...expired.trades, ...trades];
        }

        // 마진 이자·공매도 대여수수료 (경과 거래일만큼)
        const interest = settleInterest(
          { ...state, cash, shorts, stocks: combinedStocks, cashPayments },
          currentSession,
          now,
        );
        if (interest?.cash !== undefined) cash = interest.cash;
        if (interest?.cashPayments) cashPayments = interest.cashPayments;
        const lastInterestSession =
          interest?.lastInterestSession ?? state.lastInterestSession;

        // 모으기는 현금으로만 한 번 체결한다. 미접속 기간의 밀린 회차는 몰아서 사지 않는다.
        const recurring = processRecurringInvestments(
          state.recurringInvestments,
          cash,
          holdings,
          trades,
          combinedStocks,
          currentSession,
          now,
        );
        cash = recurring.cash;
        holdings = recurring.holdings;
        for (const plan of recurring.filledPlans) {
          holdings = stampLeverageMultiplier(
            holdings,
            plan.stockId,
            combinedStocks,
          );
        }
        trades = recurring.trades;
        const recurringInvestments = recurring.plans;
        if (recurring.filledPlans.length > 0) {
          useToastStore.getState().push(
            `🪙 주식 모으기 ${recurring.filledPlans.length}건 자동 매수`,
            "success",
          );
        }
        if (recurring.failedPlans.some((plan) => plan.lastStatus === "insufficient_cash")) {
          useToastStore.getState().push(
            "주식 모으기 일부를 현금 부족으로 건너뛰었습니다.",
            "info",
          );
        }

        // 레버리지·인버스 ETF 액면분할·병합: 표시가가 밴드를 벗어나면 보유 좌수를
        // 반대로 정산한다(포지션 가치 불변). 일일 누적 경로에서 산출한 현재
        // 액면배수로 미접속 공백 동안의 다중 분할·병합도 한 번에 따라잡는다.
        const splitResult = reconcileLeverageSplits(holdings, combinedStocks);
        holdings = splitResult.holdings;
        if (splitResult.changed) {
          for (const ev of splitResult.events) {
            const isSplit = ev.ratio > 1;
            useToastStore
              .getState()
              .push(
                isSplit
                  ? `📈 ${ev.ticker} ${Math.round(ev.ratio)}:1 액면분할 — 보유 좌수 ${Math.round(ev.ratio)}배`
                  : `📉 ${ev.ticker} ${Math.round(1 / ev.ratio)}:1 병합 — 보유 좌수 ${Math.round(1 / ev.ratio)}분의 1`,
                "info",
              );
          }
        }

        // 금리 단계 변경 뉴스 (결정론 — 세션당 1회, 전 클라이언트 동일)
        let nextEvents = allEvents;
        const bench = getBenchmark(combinedStocks);
        if (bench) {
          const level = getRateLevel(bench);
          const prevLevel = getPrevRateLevel(bench);
          if (
            level !== prevLevel &&
            !nextEvents.some((e) => e.id === `rate-${currentSession}`)
          ) {
            nextEvents = [
              ...nextEvents,
              buildRateChangeEvent(currentSession, prevLevel, level, now),
            ].slice(-50);
          }
        }

        // 급등주 상장 뉴스 (결정론 — 세션당 1회)
        const pumpEvent = getPumpSpawnEvent(currentSession, now);
        if (pumpEvent && !nextEvents.some((e) => e.id === pumpEvent.id)) {
          nextEvents = [...nextEvents, pumpEvent].slice(-50);
        }

        // 강제청산(마진콜): 유지증거금 미달이면 전 포지션을 현재가/마크로 청산
        let marginCallAt = state.marginCallAt;
        const liveState = {
          cash,
          holdings,
          shorts,
          options,
          stocks: combinedStocks,
          ownedLuxuries: state.ownedLuxuries,
          marginEnabled: state.marginEnabled,
          marginLeverage: state.marginLeverage,
        };
        if (fullNeedsLiquidation(liveState)) {
          const liq = liquidatePositions(
            cash,
            holdings,
            shorts,
            options,
            combinedStocks,
            trades,
            now,
          );
          cash = liq.cash;
          holdings = liq.holdings;
          shorts = liq.shorts;
          options = liq.options;
          trades = liq.trades;
          marginCallAt = now;
        }

        // 자산운용사: 공유 AUM 동기화 · 패시브 자동 리밸 · 액티브 준수 · 운용료 · 상폐 환급
        let assetManager = state.assetManager;
        const listedAmcFunds = state.listedAmcFunds;
        const priceOfAmc = (stockId: string) =>
          combinedStocks.find((stock) => stock.id === stockId)?.currentPrice ?? 0;
        const initialPriceOfAmc = (stockId: string) =>
          combinedStocks.find((stock) => stock.id === stockId)?.initialPrice ?? 0;
        const valuationPriceOfAmc = createAmcValuationPriceResolver(combinedStocks);

        if (assetManager) {
          assetManager = mergeListedAumIntoManager(assetManager, listedAmcFunds);
          const listedIds = new Set(listedAmcFunds.map((fund) => fund.id));
          const serverFunds = new Map(
            assetManager.funds
              .filter((fund) => listedIds.has(fund.id))
              .map((fund) => [fund.id, fund]),
          );
          let localManager: AssetManagerState = {
            ...assetManager,
            funds: assetManager.funds
              .filter((fund) => !listedIds.has(fund.id))
              .map((fund) =>
                upgradeAmcFundHoldingBases(
                  fund,
                  priceOfAmc,
                  initialPriceOfAmc,
                  valuationPriceOfAmc,
                ),
              ),
          };
          localManager = autoRebalancePassiveFunds(
            localManager,
            currentSession,
            now,
            priceOfAmc,
            initialPriceOfAmc,
            valuationPriceOfAmc,
          );
          const compliance = evaluateAmcCompliance(
            localManager,
            currentSession,
            now,
          );
          localManager = compliance.manager;
          for (const fund of compliance.newlyDelisted) {
            const stockId = amcFundStockId(fund.id);
            const holding = holdings.find((item) => item.stockId === stockId);
            if (holding && holding.quantity > 0) {
              const nav = computeAmcFundNavPerShare(
                { ...fund, status: "active" },
                priceOfAmc,
                initialPriceOfAmc,
                valuationPriceOfAmc,
              );
              const total = Math.round(nav * holding.quantity);
              cash += total;
              holdings = holdings.filter((item) => item.stockId !== stockId);
              trades = [
                {
                  id: `amc-delist-${fund.id}-${currentSession}`,
                  stockId,
                  ticker: fund.ticker,
                  type: "sell",
                  quantity: holding.quantity,
                  price: nav,
                  total,
                  timestamp: now,
                },
                ...trades,
              ];
              useToastStore.getState().push(
                `📕 ${fund.ticker} 상장폐지 · NAV 환급 ${formatPrice(total)}`,
                "info",
              );
            }
          }
          const feeSettle = settleAmcManagementFees(
            localManager,
            currentSession,
            priceOfAmc,
            initialPriceOfAmc,
            now,
            valuationPriceOfAmc,
          );
          localManager = feeSettle.manager;
          const paidIds = new Set(cashPayments.map((payment) => payment.id));
          for (const fee of feeSettle.feePayments) {
            if (paidIds.has(fee.id)) continue;
            cash += fee.amount;
            cashPayments = [
              {
                id: fee.id,
                kind: "management_fee" as const,
                sourceId: fee.fundId,
                ticker: fee.ticker,
                dueSession: fee.dueSession,
                amount: fee.amount,
                timestamp: now,
              },
              ...cashPayments,
            ].slice(0, 200);
            paidIds.add(fee.id);
          }
          const stockOfAmc = (stockId: string) =>
            combinedStocks.find((stock) => stock.id === stockId);
          const divSettle = settleAmcManagerDividends(
            localManager,
            currentSession,
            priceOfAmc,
            initialPriceOfAmc,
            stockOfAmc,
            now,
            valuationPriceOfAmc,
          );
          localManager = divSettle.manager;
          for (const div of divSettle.dividendPayments) {
            const stockId = amcFundStockId(div.fundId);
            const holding = holdings.find((item) => item.stockId === stockId);
            const amount = Math.round((holding?.quantity ?? 0) * div.perShare);
            if (amount > 0 && !paidIds.has(div.id)) {
              cash += amount;
              cashPayments = [
                {
                  id: div.id,
                  kind: "amc_dividend" as const,
                  sourceId: div.fundId,
                  ticker: div.ticker,
                  dueSession: div.dueSession,
                  quantity: holding?.quantity,
                  amountPerShare: div.perShare,
                  amount,
                  timestamp: now,
                },
                ...cashPayments,
              ].slice(0, 200);
              paidIds.add(div.id);
            }
            if (
              holding &&
              (holding.amcDividendCursorSession ?? Number.NEGATIVE_INFINITY) <
                div.dueSession
            ) {
              holdings = holdings.map((item) =>
                item.stockId === stockId
                  ? { ...item, amcDividendCursorSession: div.dueSession }
                  : item,
              );
            }
          }
          const localById = new Map(
            localManager.funds.map((fund) => [fund.id, fund]),
          );
          assetManager = {
            ...assetManager,
            funds: assetManager.funds.map(
              (fund) => serverFunds.get(fund.id) ?? localById.get(fund.id) ?? fund,
            ),
            lastActionAt: Math.max(
              assetManager.lastActionAt,
              localManager.lastActionAt,
            ),
          };
        }

        const equityState = {
          cash,
          holdings,
          shorts,
          options,
          stocks: combinedStocks,
          ownedLuxuries: state.ownedLuxuries,
        };
        const netWorth =
          fullEquityOf(equityState) +
          userEtfPortfolioValueOf({
            holdings,
            stocks: combinedStocks,
            assetManager,
            listedAmcFunds,
          });
        let reputation = state.reputation;
        let dailyOperation = state.dailyOperation;
        let dailyOperationHistory = state.dailyOperationHistory;
        if (dailyOperation?.status === "active") {
          const updatedOperation = updateDailyOperation(dailyOperation, {
            now,
            equity: netWorth,
            benchmarkPrice: getBenchmark(combinedStocks)?.currentPrice ?? 0,
            cash,
            holdings,
            stocks: combinedStocks,
            trades,
            marginCallAt,
          });
          dailyOperation = updatedOperation;
          if (
            updatedOperation.status !== "active" &&
            !dailyOperationHistory.some((item) => item.id === updatedOperation.id)
          ) {
            const succeeded = updatedOperation.status === "completed";
            dailyOperationHistory = [updatedOperation, ...dailyOperationHistory].slice(0, 20);
            if (succeeded) reputation += updatedOperation.reward;
            const offer = getDailyOperationOffer(updatedOperation.offerId);
            useToastStore.getState().push(
              succeeded
                ? `${offer.emoji} 오늘의 작전 성공 · 평판 +${updatedOperation.reward}`
                : `${offer.emoji} 오늘의 작전 실패 · ${updatedOperation.resultDetail ?? "조건 미달"}`,
              succeeded ? "success" : "info",
            );
            playSound(succeeded ? "cash" : "error");
          }
        }
        let investmentMission = state.investmentMission;
        let missionHistory = state.missionHistory;
        const preferredConcentration = computeCharacterConcentration(
          holdings,
          combinedStocks,
          netWorth,
        );
        const activePreferred = getActivePreferredShares(
          state.preferredShares,
          preferredConcentration,
        );
        const userEtfHoldings = userEtfRelationshipHoldingsOf({
          holdings,
          stocks: combinedStocks,
          assetManager,
          listedAmcFunds,
        });
        const relationshipEquity = netWorth;
        let characterProgress = accrueLongHoldingAffinity(
          state.characterProgress,
          holdings,
          combinedStocks,
          relationshipEquity,
          currentSession,
          activePreferred,
          userEtfHoldings,
        );
        if (investmentMission?.status === "active") {
          const benchmarkPrice = getBenchmark(combinedStocks)?.currentPrice ?? 0;
          const updatedMission = updateInvestmentMission(
            investmentMission,
            currentSession,
            relationshipEquity,
            benchmarkPrice,
            now,
          );
          investmentMission = updatedMission;
          if (
            updatedMission.status !== "active" &&
            !missionHistory.some((item) => item.id === updatedMission.id)
          ) {
            const succeeded = updatedMission.status === "completed";
            const legacyIssuer = updatedMission.issuerCharacterId
              ? undefined
              : getStoryArcAtSession(updatedMission.windowStart);
            const issuerCharacterId =
              updatedMission.issuerCharacterId ?? legacyIssuer?.character?.id;
            const issuerCompanyId =
              updatedMission.issuerCompanyId ?? legacyIssuer?.company.id;
            const historyItem: InvestmentMissionHistory = {
              id: updatedMission.id,
              kind: updatedMission.kind,
              offerId: updatedMission.offerId,
              windowStart: updatedMission.windowStart,
              status: updatedMission.status,
              reward: succeeded ? updatedMission.reward : 0,
              completedAt: updatedMission.completedAt ?? now,
              playerReturn: updatedMission.playerReturn ?? 0,
              benchmarkReturn: updatedMission.benchmarkReturn ?? 0,
              issuerCharacterId,
              issuerCompanyId,
            };
            missionHistory = [historyItem, ...missionHistory].slice(0, 30);
            if (succeeded) reputation += updatedMission.reward;
            characterProgress = settleMissionRelationship(
              characterProgress,
              issuerCharacterId,
              succeeded,
              currentSession,
              updatedMission.kind === "character",
            );
            useToastStore.getState().push(
              succeeded
                ? updatedMission.kind === "character"
                  ? `💌 전용 의뢰 성공 · 평판 +${updatedMission.reward} · 신뢰 +8 · 호감 +6`
                  : `📋 의뢰 성공 · 평판 +${updatedMission.reward} · 신뢰 +5 · 호감 +4`
                : "📋 의뢰 완료 · 호감 +1 · 다음 회차에 다시 도전하세요",
              succeeded ? "success" : "info",
            );
            playSound(succeeded ? "cash" : "error");
          }
        }
        let storyDecision = state.storyDecision;
        let storyDecisionHistory = state.storyDecisionHistory;
        if (
          storyDecision?.status === "active" &&
          currentSession >= storyDecision.resolveSession
        ) {
          const storyArc = getStoryArcForWindow(storyDecision.windowStart);
          const resolvedDecision = resolveStoryDecision(
            storyDecision,
            storyArc,
            now,
          );
          storyDecision = resolvedDecision;
          if (!storyDecisionHistory.some((item) => item.id === resolvedDecision.id)) {
            storyDecisionHistory = [resolvedDecision, ...storyDecisionHistory].slice(0, 30);
            const delta = resolvedDecision.reputationDelta ?? 0;
            reputation = Math.max(0, reputation + delta);
            const offer = getStoryDecisionOffer(resolvedDecision.kind);
            useToastStore.getState().push(
              delta > 0
                ? `${offer.emoji} 사건 판단 보상 · 평판 +${delta}`
                : delta < 0
                  ? `${offer.emoji} 사건 판단 실패 · 평판 ${delta}`
                  : `${offer.emoji} 관망 종료 · 평판 변동 없음`,
              delta > 0 ? "success" : delta < 0 ? "error" : "info",
            );
            if (delta !== 0) playSound(delta > 0 ? "cash" : "error");
          }
        }
        const netWorthHistory = appendNetWorthPoint(
          state.netWorthHistory,
          netWorth,
          now,
        );
        const investmentMastery = updateInvestmentMastery(
          state.investmentMastery,
          {
            trades,
            cashPayments,
            missionHistory,
            holdings,
            stocks: combinedStocks,
            equity: netWorth,
            initialCash: state.initialCash,
            marginCallAt,
            currentSession,
          },
        );
        const seasonUpdate = updateInvestmentSeason(
          state.investmentSeason,
          {
            currentSession,
            equity: netWorth,
            benchmarkPrice: getBenchmark(combinedStocks)?.currentPrice ?? 0,
            externalCashTotal: seasonExternalCashTotal(cashPayments),
            goalAllocation: calculateSeasonGoalAllocation(
              state.investmentSeason.current?.goalId,
              holdings,
              combinedStocks,
              netWorth,
            ),
            now,
          },
        );
        const investmentSeason = seasonUpdate.state;
        let unlockedSeasonRewardIds = state.unlockedSeasonRewardIds;
        let selectedSeasonFrameId = state.selectedSeasonFrameId;
        if (seasonUpdate.completed) {
          const tier = getInvestmentSeasonTier(seasonUpdate.completed.tierId);
          const rival = getSeasonRivalPerformance(
            seasonUpdate.completed,
            seasonUpdate.completed.endSession,
            seasonUpdate.completed.seasonScore,
          );
          const beatRival = seasonUpdate.completed.seasonScore >= rival.score;
          useToastStore.getState().push(
            `${tier.emoji} 시즌 ${seasonUpdate.completed.number} 종료 · ${tier.name} · ${seasonUpdate.completed.seasonScore}점 · 라이벌 ${beatRival ? "승리" : "패배"}`,
            beatRival ? "success" : "info",
          );
          const earnedReward = getSeasonReward(`season-frame-${tier.id}`);
          const newlyEarned = earnedReward && !unlockedSeasonRewardIds.includes(earnedReward.id);
          unlockedSeasonRewardIds = mergeSeasonRewards(
            unlockedSeasonRewardIds,
            seasonUpdate.completed.tierId,
          );
          if (!selectedSeasonFrameId && earnedReward) {
            selectedSeasonFrameId = earnedReward.id;
          }
          if (newlyEarned && earnedReward) {
            useToastStore.getState().push(
              `${earnedReward.emoji} 영구 시즌 보상 · ${earnedReward.name}`,
              "success",
            );
          }
          playSound(beatRival ? "cash" : "error");
        }
        nextEvents = nextEvents.map(ensureEventDialogue);

        // 관계 등급 상승 축하 + 동맹(호감 100) 도달 시 우선주 발행 (멱등)
        const relationshipToasts: string[] = [];
        for (const cid of Object.keys(characterProgress)) {
          const beforeTier = getRelationshipTier(
            state.characterProgress[cid]?.affinity ?? 0,
          );
          const afterTier = getRelationshipTier(characterProgress[cid].affinity);
          if (afterTier.index > beforeTier.index) {
            const ceo = getCharacterById(cid);
            relationshipToasts.push(
              `${afterTier.emoji} ${ceo?.name ?? "관계"} · ${afterTier.name} 관계로 발전!`,
            );
          }
        }
        // 유의미 분산(5캐릭터↑) 지속 시각을 추적해 5거래일 유예 후에만 휴면분 매각.
        const diversified =
          preferredConcentration.heldCount >= PREFERRED_DIVERSIFY_CHARACTERS;
        let preferredDiversifiedSince = diversified
          ? state.preferredDiversifiedSince ?? currentSession
          : null;
        const sellDormant =
          diversified &&
          preferredDiversifiedSince !== null &&
          currentSession - preferredDiversifiedSince >= PREFERRED_SALE_GRACE_SESSIONS;
        const preferredReconcile = reconcilePreferredShares(
          characterProgress,
          state.preferredShares,
          state.preferredIssuedCharacterIds,
          currentSession,
          now,
          {
            stocks: combinedStocks,
            concentration: preferredConcentration,
            sellDormant,
          },
        );
        // 매각이 확정돼 처분했으면 분산 타이머를 초기화한다.
        if (sellDormant && preferredReconcile.sold.length > 0) {
          preferredDiversifiedSince = null;
        }
        const preferredShares = preferredReconcile.shares;
        const preferredIssuedCharacterIds = preferredReconcile.issuedCharacterIds;
        // 집중 해제로 매각된 우선주는 액면가를 현금으로 지급한다.
        if (preferredReconcile.proceeds > 0) {
          cash += preferredReconcile.proceeds;
          const salePayment: CashPayment = {
            id: `preferred-sale-${currentSession}-${preferredReconcile.sold[0]?.characterId ?? "x"}`,
            kind: "preferred_dividend",
            sourceId: "preferred-sale",
            dueSession: currentSession,
            amount: preferredReconcile.proceeds,
            timestamp: now,
          };
          cashPayments = [salePayment, ...cashPayments].slice(0, 200);
        }
        for (const toast of relationshipToasts.slice(0, 3)) {
          useToastStore.getState().push(toast, "success");
        }
        for (const share of preferredReconcile.issued) {
          useToastStore.getState().push(
            `🎖️ ${share.emoji} ${share.companyName} 우선주 1좌 발행 — 동맹 보상!`,
            "success",
          );
        }
        for (const share of preferredReconcile.sold) {
          useToastStore.getState().push(
            `💸 ${share.emoji} ${share.companyName} 우선주 매각 — 집중 해제 (+${formatPrice(share.faceValue * share.shares)})`,
            "info",
          );
        }
        if (preferredReconcile.issued.length > 0 || preferredReconcile.proceeds > 0) {
          playSound("cash");
        }

        set({
          tick: nextTick,
          events: nextEvents,
          cash,
          netWorthHistory,
          // 주가 조정(배당락)은 리플레이가 절대 그리드로 이미 반영 —
          // settle의 주가 변형은 버리고 현금·회차 카운터만 반영한다 (시장 일원화)
          stocks: combinedStocks,
          holdings,
          shorts,
          options,
          marginCallAt,
          dailyOperation,
          dailyOperationHistory,
          investmentMission,
          missionHistory,
          reputation,
          characterProgress,
          preferredShares,
          preferredIssuedCharacterIds,
          preferredDiversifiedSince,
          investmentMastery,
          investmentSeason,
          unlockedSeasonRewardIds,
          selectedSeasonFrameId,
          recurringInvestments,
          storyDecision,
          storyDecisionHistory,
          trades,
          openOrders: remainingOrders,
          lastSalarySession: settled.lastSalarySession,
          lastMonthlyDistributionSession:
            settled.lastMonthlyDistributionSession,
          lastSingleCoveredCallDistributionSession:
            settled.lastSingleCoveredCallDistributionSession,
          lastQuarterlyDividendSession:
            settled.lastQuarterlyDividendSession,
          lastInterestSession,
          cashPayments,
          assetManager,
        });

        get().checkAchievements();
      },

      applyMarketCheckpoint: (checkpoint) => {
        const hydrated = hydrateMarketCheckpoint(checkpoint);
        set({
          marketVersion: MARKET_SIM_VERSION,
          marketStartedAt: MARKET_EPOCH_MS,
          tick: hydrated.tick,
          stocks: replaceActivePumpStocks(hydrated.stocks, Date.now()),
          events: hydrated.events.map(ensureEventDialogue),
        });
      },

      settleCashflows: () => {
        const state = get();
        const now = Date.now();
        const currentSession = Math.floor(now / SESSION_DURATION_MS);
        // 우선주 배당은 집중 유지 중인 활성분에만 지급한다.
        const activePreferred = getActivePreferredShares(
          state.preferredShares,
          computeCharacterConcentration(
            state.holdings,
            state.stocks,
            fullEquityOf(state),
          ),
        );
        const settled = settleLocalCashflows(
          { ...state, preferredShares: activePreferred },
          currentSession,
          now,
        );
        const baseCash = settled.changed ? settled.cash : state.cash;
        const baseCashPayments = settled.changed
          ? settled.cashPayments
          : state.cashPayments;
        const interest = settleInterest(
          { ...state, cash: baseCash, cashPayments: baseCashPayments },
          currentSession,
          now,
        );
        // 연금 복권 정기 지급: startSession + intervalDays마다 정액, 총 totalPeriods회.
        let annuityCash = 0;
        let annuitiesChanged = false;
        const annuityPayments: CashPayment[] = [];
        const nextAnnuities = state.pensionAnnuities
          .map((a) => {
            const duePeriods = Math.min(
              a.totalPeriods,
              Math.max(
                0,
                Math.floor((currentSession - a.startSession) / a.intervalDays),
              ),
            );
            const newlyPaid = Math.max(0, duePeriods - a.paidPeriods);
            if (newlyPaid <= 0) return a;
            annuitiesChanged = true;
            const amount = newlyPaid * a.amountPerPeriod;
            annuityCash += amount;
            annuityPayments.push({
              id: `pension-pay-${a.id}-${a.paidPeriods + newlyPaid}`,
              kind: "lottery",
              sourceId: "pension-annuity",
              dueSession: currentSession,
              amount,
              timestamp: now,
            });
            return { ...a, paidPeriods: a.paidPeriods + newlyPaid };
          })
          .filter((a) => a.paidPeriods < a.totalPeriods);

        if (!settled.changed && !interest && !annuitiesChanged) return;
        const mergedPayments = interest?.cashPayments ?? baseCashPayments;
        set({
          cash: (interest?.cash ?? baseCash) + annuityCash,
          // 주가 조정은 결정론 리플레이 담당 — 현금·카운터만 반영
          lastSalarySession: settled.lastSalarySession,
          lastMonthlyDistributionSession:
            settled.lastMonthlyDistributionSession,
          lastSingleCoveredCallDistributionSession:
            settled.lastSingleCoveredCallDistributionSession,
          lastQuarterlyDividendSession:
            settled.lastQuarterlyDividendSession,
          cashPayments: annuitiesChanged
            ? [...annuityPayments, ...mergedPayments].slice(0, 200)
            : mergedPayments,
          pensionAnnuities: annuitiesChanged ? nextAnnuities : state.pensionAnnuities,
          lastInterestSession:
            interest?.lastInterestSession ?? state.lastInterestSession,
        });
      },

      buyMarket: (stockId, quantity) =>
        applyLocalBuySell(set, get, "buyMarket", stockId, quantity),
      sellMarket: (stockId, quantity) =>
        applyLocalBuySell(set, get, "sellMarket", stockId, quantity),
      buyCurrent: (stockId, quantity) =>
        applyLocalBuySell(set, get, "buyCurrent", stockId, quantity),
      sellCurrent: (stockId, quantity) =>
        applyLocalBuySell(set, get, "sellCurrent", stockId, quantity),

      acceptInvestmentMission: (kind) => {
        const state = get();
        const now = Date.now();
        const session = Math.floor(now / SESSION_DURATION_MS);
        if (state.investmentMission?.status === "active") {
          return { success: false, message: "이미 진행 중인 투자 의뢰가 있습니다." };
        }
        const { equity, userEtfHoldings } = relationshipEquityOf(state);
        if (!Number.isFinite(equity) || equity <= 0) {
          return { success: false, message: "순자산이 0보다 커야 의뢰를 시작할 수 있습니다." };
        }
        const benchmark = getBenchmark(state.stocks);
        if (!benchmark) {
          return { success: false, message: "벤치마크 정보를 불러오지 못했습니다." };
        }
        const arc = getStoryArcAtSession(session);
        const concentration = computeCharacterConcentration(
          state.holdings,
          state.stocks,
          equity,
          userEtfHoldings,
        );
        const issuer = resolveMissionIssuer(
          STOCK_DEFINITIONS,
          concentration,
          arc.character?.id,
          session,
        );
        if (!issuer) {
          return {
            success: false,
            message:
              "보유 중인 캐릭터 기업 주식이 없어 의뢰를 받을 수 없습니다. 먼저 캐릭터 종목을 보유하세요.",
          };
        }
        const relationship = getCharacterProgress(
          state.characterProgress,
          issuer.characterId,
        );
        if (kind === "character" && relationship.affinity < 50) {
          return {
            success: false,
            message: "전용 의뢰는 보유 캐릭터의 호감도 50부터 열립니다.",
          };
        }
        set({
          investmentMission: createInvestmentMission(
            kind,
            session,
            equity,
            benchmark.currentPrice,
            now,
            {
              characterId: issuer.characterId,
              companyId: issuer.companyId,
            },
          ),
        });
        return { success: true, message: "5거래일 투자 의뢰를 시작했습니다." };
      },

      chooseStoryDecision: (kind) => {
        const state = get();
        const now = Date.now();
        const session = Math.floor(now / SESSION_DURATION_MS);
        const arc = getStoryArcAtSession(session);
        if (session < arc.clueSession) {
          return { success: false, message: "단서가 공개된 뒤 판단할 수 있습니다." };
        }
        if (session >= arc.resolveSession) {
          return { success: false, message: "이미 결말이 공개된 사건입니다." };
        }
        if (state.storyDecision?.storyId === arc.id) {
          return { success: false, message: "이번 사건의 판단은 이미 확정했습니다." };
        }
        if (state.storyDecision?.status === "active") {
          return { success: false, message: "이전 사건 판단이 아직 정산되지 않았습니다." };
        }
        const progress = getCharacterProgress(
          state.characterProgress,
          arc.character?.id,
        );
        if (kind === "bond" && !canUseBondChoice(progress, arc.windowStart)) {
          return {
            success: false,
            message: "사건 시작 전부터 해당 캐릭터 호감도 100이 필요합니다.",
          };
        }
        const decision = createStoryDecision(arc, kind, now);
        const characterProgress =
          kind === "bullish"
            ? addStorySupportAffinity(
                state.characterProgress,
                arc.character?.id,
                session,
              )
            : state.characterProgress;
        set({ storyDecision: decision, characterProgress });
        const offer = getStoryDecisionOffer(kind);
        useToastStore
          .getState()
          .push(`${offer.emoji} 사건 판단 확정 · ${offer.title}`, "info");
        return { success: true, message: `${offer.title} 선택을 확정했습니다.` };
      },

      purchaseLuxury: (itemId) => {
        const item = LUXURY_BY_ID.get(itemId);
        if (!item) return { success: false, message: "존재하지 않는 상품입니다." };
        const state = get();
        if (state.ownedLuxuries.some((o) => o.id === itemId)) {
          return { success: false, message: "이미 보유한 상품입니다." };
        }
        // 자산 규모별 sink 스케일링 — 부유할수록 수집 비용이 오른다.
        const price = scaledLuxuryPrice(item.price, get().getTotalAssets());
        if (price > state.cash) {
          return { success: false, message: "보유 현금이 부족합니다." };
        }
        const owned: OwnedLuxury = {
          id: item.id,
          purchasedAt: Date.now(),
          paidPrice: price,
        };
        set({
          cash: state.cash - price,
          ownedLuxuries: [...state.ownedLuxuries, owned],
        });
        get().checkAchievements();
        return {
          success: true,
          message: `${item.emoji} ${item.name} 구매 완료`,
        };
      },

      getLuxuryValue: () => getLuxuryValue(get().ownedLuxuries),

      buyRoomItem: (itemId, x, y, rotation = 0) => {
        const item = getRoomItem(itemId);
        if (!item) return { success: false, message: "존재하지 않는 가구입니다." };
        const state = get();
        const maxItems = roomMaxItemsForLevel(state.myRoomLevel);
        if (state.myRoomItems.length >= maxItems) {
          return { success: false, message: `가구는 최대 ${maxItems}개까지 놓을 수 있습니다.` };
        }
        if (!isValidRoomPlacement(item, x, y, state.myRoomLevel, rotation)) {
          return {
            success: false,
            message: "가구가 방 밖·벽·출입문 통로와 겹칩니다.",
          };
        }
        if (!canPlaceRoomItemAt(state.myRoomItems, item.id, x, y, state.myRoomLevel, rotation)) {
          return { success: false, message: item.requiresSupport ? "이 소품은 가구 위에 놓아야 합니다." : "같은 층에 다른 가구가 놓여 있습니다." };
        }
        if (item.price > state.cash) {
          return { success: false, message: "보유 현금이 부족합니다." };
        }
        const placed: PlacedRoomItem = {
          itemId: item.id,
          x,
          y,
          paidPrice: item.price,
          purchasedAt: Date.now(),
          rotation,
        };
        set({
          cash: state.cash - item.price,
          myRoomItems: [...state.myRoomItems, placed],
        });
        playSound("cash");
        return { success: true, message: `${item.emoji} ${item.name} 배치 완료` };
      },

      moveRoomItem: (index, x, y, rotation) => {
        const state = get();
        const placed = state.myRoomItems[index];
        if (!placed) return { success: false, message: "가구를 찾을 수 없습니다." };
        const item = getRoomItem(placed.itemId);
        if (!item) return { success: false, message: "가구를 찾을 수 없습니다." };
        const nextRotation = rotation ?? placed.rotation ?? 0;
        if (!isValidRoomPlacement(item, x, y, state.myRoomLevel, nextRotation)) {
          return {
            success: false,
            message: "가구가 방 밖·벽·출입문 통로와 겹칩니다.",
          };
        }
        if (!canPlaceRoomItemAt(state.myRoomItems, item.id, x, y, state.myRoomLevel, nextRotation, index)) {
          return { success: false, message: item.requiresSupport ? "이 소품은 가구 위에 놓아야 합니다." : "같은 층에 다른 가구가 놓여 있습니다." };
        }
        const nextItems = state.myRoomItems.map((p, i) =>
          i === index ? { ...p, x, y, rotation: nextRotation } : p,
        );
        const normalized = normalizeRoomItems(nextItems, state.myRoomLevel);
        if (normalized.length !== nextItems.length) {
          return { success: false, message: "가구 위 소품을 먼저 옮겨 주세요." };
        }
        set({ myRoomItems: normalized });
        return { success: true, message: `${item.emoji} ${item.name} 이동 완료` };
      },

      rotateRoomItem: (index) => {
        const state = get();
        const placed = state.myRoomItems[index];
        const item = placed ? getRoomItem(placed.itemId) : undefined;
        if (!placed || !item) return { success: false, message: "가구를 찾을 수 없습니다." };
        if (!item.rotatable) return { success: false, message: "회전할 수 없는 가구입니다." };
        const rotation: RoomRotation = placed.rotation === 90 ? 0 : 90;
        if (!canPlaceRoomItemAt(state.myRoomItems, item.id, placed.x, placed.y, state.myRoomLevel, rotation, index)) {
          return { success: false, message: "회전할 공간이 부족합니다." };
        }
        const nextItems = state.myRoomItems.map((entry, i) =>
          i === index ? { ...entry, rotation } : entry,
        );
        const normalized = normalizeRoomItems(nextItems, state.myRoomLevel);
        if (normalized.length !== nextItems.length) {
          return { success: false, message: "가구 위 소품을 먼저 옮겨 주세요." };
        }
        set({ myRoomItems: normalized });
        return { success: true, message: `${item.emoji} ${item.name} 회전 완료` };
      },

      applyRoomLayout: (items) => {
        const state = get();
        const signature = (entries: PlacedRoomItem[]) =>
          entries
            .map((entry) => `${entry.itemId}:${entry.purchasedAt}:${entry.paidPrice}`)
            .sort()
            .join("|");
        if (signature(items) !== signature(state.myRoomItems)) {
          return { success: false, message: "현재 보유 가구 구성이 프리셋과 다릅니다." };
        }
        const normalized = normalizeRoomItems(items, state.myRoomLevel);
        if (normalized.length !== items.length) {
          return { success: false, message: "겹치거나 방 밖으로 나간 프리셋입니다." };
        }
        set({ myRoomItems: normalized });
        return { success: true, message: "🗂️ 방 배치 프리셋을 적용했습니다." };
      },

      sellRoomItem: (index) => {
        const state = get();
        const placed = state.myRoomItems[index];
        if (!placed) return { success: false, message: "가구를 찾을 수 없습니다." };
        const item = getRoomItem(placed.itemId);
        const refund = Math.round(placed.paidPrice * ROOM_SELL_RATIO);
        const nextItems = state.myRoomItems.filter((_, i) => i !== index);
        if (normalizeRoomItems(nextItems, state.myRoomLevel).length !== nextItems.length) {
          return { success: false, message: "가구 위 소품을 먼저 옮기거나 판매해 주세요." };
        }
        set({
          cash: state.cash + refund,
          myRoomItems: nextItems,
        });
        playSound("cash");
        return {
          success: true,
          message: `${item?.emoji ?? ""} ${item?.name ?? "가구"} 되팔기 · ${formatPrice(refund)} 환불`,
        };
      },

      buyRoomTheme: (themeId) => {
        const theme = ROOM_THEME_BY_ID.get(themeId);
        if (!theme) return { success: false, message: "존재하지 않는 테마입니다." };
        const state = get();
        if (state.myRoomOwnedThemes.includes(themeId)) {
          return get().selectRoomTheme(themeId);
        }
        if (theme.price > state.cash) {
          return { success: false, message: "보유 현금이 부족합니다." };
        }
        set({
          cash: state.cash - theme.price,
          myRoomOwnedThemes: [...state.myRoomOwnedThemes, themeId],
          myRoomTheme: themeId,
        });
        playSound("cash");
        return { success: true, message: `${theme.emoji} ${theme.name} 테마 적용 완료` };
      },

      selectRoomTheme: (themeId) => {
        const state = get();
        const theme = getRoomTheme(themeId);
        if (!state.myRoomOwnedThemes.includes(theme.id)) {
          return { success: false, message: "아직 구매하지 않은 테마입니다." };
        }
        set({ myRoomTheme: theme.id });
        return { success: true, message: `${theme.emoji} ${theme.name} 테마로 바꿨습니다.` };
      },

      inviteRoomResident: (characterId) => {
        const state = get();
        const character = getCharacterById(characterId);
        if (!character) return { success: false, message: "캐릭터를 찾을 수 없습니다." };
        if (state.myRoomResidentCharacterIds.includes(characterId)) {
          return { success: false, message: `${character.name}은(는) 이미 상주 중입니다.` };
        }
        if (!canInviteRoomResident(characterId, state.characterProgress)) {
          return { success: false, message: "상주 초대는 친밀도 100부터 가능합니다." };
        }
        if (state.myRoomResidentCharacterIds.length >= ROOM_RESIDENT_LIMIT) {
          return { success: false, message: `상주 CEO는 최대 ${ROOM_RESIDENT_LIMIT}명까지 초대할 수 있습니다.` };
        }
        set({
          myRoomResidentCharacterIds: [
            ...state.myRoomResidentCharacterIds,
            characterId,
          ],
        });
        return { success: true, message: `${character.emoji} ${character.name}을(를) 마이룸에 초대했습니다.` };
      },

      dismissRoomResident: (characterId) => {
        const state = get();
        const character = getCharacterById(characterId);
        if (!state.myRoomResidentCharacterIds.includes(characterId)) {
          return { success: false, message: "상주 중인 캐릭터가 아닙니다." };
        }
        set({
          myRoomResidentCharacterIds: state.myRoomResidentCharacterIds.filter(
            (id) => id !== characterId,
          ),
        });
        return { success: true, message: `${character?.emoji ?? ""} ${character?.name ?? "CEO"}의 상주를 해제했습니다.` };
      },

      expandMyRoom: () => {
        const state = get();
        const expansion = nextRoomExpansion(state.myRoomLevel);
        if (!expansion) {
          return { success: false, message: "이미 가장 큰 방입니다." };
        }
        if (expansion.price > state.cash) {
          return { success: false, message: "보유 현금이 부족합니다." };
        }
        set({
          cash: state.cash - expansion.price,
          myRoomLevel: expansion.level,
        });
        playSound("cash");
        return {
          success: true,
          message: `🏠 ${expansion.name} 확장 완료 (${expansion.cols}×${expansion.rows})`,
        };
      },

      openShortPosition: (stockId, quantity) => {
        get().settleCashflows();
        const state = get();
        const stock = state.stocks.find((s) => s.id === stockId);
        if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
        if (
          stock.sector === "선물" ||
          stock.sector === "지수" ||
          isPumpStock(stock)
        ) {
          return {
            success: false,
            message: "지수·선물·급등주는 공매도할 수 없습니다.",
          };
        }
        if (!isListed(stock)) {
          return {
            success: false,
            message: "아직 상장 전인 종목입니다. IPO 탭에서 상장 시각을 확인하세요.",
          };
        }
        const price = getMarketSellPrice(stock.currentPrice);
        if (price * quantity > fullBuyingPower(state)) {
          return { success: false, message: "증거금(매수여력)이 부족합니다." };
        }
        const result = openShort(
          state.cash,
          state.shorts,
          stockId,
          stock.ticker,
          price,
          quantity,
          Date.now(),
        );
        if (!isShortSuccess(result)) return result;
        set({
          cash: result.cash,
          shorts: result.shorts,
          trades: [result.trade, ...state.trades],
        });
        get().checkAchievements();
        return {
          success: true,
          message: `공매도 (${formatPrice(price)})`,
        };
      },

      coverShortPosition: (stockId, quantity) => {
        get().settleCashflows();
        const state = get();
        const stock = state.stocks.find((s) => s.id === stockId);
        if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
        const price = getMarketBuyPrice(stock.currentPrice);
        const result = coverShort(
          state.cash,
          state.shorts,
          stockId,
          stock.ticker,
          price,
          quantity,
          Date.now(),
        );
        if (!isShortSuccess(result)) return result;
        set({
          cash: result.cash,
          shorts: result.shorts,
          trades: [result.trade, ...state.trades],
        });
        return {
          success: true,
          message: `공매도 청산 (${formatPrice(price)})`,
        };
      },

      buyOption: (stockId, kind, strike, expirySession, quantity) => {
        get().settleCashflows();
        const state = get();
        const now = Date.now();
        if (quantity <= 0 || !Number.isInteger(quantity)) {
          return { success: false, message: "수량은 1 이상의 정수여야 합니다." };
        }
        const stock = state.stocks.find((s) => s.id === stockId);
        if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
        if (
          stock.sector === "선물" ||
          stock.sector === "지수" ||
          isPumpStock(stock)
        ) {
          return { success: false, message: "지수·선물·급등주는 옵션이 없습니다." };
        }
        if (!isListed(stock)) {
          return {
            success: false,
            message: "아직 상장 전인 종목입니다. IPO 탭에서 상장 시각을 확인하세요.",
          };
        }
        const session = Math.floor(now / SESSION_DURATION_MS);
        if (expirySession <= session) {
          return { success: false, message: "이미 만기된 옵션입니다." };
        }
        const rate = currentRateDecimal(state.stocks);
        const premium = optionPremium(
          kind,
          strike,
          expirySession,
          stock,
          now / SESSION_DURATION_MS,
          rate,
        );
        if (premium <= 0) {
          return { success: false, message: "프리미엄이 거의 없는 옵션입니다." };
        }
        const cost = premium * quantity;
        // 옵션 프리미엄은 현금으로만 결제한다. 평가자산과 프리미엄 지출이
        // 상쇄되는 구조에서 마진을 허용하면 롱 옵션을 무한히 살 수 있다.
        if (cost > Math.max(0, state.cash)) {
          return { success: false, message: "옵션 프리미엄을 낼 현금이 부족합니다." };
        }
        const id = `opt-${stockId}-${kind}-long-${strike}-${expirySession}`;
        const existing = state.options.find((o) => o.id === id);
        const options = existing
          ? state.options.map((o) =>
              o.id === id
                ? {
                    ...o,
                    quantity: o.quantity + quantity,
                    openPremium: Math.round(
                      (o.openPremium * o.quantity + premium * quantity) /
                        (o.quantity + quantity),
                    ),
                  }
                : o,
            )
          : [
              ...state.options,
              {
                id,
                stockId,
                kind,
                side: "long" as const,
                strike,
                expirySession,
                quantity,
                openPremium: premium,
                openedAt: now,
                openSplitMultiplier: underlyingSplitMultiplier(stock, state.stocks),
              },
            ];
        const trade: Trade = {
          id: `option-buy-${now}-${Math.random().toString(36).slice(2, 6)}`,
          stockId,
          ticker: stock.ticker,
          type: "option_buy",
          quantity,
          price: premium,
          total: cost,
          timestamp: now,
          optionId: id,
          optionKind: kind,
          optionSide: "long",
          strike,
          expirySession,
        };
        set({ cash: state.cash - cost, options, trades: [trade, ...state.trades] });
        get().checkAchievements();
        return {
          success: true,
          message: `${kind === "call" ? "콜" : "풋"} 매수 (${formatPrice(premium)})`,
        };
      },

      writeOption: (stockId, kind, strike, expirySession, quantity) => {
        get().settleCashflows();
        const state = get();
        const now = Date.now();
        if (quantity <= 0 || !Number.isInteger(quantity)) {
          return { success: false, message: "수량은 1 이상의 정수여야 합니다." };
        }
        const stock = state.stocks.find((s) => s.id === stockId);
        if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
        if (
          stock.sector === "선물" ||
          stock.sector === "지수" ||
          isPumpStock(stock)
        ) {
          return { success: false, message: "지수·선물·급등주는 옵션이 없습니다." };
        }
        if (!isListed(stock)) {
          return {
            success: false,
            message: "아직 상장 전인 종목입니다. IPO 탭에서 상장 시각을 확인하세요.",
          };
        }
        const session = Math.floor(now / SESSION_DURATION_MS);
        if (expirySession <= session) {
          return { success: false, message: "이미 만기된 옵션입니다." };
        }
        const rate = currentRateDecimal(state.stocks);
        const premium = optionPremium(
          kind,
          strike,
          expirySession,
          stock,
          now / SESSION_DURATION_MS,
          rate,
        );
        const id = `opt-${stockId}-${kind}-short-${strike}-${expirySession}`;
        const draft: OptionPosition = {
          id,
          stockId,
          kind,
          side: "short",
          strike,
          expirySession,
          quantity,
          openPremium: premium,
          openedAt: now,
          openSplitMultiplier: underlyingSplitMultiplier(stock, state.stocks),
        };
        const margin = shortMarginPerContract(draft, stock) * quantity;
        if (margin > fullBuyingPower(state)) {
          return { success: false, message: "증거금(매수여력)이 부족합니다." };
        }
        const existing = state.options.find((o) => o.id === id);
        const options = existing
          ? state.options.map((o) =>
              o.id === id
                ? {
                    ...o,
                    quantity: o.quantity + quantity,
                    openPremium: Math.round(
                      (o.openPremium * o.quantity + premium * quantity) /
                        (o.quantity + quantity),
                    ),
                  }
                : o,
            )
          : [...state.options, draft];
        const trade: Trade = {
          id: `option-write-${now}-${Math.random().toString(36).slice(2, 6)}`,
          stockId,
          ticker: stock.ticker,
          type: "option_write",
          quantity,
          price: premium,
          total: premium * quantity,
          timestamp: now,
          optionId: id,
          optionKind: kind,
          optionSide: "short",
          strike,
          expirySession,
        };
        set({
          cash: state.cash + premium * quantity,
          options,
          trades: [trade, ...state.trades],
        });
        get().checkAchievements();
        return {
          success: true,
          message: `${kind === "call" ? "콜" : "풋"} 발행 (+${formatPrice(premium)})`,
        };
      },

      closeOption: (optionId, quantity) => {
        get().settleCashflows();
        const state = get();
        const now = Date.now();
        const pos = state.options.find((o) => o.id === optionId);
        if (!pos) return { success: false, message: "옵션 포지션이 없습니다." };
        if (quantity <= 0 || quantity > pos.quantity) {
          return { success: false, message: "청산 수량이 올바르지 않습니다." };
        }
        const stock = state.stocks.find((s) => s.id === pos.stockId);
        if (!stock) return { success: false, message: "종목을 찾을 수 없습니다." };
        const mark = positionMark(
          pos,
          stock,
          now / SESSION_DURATION_MS,
          currentRateDecimal(state.stocks),
          state.stocks,
        );
        const remaining = pos.quantity - quantity;
        const options =
          remaining === 0
            ? state.options.filter((o) => o.id !== optionId)
            : state.options.map((o) =>
                o.id === optionId ? { ...o, quantity: remaining } : o,
              );
        // long 청산 = 되팔아 현금 유입, short 청산 = 되사서 현금 유출
        const delta =
          pos.side === "long" ? mark * quantity : -mark * quantity;
        const trade: Trade = {
          id: `option-close-${now}-${Math.random().toString(36).slice(2, 6)}`,
          stockId: pos.stockId,
          ticker: stock.ticker,
          type: "option_close",
          quantity,
          price: mark,
          total: mark * quantity,
          timestamp: now,
          optionId: pos.id,
          optionKind: pos.kind,
          optionSide: pos.side,
          strike: pos.strike,
          expirySession: pos.expirySession,
        };
        set({
          cash: state.cash + delta,
          options,
          trades: [trade, ...state.trades],
        });
        return {
          success: true,
          message: `옵션 청산 (${formatPrice(mark)})`,
        };
      },

      getBuyingPower: () => longBuyingPower(get()),

      getEquity: () => fullEquityOf(get()),

      getRateLevel: () => getRateLevel(getBenchmark(get().stocks)),

      checkAchievements: () => {
        const s = get();
        const unlocked = new Set(s.achievements);
        const equity = fullEquityOf(s);
        // 캐릭터별 보유 집중도 — 원 앤 온리·트윈 스타·트리플 하르모니아 판정용.
        const concentration = computeCharacterConcentration(
          s.holdings,
          s.stocks,
          equity,
        );
        const ctx = {
          netWorth: equity,
          topCharacterShare: concentration.topCharacterShare,
          topTwoCharacterShare: concentration.topTwoCharacterShare,
          topThreeCharacterShare: concentration.topThreeCharacterShare,
          heldCharacterCount: concentration.heldCount,
          initialCash: s.initialCash,
          tradeCount: s.trades.length,
          hasShorted: s.trades.some((t) => t.type === "short"),
          hasOption: s.options.length > 0,
          hasPumpTraded: s.trades.some((t) => t.stockId.startsWith("pump-")),
          usedMargin: s.cash < 0,
          marginCalled: s.marginCallAt !== null,
          luxuryCount: s.ownedLuxuries.length,
          wonJackpot: s.wonJackpot,
        };
        const newly = ACHIEVEMENTS.filter(
          (a) => !unlocked.has(a.id) && a.check(ctx),
        );
        if (newly.length === 0) return;
        set({ achievements: [...s.achievements, ...newly.map((a) => a.id)] });
        for (const a of newly) {
          useToastStore
            .getState()
            .push(`🏆 업적 달성 · ${a.emoji} ${a.title}`, "success");
        }
        playSound("cash");
      },

      getLotteryTicketsLeft: () => {
        const s = get();
        const window = alignSessionToGrid(
          Math.floor(Date.now() / SESSION_DURATION_MS),
          LOTTERY_INTERVAL_DAYS,
        );
        const bought =
          s.lotteryWindowStart === window ? s.lotteryTicketsBought : 0;
        return Math.max(0, LOTTERY_MAX_PER_WINDOW - bought);
      },

      awardMinigameCash: (amount, label) => {
        const value = Math.max(0, Math.floor(amount));
        if (value <= 0) return;
        const state = get();
        const now = Date.now();
        const currentSession = Math.floor(now / SESSION_DURATION_MS);
        const payment: CashPayment = {
          id: `minigame-${now}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "minigame",
          sourceId: label,
          dueSession: currentSession,
          amount: value,
          timestamp: now,
        };
        set({
          cash: state.cash + value,
          cashPayments: [payment, ...state.cashPayments].slice(0, 200),
        });
        playSound("cash");
      },

      refreshServerPlayerCompany: async () => {
        const state = get();
        if (!state.userId || state.playerCompany) return;
        try {
          const requests = await listMyCompanyFoundationRequests();
          const latest = get();
          if (latest.playerCompany) return;
          const now = Date.now();
          const recovered = recoverPlayerCompanyFromServerRecords(
            requests,
            latest.cashPayments,
            Math.floor(now / SESSION_DURATION_MS),
            now,
          );
          if (!recovered) return;
          set({ playerCompany: recovered.entity });
          if (recovered.shouldMarkShipped) {
            await markCompanyFoundationShipped(recovered.requestId);
          }
        } catch (error) {
          console.warn("[company] server recovery failed", error);
        }
      },

      foundPlayerCompany: async (input, approvalRequestId) => {
        const state = get();
        if (!state.userId || !state.cloudSyncReady) {
          return {
            success: false,
            message: "로그인한 계정에서만 회사를 설립할 수 있습니다.",
          };
        }
        if (state.playerCompany) {
          return { success: false, message: "계정당 회사는 1개만 설립할 수 있습니다." };
        }
        if (
          !approvalRequestId ||
          !(await verifyCompanyFoundationApproval(approvalRequestId, input))
        ) {
          return {
            success: false,
            message: "관리자에게 허가된 회사 설립 신청이 필요합니다.",
          };
        }
        // 승인 확인 중 지갑이 바뀌었을 수 있으므로 최신 상태로 비용을 다시 계산한다.
        const approvedState = get();
        if (approvedState.playerCompany) {
          return { success: false, message: "계정당 회사는 1개만 설립할 수 있습니다." };
        }
        const now = Date.now();
        const currentSession = Math.floor(now / SESSION_DURATION_MS);
        const result = createPlayerCompany(
          input,
          approvedState.getTotalAssets(),
          approvedState.cash,
          currentSession,
          now,
          approvedState.stocks.map((stock) => stock.ticker),
        );
        if (!result.success || !result.company || result.cash === undefined) {
          return { success: false, message: result.message };
        }
        const payment: CashPayment = {
          id: `company-founding-${result.company.id}`,
          kind: "company_capital",
          sourceId: result.company.id,
          ticker: result.company.ticker,
          dueSession: currentSession,
          amount: -(result.burned ?? 0),
          timestamp: now,
        };
        set({
          cash: result.cash,
          playerCompany: result.company,
          cashPayments: [payment, ...approvedState.cashPayments].slice(0, 200),
        });
        await markCompanyFoundationShipped(approvalRequestId);
        useToastStore.getState().push(result.message, "success");
        playSound("cash");
        return { success: true, message: result.message };
      },

      preparePlayerCompanyCapitalCall: () => {
        const state = get();
        if (!state.playerCompany) return;
        const now = Date.now();
        const next = prepareCompanyCapitalCall(
          state.playerCompany,
          state.getTotalAssets(),
          Math.floor(now / SESSION_DURATION_MS),
          now,
        );
        if (next !== state.playerCompany) set({ playerCompany: next });
      },

      fundPlayerCompanyCapitalCall: () => {
        const state = get();
        if (!state.playerCompany) {
          return { success: false, message: "설립한 회사가 없습니다." };
        }
        const now = Date.now();
        const currentSession = Math.floor(now / SESSION_DURATION_MS);
        const result = fundCompanyCapitalCall(
          state.playerCompany,
          state.cash,
          currentSession,
          now,
        );
        if (!result.success || !result.company || result.cash === undefined) {
          return { success: false, message: result.message };
        }
        const payment: CashPayment = {
          id: `company-capital-${result.company.id}-${currentSession}`,
          kind: "company_capital",
          sourceId: result.company.id,
          ticker: result.company.ticker,
          dueSession: currentSession,
          amount: -(result.burned ?? 0),
          timestamp: now,
        };
        set({
          cash: result.cash,
          playerCompany: result.company,
          cashPayments: [payment, ...state.cashPayments].slice(0, 200),
        });
        useToastStore.getState().push(result.message, "success");
        playSound("cash");
        return { success: true, message: result.message };
      },

      dilutePlayerCompanyCapitalCall: () => {
        const state = get();
        if (!state.playerCompany) {
          return { success: false, message: "설립한 회사가 없습니다." };
        }
        const now = Date.now();
        const result = diluteCompanyCapitalCall(
          state.playerCompany,
          Math.floor(now / SESSION_DURATION_MS),
          now,
        );
        if (!result.success || !result.company) {
          return { success: false, message: result.message };
        }
        set({ playerCompany: result.company });
        useToastStore.getState().push(result.message, "info");
        return { success: true, message: result.message };
      },

      refusePlayerCompanyCapitalCall: () => {
        const state = get();
        if (!state.playerCompany) {
          return { success: false, message: "설립한 회사가 없습니다." };
        }
        const now = Date.now();
        const result = refuseCompanyCapitalCall(
          state.playerCompany,
          Math.floor(now / SESSION_DURATION_MS),
          now,
        );
        if (!result.success || !result.company) {
          return { success: false, message: result.message };
        }
        set({ playerCompany: result.company });
        useToastStore.getState().push(result.message, "error");
        return { success: true, message: result.message };
      },

      resumePlayerCompany: () => {
        const state = get();
        if (!state.playerCompany) {
          return { success: false, message: "설립한 회사가 없습니다." };
        }
        const now = Date.now();
        const result = resumeCompany(
          state.playerCompany,
          state.getTotalAssets(),
          Math.floor(now / SESSION_DURATION_MS),
          now,
        );
        if (!result.success || !result.company) {
          return { success: false, message: result.message };
        }
        set({ playerCompany: result.company });
        useToastStore.getState().push(result.message, "info");
        return { success: true, message: result.message };
      },

      markPlayerCompanyIpoRequested: () => {
        const state = get();
        if (!state.playerCompany) {
          return { success: false, message: "설립한 회사가 없습니다." };
        }
        const now = Date.now();
        const result = markCompanyIpoRequested(state.playerCompany, now);
        if (!result.success || !result.company) {
          return { success: false, message: result.message };
        }
        set({
          playerCompany: result.company,
          lastStockRequestSession: Math.floor(now / SESSION_DURATION_MS),
        });
        useToastStore.getState().push(result.message, "success");
        return { success: true, message: result.message };
      },

      refreshListedAmcFunds: async () => {
        const state = get();
        // cloudSyncReady 전이라도 userId만 있으면 복구 가능해야 한다.
        // (로그인 직후 saveCloud가 빈 funds를 덮어쓰기 전에 복구해야 함)
        if (!state.userId) {
          set({ listedAmcFunds: [], refreshingAmcLedger: false });
          return;
        }
        if (state.refreshingAmcLedger) return;
        set({ refreshingAmcLedger: true });
        try {
          const [live, ownedListed, requests, foundationRequests] = await Promise.all([
            fetchLiveListedAmcFunds(),
            fetchListedAmcFundsByManager(state.userId),
            listMyAmcEtfListingRequests().catch(() => []),
            listMyAmcFoundationRequests().catch(() => []),
          ]);
          const heldIds = state.holdings
            .map((item) => parseAmcFundId(item.stockId))
            .filter((id): id is string => Boolean(id));
          const knownIds = new Set([
            ...live.map((fund) => fund.id),
            ...ownedListed.map((fund) => fund.id),
          ]);
          const missing = heldIds.filter((id) => !knownIds.has(id));
          const heldExtra = missing.length
            ? await fetchListedAmcFundsByIds(missing)
            : [];
          let merged = [...live];
          for (const fund of [...ownedListed, ...heldExtra]) {
            if (!merged.some((item) => item.id === fund.id)) merged.push(fund);
          }

          const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
          const priceOf = (stockId: string) =>
            state.stocks.find((stock) => stock.id === stockId)?.currentPrice ?? 0;
          const initialPriceOf = (stockId: string) =>
            state.stocks.find((stock) => stock.id === stockId)?.initialPrice ?? 0;
          const valuationPriceOf = createAmcValuationPriceResolver(state.stocks);
          const stockOf = (stockId: string) =>
            state.stocks.find((stock) => stock.id === stockId);
          const adjustmentFunds = merged.filter((fund) => {
            if (
              fund.status === "delisted" ||
              isAmcShareAdjustmentCoolingDown(
                fund.lastShareAdjustmentSession,
                currentSession,
              )
            ) {
              return false;
            }
            const nav = computeAmcFundNavPerShare(
              listedFundToAmcState(fund),
              priceOf,
              initialPriceOf,
              valuationPriceOf,
            );
            return (
              (Boolean(fund.splitTriggerPrice) &&
                nav >= (fund.splitTriggerPrice ?? Number.POSITIVE_INFINITY)) ||
              (Boolean(fund.reverseSplitTriggerPrice) &&
                nav <= (fund.reverseSplitTriggerPrice ?? 0))
            );
          });
          const adjustedFunds = await Promise.all(
            adjustmentFunds.map((fund) =>
              adjustAmcListedFundShares({
                fundId: fund.id,
                currentSession,
                priceFactor: computeAmcFundBasketPriceFactor(
                  fund.holdings,
                  priceOf,
                  initialPriceOf,
                  valuationPriceOf,
                ),
              }),
            ),
          );
          for (const adjusted of adjustedFunds) {
            if (adjusted) merged = upsertListedCache(merged, adjusted);
          }
          const dueFunds = merged.filter(
            (fund) =>
              fund.status !== "delisted" &&
              (currentSession - fund.lastFeeSession >= AMC_FEE_INTERVAL_DAYS ||
                currentSession - fund.lastDividendSession >=
                  fund.dividendIntervalDays ||
                (fund.style === "active" &&
                  currentSession - fund.lastRebalanceSession >=
                    AMC_REBALANCE_WINDOW_DAYS)),
          );
          const settledFunds = await Promise.all(
            dueFunds.map((fund) => {
              const stateFund = listedFundToAmcState(fund);
              const priceFactor = computeAmcFundBasketPriceFactor(
                fund.holdings,
                priceOf,
                initialPriceOf,
                valuationPriceOf,
              );
              const passivePeriodRate =
                fund.style === "passive"
                  ? resolveAmcDividendPeriodRate(stateFund, priceOf, stockOf)
                  : 0;
              return settleAmcListedFund({
                fundId: fund.id,
                currentSession,
                priceFactor,
                passivePeriodRate,
              });
            }),
          );
          for (const settled of settledFunds) {
            if (settled) merged = upsertListedCache(merged, settled);
          }

          let ledger = await fetchMyAmcLedger();
          const ledgerIds = new Set(ledger.positions.map((row) => row.fundId));
          const bootstrapped = await Promise.all(
            state.holdings
              .map((holding) => ({
                holding,
                fundId: parseAmcFundId(holding.stockId),
              }))
              .filter(
                (row): row is { holding: Holding; fundId: string } =>
                  Boolean(row.fundId) &&
                  row.holding.quantity > 0 &&
                  !ledgerIds.has(row.fundId!),
              )
              .map((row) =>
                bootstrapAmcPosition(row.fundId),
              ),
          );
          if (bootstrapped.some(Boolean)) ledger = await fetchMyAmcLedger();

          const latest = get();
          const ledgerById = new Map(
            ledger.positions.map((row) => [row.fundId, row.quantity]),
          );
          const existingAmcIds = new Set<string>();
          const holdings = latest.holdings.flatMap((holding) => {
            const fundId = parseAmcFundId(holding.stockId);
            if (!fundId) return [holding];
            existingAmcIds.add(fundId);
            if (!ledgerById.has(fundId)) return [holding];
            const quantity = ledgerById.get(fundId) ?? 0;
            const shareMultiplier =
              merged.find((fund) => fund.id === fundId)?.shareMultiplier ?? 1;
            const appliedMultiplier = holding.amcShareMultiplier ?? 1;
            const adjustmentRatio =
              shareMultiplier > 0 && appliedMultiplier > 0
                ? shareMultiplier / appliedMultiplier
                : 1;
            return quantity > 1e-9
              ? [
                  {
                    ...holding,
                    quantity,
                    averagePrice: holding.averagePrice / adjustmentRatio,
                    amcShareMultiplier: shareMultiplier,
                  },
                ]
              : [];
          });
          for (const position of ledger.positions) {
            if (!(position.quantity > 1e-9) || existingAmcIds.has(position.fundId)) {
              continue;
            }
            const fund = merged.find((item) => item.id === position.fundId);
            if (!fund) continue;
            const stateFund = listedFundToAmcState(fund);
            const nav = computeAmcFundNavPerShare(
              stateFund,
              priceOf,
              initialPriceOf,
              valuationPriceOf,
            );
            const cursor = fund.dividendHistory.reduce(
              (max, entry) => Math.max(max, entry.session),
              Number.NEGATIVE_INFINITY,
            );
            holdings.push({
              stockId: amcFundStockId(position.fundId),
              quantity: position.quantity,
              averagePrice: nav,
              amcShareMultiplier: fund.shareMultiplier ?? 1,
              ...(Number.isFinite(cursor)
                ? { amcDividendCursorSession: cursor }
                : {}),
            });
          }

          let assetManager = rebuildAssetManagerFromOwnedListed(
            merged,
            state.userId,
            latest.assetManager,
          );
          if (!assetManager) {
            const recovered = recoverAssetManagerFromServerRecords(
              foundationRequests,
              requests,
              latest.cashPayments,
              currentSession,
            );
            if (recovered) {
              assetManager = recovered.entity;
              if (recovered.shouldMarkShipped) {
                await markAmcFoundationShipped(recovered.requestId);
              }
            }
          }
          if (!assetManager && requests.length) {
            const usable = requests.filter(
              (request) => request.status !== "rejected",
            );
            if (usable.length) {
              const sample = usable[0]!;
              const createdAt = Date.parse(sample.createdAt) || Date.now();
              assetManager = {
                id: `amc-restored-req-${state.userId.slice(0, 8)}`,
                name: sample.payload.managerName || "복구된 운용사",
                tagline:
                  sample.payload.managerTagline || "상장 신청 내역에서 자동 복구됨",
                foundedAt: createdAt,
                foundedSession: Math.floor(createdAt / SESSION_DURATION_MS),
                foundingBurn: 1_000_000,
                cumulativeBurned: 1_000_000,
                approvalRequestId: "restored-from-listing-request",
                funds: [],
                lastActionAt: Date.now(),
              };
            }
          }
          if (assetManager) {
            assetManager = reconcileOwnedListingRequestsIntoManager(
              assetManager,
              requests,
            );
            let upgradedManager: AssetManagerState = assetManager;
            for (const fund of [...upgradedManager.funds]) {
              const upgraded = upgradeAmcFundHoldingBases(
                fund,
                priceOf,
                initialPriceOf,
                valuationPriceOf,
              );
              if (upgraded === fund) continue;
              const listed = merged.some((item) => item.id === fund.id);
              if (listed) {
                const nextManager: AssetManagerState = {
                  ...upgradedManager,
                  funds: upgradedManager.funds.map((item) =>
                    item.id === fund.id ? upgraded : item,
                  ),
                };
                const synced = await syncAmcListedFundMeta(
                  upgraded,
                  nextManager,
                  true,
                );
                if (!synced.success || !synced.fund) continue;
                merged = upsertListedCache(merged, synced.fund);
                upgradedManager = nextManager;
              } else {
                upgradedManager = {
                  ...upgradedManager,
                  funds: upgradedManager.funds.map((item) =>
                    item.id === fund.id ? upgraded : item,
                  ),
                };
              }
            }
            assetManager = upgradedManager;
          }
          const existingTradeIds = new Set(latest.trades.map((trade) => trade.id));
          const ledgerTrades: Trade[] = ledger.trades
            .filter((trade) => !existingTradeIds.has(`amc-ledger-trade-${trade.id}`))
            .map((trade) => {
              const fund = merged.find((item) => item.id === trade.fundId);
              return {
                id: `amc-ledger-trade-${trade.id}`,
                stockId: amcFundStockId(trade.fundId),
                ticker: fund?.ticker ?? trade.fundId,
                type: trade.delta > 0 ? ("buy" as const) : ("sell" as const),
                quantity: Math.abs(trade.delta),
                price: trade.navPerShare,
                total: trade.total,
                timestamp: trade.createdAt,
              };
            });
          const redemptionTrades: Trade[] = ledger.payments
            .filter(
              (payment) =>
                payment.kind === "delist" &&
                !existingTradeIds.has(
                  `amc-ledger-redemption-${payment.eventId}`,
                ),
            )
            .map((payment) => ({
              id: `amc-ledger-redemption-${payment.eventId}`,
              stockId: amcFundStockId(payment.fundId),
              ticker: payment.ticker,
              type: "sell" as const,
              quantity: payment.quantity,
              price: payment.perShare,
              total: payment.amount,
              timestamp: payment.createdAt,
            }));
          const existingPaymentIds = new Set(
            latest.cashPayments.map((payment) => payment.id),
          );
          const ledgerPayments: CashPayment[] = ledger.payments
            .filter(
              (payment) =>
                !existingPaymentIds.has(
                  `amc-ledger-payment-${payment.eventId}`,
                ),
            )
            .map((payment) => ({
              id: `amc-ledger-payment-${payment.eventId}`,
              kind:
                payment.kind === "management_fee"
                  ? ("management_fee" as const)
                  : payment.kind === "delist"
                    ? ("amc_redemption" as const)
                    : ("amc_dividend" as const),
              sourceId: payment.fundId,
              ticker: payment.ticker,
              dueSession: payment.dueSession,
              quantity: payment.quantity,
              amountPerShare: payment.perShare || undefined,
              amount: payment.amount,
              timestamp: payment.createdAt,
            }));
          const ledgerCash = reconcileAmcLedgerCash(
            latest.cash,
            latest.amcLedgerBalance,
            ledger.balance,
          );
          if (!ledgerCash) throw new Error("invalid AMC ledger balance");
          set({
            listedAmcFunds: merged,
            assetManager,
            holdings,
            cash: ledgerCash.cash,
            amcLedgerBalance: ledgerCash.appliedBalance,
            amcLedgerRevision: ledger.revision,
            trades: [...ledgerTrades, ...redemptionTrades, ...latest.trades]
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 500),
            cashPayments: [...ledgerPayments, ...latest.cashPayments]
              .sort((a, b) => b.timestamp - a.timestamp)
              .slice(0, 200),
          });
        } catch (error) {
          console.warn("[amc] server ledger refresh failed", error);
        } finally {
          set({ refreshingAmcLedger: false });
        }
      },

      foundAssetManager: async (input, approvalRequestId) => {
        const state = get();
        if (!state.userId || !state.cloudSyncReady) {
          return {
            success: false,
            message: "로그인한 계정에서만 자산운용사를 설립할 수 있습니다.",
          };
        }
        if (state.assetManager) {
          return { success: false, message: "이미 자산운용사를 보유 중입니다." };
        }
        if (
          !approvalRequestId ||
          !(await verifyAmcFoundationApproval(approvalRequestId, input))
        ) {
          return {
            success: false,
            message: "관리자에게 허가된 운용사 설립 신청이 필요합니다.",
          };
        }
        const approved = get();
        if (approved.assetManager) {
          return { success: false, message: "이미 자산운용사를 보유 중입니다." };
        }
        const now = Date.now();
        const currentSession = Math.floor(now / SESSION_DURATION_MS);
        const result = createAssetManager(
          input,
          approved.cash,
          approved.getTotalAssets(),
          approvalRequestId,
          currentSession,
          now,
        );
        if (!result.success || !result.manager || result.cash === undefined) {
          return { success: false, message: result.message };
        }
        const payment: CashPayment = {
          id: `amc-founding-${result.manager.id}`,
          kind: "amc_capital",
          sourceId: result.manager.id,
          dueSession: currentSession,
          amount: -(result.burned ?? 0),
          timestamp: now,
        };
        set({
          cash: result.cash,
          assetManager: result.manager,
          cashPayments: [payment, ...approved.cashPayments].slice(0, 200),
        });
        await markAmcFoundationShipped(approvalRequestId);
        useToastStore.getState().push(result.message, "success");
        playSound("cash");
        return { success: true, message: result.message };
      },

      createAmcFund: async (input) => {
        const state = get();
        if (!state.userId || !state.cloudSyncReady) {
          return {
            success: false,
            message: "로그인한 계정에서만 ETF를 설정·신청할 수 있습니다.",
          };
        }
        if (!state.assetManager) {
          return { success: false, message: "먼저 자산운용사를 설립해 주세요." };
        }
        const now = Date.now();
        const currentSession = Math.floor(now / SESSION_DURATION_MS);
        const priceOf = (stockId: string) =>
          state.stocks.find((stock) => stock.id === stockId)?.currentPrice ?? 0;
        const initialPriceOf = (stockId: string) =>
          state.stocks.find((stock) => stock.id === stockId)?.initialPrice ?? 0;
        const valuationPriceOf = createAmcValuationPriceResolver(state.stocks);
        const reservedTickers = [
          ...state.stocks.map((stock) => stock.ticker),
          ...state.listedAmcFunds
            .filter((fund) => fund.status !== "delisted")
            .map((fund) => fund.ticker),
        ];
        const result = createManagedFund(
          state.assetManager,
          input,
          state.cash,
          currentSession,
          priceOf,
          initialPriceOf,
          now,
          reservedTickers,
          valuationPriceOf,
        );
        if (
          !result.success ||
          !result.manager ||
          !result.fund ||
          result.cash === undefined
        ) {
          return { success: false, message: result.message };
        }
        // 상장 신청 전에 지갑에 먼저 반영 — 신청 대기 중 유실 방지
        const seedStockId = amcFundStockId(result.fund.id);
        const seedQty = result.fund.totalShares;
        const nav = computeAmcFundNavPerShare(
          result.fund,
          priceOf,
          initialPriceOf,
          valuationPriceOf,
        );
        const payments: CashPayment[] = [];
        if ((result.burned ?? 0) > 0) {
          payments.push({
            id: `amc-seed-burn-${result.fund.id}`,
            kind: "amc_capital",
            sourceId: result.fund.id,
            ticker: result.fund.ticker,
            dueSession: currentSession,
            amount: -(result.burned ?? 0),
            timestamp: now,
          });
        }
        const holdings = [
          ...state.holdings.filter((item) => item.stockId !== seedStockId),
          {
            stockId: seedStockId,
            quantity: seedQty,
            averagePrice: nav,
            amcDividendCursorSession: currentSession,
            amcShareMultiplier: 1,
          },
        ];
        const issuanceCharacterId = resolveSingleCharacterLongEtfId(
          result.fund.holdings,
          state.stocks,
        );
        const characterProgress = issuanceCharacterId
          ? addCharacterProgress(
              state.characterProgress,
              issuanceCharacterId,
              0,
              SINGLE_CHARACTER_ETF_ISSUANCE_AFFINITY,
              currentSession,
            )
          : state.characterProgress;
        set({
          cash: result.cash,
          assetManager: result.manager,
          holdings,
          characterProgress,
          cashPayments: [...payments, ...state.cashPayments].slice(0, 200),
          trades: [
            {
              id: `amc-seed-${result.fund.id}`,
              stockId: seedStockId,
              ticker: result.fund.ticker,
              type: "buy",
              quantity: seedQty,
              price: nav,
              total: nav * seedQty,
              timestamp: now,
            },
            ...state.trades,
          ].slice(0, 500) as Trade[],
        });
        // Persist the seed debit and founder position before a listing request
        // can survive beyond this tab/session.
        if (!(await get().saveCloud())) {
          useToastStore.getState().push(
            "ETF는 계좌에 반영했지만 서버 저장이 지연되고 있습니다.",
            "info",
          );
          return {
            success: true,
            message:
              "ETF와 시드 대금은 계좌에 반영했습니다. 서버 저장 후 펀드 카드에서 상장을 다시 신청해 주세요.",
          };
        }
        const listing = await submitAmcEtfListingRequest(
          result.fund,
          result.manager,
        );
        if (!listing.success || !listing.requestId) {
          useToastStore.getState().push(
            `${result.message} (상장 신청 실패: ${listing.message || "다시 신청해 주세요."})`,
            "info",
          );
          return {
            success: true,
            message: `${result.message} 상장 허가 신청은 실패했습니다. 펀드 카드에서 다시 신청해 주세요.`,
          };
        }
        const fundWithRequest = {
          ...result.fund,
          listingRequestId: listing.requestId,
        };
        const latest = get();
        if (latest.assetManager) {
          set({
            assetManager: {
              ...latest.assetManager,
              funds: latest.assetManager.funds.map((item) =>
                item.id === fundWithRequest.id ? fundWithRequest : item,
              ),
            },
          });
        }
        const issuanceMessage = issuanceCharacterId
          ? ` 단일 캐릭터 테마 발행 보너스로 호감도 +${SINGLE_CHARACTER_ETF_ISSUANCE_AFFINITY}가 적용되었습니다.`
          : "";
        const message = `${result.message} 상장 허가 신청이 접수되었습니다.${issuanceMessage}`;
        useToastStore.getState().push(message, "success");
        playSound("cash");
        return { success: true, message };
      },

      requestAmcFundListing: async (fundId) => {
        const state = get();
        if (!state.userId || !state.cloudSyncReady || !state.assetManager) {
          return {
            success: false,
            message: "로그인한 운용사 계정에서만 신청할 수 있습니다.",
          };
        }
        const fund = state.assetManager.funds.find((item) => item.id === fundId);
        if (!fund) {
          return { success: false, message: "펀드를 찾을 수 없습니다." };
        }
        if (
          state.listedAmcFunds.some(
            (item) => item.id === fundId && item.status !== "delisted",
          )
        ) {
          return { success: false, message: "이미 공유 마켓에 상장되어 있습니다." };
        }
        const listing = await submitAmcEtfListingRequest(
          fund,
          state.assetManager,
        );
        if (!listing.success || !listing.requestId) {
          return {
            success: false,
            message: listing.message || "상장 허가 신청에 실패했습니다.",
          };
        }
        set({
          assetManager: {
            ...state.assetManager,
            funds: state.assetManager.funds.map((item) =>
              item.id === fundId
                ? { ...item, listingRequestId: listing.requestId }
                : item,
            ),
            lastActionAt: Date.now(),
          },
        });
        useToastStore.getState().push(listing.message, "success");
        return { success: true, message: listing.message };
      },

      listAmcFundOnMarket: async (fundId) => {
        const state = get();
        if (!state.userId || !state.cloudSyncReady) {
          return {
            success: false,
            message: "로그인한 계정에서만 상장할 수 있습니다.",
          };
        }
        if (!state.assetManager) {
          return { success: false, message: "자산운용사가 없습니다." };
        }
        const fund = state.assetManager.funds.find((item) => item.id === fundId);
        if (!fund) {
          return { success: false, message: "펀드를 찾을 수 없습니다." };
        }
        if (fund.status === "delisted") {
          return { success: false, message: "상장폐지된 펀드입니다." };
        }
        if (state.listedAmcFunds.some((item) => item.id === fundId && item.status !== "delisted")) {
          return { success: false, message: "이미 공유 마켓에 상장되어 있습니다." };
        }
        const requestId = fund.listingRequestId;
        if (!requestId) {
          return {
            success: false,
            message: "상장 허가 신청 기록이 없습니다. 다시 신청해 주세요.",
          };
        }
        if (!(await verifyAmcEtfListingApproval(requestId, fund))) {
          return {
            success: false,
            message: "관리자 상장 허가가 필요합니다.",
          };
        }
        const published = await publishAmcListedFund(fund, state.assetManager);
        if (!published.success || !published.fund) {
          return {
            success: false,
            message: published.message || "공유 상장에 실패했습니다.",
          };
        }
        const seedHolding = state.holdings.find(
          (item) => item.stockId === amcFundStockId(fund.id),
        );
        if (seedHolding && seedHolding.quantity > 0) {
          await state.saveCloud();
          await bootstrapAmcPosition(fund.id);
        }
        await markAmcEtfListingShipped(requestId);
        set({
          listedAmcFunds: upsertListedCache(
            state.listedAmcFunds,
            published.fund,
          ),
        });
        const message = `${fund.ticker}가 AMC 마켓에 상장되었습니다.`;
        useToastStore.getState().push(message, "success");
        playSound("cash");
        return { success: true, message };
      },

      rebalanceAmcFund: async (fundId, holdingsInput) => {
        const state = get();
        if (!state.assetManager) {
          return { success: false, message: "자산운용사가 없습니다." };
        }
        const now = Date.now();
        const result = rebalanceManagedFund(
          state.assetManager,
          fundId,
          holdingsInput,
          Math.floor(now / SESSION_DURATION_MS),
          now,
          (stockId) =>
            state.stocks.find((stock) => stock.id === stockId)?.currentPrice ?? 0,
          (stockId) =>
            state.stocks.find((stock) => stock.id === stockId)?.initialPrice ?? 0,
          createAmcValuationPriceResolver(state.stocks),
        );
        if (!result.success || !result.manager || !result.fund) {
          return { success: false, message: result.message };
        }
        const alreadyListed = state.listedAmcFunds.some(
          (item) => item.id === fundId && item.status !== "delisted",
        );
        if (alreadyListed) {
          const synced = await syncAmcListedFundMeta(
            result.fund,
            result.manager,
            true,
          );
          if (!synced.success) {
            return {
              success: false,
              message: synced.message || "공유 원장 동기화에 실패했습니다.",
            };
          }
          set({
            assetManager: result.manager,
            ...(synced.fund
              ? {
                  listedAmcFunds: upsertListedCache(
                    state.listedAmcFunds,
                    synced.fund,
                  ),
                }
              : {}),
          });
        } else {
          set({ assetManager: result.manager });
        }
        useToastStore.getState().push(result.message, "success");
        return { success: true, message: result.message };
      },

      voluntarilyDelistAmcFund: async (fundId) => {
        let state = get();
        if (!state.userId || !state.cloudSyncReady) {
          return {
            success: false,
            message: "로그인한 계정에서만 자진 상장폐지할 수 있습니다.",
          };
        }
        const listed = state.listedAmcFunds.find(
          (item) => item.id === fundId && item.status !== "delisted",
        );
        if (!listed) {
          return { success: false, message: "상장 중인 ETF를 찾을 수 없습니다." };
        }
        if (listed.managerUserId !== state.userId) {
          return {
            success: false,
            message: "해당 ETF의 운용사만 자진 상장폐지할 수 있습니다.",
          };
        }
        if (!state.assetManager) {
          return { success: false, message: "자산운용사 정보를 불러와 주세요." };
        }
        const fund =
          state.assetManager.funds.find((item) => item.id === fundId) ??
          listedFundToAmcState(listed);
        const priceOf = (stockId: string) =>
          state.stocks.find((stock) => stock.id === stockId)?.currentPrice ?? 0;
        const initialPriceOf = (stockId: string) =>
          state.stocks.find((stock) => stock.id === stockId)?.initialPrice ?? 0;
        const valuationPriceOf = createAmcValuationPriceResolver(state.stocks);
        const priceFactor = computeAmcFundBasketPriceFactor(
          fund.holdings,
          priceOf,
          initialPriceOf,
          valuationPriceOf,
        );
        if (!(priceFactor > 0) || !Number.isFinite(priceFactor)) {
          return {
            success: false,
            message: "현재 구성종목 가격을 확인할 수 없어 청산할 수 없습니다.",
          };
        }
        if (!(await state.saveCloud())) {
          return {
            success: false,
            message: "최신 지갑을 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          };
        }
        const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
        const response = await voluntarilyDelistAmcListedFund({
          fundId,
          currentSession,
          priceFactor,
          passivePeriodRate:
            fund.style === "passive"
              ? resolveAmcDividendPeriodRate(
                  fund,
                  priceOf,
                  (stockId) => state.stocks.find((stock) => stock.id === stockId),
                )
              : 0,
        });
        if (!response.success || !response.fund) {
          return { success: false, message: response.message };
        }
        state = get();
        const manager = state.assetManager;
        if (!manager) {
          return {
            success: false,
            message: "청산은 완료됐지만 운용사 화면 갱신에 실패했습니다. 새로고침해 주세요.",
          };
        }
        const managerWithFund = manager.funds.some((item) => item.id === fundId)
          ? manager
          : { ...manager, funds: [...manager.funds, fund] };
        const local = markAmcFundVoluntarilyDelisted(
          managerWithFund,
          fundId,
          currentSession,
        );
        set({
          ...(local.manager ? { assetManager: local.manager } : {}),
          listedAmcFunds: upsertListedCache(
            state.listedAmcFunds,
            response.fund,
          ),
        });
        await get().refreshListedAmcFunds();
        await get().saveCloud();
        useToastStore
          .getState()
          .push(`${fund.ticker} 자진 상장폐지 · 전 보유자 NAV 환급 완료`, "info");
        return { success: true, message: response.message };
      },

      updateAmcFundShareAdjustment: async (fundId, input) => {
        const state = get();
        if (!state.assetManager) {
          return { success: false, message: "자산운용사가 없습니다." };
        }
        const localFund = state.assetManager.funds.find(
          (item) => item.id === fundId,
        );
        const listed = state.listedAmcFunds.find(
          (item) => item.id === fundId && item.status !== "delisted",
        );
        const manager = localFund
          ? state.assetManager
          : listed
            ? {
                ...state.assetManager,
                funds: [
                  ...state.assetManager.funds,
                  listedFundToAmcState(listed),
                ],
              }
            : state.assetManager;
        const result = updateManagedFundShareAdjustment(
          manager,
          fundId,
          input,
        );
        if (!result.success || !result.manager || !result.fund) {
          return { success: false, message: result.message };
        }

        if (listed) {
          const synced = await updateAmcListedFundShareAdjustment(
            fundId,
            input,
          );
          if (!synced.success) {
            return {
              success: false,
              message: synced.message || "공유 원장 설정 수정에 실패했습니다.",
            };
          }
          set({
            assetManager: result.manager,
            ...(synced.fund
              ? {
                  listedAmcFunds: upsertListedCache(
                    state.listedAmcFunds,
                    synced.fund,
                  ),
                }
              : {}),
          });
        } else {
          set({ assetManager: result.manager });
        }
        useToastStore.getState().push(result.message, "success");
        return { success: true, message: result.message };
      },

      updateAmcFundComparisonStock: async (fundId, input) => {
        const state = get();
        if (!state.assetManager) {
          return { success: false, message: "자산운용사가 없습니다." };
        }
        const localFund = state.assetManager.funds.find(
          (item) => item.id === fundId,
        );
        const listed = state.listedAmcFunds.find(
          (item) => item.id === fundId && item.status !== "delisted",
        );
        const manager = localFund
          ? state.assetManager
          : listed
            ? {
                ...state.assetManager,
                funds: [
                  ...state.assetManager.funds,
                  listedFundToAmcState(listed),
                ],
              }
            : state.assetManager;
        const result = updateManagedFundComparisonStock(
          manager,
          fundId,
          input,
          (stockId) => {
            const stock = state.stocks.find((item) => item.id === stockId);
            return Boolean(
              stock &&
                stock.currentPrice > 0 &&
                isListed(stock) &&
                instrumentTypeOf(stock) === "company",
            );
          },
        );
        if (!result.success || !result.manager || !result.fund) {
          return { success: false, message: result.message };
        }
        if (listed) {
          const synced = await updateAmcListedFundComparisonStock(
            fundId,
            result.fund.comparisonStockId ?? "",
          );
          if (!synced.success) {
            return {
              success: false,
              message: synced.message || "목표 주식 동기화에 실패했습니다.",
            };
          }
          set({
            assetManager: result.manager,
            ...(synced.fund
              ? {
                  listedAmcFunds: upsertListedCache(
                    state.listedAmcFunds,
                    synced.fund,
                  ),
                }
              : {}),
          });
        } else {
          set({ assetManager: result.manager });
        }
        useToastStore.getState().push(result.message, "success");
        return { success: true, message: result.message };
      },

      buyAmcFund: async (fundId, quantity) => {
        let state = get();
        if (!state.userId || !state.cloudSyncReady) {
          return {
            success: false,
            message: "로그인한 계정에서만 유저 ETF를 거래할 수 있습니다.",
          };
        }
        const listed = state.listedAmcFunds.find((item) => item.id === fundId);
        if (!listed || listed.status === "delisted") {
          return {
            success: false,
            message: "상장 허가 후 AMC 마켓에 오른 ETF만 거래할 수 있습니다.",
          };
        }
        const own = state.assetManager?.funds.find((item) => item.id === fundId);
        const fund = own ?? listedFundToAmcState(listed);
        if (!fund) {
          return {
            success: false,
            message: "펀드를 찾을 수 없습니다. 목록을 새로고침해 주세요.",
          };
        }
        if (fund.status === "delisted") {
          return { success: false, message: "상장폐지된 펀드입니다." };
        }
        if (fund.status === "grace") {
          return {
            success: false,
            message:
              "유예 기간에는 신규 매수가 불가합니다. 리밸런싱 후 재시도해 주세요.",
          };
        }
        const qty = Number(quantity);
        if (
          !Number.isFinite(qty) ||
          qty <= 0 ||
          Math.abs(qty - Number(qty.toFixed(6))) > 1e-9
        ) {
          return { success: false, message: "수량을 확인해 주세요." };
        }
        const priceOf = (stockId: string) =>
          state.stocks.find((stock) => stock.id === stockId)?.currentPrice ?? 0;
        const initialPriceOf = (stockId: string) =>
          state.stocks.find((stock) => stock.id === stockId)?.initialPrice ?? 0;
        const valuationPriceOf = createAmcValuationPriceResolver(state.stocks);
        const nav = computeAmcFundNavPerShare(
          fund,
          priceOf,
          initialPriceOf,
          valuationPriceOf,
        );
        const total = Math.round(nav * qty);
        const buyingPower = longBuyingPower(state);
        if (buyingPower < total) {
          return {
            success: false,
            message: state.marginEnabled ? "매수여력이 부족합니다." : "현금이 부족합니다.",
          };
        }
        if (!(await state.saveCloud())) {
          return {
            success: false,
            message: "최신 지갑을 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          };
        }
        const priceFactor = computeAmcFundBasketPriceFactor(
          fund.holdings,
          priceOf,
          initialPriceOf,
          valuationPriceOf,
        );
        const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
        const settled = await settleAmcListedFund({
          fundId,
          currentSession,
          priceFactor,
          passivePeriodRate:
            fund.style === "passive"
              ? resolveAmcDividendPeriodRate(
                  fund,
                  priceOf,
                  (stockId) => state.stocks.find((stock) => stock.id === stockId),
                )
              : 0,
        });
        const serverFund = settled ?? listed;
        state = get();
        const stockId = amcFundStockId(fund.id);
        const existing = state.holdings.find((item) => item.stockId === stockId);
        if (existing?.quantity) {
          await bootstrapAmcPosition(fundId);
        }
        const orderId =
          globalThis.crypto?.randomUUID?.() ??
          `amc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const traded = await tradeAmcListedFund({
          fundId,
          delta: qty,
          expectedPosition: existing?.quantity ?? 0,
          priceFactor,
          clientOrderId: orderId,
          allowMargin: state.marginEnabled,
          marginBuyingPower: buyingPower,
        });
        if (
          !traded.success ||
          !traded.fund ||
          traded.position === undefined ||
          traded.navPerShare === undefined ||
          traded.total === undefined ||
          traded.ledgerBalance === undefined ||
          traded.ledgerRevision === undefined
        ) {
          return { success: false, message: traded.message };
        }
        const newQty = traded.position;
        const newAvg = existing
          ? (existing.averagePrice * existing.quantity +
              traded.navPerShare * qty) /
            newQty
          : traded.navPerShare;
        const now = Date.now();
        const dividendCursorSession = traded.fund.dividendHistory.reduce(
          (latest, entry) => Math.max(latest, entry.session),
          Number.NEGATIVE_INFINITY,
        );
        const nextListed = upsertListedCache(
          state.listedAmcFunds,
          traded.fund,
        );
        let nextManager = state.assetManager;
        if (nextManager) {
          nextManager = {
            ...nextManager,
            funds: nextManager.funds.map((item) =>
              item.id === fundId
                ? {
                    ...item,
                    totalShares: traded.fund!.totalShares,
                    seedNavValue: traded.fund!.seedNavValue,
                    basketPriceFactor: traded.fund!.basketPriceFactor ?? 1,
                  }
                : item,
            ),
            lastActionAt: now,
          };
        }
        const ledgerCash = reconcileAmcLedgerCash(
          state.cash,
          state.amcLedgerBalance,
          traded.ledgerBalance,
        );
        if (!ledgerCash) {
          return { success: false, message: "ETF 현금원장 값이 올바르지 않습니다." };
        }
        set({
          cash: ledgerCash.cash,
          amcLedgerBalance: ledgerCash.appliedBalance,
          amcLedgerRevision: traded.ledgerRevision,
          assetManager: nextManager,
          listedAmcFunds: nextListed,
          holdings: existing
            ? state.holdings.map((item) =>
                item.stockId === stockId
                  ? {
                      ...item,
                      quantity: newQty,
                      averagePrice: newAvg,
                      amcShareMultiplier: traded.fund!.shareMultiplier ?? 1,
                    }
                  : item,
              )
            : [
                ...state.holdings,
                {
                  stockId,
                  quantity: qty,
                  averagePrice: traded.navPerShare,
                  amcShareMultiplier: traded.fund.shareMultiplier ?? 1,
                  ...(Number.isFinite(dividendCursorSession)
                    ? { amcDividendCursorSession: dividendCursorSession }
                    : {}),
                },
              ],
          trades: [
            {
              id: `amc-ledger-trade-${orderId}`,
              stockId,
              ticker: fund.ticker,
              type: "buy",
              quantity: qty,
              price: traded.navPerShare,
              total: traded.total,
              timestamp: now,
            },
            ...state.trades,
          ].slice(0, 500) as Trade[],
        });
        playSound("buy");
        return {
          success: true,
          message: `${serverFund.ticker} ${qty}좌 매수${ledgerCash.cash < 0 ? " · 미수 사용" : ""}`,
        };
      },

      sellAmcFund: async (fundId, quantity) => {
        let state = get();
        if (!state.userId || !state.cloudSyncReady) {
          return {
            success: false,
            message: "로그인한 계정에서만 유저 ETF를 거래할 수 있습니다.",
          };
        }
        const listed = state.listedAmcFunds.find((item) => item.id === fundId);
        if (!listed || listed.status === "delisted") {
          return {
            success: false,
            message: "상장 허가 후 AMC 마켓에 오른 ETF만 거래할 수 있습니다.",
          };
        }
        const own = state.assetManager?.funds.find((item) => item.id === fundId);
        const fund = own ?? listedFundToAmcState(listed);
        if (!fund) {
          return { success: false, message: "펀드를 찾을 수 없습니다." };
        }
        if (fund.status === "delisted") {
          return {
            success: false,
            message: "이미 상장폐지되어 환급된 펀드입니다.",
          };
        }
        const qty = Number(quantity);
        if (
          !Number.isFinite(qty) ||
          qty <= 0 ||
          Math.abs(qty - Number(qty.toFixed(6))) > 1e-9
        ) {
          return { success: false, message: "수량을 확인해 주세요." };
        }
        const stockId = amcFundStockId(fund.id);
        const existing = state.holdings.find((item) => item.stockId === stockId);
        if (!existing || existing.quantity < qty) {
          return { success: false, message: "보유 좌수가 부족합니다." };
        }
        const priceOf = (stockId: string) =>
          state.stocks.find((stock) => stock.id === stockId)?.currentPrice ?? 0;
        const initialPriceOf = (stockId: string) =>
          state.stocks.find((stock) => stock.id === stockId)?.initialPrice ?? 0;
        const valuationPriceOf = createAmcValuationPriceResolver(state.stocks);
        if (!(await state.saveCloud())) {
          return {
            success: false,
            message: "최신 지갑을 서버에 저장하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          };
        }
        const priceFactor = computeAmcFundBasketPriceFactor(
          fund.holdings,
          priceOf,
          initialPriceOf,
          valuationPriceOf,
        );
        const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
        await settleAmcListedFund({
          fundId,
          currentSession,
          priceFactor,
          passivePeriodRate:
            fund.style === "passive"
              ? resolveAmcDividendPeriodRate(
                  fund,
                  priceOf,
                  (id) => state.stocks.find((stock) => stock.id === id),
                )
              : 0,
        });
        state = get();
        const latestExisting = state.holdings.find(
          (item) => item.stockId === stockId,
        );
        if (!latestExisting || latestExisting.quantity < qty) {
          return { success: false, message: "보유 좌수가 부족합니다." };
        }
        await bootstrapAmcPosition(fundId);
        const orderId =
          globalThis.crypto?.randomUUID?.() ??
          `amc-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const traded = await tradeAmcListedFund({
          fundId,
          delta: -qty,
          expectedPosition: latestExisting.quantity,
          priceFactor,
          clientOrderId: orderId,
        });
        if (
          !traded.success ||
          !traded.fund ||
          traded.position === undefined ||
          traded.navPerShare === undefined ||
          traded.total === undefined ||
          traded.ledgerBalance === undefined ||
          traded.ledgerRevision === undefined
        ) {
          return { success: false, message: traded.message };
        }
        const remaining = traded.position;
        const now = Date.now();
        const nextListed = upsertListedCache(
          state.listedAmcFunds,
          traded.fund,
        );
        let nextManager = state.assetManager;
        if (nextManager) {
          nextManager = {
            ...nextManager,
            funds: nextManager.funds.map((item) =>
              item.id === fundId
                ? {
                    ...item,
                    totalShares: traded.fund!.totalShares,
                    seedNavValue: traded.fund!.seedNavValue,
                    basketPriceFactor: traded.fund!.basketPriceFactor ?? 1,
                  }
                : item,
            ),
            lastActionAt: now,
          };
        }
        const ledgerCash = reconcileAmcLedgerCash(
          state.cash,
          state.amcLedgerBalance,
          traded.ledgerBalance,
        );
        if (!ledgerCash) {
          return { success: false, message: "ETF 현금원장 값이 올바르지 않습니다." };
        }
        set({
          cash: ledgerCash.cash,
          amcLedgerBalance: ledgerCash.appliedBalance,
          amcLedgerRevision: traded.ledgerRevision,
          assetManager: nextManager,
          listedAmcFunds: nextListed,
          holdings:
            remaining > 1e-9
              ? state.holdings.map((item) =>
                  item.stockId === stockId
                    ? {
                        ...item,
                        quantity: remaining,
                        amcShareMultiplier: traded.fund!.shareMultiplier ?? 1,
                      }
                    : item,
                )
              : state.holdings.filter((item) => item.stockId !== stockId),
          trades: [
            {
              id: `amc-ledger-trade-${orderId}`,
              stockId,
              ticker: fund.ticker,
              type: "sell",
              quantity: qty,
              price: traded.navPerShare,
              total: traded.total,
              timestamp: now,
            },
            ...state.trades,
          ].slice(0, 500) as Trade[],
        });
        playSound("sell");
        return { success: true, message: `${fund.ticker} ${qty}좌 매도` };
      },

      canRequestStock: () => {
        const s = get();
        const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
        const last = s.lastStockRequestSession ?? Number.NEGATIVE_INFINITY;
        const elapsed = currentSession - last;
        if (elapsed < STOCK_REQUEST_COOLDOWN_DAYS) {
          return {
            ok: false,
            reason: "cooldown",
            daysLeft: STOCK_REQUEST_COOLDOWN_DAYS - elapsed,
          };
        }
        if (s.cash < STOCK_REQUEST_COST) {
          return { ok: false, reason: "insufficient_cash" };
        }
        return { ok: true };
      },

      chargeStockRequest: () => {
        const s = get();
        const currentSession = Math.floor(Date.now() / SESSION_DURATION_MS);
        set({
          cash: s.cash - STOCK_REQUEST_COST,
          lastStockRequestSession: currentSession,
        });
      },

      buyLottoTicket: (picks) => {
        const state = get();
        const now = Date.now();
        const currentSession = Math.floor(now / SESSION_DURATION_MS);
        const window = alignSessionToGrid(currentSession, LOTTERY_INTERVAL_DAYS);
        const bought =
          state.lotteryWindowStart === window ? state.lotteryTicketsBought : 0;
        if (bought >= LOTTERY_MAX_PER_WINDOW) {
          return { success: false, message: "이번 회차 복권을 모두 구매했습니다." };
        }
        const valid =
          Array.isArray(picks) &&
          picks.length === 5 &&
          new Set(picks).size === 5 &&
          picks.every((n) => Number.isInteger(n) && n >= 1 && n <= 45);
        if (!valid) {
          return { success: false, message: "1~45 중 서로 다른 5개를 골라주세요." };
        }
        if (state.cash < LOTTERY_TICKET_PRICE) {
          return { success: false, message: "보유 현금이 부족합니다." };
        }
        const nonce = Math.floor(now ^ (Math.random() * 0x7fffffff));
        const { winning, matches, prize } = drawLotto(picks, nonce);
        const net = prize.amount - LOTTERY_TICKET_PRICE;
        const payment: CashPayment = {
          id: `lottery-${now}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "lottery",
          sourceId: "lottery",
          dueSession: currentSession,
          amount: net,
          timestamp: now,
        };
        set({
          cash: state.cash + net,
          lotteryWindowStart: window,
          lotteryTicketsBought: bought + 1,
          wonJackpot: state.wonJackpot || prize.tier === "jackpot",
          cashPayments: [payment, ...state.cashPayments].slice(0, 200),
        });
        useToastStore
          .getState()
          .push(
            prize.tier === "lose"
              ? `낙첨 (${matches}개 일치)… 다음 기회에!`
              : `🎉 ${prize.label} (${matches}개 일치)`,
            prize.tier === "lose" ? "info" : "success",
          );
        playSound(prize.tier === "lose" ? "error" : "cash");
        get().checkAchievements();
        return {
          success: true,
          message: prize.label,
          picks,
          winning,
          matches,
          prize,
        };
      },

      buyPensionTicket: () => {
        const state = get();
        const now = Date.now();
        const currentSession = Math.floor(now / SESSION_DURATION_MS);
        const window = alignSessionToGrid(currentSession, LOTTERY_INTERVAL_DAYS);
        const bought =
          state.lotteryWindowStart === window ? state.lotteryTicketsBought : 0;
        if (bought >= LOTTERY_MAX_PER_WINDOW) {
          return { success: false, message: "이번 회차 복권을 모두 구매했습니다." };
        }
        if (state.cash < PENSION_TICKET_PRICE) {
          return { success: false, message: "보유 현금이 부족합니다." };
        }
        const nonce = Math.floor(now ^ (Math.random() * 0x7fffffff));
        const outcome = drawPension(nonce);
        const isAnnuity = outcome.totalPeriods > 1;
        const lump = outcome.totalPeriods === 1 ? outcome.amountPerPeriod : 0;
        const net = lump - PENSION_TICKET_PRICE;
        const payment: CashPayment = {
          id: `pension-buy-${now}-${Math.random().toString(36).slice(2, 6)}`,
          kind: "lottery",
          sourceId: "pension-lottery",
          dueSession: currentSession,
          amount: net,
          timestamp: now,
        };
        const pensionAnnuities = isAnnuity
          ? [
              {
                id: `pension-${now}-${Math.random().toString(36).slice(2, 6)}`,
                amountPerPeriod: outcome.amountPerPeriod,
                totalPeriods: outcome.totalPeriods,
                paidPeriods: 0,
                startSession: alignSessionToGrid(
                  currentSession,
                  LOTTERY_INTERVAL_DAYS,
                ),
                intervalDays: LOTTERY_INTERVAL_DAYS,
                label: outcome.label,
              },
              ...state.pensionAnnuities,
            ].slice(0, 20)
          : state.pensionAnnuities;
        set({
          cash: state.cash + net,
          lotteryWindowStart: window,
          lotteryTicketsBought: bought + 1,
          pensionAnnuities,
          cashPayments: [payment, ...state.cashPayments].slice(0, 200),
        });
        useToastStore
          .getState()
          .push(
            outcome.tier === "lose"
              ? "연금 복권 낙첨… 다음 기회에!"
              : `🎉 ${outcome.label}`,
            outcome.tier === "lose" ? "info" : "success",
          );
        playSound(outcome.tier === "lose" ? "error" : "cash");
        return {
          success: true,
          message: outcome.label,
          prize: {
            amount: outcome.amountPerPeriod,
            tier:
              outcome.tier === "first"
                ? "jackpot"
                : outcome.tier === "second"
                  ? "big"
                  : outcome.tier === "third"
                    ? "small"
                    : "lose",
            label: outcome.label,
          },
        };
      },

      reset: () => set(createInitialState()),

      getTotalAssets: () => {
        const s = get();
        const equity = fullEquityOf(s) + userEtfPortfolioValueOf(s);
        // 우선주는 집중(focused) 유지 중인 활성분만 자산에 반영한다.
        const active = getActivePreferredShares(
          s.preferredShares,
          computeCharacterConcentration(s.holdings, s.stocks, equity),
        );
        // 유저 ETF는 일반 stocks 맵 밖에 있어 NAV 평가액을 별도로 더한다.
        return equity + getPreferredShareValue(active);
      },

      getStockById: (id) => get().stocks.find((s) => s.id === id),
    }),
    {
      name: marketStorageKey(null),
      skipHydration: true,
      storage: createJSONStorage(() => {
        clearLegacyMarketStorage();
        return safeMarketStorage;
      }),
      partialize: (state) => ({
        tick: state.tick,
        marketVersion: state.marketVersion,
        walletEpoch: state.walletEpoch,
        sessionDurationMs: state.sessionDurationMs,
        marketStartedAt: state.marketStartedAt,
        cash: state.cash,
        amcLedgerBalance: state.amcLedgerBalance,
        amcLedgerRevision: state.amcLedgerRevision,
        initialCash: state.initialCash,
        lastSalarySession: state.lastSalarySession,
        lastMonthlyDistributionSession: state.lastMonthlyDistributionSession,
        lastSingleCoveredCallDistributionSession:
          state.lastSingleCoveredCallDistributionSession,
        lastQuarterlyDividendSession: state.lastQuarterlyDividendSession,
        holdings: state.holdings,
        shorts: state.shorts,
        options: state.options,
        lastInterestSession: state.lastInterestSession,
        trades: state.trades.slice(0, 500),
        openOrders: state.openOrders.slice(0, 50),
        cashPayments: state.cashPayments.slice(0, 50),
        ownedLuxuries: state.ownedLuxuries,
        netWorthHistory: state.netWorthHistory.slice(-80),
        achievements: state.achievements,
        lotteryWindowStart: state.lotteryWindowStart,
        lotteryTicketsBought: state.lotteryTicketsBought,
        wonJackpot: state.wonJackpot,
        pensionAnnuities: state.pensionAnnuities,
        lastStockRequestSession: state.lastStockRequestSession,
        investmentMission: state.investmentMission,
        missionHistory: state.missionHistory.slice(0, 30),
        reputation: state.reputation,
        characterProgress: state.characterProgress,
        preferredShares: state.preferredShares,
        preferredIssuedCharacterIds: state.preferredIssuedCharacterIds,
        preferredDiversifiedSince: state.preferredDiversifiedSince,
        readCharacterMessageIds: state.readCharacterMessageIds.slice(0, 200),
        resolvedBugReportIds: state.resolvedBugReportIds.slice(0, 200),
        resolvedFeedbackIds: state.resolvedFeedbackIds.slice(0, 200),
        resolvedStockRequestIds: state.resolvedStockRequestIds.slice(0, 200),
        claimedCompensationIds: state.claimedCompensationIds,
        myRoomItems: state.myRoomItems,
        myRoomLevel: state.myRoomLevel,
        myRoomTheme: state.myRoomTheme,
        myRoomOwnedThemes: state.myRoomOwnedThemes,
        myRoomResidentCharacterIds: state.myRoomResidentCharacterIds,
        investmentMastery: state.investmentMastery,
        investmentSeason: state.investmentSeason,
        storyDecision: state.storyDecision,
        storyDecisionHistory: state.storyDecisionHistory.slice(0, 30),
        playerCompany: state.playerCompany,
        assetManager: state.assetManager,
        marginEnabled: state.marginEnabled,
        marginLeverage: state.marginLeverage,
        recurringInvestments: state.recurringInvestments,
        attendance: state.attendance,
        selectedTitleId: state.selectedTitleId,
        dailyOperation: state.dailyOperation,
        dailyOperationHistory: state.dailyOperationHistory.slice(0, 30),
        selectedPortfolioStrategyId: state.selectedPortfolioStrategyId,
        portfolioStrategySelectedAt: state.portfolioStrategySelectedAt,
        unlockedSeasonRewardIds: state.unlockedSeasonRewardIds,
        selectedSeasonFrameId: state.selectedSeasonFrameId,
        // 시장 체크포인트는 초경량만 저장한다. 캔들·호가·이벤트가 quota 를 초과했다.
        // 복원 시 일봉은 제네시스에서 합성하고, 분봉은 틱 리플레이로 채운다.
        stocks: state.stocks
          .filter(
            (stock) =>
              (!stock.universalDerivative ||
                Boolean(stock.coveredCallUnderlyingId)) &&
              !isPumpStock(stock),
          )
          .map((stock) => {
            // orderBook 은 복원 시 재생성 — persist 용량의 상당 부분을 차지한다.
            const { orderBook: _orderBook, ...rest } = stock;
            return {
              ...rest,
              priceHistory: stock.priceHistory.slice(-20),
              candles: stock.candles.slice(-30),
              dailyCandles: stock.dailyCandles.slice(-PERSISTED_DAILY_CANDLES),
              orderBook: { bids: [], asks: [] },
            };
          }),
        events: state.events.slice(-30),
      }),
      merge: (persisted, current) => {
        const raw = (persisted ?? {}) as Partial<MarketSnapshot>;
        const merged = { ...current, ...raw };
        const nowSession = Math.floor(Date.now() / SESSION_DURATION_MS);
        // 반드시 persisted 쪽 epoch 만 본다. current(createInitialState)에 이미
        // 최신 WALLET_EPOCH 가 들어 있어 merged 로 판정하면 구 LocalStorage 가
        // 리셋 대상에서 빠져 분배 복제 잔액이 SQL truncate 후에도 다시 올라간다.
        const walletEpochOk = raw.walletEpoch === WALLET_EPOCH;
        // 구세대 지갑(비정상 자산·거래내역 누락 시즌)은 버리고 초기 자금으로 재시작한다.
        // 시장 체크포인트는 marketVersion으로 따로 판정한다.
        // WALLET_EPOCH v4 전체 초기화: 실제 이전 지갑이 있던 계정에는 리셋 보상으로
        // 마스터 프레임을 지급한다(신규 접속자는 제외).
        const hadPriorWallet = raw.walletEpoch !== undefined;
        const walletSource = walletEpochOk
          ? merged
          : {
              ...merged,
              ...createInitialState(),
              ...(hadPriorWallet
                ? {
                    unlockedSeasonRewardIds: mergeSeasonRewards([], "master"),
                    selectedSeasonFrameId: "season-frame-master" as const,
                  }
                : {}),
            };
        const persistedSessionDuration = Number.isFinite(
          (walletSource as Partial<MarketSnapshot>).sessionDurationMs,
        )
          ? (walletSource as Partial<MarketSnapshot>).sessionDurationMs!
          : SESSION_DURATION_MS;
        const sessionClockChanged =
          persistedSessionDuration !== SESSION_DURATION_MS;
        const previousNowSession = Math.floor(Date.now() / (3 * 60 * 60 * 1000));
        const sessionBaseline = sessionClockChanged ? nowSession : undefined;

        const rebaseWindow = (start: number, end: number) => {
          const duration = Math.max(1, end - start);
          const elapsed = Math.max(0, Math.min(duration, previousNowSession - start));
          const rebasedStart = nowSession - elapsed;
          return { start: rebasedStart, end: rebasedStart + duration };
        };

        // 저장분은 결정론 시장의 체크포인트로만 유효하다.
        // 기원점·종목 구성이 다르거나 틱이 미래면 제네시스에서 다시 리플레이한다
        // (포트폴리오는 유지 — 시장만 공통 상태로 재계산).
        const persistedStocks = Array.isArray(merged.stocks) ? merged.stocks : [];
        const definedIds = new Set(STOCK_DEFINITIONS.map((d) => d.id));
        const compatibleUniverse =
          persistedStocks.length > 0 &&
          persistedStocks.every(
            (s) => definedIds.has(s.id) && Array.isArray(s.dailyCandles),
          );
        const marketValid =
          merged.marketVersion === MARKET_SIM_VERSION &&
          merged.marketStartedAt === MARKET_EPOCH_MS &&
          Number.isSafeInteger(merged.tick) &&
          merged.tick >= 0 &&
          merged.tick <= currentSimTick() + 60 &&
          compatibleUniverse;
        const persistedById = new Map(
          persistedStocks.map((stock) => [stock.id, stock]),
        );
        const genesisStocks = marketValid
          ? createGenesisStocks()
          : current.stocks;
        const genesisById = new Map(genesisStocks.map((stock) => [stock.id, stock]));
        const restoredStocks = marketValid
          ? STOCK_DEFINITIONS.map((definition) => {
              const persistedStock = persistedById.get(definition.id);
              if (!persistedStock) {
                return createInitialStockState(definition, simTickTime(merged.tick));
              }
              const migrated = migrateStock(persistedStock);
              const firstSaved = migrated.dailyCandles[0]?.timestamp ?? Number.POSITIVE_INFINITY;
              const synthetic = genesisById
                .get(definition.id)
                ?.dailyCandles.filter((candle) => candle.timestamp < firstSaved) ?? [];
              return {
                ...migrated,
                dailyCandles: [...synthetic, ...migrated.dailyCandles].slice(-1_250),
              };
            })
          : current.stocks;

        // 저장하지 않는 레버리지·인버스 ETF는 기초자산 캔들에서 시계열을 역산해
        // 복원 직후에도 차트가 점이 아닌 정상 봉으로 보이게 한다.
        const restoredById = new Map(
          restoredStocks.map((stock) => [stock.id, stock]),
        );
        const stocksWithDerived = restoredStocks.map((stock) => {
          if (
            !stock.universalDerivative ||
            stock.coveredCallUnderlyingId ||
            stock.leverage === undefined
          ) {
            return stock;
          }
          const underlying = restoredById.get(
            stock.leverageUnderlyingId ?? "vnasdaq",
          );
          return underlying
            ? reconstructDerivativeSeries(stock, underlying)
            : stock;
        });

        const rawMission = (walletSource as Partial<MarketStore>).investmentMission ?? null;
        const investmentMission =
          sessionClockChanged && rawMission?.status === "active"
            ? (() => {
                const window = rebaseWindow(rawMission.windowStart, rawMission.endSession);
                return { ...rawMission, windowStart: window.start, endSession: window.end };
              })()
            : rawMission;
        const normalizedSeason = normalizeInvestmentSeasonState(
          (walletSource as Partial<MarketStore>).investmentSeason,
        );
        const investmentSeason =
          sessionClockChanged && normalizedSeason.current
            ? (() => {
                const previous = normalizedSeason.current!;
                const window = rebaseWindow(previous.startSession, previous.endSession);
                const rebaseOptional = (session: number | undefined) =>
                  session === undefined
                    ? undefined
                    : window.start +
                      Math.max(0, Math.min(window.end - window.start, session - previous.startSession));
                return {
                  ...normalizedSeason,
                  current: {
                    ...previous,
                    startSession: window.start,
                    endSession: window.end,
                    goalSelectedAtSession: rebaseOptional(previous.goalSelectedAtSession),
                    goalLastCheckedSession: rebaseOptional(previous.goalLastCheckedSession),
                    traitSelectedAtSession: rebaseOptional(previous.traitSelectedAtSession),
                  },
                };
              })()
            : normalizedSeason;
        const persistedSeasonRewardIds = rewardsFromSeasonHistory(
          investmentSeason.history,
          normalizeSeasonRewardIds(
            (walletSource as Partial<MarketStore>).unlockedSeasonRewardIds,
          ),
        );
        const normalizedProgress = normalizeCharacterProgressMap(
          (walletSource as Partial<MarketStore>).characterProgress,
        );
        const characterProgress = sessionClockChanged
          ? Object.fromEntries(
              Object.entries(normalizedProgress).map(([id, progress]) => [
                id,
                {
                  ...progress,
                  lastHoldingSession:
                    progress.lastHoldingSession === undefined
                      ? undefined
                      : nowSession -
                        Math.max(0, previousNowSession - progress.lastHoldingSession),
                },
              ]),
            )
          : normalizedProgress;
        // 저장된 우선주만 복원 — 발행(집중도 판정 필요)은 직후 tick 정산이 담당.
        const preferredShares = normalizePreferredShares(
          (walletSource as Partial<MarketStore>).preferredShares,
        );
        // 복원 직후 레버리지 ETF 보유 좌수를 현재 분할·병합 배수로 정산한다.
        const reconciledHoldings = reconcileLeverageSplits(
          Array.isArray(walletSource.holdings) ? walletSource.holdings : [],
          stocksWithDerived,
        ).holdings;

        // 자금 상한 제거 이전, 2^53 경계를 넘겨 자산이 오염·마이너스로 깨진 계정을
        // 복구 지원금($10M)으로 재출발시킨다. 판정이 곧 멱등성이라 정상 계정은 무시.
        const overflowRepair = recoverFromOverflow({
          cash: Number((walletSource as Partial<MarketStore>).cash ?? 0),
          holdings: reconciledHoldings,
          shorts: Array.isArray((walletSource as Partial<MarketStore>).shorts)
            ? (walletSource as Partial<MarketStore>).shorts!
            : [],
          options: Array.isArray((walletSource as Partial<MarketStore>).options)
            ? (walletSource as Partial<MarketStore>).options!
            : [],
          stocks: stocksWithDerived,
          ownedLuxuries: Array.isArray(
            (walletSource as Partial<MarketStore>).ownedLuxuries,
          )
            ? (walletSource as Partial<MarketStore>).ownedLuxuries!
            : [],
          marginEnabled:
            (walletSource as Partial<MarketStore>).marginEnabled === true,
        });

        // 발행량 제한 롤백 보상 등 전 계정 운영 보상을 1회 지급한다(멱등).
        const compensation = settleOperationalCompensations({
          cash: overflowRepair.cash,
          cashPayments: Array.isArray(walletSource.cashPayments)
            ? walletSource.cashPayments
            : [],
          claimedCompensationIds: (walletSource as Partial<MarketStore>)
            .claimedCompensationIds,
        });

        return {
          ...walletSource,
          marketVersion: MARKET_SIM_VERSION,
          walletEpoch: WALLET_EPOCH,
          sessionDurationMs: SESSION_DURATION_MS,
          marketStartedAt: MARKET_EPOCH_MS,
          tick: marketValid ? merged.tick : current.tick,
          stocks: stocksWithDerived,
          cash: compensation.cash,
          amcLedgerBalance: Number.isFinite(
            (walletSource as Partial<MarketStore>).amcLedgerBalance,
          )
            ? Math.round(
                (walletSource as Partial<MarketStore>).amcLedgerBalance!,
              )
            : 0,
          amcLedgerRevision: Number.isFinite(
            (walletSource as Partial<MarketStore>).amcLedgerRevision,
          )
            ? Math.max(
                0,
                Math.floor(
                  (walletSource as Partial<MarketStore>).amcLedgerRevision!,
                ),
              )
            : 0,
          holdings: overflowRepair.holdings,
          events:
            marketValid && Array.isArray(merged.events)
              ? merged.events.map(ensureEventDialogue)
              : current.events,
          lastSalarySession: sessionBaseline ?? (Number.isSafeInteger(walletSource.lastSalarySession)
            ? walletSource.lastSalarySession
            : nowSession),
          lastMonthlyDistributionSession: alignSessionToGrid(
            sessionBaseline ?? (Number.isSafeInteger(walletSource.lastMonthlyDistributionSession)
              ? walletSource.lastMonthlyDistributionSession
              : nowSession),
            COVERED_CALL_INTERVAL_DAYS,
          ),
          lastSingleCoveredCallDistributionSession: alignSessionToGrid(
            sessionBaseline ?? (Number.isSafeInteger(
              walletSource.lastSingleCoveredCallDistributionSession,
            )
              ? walletSource.lastSingleCoveredCallDistributionSession
              : nowSession),
            SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
          ),
          lastQuarterlyDividendSession: alignSessionToGrid(
            sessionBaseline ?? (Number.isSafeInteger(walletSource.lastQuarterlyDividendSession)
              ? walletSource.lastQuarterlyDividendSession
              : nowSession),
            QUARTERLY_DIVIDEND_INTERVAL_DAYS,
          ),
          cashPayments: compensation.cashPayments,
          claimedCompensationIds: compensation.claimedCompensationIds,
          ownedLuxuries: Array.isArray(
            (walletSource as Partial<MarketStore>).ownedLuxuries,
          )
            ? (walletSource as Partial<MarketStore>).ownedLuxuries!
            : [],
          netWorthHistory: Array.isArray(
            (walletSource as Partial<MarketStore>).netWorthHistory,
          )
            ? (walletSource as Partial<MarketStore>).netWorthHistory!
            : [],
          shorts: overflowRepair.shorts,
          options: overflowRepair.options,
          lastInterestSession: sessionBaseline ?? (Number.isSafeInteger(
            (walletSource as Partial<MarketStore>).lastInterestSession,
          )
            ? (walletSource as Partial<MarketStore>).lastInterestSession!
            : nowSession),
          marginCallAt: null,
          achievements: Array.isArray(
            (walletSource as Partial<MarketStore>).achievements,
          )
            ? (walletSource as Partial<MarketStore>).achievements!
            : [],
          lotteryWindowStart: sessionClockChanged
            ? alignSessionToGrid(nowSession, LOTTERY_INTERVAL_DAYS)
            : Number.isSafeInteger(
            (walletSource as Partial<MarketStore>).lotteryWindowStart,
          )
            ? (walletSource as Partial<MarketStore>).lotteryWindowStart!
            : alignSessionToGrid(nowSession, LOTTERY_INTERVAL_DAYS),
          lotteryTicketsBought: sessionClockChanged
            ? 0
            : Number.isSafeInteger(
            (walletSource as Partial<MarketStore>).lotteryTicketsBought,
          )
            ? (walletSource as Partial<MarketStore>).lotteryTicketsBought!
            : 0,
          wonJackpot: Boolean((walletSource as Partial<MarketStore>).wonJackpot),
          pensionAnnuities: Array.isArray(
            (walletSource as Partial<MarketStore>).pensionAnnuities,
          )
            ? (walletSource as Partial<MarketStore>).pensionAnnuities!
            : [],
          lastStockRequestSession: Number.isFinite(
            (walletSource as Partial<MarketStore>).lastStockRequestSession,
          )
            ? (walletSource as Partial<MarketStore>).lastStockRequestSession
            : undefined,
          investmentMission,
          missionHistory: Array.isArray(
            (walletSource as Partial<MarketStore>).missionHistory,
          )
            ? (walletSource as Partial<MarketStore>).missionHistory!
            : [],
          reputation: Number.isFinite(
            (walletSource as Partial<MarketStore>).reputation,
          )
            ? Math.max(0, (walletSource as Partial<MarketStore>).reputation ?? 0)
            : 0,
          characterProgress,
          preferredShares,
          preferredIssuedCharacterIds: Array.isArray(
            (walletSource as Partial<MarketStore>).preferredIssuedCharacterIds,
          )
            ? (walletSource as Partial<MarketStore>).preferredIssuedCharacterIds!.filter(
                (id): id is string => typeof id === "string",
              )
            : [],
          preferredDiversifiedSince:
            typeof (walletSource as Partial<MarketStore>).preferredDiversifiedSince === "number"
              ? (walletSource as Partial<MarketStore>).preferredDiversifiedSince!
              : null,
          readCharacterMessageIds: Array.isArray(
            (walletSource as Partial<MarketStore>).readCharacterMessageIds,
          )
            ? (walletSource as Partial<MarketStore>).readCharacterMessageIds!.slice(0, 300)
            : [],
          resolvedBugReportIds: Array.isArray(
            (walletSource as Partial<MarketStore>).resolvedBugReportIds,
          )
            ? (walletSource as Partial<MarketStore>).resolvedBugReportIds!.slice(0, 300)
            : [],
          resolvedFeedbackIds: Array.isArray(
            (walletSource as Partial<MarketStore>).resolvedFeedbackIds,
          )
            ? (walletSource as Partial<MarketStore>).resolvedFeedbackIds!.slice(0, 300)
            : [],
          resolvedStockRequestIds: Array.isArray(
            (walletSource as Partial<MarketStore>).resolvedStockRequestIds,
          )
            ? (walletSource as Partial<MarketStore>).resolvedStockRequestIds!.slice(0, 300)
            : [],
          myRoomItems: normalizeRoomItems(
            (walletSource as Partial<MarketStore>).myRoomItems,
            normalizeRoomLevel((walletSource as Partial<MarketStore>).myRoomLevel),
          ),
          myRoomLevel: normalizeRoomLevel(
            (walletSource as Partial<MarketStore>).myRoomLevel,
          ),
          myRoomTheme: normalizeRoomThemeId(
            (walletSource as Partial<MarketStore>).myRoomTheme,
          ),
          myRoomOwnedThemes: normalizeOwnedRoomThemes(
            (walletSource as Partial<MarketStore>).myRoomOwnedThemes,
          ),
          myRoomResidentCharacterIds: normalizeRoomResidentCharacterIds(
            (walletSource as Partial<MarketStore>).myRoomResidentCharacterIds,
          ),
          investmentMastery: normalizeInvestmentMastery(
            (walletSource as Partial<MarketStore>).investmentMastery,
          ),
          investmentSeason,
          storyDecision:
            sessionClockChanged
              ? null
              : (walletSource as Partial<MarketStore>).storyDecision ?? null,
          storyDecisionHistory: Array.isArray(
            (walletSource as Partial<MarketStore>).storyDecisionHistory,
          )
            ? (walletSource as Partial<MarketStore>).storyDecisionHistory!
            : [],
          playerCompany: normalizePlayerCompany(
            (walletSource as Partial<MarketStore>).playerCompany,
          ),
          assetManager: normalizeAssetManager(
            (walletSource as Partial<MarketStore>).assetManager,
          ),
          listedAmcFunds: Array.isArray(
            (walletSource as Partial<MarketStore>).listedAmcFunds,
          )
            ? (walletSource as Partial<MarketStore>).listedAmcFunds!
            : [],
          marginEnabled: overflowRepair.marginEnabled,
          marginLeverage: normalizeMarginLeverage(
            (walletSource as Partial<MarketStore>).marginLeverage,
          ),
          recurringInvestments: normalizeRecurringInvestments(
            (walletSource as Partial<MarketStore>).recurringInvestments,
          ),
          attendance: normalizeAttendance(
            (walletSource as Partial<MarketStore>).attendance,
          ),
          selectedTitleId: getPlayerTitle(
            (walletSource as Partial<MarketStore>).selectedTitleId,
          ).id,
          dailyOperation: normalizeDailyOperation(
            (walletSource as Partial<MarketStore>).dailyOperation,
          ),
          dailyOperationHistory: normalizeDailyOperationHistory(
            (walletSource as Partial<MarketStore>).dailyOperationHistory,
          ),
          selectedPortfolioStrategyId: normalizePortfolioStrategyId(
            (walletSource as Partial<MarketStore>).selectedPortfolioStrategyId,
          ),
          portfolioStrategySelectedAt: Number.isFinite(
            (walletSource as Partial<MarketStore>).portfolioStrategySelectedAt,
          )
            ? (walletSource as Partial<MarketStore>).portfolioStrategySelectedAt!
            : 0,
          unlockedSeasonRewardIds: persistedSeasonRewardIds,
          selectedSeasonFrameId: normalizeSelectedSeasonFrame(
            (walletSource as Partial<MarketStore>).selectedSeasonFrameId,
            persistedSeasonRewardIds,
          ),
          userId: null,
          isReady: false,
          cloudSyncReady: false,
        };
      },
    },
  ),
);

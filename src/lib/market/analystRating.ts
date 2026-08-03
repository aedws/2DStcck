/**
 * 애널리스트 리포트 — 종목의 결정론적 적정가치(앵커)를 근거로 목표주가·투자의견·
 * 근거를 만든다. 시뮬 엔진의 성장 앵커(calculateSecularGrowthSupport)와 같은 공식을
 * 써서, 모든 유저가 같은 시각에 같은 리포트를 본다(랜덤·개인차 없음).
 *
 * 단기 뉴스로 흔들리는 시세와 별개로 '적정가치 대비 위치'를 보여줘 중장기 투자 판단을
 * 돕는 게 목적이다(피드백 37bae7dd).
 */
import {
  DRIFT_TIME_SCALE,
  MARKET_SECULAR_GROWTH_PER_SESSION,
  MARKET_EPOCH_MS,
  MIN_SHARE_MULTIPLIER,
  SESSION_DURATION_MS,
} from "@/lib/market/constants";
import type { StockDefinition, StockState } from "@/lib/types/market";

export type AnalystOpinion =
  | "strong_buy"
  | "buy"
  | "hold"
  | "sell"
  | "strong_sell";

export interface AnalystRating {
  opinion: AnalystOpinion;
  /** 강력 매수(4) ~ 강력 매도(0) — 막대 그래프용. */
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  /** 12개월(=1시즌 그리드) 목표주가(센트). */
  targetPrice: number;
  /** 목표주가 대비 상승여력(소수, 예: 0.12 = +12%). */
  upside: number;
  /** 현재 적정가치(앵커, 센트). */
  fairValue: number;
  /** 투자의견 근거(최대 3개). */
  reasons: string[];
}

export type AnalystDeskId =
  | "michael-burry"
  | "jp-morgan"
  | "goldman-sachs"
  | "morgan-stanley"
  | "morningstar"
  | "citi-research";

export interface AnalystDeskOpinion {
  id: AnalystDeskId;
  name: string;
  lens: string;
  opinion: AnalystOpinion;
  label: string;
  targetPrice: number;
  upside: number;
  thesis: string;
  disclosure: string;
}

const OPINION_LABEL: Record<AnalystOpinion, string> = {
  strong_buy: "강력 매수",
  buy: "매수",
  hold: "중립",
  sell: "매도",
  strong_sell: "강력 매도",
};
const OPINION_SCORE: Record<AnalystOpinion, 0 | 1 | 2 | 3 | 4> = {
  strong_buy: 4,
  buy: 3,
  hold: 2,
  sell: 1,
  strong_sell: 0,
};

/** 목표주가 산정 지평(거래일) — 1시즌(20거래일). */
const TARGET_HORIZON_SESSIONS = 20;

export type AnalystStockInput = Pick<
  StockDefinition,
  | "instrumentType"
  | "initialPrice"
  | "drift"
  | "volatility"
  | "beta"
  | "sector"
  | "quarterlyDividend"
  | "listingEpochMs"
> & { currentPrice: number; shareMultiplier?: number };

/** 애널리스트 리포트 대상 종목인지 — 일반 상장 기업만(파생·ETF 제외). */
export function isAnalystEligible(
  stock: Pick<StockDefinition, "instrumentType">,
): boolean {
  return stock.instrumentType === "company";
}

export function computeAnalystRating(
  stock: AnalystStockInput,
  now = Date.now(),
): AnalystRating | null {
  if (!isAnalystEligible(stock)) return null;
  const current = Math.max(1, stock.currentPrice);
  const sessionSeconds = SESSION_DURATION_MS / 1_000;
  const epochBase = stock.listingEpochMs ?? MARKET_EPOCH_MS;
  const elapsedSessions = Math.max(0, (now - epochBase) / SESSION_DURATION_MS);
  const driftGrowthPerSession =
    (stock.drift ?? 0) * DRIFT_TIME_SCALE * sessionSeconds;
  const growthPerSession = driftGrowthPerSession + MARKET_SECULAR_GROWTH_PER_SESSION;
  const base =
    stock.initialPrice /
    Math.max(stock.shareMultiplier ?? 1, MIN_SHARE_MULTIPLIER);
  // 현재 적정가치(앵커)와 목표주가(앵커를 지평만큼 전진).
  const fairValue = base * Math.exp(growthPerSession * elapsedSessions);
  const targetPrice = Math.max(
    1,
    Math.round(
      base * Math.exp(growthPerSession * (elapsedSessions + TARGET_HORIZON_SESSIONS)),
    ),
  );
  const upside = targetPrice / current - 1;
  // 밸류에이션 편차(로그) — 양수면 적정가치보다 비쌈, 음수면 저평가.
  const deviation = Math.log(current / Math.max(1, fairValue));

  const opinion = opinionForUpside(upside);

  // 근거: 밸류에이션·성장성·배당·변동성/베타 중 두드러진 순서로 최대 3개.
  const candidates: { weight: number; text: string }[] = [];
  if (deviation <= -0.12) {
    candidates.push({
      weight: 3 + Math.abs(deviation),
      text: `적정가치 대비 ${Math.round((1 - current / fairValue) * 100)}% 저평가로 가격 매력이 있습니다.`,
    });
  } else if (deviation >= 0.12) {
    candidates.push({
      weight: 3 + deviation,
      text: `적정가치를 ${Math.round((current / fairValue - 1) * 100)}% 웃돌아 밸류에이션 부담이 있습니다.`,
    });
  } else {
    candidates.push({
      weight: 0.5,
      text: "현재가가 적정가치 부근으로 밸류에이션 부담은 크지 않습니다.",
    });
  }
  const drift = stock.drift ?? 0;
  if (drift >= 0.0008) {
    candidates.push({
      weight: 2.5,
      text: "장기 성장 기대(우상향 드리프트)가 이익 추정을 뒷받침합니다.",
    });
  } else if (drift <= -0.0006) {
    candidates.push({
      weight: 2.5,
      text: "구조적 하향 압력(우하향 드리프트)이 실적 전망을 제약합니다.",
    });
  }
  if ((stock.quarterlyDividend ?? 0) > 0) {
    candidates.push({
      weight: 1.8,
      text: "분기 배당이 있어 하방 방어와 인컴 매력을 더합니다.",
    });
  }
  if ((stock.volatility ?? 0) >= 0.06) {
    candidates.push({
      weight: 1.5,
      text: "변동성이 높아 단기 낙폭 위험에 유의해야 합니다.",
    });
  } else if ((stock.volatility ?? 0) <= 0.03) {
    candidates.push({
      weight: 1.0,
      text: "변동성이 낮아 방어적 보유에 적합합니다.",
    });
  }
  if ((stock.beta ?? 1) >= 1.3) {
    candidates.push({
      weight: 1.2,
      text: "시장 민감도가 높아(고베타) 강세장에 탄력적입니다.",
    });
  } else if ((stock.beta ?? 1) <= 0.8) {
    candidates.push({
      weight: 1.0,
      text: "시장 민감도가 낮아(저베타) 하락장 방어력이 있습니다.",
    });
  }
  const reasons = candidates
    .sort((a, b) => b.weight - a.weight)
    .slice(0, 3)
    .map((item) => item.text);

  return {
    opinion,
    score: OPINION_SCORE[opinion],
    label: OPINION_LABEL[opinion],
    targetPrice,
    upside,
    fairValue: Math.round(fairValue),
    reasons,
  };
}

function opinionForUpside(upside: number): AnalystOpinion {
  return upside >= 0.25
    ? "strong_buy"
    : upside >= 0.08
      ? "buy"
      : upside > -0.08
        ? "hold"
        : upside > -0.25
          ? "sell"
          : "strong_sell";
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function deskOpinion(
  stock: AnalystStockInput,
  input: Omit<AnalystDeskOpinion, "opinion" | "label" | "upside"> & {
    opinion?: AnalystOpinion;
  },
): AnalystDeskOpinion {
  const targetPrice = Math.max(1, Math.round(input.targetPrice));
  const upside = targetPrice / Math.max(1, stock.currentPrice) - 1;
  const opinion = input.opinion ?? opinionForUpside(upside);
  return {
    ...input,
    targetPrice,
    upside,
    opinion,
    label: OPINION_LABEL[opinion],
  };
}

/**
 * 같은 종목을 서로 다른 철학으로 해석하는 기관별 의견.
 * 컨센서스 공식을 복제하지 않고 각 기관의 편향·시간축·위험 선호를 의도적으로
 * 다르게 적용해, 목표가가 한 방향으로만 정렬되지 않게 한다.
 */
export function computeAnalystDeskOpinions(
  stock: AnalystStockInput,
  now = Date.now(),
): AnalystDeskOpinion[] {
  const consensus = computeAnalystRating(stock, now);
  if (!consensus) return [];
  const current = Math.max(1, stock.currentPrice);
  const drift = stock.drift ?? 0;
  const volatility = stock.volatility ?? 0.04;
  const beta = stock.beta ?? 1;
  const dividendYield =
    Math.max(0, stock.quarterlyDividend ?? 0) * 4 / current;
  const qualityBusiness =
    drift >= 0.0004 || dividendYield >= 0.015 || volatility <= 0.032;

  const burryTarget = Math.min(consensus.fairValue * 0.72, current * 0.78);
  const jpMorganTarget = Math.max(
    consensus.targetPrice * 1.18,
    consensus.fairValue * 1.25,
  );
  const momentumReturn = clamp(
    drift * 120 + (beta - 1) * 0.12 - volatility * 0.45,
    -0.28,
    0.38,
  );
  const riskDiscount = clamp(
    volatility * 1.8 + Math.max(0, beta - 1) * 0.12,
    0.04,
    0.32,
  );
  const intrinsicTarget =
    consensus.fairValue * (1 + Math.min(0.12, dividendYield * 2));
  const defensiveSector = ["식품·농업", "유틸리티", "헬스케어", "채권"].some(
    (keyword) => stock.sector.includes(keyword),
  );
  const macroAdjustment = defensiveSector
    ? 0.09
    : beta >= 1.3
      ? -0.08
      : beta <= 0.8
        ? 0.05
        : 0.01;

  return [
    deskOpinion(stock, {
      id: "michael-burry",
      name: "마이클 버리",
      lens: "역발상 숏",
      opinion: "strong_sell",
      targetPrice: burryTarget,
      thesis: qualityBusiness
        ? "사업 자체는 좋은 기업으로 보지만, 좋은 기업과 좋은 진입 가격은 다르다며 붕괴 시나리오를 먼저 매수합니다."
        : "약한 재무 체력과 높은 변동성이 작은 균열을 대형 하락으로 키울 수 있다고 봅니다.",
      disclosure: "상방 여력이 남아도 숏 우선 · 장기 적중 설정 1%",
    }),
    deskOpinion(stock, {
      id: "jp-morgan",
      name: "종필모건",
      lens: "선행 가치·차익거래",
      targetPrice: jpMorganTarget,
      thesis:
        "시장 컨센서스보다 이르게, 더 높은 가치를 제시해 기대 재평가 구간을 선점하고 목표가 접근 시 차익 실현을 노립니다.",
      disclosure: "20거래일 전망·위기 예고 장기 적중률 80%",
    }),
    deskOpinion(stock, {
      id: "goldman-sachs",
      name: "실버만삭스",
      lens: "모멘텀·수급",
      targetPrice: current * (1 + momentumReturn),
      thesis:
        momentumReturn >= 0
          ? "성장 드리프트와 시장 민감도가 만드는 추세 추종 수요를 높게 평가합니다."
          : "가격 추세를 되돌릴 신규 수급이 부족해 반등보다 포지션 축소를 우선합니다.",
      disclosure: "기업가치보다 가격 추세 변화에 빠르게 반응",
    }),
    deskOpinion(stock, {
      id: "morgan-stanley",
      name: "모건스탈리",
      lens: "리스크 조정",
      targetPrice: consensus.targetPrice * (1 - riskDiscount),
      thesis:
        "컨센서스 성장 가치는 인정하되 변동성과 베타에 위험 할인율을 적용해 보수적인 목표가를 제시합니다.",
      disclosure: `위험 할인 ${(riskDiscount * 100).toFixed(1)}% 적용`,
    }),
    deskOpinion(stock, {
      id: "morningstar",
      name: "이브닝스타",
      lens: "내재가치·안전마진",
      targetPrice: intrinsicTarget,
      thesis:
        intrinsicTarget > current
          ? "장기 적정가치와 배당 현금흐름 대비 현재가에 안전마진이 남아 있다고 판단합니다."
          : "좋은 사업이라도 내재가치 위에서는 기다리는 편이 낫다고 판단합니다.",
      disclosure: "단기 뉴스보다 적정가치와 배당 현금흐름 중시",
    }),
    deskOpinion(stock, {
      id: "citi-research",
      name: "씨리 리서치",
      lens: "거시·업종 순환",
      targetPrice: consensus.targetPrice * (1 + macroAdjustment),
      thesis: defensiveSector
        ? "방어 업종의 현금흐름과 경기 둔감성이 불확실한 국면에서 프리미엄을 받을 수 있다고 봅니다."
        : beta >= 1.3
          ? "고베타 업종은 상승 탄력보다 거시 충격의 이익 민감도를 먼저 반영해야 한다고 봅니다."
          : "업종 순환과 시장 민감도가 중립적이라 종목 고유 성장 경로를 중심으로 평가합니다.",
      disclosure: "업종·베타에 따른 거시 프리미엄 조정",
    }),
  ];
}

/** StockState에서 바로 리포트를 낸다(정의 필드는 StockState에 포함). */
export function analystRatingForState(
  stock: StockState,
  now = Date.now(),
): AnalystRating | null {
  return computeAnalystRating(stock as unknown as AnalystStockInput, now);
}

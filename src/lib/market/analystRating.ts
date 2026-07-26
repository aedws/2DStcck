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

type AnalystStock = Pick<
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
  stock: AnalystStock,
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

  const opinion: AnalystOpinion =
    upside >= 0.25
      ? "strong_buy"
      : upside >= 0.08
        ? "buy"
        : upside > -0.08
          ? "hold"
          : upside > -0.25
            ? "sell"
            : "strong_sell";

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

/** StockState에서 바로 리포트를 낸다(정의 필드는 StockState에 포함). */
export function analystRatingForState(
  stock: StockState,
  now = Date.now(),
): AnalystRating | null {
  return computeAnalystRating(stock as unknown as AnalystStock, now);
}

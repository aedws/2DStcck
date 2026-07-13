import { MARKET_EPOCH_MS, SESSION_DURATION_MS } from "@/lib/market/constants";
import type {
  InvestmentMission,
  InvestmentMissionKind,
} from "@/lib/types/market";

export const MISSION_WINDOW_SESSIONS = 5;
const EPOCH_SESSION = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS);

export interface InvestmentMissionOffer {
  id: string;
  kind: InvestmentMissionKind;
  title: string;
  description: string;
  target: string;
  reward: number;
  emoji: string;
}

export const INVESTMENT_MISSION_OFFERS: InvestmentMissionOffer[] = [
  {
    id: "growth-sprint",
    kind: "growth",
    title: "공격적 성장",
    description: "현물·공매도·옵션을 활용해 회차 종료까지 순자산을 키우세요.",
    target: "수락 시점 대비 순자산 +3%",
    reward: 120,
    emoji: "🚀",
  },
  {
    id: "growth-momentum",
    kind: "growth",
    title: "추세 가속",
    description: "강한 시장 흐름을 포착해 5거래일 동안 자산 성장을 끌어내세요.",
    target: "수락 시점 대비 순자산 +3%",
    reward: 125,
    emoji: "🔥",
  },
  {
    id: "growth-conviction",
    kind: "growth",
    title: "확신의 포지션",
    description: "분석한 종목과 파생 전략을 조합해 뚜렷한 절대수익을 만드세요.",
    target: "수락 시점 대비 순자산 +3%",
    reward: 130,
    emoji: "💥",
  },
  {
    id: "benchmark-edge",
    kind: "benchmark",
    title: "시장보다 한 수 위",
    description: "같은 기간 V-NASDAQ보다 높은 성과를 기록하세요.",
    target: "벤치마크 수익률 +1%p 초과",
    reward: 150,
    emoji: "🎯",
  },
  {
    id: "benchmark-quiet-alpha",
    kind: "benchmark",
    title: "조용한 초과수익",
    description: "시장 방향과 관계없이 지수보다 나은 결과를 쌓으세요.",
    target: "벤치마크 수익률 +1%p 초과",
    reward: 155,
    emoji: "📈",
  },
  {
    id: "benchmark-rivalry",
    kind: "benchmark",
    title: "지수와의 결투",
    description: "V-NASDAQ을 상대 투자자로 생각하고 상대성과에서 승리하세요.",
    target: "벤치마크 수익률 +1%p 초과",
    reward: 160,
    emoji: "⚔️",
  },
  {
    id: "risk-fortress",
    kind: "risk",
    title: "철벽 리스크 관리",
    description: "원금을 지키면서 큰 낙폭 없이 5거래일을 마무리하세요.",
    target: "수익률 0% 이상 · 최대 낙폭 5% 이내",
    reward: 100,
    emoji: "🛡️",
  },
  {
    id: "risk-survival",
    kind: "risk",
    title: "생존 우선",
    description: "변동성 속에서도 원금을 지키고 포트폴리오 낙폭을 제한하세요.",
    target: "수익률 0% 이상 · 최대 낙폭 5% 이내",
    reward: 105,
    emoji: "⛑️",
  },
  {
    id: "risk-discipline",
    kind: "risk",
    title: "손실 통제 규율",
    description: "큰 한 방보다 손실 제한을 우선하는 운용을 증명하세요.",
    target: "수익률 0% 이상 · 최대 낙폭 5% 이내",
    reward: 110,
    emoji: "📐",
  },
  {
    id: "character-trust",
    kind: "character",
    title: "전용 · 신뢰의 증명",
    description: "호감도 50 이상인 캐릭터가 맡기는 고난도 성과 의뢰입니다.",
    target: "순자산 +2% · 벤치마크 +0.5%p 초과",
    reward: 220,
    emoji: "💌",
  },
  {
    id: "character-confidential",
    kind: "character",
    title: "전용 · 비공개 운용",
    description: "캐릭터가 공개하지 않은 고난도 상대수익 의뢰를 맡깁니다.",
    target: "순자산 +2% · 벤치마크 +0.5%p 초과",
    reward: 230,
    emoji: "🔐",
  },
  {
    id: "character-board",
    kind: "character",
    title: "전용 · 이사회 특명",
    description: "가장 신뢰하는 투자자에게만 전달되는 성과 임무입니다.",
    target: "순자산 +2% · 벤치마크 +0.5%p 초과",
    reward: 240,
    emoji: "📜",
  },
];

const MISSION_KINDS: InvestmentMissionKind[] = [
  "growth",
  "benchmark",
  "risk",
  "character",
];

export function missionWindowStart(session: number): number {
  const elapsed = session - EPOCH_SESSION;
  return EPOCH_SESSION + Math.floor(elapsed / MISSION_WINDOW_SESSIONS) * MISSION_WINDOW_SESSIONS;
}

export function getAvailableInvestmentMissionOffers(
  session: number,
): InvestmentMissionOffer[] {
  const window = Math.floor(missionWindowStart(session) / MISSION_WINDOW_SESSIONS);
  return MISSION_KINDS.map((kind, kindIndex) => {
    const variants = INVESTMENT_MISSION_OFFERS.filter((offer) => offer.kind === kind);
    const index = Math.abs(window + kindIndex * 2) % variants.length;
    return variants[index];
  });
}

export function getMissionOffer(
  kind: InvestmentMissionKind,
  offerId?: string,
): InvestmentMissionOffer {
  return (
    INVESTMENT_MISSION_OFFERS.find((offer) => offer.id === offerId) ??
    INVESTMENT_MISSION_OFFERS.find((offer) => offer.kind === kind) ??
    INVESTMENT_MISSION_OFFERS[0]
  );
}

export function createInvestmentMission(
  kind: InvestmentMissionKind,
  session: number,
  equity: number,
  benchmarkPrice: number,
  now = Date.now(),
  issuer?: { characterId?: string; companyId?: string },
): InvestmentMission {
  // 사건은 공통 회차지만 의뢰는 신규·복귀 유저도 온전한 5거래일을 받도록
  // 수락 시점부터 개인 회차를 시작한다.
  const windowStart = session;
  const offer = getAvailableInvestmentMissionOffers(session).find(
    (candidate) => candidate.kind === kind,
  ) ?? getMissionOffer(kind);
  return {
    id: `mission-${windowStart}-${kind}`,
    kind,
    offerId: offer.id,
    windowStart,
    endSession: windowStart + MISSION_WINDOW_SESSIONS,
    acceptedAt: now,
    startEquity: equity,
    startBenchmarkPrice: benchmarkPrice,
    minEquity: equity,
    status: "active",
    reward: offer.reward,
    issuerCharacterId: issuer?.characterId,
    issuerCompanyId: issuer?.companyId,
  };
}

export function updateInvestmentMission(
  mission: InvestmentMission,
  currentSession: number,
  equity: number,
  benchmarkPrice: number,
  now = Date.now(),
): InvestmentMission {
  if (mission.status !== "active") return mission;
  const minEquity = Math.min(mission.minEquity, equity);
  if (currentSession < mission.endSession) {
    return minEquity === mission.minEquity ? mission : { ...mission, minEquity };
  }

  const playerReturn =
    mission.startEquity > 0 ? equity / mission.startEquity - 1 : -1;
  const benchmarkReturn =
    mission.startBenchmarkPrice > 0
      ? benchmarkPrice / mission.startBenchmarkPrice - 1
      : 0;
  const drawdown =
    mission.startEquity > 0
      ? 1 - minEquity / mission.startEquity
      : Number.POSITIVE_INFINITY;
  const success =
    mission.kind === "growth"
      ? playerReturn >= 0.03
      : mission.kind === "benchmark"
        ? playerReturn >= benchmarkReturn + 0.01
        : mission.kind === "risk"
          ? playerReturn >= 0 && drawdown <= 0.05
          : playerReturn >= 0.02 && playerReturn >= benchmarkReturn + 0.005;

  return {
    ...mission,
    minEquity,
    status: success ? "completed" : "failed",
    completedAt: now,
    playerReturn,
    benchmarkReturn,
  };
}

export function missionProgressPercent(
  mission: InvestmentMission,
  equity: number,
  benchmarkPrice: number,
): number {
  const playerReturn =
    mission.startEquity > 0 ? equity / mission.startEquity - 1 : -1;
  const benchmarkReturn =
    mission.startBenchmarkPrice > 0
      ? benchmarkPrice / mission.startBenchmarkPrice - 1
      : 0;
  if (mission.kind === "growth") return Math.max(0, Math.min(100, (playerReturn / 0.03) * 100));
  if (mission.kind === "benchmark") {
    return Math.max(0, Math.min(100, ((playerReturn - benchmarkReturn) / 0.01) * 100));
  }
  if (mission.kind === "character") {
    const growthProgress = playerReturn / 0.02;
    const alphaProgress = (playerReturn - benchmarkReturn) / 0.005;
    return Math.max(0, Math.min(100, Math.min(growthProgress, alphaProgress) * 100));
  }
  const drawdown = mission.startEquity > 0 ? 1 - mission.minEquity / mission.startEquity : 1;
  return playerReturn >= 0 && drawdown <= 0.05 ? 100 : Math.max(0, 100 - drawdown * 2_000);
}

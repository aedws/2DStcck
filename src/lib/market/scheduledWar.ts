/**
 * 예약 확정 국면 — '게-트 대전쟁'(게헨나 vs 트리니티).
 *
 * 유저 국면 추가 요청(feedback #0e09d003)을 예약 상장형 스크립트 국면으로 구현한다.
 * IPO처럼 고정된 미래 시작 세션(WAR_START_SESSION)부터만 효과가 들어가고, 그 전에는
 * 모든 기여가 0이라 과거/현재 시장이 바뀌지 않는다. 국면은 오직 전역 세션 번호(벽시계
 * 순함수)로만 정해져, 같은 시각에 접속한 모두가 같은 전황·같은 가격을 본다.
 *
 * 시나리오(총 20거래일 = 1시즌):
 *  1) 발발·동원 — 유동성 위기로 대부분 폭락, 방산·치안·식품(생산·제조) 폭등,
 *     헬스케어 소폭↑, 게헨나·트리니티 학원채 소폭↓, 아비도스 학원채·키보토스 지방채
 *     폭락, 밀레니엄 학원채·단기채·금 폭등.
 *  2) 전면전 — 완만한 하락 지속, 방산·식품·헬스 완만 상승, 전황에 따라 유리 진영
 *     학원채↑·불리 진영↓, 금·단기채 강세 유지.
 *  3) 교착·협상 — 변동성 최고조, 진영 채권 등락 심화.
 *  4) 종전 — 방산·치안 폭락, 그 외 섹터 상승, 승리 진영 폭등·패배 진영 폭락.
 *  5) 전후 복구 — 완만한 전반 회복·정상화.
 */
import { SESSION_DURATION_MS } from "@/lib/market/constants";
import type { MarketEvent, StockDefinition } from "@/lib/types/market";

export type WarFaction = "gehenna" | "trinity";

export interface ScheduledWarPhase {
  id: string;
  name: string;
  emoji: string;
  duration: number;
  /** 전황이 '유동성 위기'(전쟁 중)인지 '회복'(종전 후)인지 — 이벤트 문구용. */
  wartime: boolean;
  volatilityMultiplier: number;
  eventImpactMultiplier: number;
  /** 그 외 일반주 기저 세션 수익률(베타로 개별 스케일). */
  base: number;
  defense: number;
  foodProduction: number;
  healthcare: number;
  gold: number;
  shortBond: number;
  /** 진영 학원채 — 승리/패배 진영은 런타임에 매핑. */
  bondWinner: number;
  bondLoser: number;
  bondAbydos: number;
  bondKivotos: number;
  bondMillennium: number;
  description: string;
}

/** 국면이 시작되는 절대 시각(UTC) — 2026-08-02 21:00 KST(= 12:00 UTC). 예고 후 개전. */
export const WAR_START_MS = Date.UTC(2026, 7, 2, 12, 0);
export const WAR_START_SESSION = Math.floor(WAR_START_MS / SESSION_DURATION_MS);

export const SCHEDULED_WAR_PHASES: ScheduledWarPhase[] = [
  {
    id: "outbreak",
    name: "개전·총동원",
    emoji: "🚨",
    duration: 3,
    wartime: true,
    volatilityMultiplier: 1.55,
    eventImpactMultiplier: 1.45,
    base: -0.03,
    defense: 0.06,
    foodProduction: 0.045,
    healthcare: 0.012,
    gold: 0.05,
    shortBond: 0.03,
    bondWinner: -0.008,
    bondLoser: -0.008,
    bondAbydos: -0.05,
    bondKivotos: -0.05,
    bondMillennium: 0.04,
    description:
      "게헨나와 트리니티가 전면전에 돌입하며 유동성 위기로 대부분의 자산이 무너집니다. 방산·치안과 식품 생산이 급등하고, 안전자산인 금·단기채·밀레니엄 학원채로 자금이 몰립니다.",
  },
  {
    id: "fullwar",
    name: "전면전",
    emoji: "⚔️",
    duration: 5,
    wartime: true,
    volatilityMultiplier: 1.7,
    eventImpactMultiplier: 1.5,
    base: -0.01,
    defense: 0.02,
    foodProduction: 0.015,
    healthcare: 0.008,
    gold: 0.015,
    shortBond: 0.01,
    bondWinner: 0.02,
    bondLoser: -0.02,
    bondAbydos: -0.012,
    bondKivotos: -0.012,
    bondMillennium: 0.015,
    description:
      "전선이 고착되며 완만한 하락이 이어집니다. 전황에서 우위를 점한 진영의 학원채가 오르고 불리한 진영은 밀립니다.",
  },
  {
    id: "stalemate",
    name: "교착·협상",
    emoji: "🕯️",
    duration: 3,
    wartime: true,
    volatilityMultiplier: 2.0,
    eventImpactMultiplier: 1.7,
    base: -0.005,
    defense: 0.01,
    foodProduction: 0.008,
    healthcare: 0.005,
    gold: 0.01,
    shortBond: 0.006,
    bondWinner: 0.025,
    bondLoser: -0.025,
    bondAbydos: -0.008,
    bondKivotos: -0.008,
    bondMillennium: 0.008,
    description:
      "휴전 협상과 국지전이 교차하며 변동성이 최고조에 이릅니다. 전황 우열에 따라 진영 채권의 등락이 심해집니다.",
  },
  {
    id: "armistice",
    name: "종전",
    emoji: "🕊️",
    duration: 4,
    wartime: false,
    volatilityMultiplier: 1.6,
    eventImpactMultiplier: 1.5,
    base: 0.018,
    defense: -0.055,
    foodProduction: 0.01,
    healthcare: 0.008,
    gold: -0.02,
    shortBond: -0.006,
    bondWinner: 0.06,
    bondLoser: -0.06,
    bondAbydos: 0.02,
    bondKivotos: 0.02,
    bondMillennium: 0.005,
    description:
      "정전 협정이 체결되며 방산·치안이 급락하고 그 외 섹터가 반등합니다. 승리 진영은 폭등하고 패배 진영은 폭락합니다.",
  },
  {
    id: "rebuild",
    name: "전후 복구",
    emoji: "🏗️",
    duration: 5,
    wartime: false,
    volatilityMultiplier: 1.3,
    eventImpactMultiplier: 1.25,
    base: 0.008,
    defense: -0.008,
    foodProduction: 0.005,
    healthcare: 0.004,
    gold: -0.005,
    shortBond: -0.003,
    bondWinner: 0.01,
    bondLoser: -0.005,
    bondAbydos: 0.008,
    bondKivotos: 0.008,
    bondMillennium: 0.003,
    description:
      "재건 수요로 시장 전반이 완만히 회복되고 전시 프리미엄이 정상화됩니다.",
  },
];

export const SCHEDULED_WAR_DURATION_SESSIONS = SCHEDULED_WAR_PHASES.reduce(
  (sum, phase) => sum + phase.duration,
  0,
);

function deterministicUnit(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 4_294_967_296;
}

/** 결정론적 승리 진영 — 예약 확정 국면이라 시드로 한 번 정해진다. */
export const WAR_WINNER: WarFaction =
  deterministicUnit(`gt-war:${WAR_START_SESSION}`) < 0.5 ? "gehenna" : "trinity";
export const WAR_LOSER: WarFaction =
  WAR_WINNER === "gehenna" ? "trinity" : "gehenna";

const FACTION_NAME: Record<WarFaction, string> = {
  gehenna: "게헨나",
  trinity: "트리니티",
};

export function scheduledWarFactionName(faction: WarFaction): string {
  return FACTION_NAME[faction];
}

export type ScheduledWarRegionController = WarFaction | "contested";

export interface ScheduledWarRegionDefinition {
  id: string;
  name: string;
  icon: string;
  strategicWeight: number;
}

export interface ScheduledWarRegionState extends ScheduledWarRegionDefinition {
  controller: ScheduledWarRegionController;
}

interface ScheduledWarRegionSeed extends ScheduledWarRegionDefinition {
  pressurePair: string;
  mirrored: boolean;
}

/**
 * 대전쟁 전역 18개 지역.
 * 같은 pressurePair의 두 지역은 동일 가중치와 대칭 압력을 가져 개전 첫날 50:50을 보장한다.
 */
const SCHEDULED_WAR_REGION_SEEDS: readonly ScheduledWarRegionSeed[] = [
  { id: "central-exchange", name: "중앙거래소", icon: "🏦", strategicWeight: 3, pressurePair: "core", mirrored: false },
  { id: "industrial-belt", name: "북부공단", icon: "🏭", strategicWeight: 3, pressurePair: "core", mirrored: true },
  { id: "rail-hub", name: "철도허브", icon: "🚉", strategicWeight: 3, pressurePair: "artery", mirrored: false },
  { id: "academy-district", name: "학원지구", icon: "🏫", strategicWeight: 3, pressurePair: "artery", mirrored: true },
  { id: "southern-port", name: "남부항만", icon: "⚓", strategicWeight: 2, pressurePair: "logistics", mirrored: false },
  { id: "outer-airfield", name: "외곽비행장", icon: "🛩️", strategicWeight: 2, pressurePair: "logistics", mirrored: true },
  { id: "energy-grid", name: "에너지지구", icon: "⚡", strategicWeight: 2, pressurePair: "utility", mirrored: false },
  { id: "waterworks", name: "수원시설", icon: "💧", strategicWeight: 2, pressurePair: "utility", mirrored: true },
  { id: "communications", name: "통신관제소", icon: "📡", strategicWeight: 2, pressurePair: "signals", mirrored: false },
  { id: "broadcast-center", name: "방송송신소", icon: "📻", strategicWeight: 2, pressurePair: "signals", mirrored: true },
  { id: "relief-hospital", name: "구호병원", icon: "🏥", strategicWeight: 2, pressurePair: "civil", mirrored: false },
  { id: "commerce-quarter", name: "상업중심가", icon: "🏬", strategicWeight: 2, pressurePair: "civil", mirrored: true },
  { id: "western-supply", name: "서부보급로", icon: "🚚", strategicWeight: 1, pressurePair: "supply", mirrored: false },
  { id: "warehouse-zone", name: "창고지대", icon: "📦", strategicWeight: 1, pressurePair: "supply", mirrored: true },
  { id: "grand-bridge", name: "대교검문소", icon: "🌉", strategicWeight: 1, pressurePair: "frontier", mirrored: false },
  { id: "mountain-fort", name: "산악요새", icon: "⛰️", strategicWeight: 1, pressurePair: "frontier", mirrored: true },
  { id: "underground-route", name: "지하물류망", icon: "🚇", strategicWeight: 1, pressurePair: "covert", mirrored: false },
  { id: "outer-gate", name: "외곽관문", icon: "🚧", strategicWeight: 1, pressurePair: "covert", mirrored: true },
];

const SCHEDULED_WAR_PRESSURE_PAIRS = [
  ...new Set(SCHEDULED_WAR_REGION_SEEDS.map((region) => region.pressurePair)),
].sort(
  (left, right) =>
    deterministicUnit(`gt-war-region-order:${WAR_START_SESSION}:${left}`) -
    deterministicUnit(`gt-war-region-order:${WAR_START_SESSION}:${right}`),
);

function scheduledWarRegionPairPressure(pair: string): number {
  const index = SCHEDULED_WAR_PRESSURE_PAIRS.indexOf(pair);
  const lastIndex = Math.max(1, SCHEDULED_WAR_PRESSURE_PAIRS.length - 1);
  return 0.06 + (index / lastIndex) * 0.38;
}

export const SCHEDULED_WAR_REGIONS: readonly ScheduledWarRegionDefinition[] =
  SCHEDULED_WAR_REGION_SEEDS.map((region) => ({
    id: region.id,
    name: region.name,
    icon: region.icon,
    strategicWeight: region.strategicWeight,
  }));

export interface ActiveScheduledWar {
  phase: ScheduledWarPhase;
  phaseIndex: number;
  phaseSession: number;
  phaseSessionsLeft: number;
  sessionsLeft: number;
  winner: WarFaction;
  loser: WarFaction;
}

export interface ScheduledWarFrontline {
  gehennaControl: number;
  trinityControl: number;
  leader: WarFaction | null;
  regions: ScheduledWarRegionState[];
  gehennaRegions: number;
  trinityRegions: number;
  contestedRegions: number;
  headline: string;
  situation: string;
}

function winnerControlForPhase(active: ActiveScheduledWar): number {
  const progress =
    active.phase.duration <= 1
      ? 1
      : active.phaseSession / (active.phase.duration - 1);
  switch (active.phase.id) {
    case "outbreak":
      return 50 + progress * 5;
    case "fullwar":
      return 56 + progress * 8;
    case "stalemate":
      return [63, 60, 65][active.phaseSession] ?? 63;
    case "armistice":
      return 70 + progress * 10;
    case "rebuild":
      return 78 - progress * 3;
    default:
      return 50;
  }
}

function contestedBandForPhase(active: ActiveScheduledWar): number {
  switch (active.phase.id) {
    case "outbreak":
      return 0.14;
    case "fullwar":
      return 0.1;
    case "stalemate":
      return 0.16;
    case "armistice":
      return 0.06;
    case "rebuild":
      return 0.04;
    default:
      return 0.1;
  }
}

function getScheduledWarRegions(
  active: ActiveScheduledWar,
): ScheduledWarRegionState[] {
  const target = winnerControlForPhase(active) / 100;
  const halfBand = contestedBandForPhase(active) / 2;
  return SCHEDULED_WAR_REGION_SEEDS.map((seed) => {
    const pairPressure = scheduledWarRegionPairPressure(seed.pressurePair);
    const pressure = seed.mirrored ? 1 - pairPressure : pairPressure;
    const controller: ScheduledWarRegionController =
      pressure < target - halfBand
        ? active.winner
        : pressure > target + halfBand
          ? active.loser
          : "contested";
    return {
      id: seed.id,
      name: seed.name,
      icon: seed.icon,
      strategicWeight: seed.strategicWeight,
      controller,
    };
  });
}

/** 홈 전쟁 현황판에 표시할 결정론적 지역 점령·상황·속보. */
export function getScheduledWarFrontline(
  active: ActiveScheduledWar,
): ScheduledWarFrontline {
  const regions = getScheduledWarRegions(active);
  const totalWeight = regions.reduce(
    (sum, region) => sum + region.strategicWeight,
    0,
  );
  const gehennaWeight = regions.reduce(
    (sum, region) =>
      sum +
      (region.controller === "gehenna"
        ? region.strategicWeight
        : region.controller === "contested"
          ? region.strategicWeight / 2
          : 0),
    0,
  );
  const gehennaControl = (gehennaWeight / totalWeight) * 100;
  const trinityControl = 100 - gehennaControl;
  const leader: WarFaction | null =
    Math.abs(gehennaControl - trinityControl) < 0.5
      ? null
      : gehennaControl > trinityControl
        ? "gehenna"
        : "trinity";
  const gehennaRegions = regions.filter(
    (region) => region.controller === "gehenna",
  ).length;
  const trinityRegions = regions.filter(
    (region) => region.controller === "trinity",
  ).length;
  const contestedRegions = regions.length - gehennaRegions - trinityRegions;
  const winnerName = FACTION_NAME[active.winner];
  const loserName = FACTION_NAME[active.loser];
  const winnerRegions =
    active.winner === "gehenna" ? gehennaRegions : trinityRegions;
  const loserRegions =
    active.loser === "gehenna" ? gehennaRegions : trinityRegions;
  const focusRegion =
    regions.find((region) => region.controller === "contested") ??
    regions.find((region) => region.controller === active.winner) ??
    regions[0];
  const shared = {
    gehennaControl,
    trinityControl,
    leader,
    regions,
    gehennaRegions,
    trinityRegions,
    contestedRegions,
  };

  switch (active.phase.id) {
    case "outbreak":
      return {
        ...shared,
        headline: `양측 총동원령… ${focusRegion.name} 등 전역에서 동시 교전`,
        situation: `게헨나 ${gehennaRegions}곳, 트리니티 ${trinityRegions}곳을 확보했고 ${contestedRegions}곳에서 교전 중입니다. 전역 세션에 따라 모든 플레이어에게 같은 점령 상황이 표시됩니다.`,
      };
    case "fullwar":
      return {
        ...shared,
        headline: `${winnerName}, ${focusRegion.name} 공방전에서 주도권 확보`,
        situation: `${winnerName}가 ${winnerRegions}개 지역을 점령해 ${loserName}의 ${loserRegions}개 지역을 압박하고 있습니다. ${contestedRegions}개 교전 지역을 중심으로 방산·식품·의료 수요가 늘어납니다.`,
      };
    case "stalemate":
      return {
        ...shared,
        headline: `${focusRegion.name} 교전 지속… 휴전 협상과 국지전 교차`,
        situation: `${winnerName} ${winnerRegions}곳, ${loserName} ${loserRegions}곳 점령 상태에서 ${contestedRegions}곳의 소유권이 흔들리고 있습니다. 전선 변동성이 최고조입니다.`,
      };
    case "armistice":
      return {
        ...shared,
        headline: `${winnerName} 승리… ${loserName} 점령지에서 단계적 철수`,
        situation: `정전 협정이 체결됐습니다. ${winnerName}는 ${winnerRegions}개 지역을 확보했고 ${loserName}는 ${loserRegions}개 지역으로 후퇴했습니다. 방산 프리미엄이 빠지고 민간 산업이 재평가됩니다.`,
      };
    case "rebuild":
      return {
        ...shared,
        headline: "전후 복구 착수… 교통·생산시설 단계적 정상화",
        situation: `${winnerName}가 확보한 ${winnerRegions}개 지역을 중심으로 전후 질서가 자리 잡고 있습니다. ${contestedRegions}개 지역의 행정권을 정리하며 재건 산업으로 자금이 이동합니다.`,
      };
    default:
      return {
        ...shared,
        headline: "게-트 대전쟁 전황 갱신",
        situation: active.phase.description,
      };
  }
}

/** 해당 세션의 진행 중 전쟁 국면(없으면 null). */
export function getActiveScheduledWar(
  session: number,
): ActiveScheduledWar | null {
  if (session < WAR_START_SESSION) return null;
  const offset = session - WAR_START_SESSION;
  if (offset >= SCHEDULED_WAR_DURATION_SESSIONS) return null;
  let acc = 0;
  for (let index = 0; index < SCHEDULED_WAR_PHASES.length; index++) {
    const phase = SCHEDULED_WAR_PHASES[index];
    if (offset < acc + phase.duration) {
      const phaseSession = offset - acc;
      return {
        phase,
        phaseIndex: index,
        phaseSession,
        phaseSessionsLeft: phase.duration - phaseSession,
        sessionsLeft: SCHEDULED_WAR_DURATION_SESSIONS - offset,
        winner: WAR_WINNER,
        loser: WAR_LOSER,
      };
    }
    acc += phase.duration;
  }
  return null;
}

type WarStock = Pick<
  StockDefinition,
  "id" | "sector" | "subsector" | "marketTags" | "beta"
>;

const BOND_FACTION: Record<string, WarFaction | "abydos" | "kivotos" | "millennium"> = {
  baghb: "gehenna",
  batrb: "trinity",
  baabb: "abydos",
  bakvb: "kivotos",
  bamlb: "millennium",
};

function isDefense(stock: WarStock): boolean {
  if (stock.id === "pmcx") return true;
  if (stock.sector?.startsWith("방산")) return true;
  return Boolean(
    stock.marketTags?.some((tag) => tag === "방산" || tag === "치안"),
  );
}

function isHealthcare(stock: WarStock): boolean {
  return (
    stock.sector === "헬스케어" ||
    stock.sector === "바이오" ||
    Boolean(
      stock.marketTags?.some(
        (tag) => tag === "바이오" || tag === "헬스케어" || tag === "제약",
      ),
    )
  );
}

/** 원자재 생산·공장 식품제조만 포함하고 외식·다이닝·카페는 제외한다. */
function isFoodProduction(stock: WarStock): boolean {
  if (stock.sector !== "식품·외식") return false;
  const sub = stock.subsector ?? "";
  if (/외식|다이닝|프랜차이즈|카페|닭꼬치/.test(sub)) return false;
  return /생산|농|낙농|유제품|제조|원예|식물|음료|소비재|식품/.test(sub);
}

/**
 * 전쟁 국면이 종목에 주는 세션 기저 수익률. tickStock(비파생 종목)에서만 호출되며,
 * 레버리지·인버스·NAV ETF는 기초자산을 순함수로 추종하므로 여기서 다루지 않는다.
 */
export function scheduledWarReturnForStock(
  active: ActiveScheduledWar,
  stock: WarStock,
  dtSeconds: number,
): number {
  const p = active.phase;
  let perSession: number;

  const bond = BOND_FACTION[stock.id];
  if (bond) {
    if (bond === "abydos") perSession = p.bondAbydos;
    else if (bond === "kivotos") perSession = p.bondKivotos;
    else if (bond === "millennium") perSession = p.bondMillennium;
    else if (bond === active.winner) perSession = p.bondWinner;
    else perSession = p.bondLoser;
  } else if (stock.id === "gldx") {
    perSession = p.gold;
  } else if (stock.id === "sbnd") {
    perSession = p.shortBond;
  } else if (isDefense(stock)) {
    perSession = p.defense;
  } else if (isFoodProduction(stock)) {
    perSession = p.foodProduction;
  } else if (isHealthcare(stock)) {
    perSession = p.healthcare;
  } else if (stock.sector === "채권") {
    // 분류 밖 일반 채권은 위기엔 방어적(완만), 종전엔 소폭.
    perSession = p.wartime ? p.shortBond * 0.5 : -p.shortBond * 0.5;
  } else {
    // 일반주: 기저 수익률을 베타로 스케일(고베타일수록 크게 흔들린다).
    perSession = p.base * (stock.beta ?? 0.9);
  }

  return perSession * (dtSeconds / (SESSION_DURATION_MS / 1_000));
}

/** 전쟁 국면의 변동성 배수(없으면 1). */
export function scheduledWarVolatilityMultiplier(session: number): number {
  return getActiveScheduledWar(session)?.phase.volatilityMultiplier ?? 1;
}

/** 전쟁 국면의 이벤트 임팩트 배수(없으면 1). */
export function scheduledWarEventImpactMultiplier(session: number): number {
  return getActiveScheduledWar(session)?.phase.eventImpactMultiplier ?? 1;
}

/** 각 전쟁 단계가 시작되는 거래일에 한 번 뉴스 사건을 만든다. */
export function getScheduledWarEventsForSession(session: number): MarketEvent[] {
  const active = getActiveScheduledWar(session);
  if (!active || active.phaseSession !== 0) return [];
  const winnerName = FACTION_NAME[active.winner];
  const loserName = FACTION_NAME[active.loser];
  const tail =
    active.phaseIndex === 0
      ? ""
      : active.phase.wartime
        ? ` 현재 전황은 ${winnerName} 우세입니다.`
        : ` ${winnerName}의 승리로 전쟁이 마무리됩니다(${loserName} 패배).`;
  const event: MarketEvent = {
    id: `gt-war-${active.phase.id}`,
    title: `${active.phase.emoji} 게-트 대전쟁: ${active.phase.name}`,
    description: `${active.phase.description}${tail}`,
    affectedStockIds: [],
    impact: active.phase.base,
    timestamp: session * SESSION_DURATION_MS,
    category: "macro",
    tag: "전쟁",
  };
  return [event];
}

/** 시작 전이면 남은 세션 수(예고용), 진행/종료면 null. */
export function scheduledWarSessionsUntilStart(session: number): number | null {
  if (session >= WAR_START_SESSION) return null;
  return WAR_START_SESSION - session;
}

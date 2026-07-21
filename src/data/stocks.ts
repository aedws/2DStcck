import type { EventTemplate, StockDefinition } from "@/lib/types/market";
import { CSV_COMPANIES } from "@/data/generated";
import { IPO_SCHEDULE } from "@/data/ipoSchedule";

export const INITIAL_CASH = 10_000_000;

/** 화면 표시용 한국어 종목명. 티커와 CSV 원문명은 그대로 유지한다. */
const KOREAN_STOCK_NAMES: Record<string, string> = {
  vnasdaq: "V-나스닥",
  vnasfut: "V-나스닥 선물",
  vnsl2: "V-나스닥 2배 레버리지",
  vnsi: "V-나스닥 인버스",
  vnsi2: "V-나스닥 2배 인버스",
  vncc: "V-나스닥 커버드콜",
  baridc: "리오 방위산업",
  baqqq: "밀레니엄 테크 100",
  bamlb: "밀레니엄 학원채",
  bagdi: "게임개발 인터랙티브",
  bavts: "베리타스 시큐리티",
  banru: "네루 택티컬 그룹",
  bahbk: "히비키 병기 시스템",
  basmr: "밀레니엄 메디컬",
  baspy: "키보토스 종합지수",
  bakaya: "시라누이 중공업",
  bakvb: "키보토스 지방채",
  baabs: "아비도스 시큐리티",
  baabb: "아비도스 학원채",
  ba68: "흥신소 68",
  bahina: "선도부 방위산업",
  bahrn: "미식연구회 다이닝",
  bafka: "게헨나 키친 푸드",
  basena: "구호기사단 바이오텍",
  baksm: "카스미 건설",
  bakrr: "키라라 코스메틱",
  baghb: "게헨나 학원채",
  bahnk: "하나코 교육그룹",
  baszm: "스즈미 경비서비스",
  baui: "아카이브 미디어웍스",
  baair: "아이리 커피",
  bamine: "미네 제약",
  batrg: "정의실현부 시큐리티",
  bamari: "마리 성지순례 관광",
  batrb: "트리니티 학원채",
  wwjin: "금주 금융그룹",
  wwchl: "장리 에너지 홀딩스",
  wwxly: "상리요 연구소",
  wwjyn: "청룡 항공물류",
  wwskp: "블랙쇼어 텔레콤",
  wwcam: "카멜리야 보태니컬",
  nkltr: "리터 개발",
  nkvol: "볼륨 방송",
  nkneo: "네온 메가스토어",
  nkexa: "엑시아 인터랙티브",
  pmcx: "키보토스 치안 ETF",
  bndx: "학원채 ETF",
};

/** CSV에서 세부 섹터를 비워 둔 경우 사용하는 기본 분류. CSV 값이 있으면 그 값이 우선한다. */
const DEFAULT_SUBSECTORS: Record<string, string> = {
  vnasdaq: "시장대표 지수",
  vnasfut: "주가지수 선물",
  vnsl2: "레버리지 ETF",
  vnsi: "인버스 ETF",
  vnsi2: "곱버스 ETF",
  vncc: "커버드콜 ETF",
  baridc: "방위 시스템",
  baqqq: "기술주 ETF",
  bamlb: "학원채",
  bagdi: "게임 개발",
  bavts: "사이버 보안",
  banru: "민간 군사",
  bahbk: "병기 제조",
  basmr: "의료 서비스",
  baspy: "시장대표 ETF",
  bakaya: "중공업",
  bakvb: "지방채",
  baabs: "시설 경비",
  baabb: "학원채",
  ba68: "조사·해결 서비스",
  bahina: "치안 서비스",
  bahrn: "외식",
  bafka: "식품 서비스",
  basena: "바이오테크",
  baksm: "종합 건설",
  bakrr: "화장품 제조",
  baghb: "학원채",
  bahnk: "교육 서비스",
  baszm: "민간 경호",
  baui: "콘텐츠 제작",
  baair: "카페",
  bamine: "제약",
  batrg: "치안 서비스",
  bamari: "여행 서비스",
  batrb: "학원채",
  wwjin: "금융지주",
  wwchl: "종합 에너지",
  wwxly: "기술 연구개발",
  wwjyn: "항공 물류",
  wwskp: "통신 서비스",
  wwcam: "원예·식물",
  nkltr: "부동산 개발",
  nkvol: "방송",
  nkneo: "종합 소매",
  nkexa: "게임 개발",
  pmcx: "치안·보안 ETF",
  bndx: "채권 ETF",
};

/** 코드 관리 종목 (시장 코어: 지수·선물). 회사·캐릭터는 data/companies.csv가 원본. */
const CORE_DEFINITIONS: StockDefinition[] = [
  {
    id: "vnasdaq",
    ticker: "VNAS",
    name: "V-NASDAQ",
    sector: "지수",
    initialPrice: 21000,
    volatility: 0.012,
    drift: 0.0007,
    trendStrength: 0.00004,
    description:
      "가상 시장 전 섹터를 아우르는 종합 벤치마크 지수. 반도체·금융·방어주까지 상장 종목 전체의 평균 흐름을 나타내며, 모든 시즌·의뢰의 초과수익(알파) 기준이 된다.",
    beta: 1,
  },
  {
    id: "vnasfut",
    ticker: "VNSF",
    name: "V-NASDAQ 선물",
    sector: "선물",
    initialPrice: 21200,
    volatility: 0.02,
    drift: 0.0007,
    trendStrength: 0.00007,
    description: "V-NASDAQ 지수 선물. 지수보다 90초 먼저 움직이는 선행지표.",
    beta: 1,
  },
  // ── 합성 ETF (V-NASDAQ 추종 파생상품 — 캐릭터 없는 시장 상품) ──
  {
    id: "vnsl2",
    ticker: "VNSL2",
    name: "V-NASDAQ Leverage 2x",
    sector: "ETF",
    initialPrice: 10000,
    volatility: 0.01,
    drift: 0,
    beta: 0,
    leverage: 2,
    leverageUnderlyingId: "vnasdaq",
    description:
      "V-NASDAQ 틱 수익률을 2배로 추종하는 레버리지 ETF. 고위험 고수익.",
  },
  {
    id: "vnsi",
    ticker: "VNSI",
    name: "V-NASDAQ Inverse",
    sector: "ETF",
    initialPrice: 10000,
    volatility: 0.01,
    drift: 0,
    beta: 0,
    leverage: -1,
    leverageUnderlyingId: "vnasdaq",
    description: "지수가 1% 내리면 1% 오르는 인버스 ETF. 하락장 방어 수단.",
  },
  {
    id: "vnsi2",
    ticker: "VNSI2",
    name: "V-NASDAQ Inverse 2x",
    sector: "ETF",
    initialPrice: 10000,
    volatility: 0.01,
    drift: 0,
    beta: 0,
    leverage: -2,
    leverageUnderlyingId: "vnasdaq",
    description:
      "하락에 2배로 베팅하는 곱버스 ETF. 방향을 맞추면 크게 벌고 틀리면 크게 잃는다.",
  },
  {
    id: "vncc",
    ticker: "VNCC",
    name: "V-NASDAQ Covered Call",
    sector: "ETF",
    initialPrice: 10000,
    volatility: 0.01,
    drift: 0,
    beta: 0,
    coveredCallUnderlyingId: "vnasdaq",
    coveredCallAnnualYield: 12,
    coveredCallUpsideCapture: 0.65,
    coveredCallDistributionIntervalDays: 20,
    description:
      "V-NASDAQ을 보유하면서 콜옵션 프리미엄을 수취하는 커버드콜 ETF. 하락은 그대로 반영되고 상승 일부를 포기하는 대신, 변동 가능한 월 분배금을 20거래일마다 지급한다.",
  },
  // ── 안전자산 ETF (캐릭터 없는 시장 상품) ──
  {
    id: "sbnd",
    ticker: "SBND",
    name: "단기채 ETF",
    sector: "ETF",
    subsector: "단기채 ETF",
    initialPrice: 10000,
    volatility: 0.0025,
    drift: 0.0006,
    beta: 0.05,
    quarterlyDividend: 90,
    description:
      "만기가 짧은 우량 채권에 투자하는 저변동 ETF. 주가 등락에 거의 흔들리지 않고 60거래일마다 이자 성격의 분기 분배금을 지급해 현금 대기·방어 자산으로 쓰인다.",
  },
  {
    id: "gldx",
    ticker: "GLDX",
    name: "금 ETF",
    sector: "ETF",
    subsector: "금 ETF",
    initialPrice: 18000,
    volatility: 0.009,
    drift: 0.0008,
    beta: -0.1,
    description:
      "실물 금 가격을 추종하는 ETF. 시장이 흔들릴 때 오히려 강세를 보이는 경향이 있어 위기 국면의 헤지·분산 수단으로 쓰인다. 배당은 없다.",
  },
  // ── 코드 관리 캐릭터 기업 ──
  {
    // CSV에서 이관 — 티커를 BAHINA→BAAKO로 바꾸면서 id(보유·호감도 키)는 보존한다.
    id: "bahina",
    ticker: "BAAKO",
    name: "선도부 방위산업",
    sector: "PMC",
    subsector: "치안 서비스",
    initialPrice: 142000,
    volatility: 0.038,
    drift: 0.0009,
    beta: 1,
    description: "게헨나 풍기위원회 직영의 최정예 방위 서비스.",
    eventBias: {
      수주: 3,
      스캔들: 0.5,
    },
    ceoId: "chr_baako",
  },
  // ── IPO 상장 예정 (코드 관리 캐릭터 기업) ──
  {
    id: "udnge",
    ticker: "UDGE",
    name: "레이센 제약",
    sector: "바이오",
    subsector: "제약",
    initialPrice: 38000,
    volatility: 0.042,
    drift: 0.0006,
    beta: 0.95,
    description:
      "미혹의 죽림 깊은 곳 영원정에 자리한 제약사. 불사의 명약 '봉래약'을 개발 중이라는 소문이 돈다. 다만 간판 얼굴인 우동게는 정작 제조엔 손대지 않고, 마을에 행상인 행세로 들어가 약을 파는 판매만 맡는다 — 실제 조제는 따로 있다.",
    eventBias: {
      신제품: 4,
      행보: 2,
      스캔들: 1.5,
    },
    ceoId: "chr_udnge",
  },
  {
    id: "dante",
    ticker: "DNTE",
    name: "단테 정밀시계",
    sector: "명품",
    subsector: "고급 시계",
    initialPrice: 95000,
    volatility: 0.03,
    drift: 0.0006,
    beta: 0.85,
    description:
      "한 치의 오차도 허락하지 않는 하이엔드 기계식 시계 제조사. 초정밀 무브먼트와 극소량 생산으로 수집가들의 성지가 됐다. 시계에 진심인 창업자 단테가 직접 모든 무브먼트를 검수한다.",
    eventBias: {
      신제품: 4,
      행보: 2,
      실적: 2,
    },
    ceoId: "chr_dante",
  },
  {
    id: "hinafg",
    ticker: "HINA",
    name: "소라사키 히나 금융지주",
    sector: "금융",
    subsector: "금융지주",
    initialPrice: 52000,
    volatility: 0.024,
    drift: 0.0007,
    beta: 1.1,
    description:
      "키보토스 금융업계 최대 기업 가치를 지닌 종합 금융지주. 상업은행·투자은행·자산운용 3개 사업부를 거느리며, 풍기위원장 출신 회장 소라사키 히나가 잠도 잊은 결재 속도로 그룹 전체를 직접 통솔한다. 유저 종목 요청으로 상장.",
    eventBias: {
      실적: 3,
      행보: 2,
      스캔들: 1.5,
    },
    ceoId: "chr_bahina",
  },
  {
    id: "gsck",
    ticker: "GSCK",
    name: "키보토스 총학생회 금융지주",
    sector: "금융",
    subsector: "행정 지주회사",
    initialPrice: 88000,
    volatility: 0.02,
    drift: 0.0007,
    beta: 0.9,
    description:
      "키보토스 연방 예산과 금융 자산 운용, 9개 행정위원회·각 학원 거버넌스, 생텀 타워 인프라 관제를 총괄하는 행정 지주회사. 총학생회장 장기 부재 중에도 수석 행정관 나나가미 린의 쿨하고 철저한 일처리로 리스크를 최소화하며, 린의 직인이 찍히지 않은 합병 서류는 어떤 경우에도 효력이 없다. 유저 종목 요청으로 상장.",
    eventBias: {
      행보: 3,
      실적: 2,
      스캔들: 0.5,
    },
    ceoId: "chr_baspy",
  },
  {
    id: "yisang",
    ticker: "YSAN",
    name: "이상 연구소",
    sector: "기술",
    subsector: "특허 라이선싱",
    initialPrice: 73000,
    volatility: 0.036,
    drift: 0.0009,
    beta: 1.08,
    description:
      "26개의 메가코프가 지배하는 도시에서 연구개발로 확보한 특허를 판매하고 라이선싱하는 기술 사업화 연구소. 최연소 수석연구원 이상이 발명과 권리화를 총괄하며, 직접 생산보다 지식재산 사용료와 공동 연구 계약으로 수익을 낸다. 유저 종목 요청으로 상장.",
    eventBias: {
      신제품: 4,
      수주: 3,
      실적: 2,
      스캔들: 0.5,
    },
    ceoId: "chr_yisang",
  },
];

/** CSV 회사가 코드 종목과 같은 id면 CSV가 우선한다 */
const BASE_STOCK_DEFINITIONS: StockDefinition[] = [
  ...CORE_DEFINITIONS.filter(
    (c) => !CSV_COMPANIES.some((g) => g.id === c.id),
  ),
  ...CSV_COMPANIES,
];

const DISPLAY_BASE_STOCK_DEFINITIONS: StockDefinition[] =
  BASE_STOCK_DEFINITIONS.map((definition) => ({
    ...definition,
    name: KOREAN_STOCK_NAMES[definition.id] ?? definition.name,
    subsector: definition.subsector ?? DEFAULT_SUBSECTORS[definition.id],
    // IPO 예약이 있으면 상장 시각을 얹는다(그 전에는 비거래·비노출·시뮬 동결).
    listingEpochMs: IPO_SCHEDULE[definition.id] ?? definition.listingEpochMs,
  }));

const DERIVATIVE_FACTORS = [
  { leverage: -1, idSuffix: "inverse", tickerSuffix: "I", name: "인버스" },
  { leverage: -2, idSuffix: "inverse-2x", tickerSuffix: "I2", name: "2배 인버스" },
  { leverage: 2, idSuffix: "leverage-2x", tickerSuffix: "L2", name: "2배 레버리지" },
] as const;

const existingDerivativeKeys = new Set(
  DISPLAY_BASE_STOCK_DEFINITIONS.filter(
    (stock) => stock.leverage !== undefined && stock.leverageUnderlyingId,
  ).map(
    (stock) => `${stock.leverageUnderlyingId}:${stock.leverage}`,
  ),
);

/** 기존 합성상품을 제외한 모든 상장 기초자산에 -1배·-2배·+2배 상품을 제공한다. */
const UNIVERSAL_DERIVATIVES: StockDefinition[] =
  DISPLAY_BASE_STOCK_DEFINITIONS.filter(
    (stock) =>
      stock.leverage === undefined && !stock.coveredCallUnderlyingId,
  ).flatMap((underlying) =>
    DERIVATIVE_FACTORS.filter(
      ({ leverage }) =>
        !existingDerivativeKeys.has(`${underlying.id}:${leverage}`),
    ).map(({ leverage, idSuffix, tickerSuffix, name }) => ({
      id: `${underlying.id}-${idSuffix}`,
      ticker: `${underlying.ticker}${tickerSuffix}`,
      name: `${underlying.name} ${name}`,
      sector: "ETF",
      subsector:
        leverage === -1
          ? "인버스 ETF"
          : leverage === -2
            ? "곱버스 ETF"
            : "레버리지 ETF",
      initialPrice: 10_000,
      // 레버리지·인버스 ETF는 기초 대비 |배수|만큼 크게 움직인다. 옵션 가격은 이
      // volatility 로 매겨지므로(가격 생성은 기초자산 순함수라 이 값을 안 씀),
      // |배수|를 곱해 옵션이 저평가돼 0DTE 스트래들이 공짜가 되는 걸 막는다.
      volatility: underlying.volatility * Math.abs(leverage),
      drift: 0,
      beta: 0,
      leverage,
      leverageUnderlyingId: underlying.id,
      universalDerivative: true,
      // 기초자산이 IPO 예정이면 파생상품도 같은 시각까지 비상장으로 묶는다.
      listingEpochMs: underlying.listingEpochMs,
      description: `${underlying.name}의 틱 수익률을 ${leverage}배로 추종하는 합성 ETF.`,
    })),
  );

function deterministicCoveredCallYield(stockId: string): number {
  let hash = 2166136261;
  for (let index = 0; index < stockId.length; index++) {
    hash ^= stockId.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 30 + ((hash >>> 0) % 151) / 10;
}

/** 캐릭터가 있는 실제 기업마다 ±0.7배 단일 종목 커버드콜을 제공한다. */
const SINGLE_STOCK_COVERED_CALLS: StockDefinition[] =
  DISPLAY_BASE_STOCK_DEFINITIONS.filter(
    (stock) =>
      stock.sector !== "지수" &&
      stock.sector !== "선물" &&
      stock.sector !== "ETF" &&
      Boolean(stock.ceoId),
  ).map((underlying) => ({
    id: `${underlying.id}-covered-call`,
    ticker: `${underlying.ticker}CC`,
    name: `${underlying.name} 커버드콜`,
    sector: "ETF",
    subsector: "단일 종목 커버드콜",
    initialPrice: 10_000,
    volatility: underlying.volatility * 0.7,
    drift: 0,
    beta: 0,
    coveredCallUnderlyingId: underlying.id,
    coveredCallAnnualYield: deterministicCoveredCallYield(underlying.id),
    coveredCallUpsideCapture: 0.7,
    coveredCallDistributionIntervalDays: 5,
    universalDerivative: true,
    // 기초자산이 IPO 예정이면 커버드콜도 같은 시각까지 비상장으로 묶는다.
    listingEpochMs: underlying.listingEpochMs,
    description: `${underlying.name}의 상승·하락을 0.7배로 추종하고 5거래일마다 옵션 프리미엄을 분배하는 단일 종목 커버드콜 ETF.`,
  }));

export const STOCK_DEFINITIONS: StockDefinition[] = [
  ...DISPLAY_BASE_STOCK_DEFINITIONS,
  ...UNIVERSAL_DERIVATIVES,
  ...SINGLE_STOCK_COVERED_CALLS,
];

/** 지수·선물·ETF를 제외한 실제 기업 목록 (company 이벤트 대상) */
export function getCompanyDefinitions(): StockDefinition[] {
  return STOCK_DEFINITIONS.filter(
    (d) => d.sector !== "지수" && d.sector !== "선물" && d.sector !== "ETF",
  );
}

/**
 * 이벤트 템플릿.
 * - macro: affectedStockIds 생략 → 전 종목 (임팩트는 베타로 스케일)
 * - sector: 해당 섹터 전 종목 대상
 * - company: 생성 시 eventBias 가중 추첨으로 회사 1곳 선택, {company}/{ceo} 치환
 */
export const EVENT_TEMPLATES: EventTemplate[] = [
  // ── macro (전 종목 × 베타) ──
  {
    category: "macro",
    tag: "금리",
    title: "금리 인하 기대",
    description: "중앙은행의 완화적 통화정책 기대감이 시장 전반에 확산됩니다.",
    impact: 0.04,
  },
  {
    category: "macro",
    tag: "금리",
    title: "금리 동결 실망",
    description: "기대했던 금리 인하가 미뤄지며 위험자산 전반이 약세입니다.",
    impact: -0.04,
  },
  {
    category: "macro",
    tag: "위험선호",
    title: "글로벌 위험선호 회복",
    description: "위험자산 선호가 살아나며 성장주 중심으로 반등합니다.",
    impact: 0.035,
  },
  {
    category: "macro",
    tag: "위험선호",
    title: "시장 전반 조정",
    description: "투자 심리 위축으로 전 종목에 조정 압력이 가해집니다.",
    impact: -0.035,
  },
  {
    category: "macro",
    tag: "실적",
    title: "실적 시즌 호조",
    description: "주요 기업들의 분기 실적이 시장 예상을 상회했습니다.",
    impact: 0.03,
  },
  {
    category: "macro",
    tag: "실적",
    title: "실적 시즌 부진",
    description: "주요 기업들의 실적이 기대에 못 미치며 실망 매물이 나옵니다.",
    impact: -0.03,
  },
  // ── sector ──
  {
    category: "sector",
    tag: "지정학",
    title: "지정학 리스크 고조",
    description: "국경 분쟁 격화로 방위 예산 증액 논의가 급물살을 탑니다.",
    sector: "방산",
    impact: 0.055,
  },
  {
    category: "sector",
    tag: "치안",
    title: "키보토스 치안 불안 고조",
    description: "곳곳의 소요 사태로 경비·경호 수요가 급증하고 있습니다.",
    sector: "PMC",
    impact: 0.05,
  },
  {
    category: "sector",
    tag: "보안",
    title: "대규모 해킹 사태",
    description: "연쇄 해킹 공격에 보안 솔루션 수요가 폭증합니다.",
    sector: "보안",
    impact: 0.06,
  },
  {
    category: "sector",
    tag: "신작",
    title: "신작 게임 글로벌 흥행",
    description: "신작 게임의 글로벌 흥행으로 게임 섹터가 강세입니다.",
    sector: "게임",
    impact: 0.065,
  },
  {
    category: "sector",
    tag: "규제",
    title: "임상 규제 완화",
    description: "신약 승인 절차 간소화 소식에 바이오 섹터가 급등합니다.",
    sector: "바이오",
    impact: 0.055,
  },
  {
    category: "sector",
    tag: "원가",
    title: "식자재 가격 급등",
    description: "식자재 가격 상승으로 요식업 마진 우려가 커집니다.",
    sector: "요식업",
    impact: -0.04,
  },
  {
    category: "sector",
    tag: "신용",
    title: "신용 스프레드 확대",
    description: "신용 경계감이 커지며 학원채 가격이 일제히 밀립니다.",
    sector: "채권",
    impact: -0.025,
  },
  {
    category: "sector",
    tag: "소비",
    title: "연휴 특수 기대",
    description: "긴 연휴를 앞두고 여행 수요가 빠르게 살아나고 있습니다.",
    sector: "관광",
    impact: 0.045,
  },
  {
    category: "sector",
    tag: "금융",
    title: "예대마진 개선 기대",
    description: "금리 환경 개선으로 금융사 수익성 기대가 커집니다.",
    sector: "금융",
    impact: 0.045,
  },
  {
    category: "sector",
    tag: "금융",
    title: "부실 채권 우려",
    description: "연체율 상승 조짐에 금융 섹터 경계감이 확산됩니다.",
    sector: "금융",
    impact: -0.045,
  },
  {
    category: "sector",
    tag: "유가",
    title: "에너지 가격 급등",
    description: "에너지 가격 강세로 관련 기업 실적 기대가 커집니다.",
    sector: "에너지",
    impact: 0.05,
  },
  {
    category: "sector",
    tag: "유가",
    title: "에너지 가격 급락",
    description: "수요 둔화 전망에 에너지 가격이 미끄러집니다.",
    sector: "에너지",
    impact: -0.05,
  },
  {
    category: "sector",
    tag: "AI",
    title: "AI 투자 붐",
    description: "연산 인프라 투자 확대에 기술주가 강세입니다.",
    sector: "기술",
    impact: 0.055,
  },
  {
    category: "sector",
    tag: "규제",
    title: "기술 규제 강화",
    description: "플랫폼·AI 규제 논의로 기술주에 매도 압력이 나타납니다.",
    sector: "기술",
    impact: -0.05,
  },
  {
    category: "sector",
    tag: "흥행",
    title: "콘텐츠 글로벌 흥행",
    description: "히트 콘텐츠 등장으로 엔터 섹터에 훈풍이 붑니다.",
    sector: "엔터",
    impact: 0.05,
  },
  {
    category: "sector",
    tag: "흥행",
    title: "시청률 부진",
    description: "기대작들의 성적 부진으로 엔터 섹터가 약세입니다.",
    sector: "엔터",
    impact: -0.045,
  },
  // ── sector 악재 (상승 편향 방지 균형추) ──
  {
    category: "sector",
    tag: "지정학",
    title: "평화 협정 진전",
    description: "긴장 완화 소식에 방위 예산 축소 우려가 제기됩니다.",
    sector: "방산",
    impact: -0.05,
  },
  {
    category: "sector",
    tag: "치안",
    title: "과잉 진압 논란",
    description: "경비 업계의 과잉 대응 논란으로 규제 목소리가 커집니다.",
    sector: "PMC",
    impact: -0.045,
  },
  {
    category: "sector",
    tag: "신작",
    title: "기대작 혹평",
    description: "화제의 신작이 혹평을 받으며 게임 섹터가 흔들립니다.",
    sector: "게임",
    impact: -0.055,
  },
  {
    category: "sector",
    tag: "규제",
    title: "임상 실패 여파",
    description: "대형 임상 실패 소식에 바이오 투자 심리가 얼어붙습니다.",
    sector: "바이오",
    impact: -0.05,
  },
  {
    category: "sector",
    tag: "보안",
    title: "보안 예산 삭감",
    description: "긴축 기조로 보안 투자 예산이 줄어들 것이란 전망입니다.",
    sector: "보안",
    impact: -0.045,
  },
  {
    category: "sector",
    tag: "소비",
    title: "외식 수요 회복",
    description: "외식 소비가 살아나며 요식업 실적 기대가 커집니다.",
    sector: "요식업",
    impact: 0.04,
  },
  {
    category: "sector",
    tag: "신용",
    title: "안전자산 선호",
    description: "불확실성 회피 수요가 몰리며 학원채 가격이 오릅니다.",
    sector: "채권",
    impact: 0.03,
  },
  {
    category: "sector",
    tag: "소비",
    title: "악천후 여행 취소",
    description: "이상 기후로 여행 취소가 잇따르며 관광 섹터가 약세입니다.",
    sector: "관광",
    impact: -0.04,
  },
  // ── company ──
  {
    category: "company",
    tag: "수주",
    title: "{company} 대형 수주",
    description: "{company}이(가) 대형 공급 계약을 따내며 실적 기대가 커집니다.",
    impact: 0.065,
  },
  {
    category: "company",
    tag: "신제품",
    title: "{company} 신제품 공개",
    description: "{company}의 신제품 발표가 시장의 호평을 받고 있습니다.",
    impact: 0.05,
  },
  {
    category: "company",
    tag: "실적",
    title: "{company} 어닝 서프라이즈",
    description: "{company}의 분기 실적이 컨센서스를 크게 상회했습니다.",
    impact: 0.055,
  },
  {
    category: "company",
    tag: "실적",
    title: "{company} 실적 쇼크",
    description: "{company}의 분기 실적이 예상을 크게 밑돌았습니다.",
    impact: -0.06,
  },
  {
    category: "company",
    tag: "스캔들",
    title: "{company} 경영 리스크 부각",
    description: "{ceo} {title} 관련 루머가 확산되며 투자 심리가 흔들립니다.",
    impact: -0.055,
    requiresCeo: true,
  },
  {
    category: "company",
    tag: "행보",
    title: "{ceo}의 깜짝 발표",
    description: "{company} {ceo} {title}이(가) 이례적인 공개 행보로 화제를 모읍니다.",
    impact: 0.045,
    requiresCeo: true,
  },
];

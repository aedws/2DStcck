import type { EventTemplate, StockDefinition } from "@/lib/types/market";
import { CSV_COMPANIES } from "@/data/generated";

export const INITIAL_CASH = 10_000_000;

/** 코드 관리 종목 (지수·선물·기본 회사). 캐릭터 회사는 data/companies.csv가 원본. */
const CORE_DEFINITIONS: StockDefinition[] = [
  {
    id: "vnasdaq",
    ticker: "VNAS",
    name: "V-NASDAQ",
    sector: "지수",
    initialPrice: 21000,
    volatility: 0.012,
    drift: 0.001,
    trendStrength: 0.0012,
    description: "가상 시장 대표 100개 종목으로 구성된 기술주 중심 지수.",
    beta: 1,
  },
  {
    id: "vnasfut",
    ticker: "VNSF",
    name: "V-NASDAQ 선물",
    sector: "선물",
    initialPrice: 21200,
    volatility: 0.02,
    drift: 0.001,
    trendStrength: 0.002,
    description: "V-NASDAQ 지수 선물. 지수보다 90초 먼저 움직이는 선행지표.",
    beta: 1,
  },
  {
    id: "vtech",
    ticker: "VTECH",
    name: "Virtual Tech",
    sector: "기술",
    initialPrice: 85000,
    volatility: 0.035,
    drift: 0.0008,
    description: "클라우드와 소비자 플랫폼을 아우르는 종합 기술 기업.",
    beta: 1.3,
  },
  {
    id: "vchip",
    ticker: "VCHP",
    name: "Virtual Semicon",
    sector: "반도체",
    initialPrice: 152000,
    volatility: 0.04,
    drift: 0.0009,
    description: "AI 가속기와 메모리를 설계·양산하는 반도체 기업.",
    beta: 1.5,
  },
  {
    id: "vbatt",
    ticker: "VBAT",
    name: "Virtual Battery",
    sector: "2차전지",
    initialPrice: 37500,
    volatility: 0.045,
    drift: 0.0004,
    description: "전기차·ESS용 차세대 배터리 제조사.",
    beta: 1.4,
  },
  {
    id: "vgame",
    ticker: "VGME",
    name: "Virtual Games",
    sector: "게임",
    initialPrice: 54000,
    volatility: 0.038,
    drift: 0.0006,
    description: "글로벌 히트작을 보유한 게임 퍼블리셔.",
    beta: 1.2,
  },
  {
    id: "venergy",
    ticker: "VNRG",
    name: "Virtual Energy",
    sector: "에너지",
    initialPrice: 42000,
    volatility: 0.028,
    drift: 0.0003,
    description: "정유·신재생을 겸하는 에너지 기업.",
    beta: 0.6,
  },
  {
    id: "vhealth",
    ticker: "VHLT",
    name: "Virtual Health",
    sector: "헬스케어",
    initialPrice: 63000,
    volatility: 0.022,
    drift: 0.0005,
    description: "신약 파이프라인 중심의 바이오·헬스케어 기업.",
    beta: 0.7,
  },
  {
    id: "vretail",
    ticker: "VRTL",
    name: "Virtual Retail",
    sector: "소비재",
    initialPrice: 28000,
    volatility: 0.03,
    drift: 0.0002,
    description: "온·오프라인을 잇는 유통·소비재 기업.",
    beta: 0.9,
  },
  {
    id: "vfinance",
    ticker: "VFIN",
    name: "Virtual Finance",
    sector: "금융",
    initialPrice: 51000,
    volatility: 0.025,
    drift: 0.0004,
    description: "은행·증권·핀테크를 아우르는 금융 지주.",
    beta: 1.1,
  },
  {
    id: "vmedia",
    ticker: "VMDA",
    name: "Virtual Media",
    sector: "미디어",
    initialPrice: 19000,
    volatility: 0.04,
    drift: 0.0001,
    description: "스트리밍과 디지털 광고 기반 미디어 기업.",
    beta: 1.2,
  },
];

/** CSV 회사가 코드 종목과 같은 id면 CSV가 우선한다 */
export const STOCK_DEFINITIONS: StockDefinition[] = [
  ...CORE_DEFINITIONS.filter(
    (c) => !CSV_COMPANIES.some((g) => g.id === c.id),
  ),
  ...CSV_COMPANIES,
];

/** 지수·선물을 제외한 실제 기업 목록 (company 이벤트 대상) */
export function getCompanyDefinitions(): StockDefinition[] {
  return STOCK_DEFINITIONS.filter(
    (d) => d.sector !== "지수" && d.sector !== "선물",
  );
}

/**
 * 이벤트 템플릿.
 * - macro: affectedStockIds 고정 (시장 전반)
 * - sector: 해당 섹터 전 종목 + 지수·선물
 * - company: 생성 시 eventBias 가중 추첨으로 회사 1곳 선택, {company}/{ceo} 치환
 */
export const EVENT_TEMPLATES: EventTemplate[] = [
  // ── macro ──
  {
    category: "macro",
    tag: "금리",
    title: "금리 인하 기대",
    description: "중앙은행의 완화적 통화정책 기대감이 시장 전반에 확산됩니다.",
    affectedStockIds: ["vnasdaq", "vnasfut", "vfinance", "vtech", "vretail"],
    impact: 0.04,
  },
  {
    category: "macro",
    tag: "금리",
    title: "미 금리 동결 실망",
    description: "기대했던 금리 인하가 미뤄지며 위험자산 전반이 약세입니다.",
    affectedStockIds: ["vnasdaq", "vnasfut", "vfinance", "vtech"],
    impact: -0.04,
  },
  {
    category: "macro",
    tag: "위험선호",
    title: "글로벌 위험선호 회복",
    description: "위험자산 선호가 살아나며 성장주 중심으로 반등합니다.",
    affectedStockIds: ["vnasdaq", "vnasfut", "vtech", "vchip", "vgame"],
    impact: 0.035,
  },
  {
    category: "macro",
    tag: "위험선호",
    title: "시장 전반 조정",
    description: "투자 심리 위축으로 전 종목에 조정 압력이 가해집니다.",
    impact: -0.025,
  },
  {
    category: "macro",
    tag: "실적",
    title: "실적 시즌 호조",
    description: "주요 기업들의 분기 실적이 시장 예상을 상회했습니다.",
    affectedStockIds: ["vnasdaq", "vnasfut", "vtech", "vchip", "vfinance", "vhealth"],
    impact: 0.03,
  },
  // ── sector ──
  {
    category: "sector",
    tag: "AI",
    title: "AI 서버 수요 폭증",
    description: "데이터센터 투자 확대에 반도체·기술주가 급등합니다.",
    sector: "반도체",
    impact: 0.06,
  },
  {
    category: "sector",
    tag: "감산",
    title: "반도체 감산 발표",
    description: "주요 업체의 감산으로 메모리 가격 반등 기대가 커집니다.",
    sector: "반도체",
    impact: 0.05,
  },
  {
    category: "sector",
    tag: "수요둔화",
    title: "전기차 판매 부진",
    description: "전방 수요 둔화로 2차전지 섹터에 매도세가 몰립니다.",
    sector: "2차전지",
    impact: -0.055,
  },
  {
    category: "sector",
    tag: "유가",
    title: "유가 급등",
    description: "국제 유가 상승으로 에너지 섹터가 강세를 보입니다.",
    sector: "에너지",
    impact: 0.06,
  },
  {
    category: "sector",
    tag: "규제",
    title: "규제 강화 우려",
    description: "플랫폼 규제 논의로 기술·미디어주에 매도 압력이 나타납니다.",
    sector: "기술",
    impact: -0.05,
  },
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
    tag: "소비",
    title: "소비 둔화",
    description: "소매 판매 지표 부진으로 소비재 섹터가 약세입니다.",
    sector: "소비재",
    impact: -0.04,
  },
  {
    category: "sector",
    tag: "광고",
    title: "광고 수요 감소",
    description: "디지털 광고 지출 축소로 미디어 섹터가 하락합니다.",
    sector: "미디어",
    impact: -0.045,
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

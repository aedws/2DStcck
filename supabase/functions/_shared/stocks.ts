// AUTO-GENERATED from src/data/stocks.ts — edit the original and run `npm run sync:functions`
import type { EventTemplate, StockDefinition } from "./types.ts";
import { CSV_COMPANIES } from "./generated.ts";

export const INITIAL_CASH = 10_000_000;

/** 코드 관리 종목 (시장 코어: 지수·선물). 회사·캐릭터는 data/companies.csv가 원본. */
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
    impact: -0.025,
  },
  {
    category: "macro",
    tag: "실적",
    title: "실적 시즌 호조",
    description: "주요 기업들의 분기 실적이 시장 예상을 상회했습니다.",
    impact: 0.03,
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

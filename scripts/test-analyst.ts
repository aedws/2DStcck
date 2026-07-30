/**
 * 애널리스트 리포트 회귀 테스트 — 결정론적 적정가치 기반 목표주가·투자의견·근거.
 */
import assert from "node:assert";
import {
  computeAnalystDeskOpinions,
  computeAnalystRating,
} from "../src/lib/market/analystRating";

const base = {
  instrumentType: "company" as const,
  initialPrice: 50_000,
  drift: 0.0008,
  volatility: 0.04,
  beta: 1.0,
  sector: "금융",
  quarterlyDividend: 0,
  listingEpochMs: Date.UTC(2026, 6, 11),
  shareMultiplier: 1,
};
const now = Date.UTC(2026, 6, 26);

// 기본: 회사 종목은 리포트가 나오고, 점수·근거 범위가 유효하다.
const mid = computeAnalystRating({ ...base, currentPrice: 50_000 }, now);
assert.ok(mid, "회사 종목은 리포트 생성");
assert.ok(mid.score >= 0 && mid.score <= 4, "점수 0~4");
assert.ok(mid.targetPrice > 0, "목표주가 > 0");
assert.ok(mid.reasons.length >= 1 && mid.reasons.length <= 3, "근거 1~3개");
assert.ok(Number.isFinite(mid.upside), "상승여력 유한");

// 파생·ETF는 리포트 없음.
assert.equal(
  computeAnalystRating(
    { ...base, instrumentType: "etf", currentPrice: 50_000 },
    now,
  ),
  null,
  "ETF는 리포트 없음",
);
assert.equal(
  computeAnalystRating(
    { ...base, instrumentType: "strategy", currentPrice: 50_000 },
    now,
  ),
  null,
  "전략(레버리지 등)은 리포트 없음",
);

// 고평가(적정가치보다 크게 비쌈) → 매도 계열, 상승여력 음수.
const fair = mid.fairValue;
const over = computeAnalystRating({ ...base, currentPrice: fair * 2 }, now);
assert.ok(over, "고평가 리포트");
assert.ok(over.upside < 0, "고평가는 하락여력");
assert.ok(
  over.score <= 1,
  `고평가는 매도 계열이어야: score=${over.score}`,
);
assert.ok(
  over.reasons.some((r) => r.includes("밸류에이션")),
  "고평가 근거에 밸류에이션 부담",
);

// 저평가(적정가치보다 크게 쌈) → 매수 계열, 상승여력 양수.
const under = computeAnalystRating(
  { ...base, currentPrice: Math.round(fair * 0.5) },
  now,
);
assert.ok(under, "저평가 리포트");
assert.ok(under.upside > 0, "저평가는 상승여력");
assert.ok(under.score >= 3, `저평가는 매수 계열이어야: score=${under.score}`);
assert.ok(
  under.reasons.some((r) => r.includes("저평가")),
  "저평가 근거에 가격 매력",
);

// 배당·고변동성 근거가 조건에 맞게 등장.
const dividend = computeAnalystRating(
  { ...base, quarterlyDividend: 300, currentPrice: 50_000 },
  now,
);
assert.ok(
  dividend?.reasons.some((r) => r.includes("배당")),
  "배당 종목은 배당 근거 포함",
);

const desks = computeAnalystDeskOpinions(
  { ...base, currentPrice: Math.round(fair * 0.7) },
  now,
);
assert.equal(desks.length, 6, "기관별 의견 6종");
const burry = desks.find((desk) => desk.id === "michael-burry");
assert.equal(burry?.opinion, "strong_sell", "버리는 상방 여력과 무관하게 숏");
assert.ok(
  (burry?.upside ?? 0) < 0,
  "버리 목표가는 현재가보다 낮아야 한다",
);
const jpMorgan = desks.find((desk) => desk.id === "jp-morgan");
assert.ok(
  (jpMorgan?.targetPrice ?? 0) > under.targetPrice,
  "JP모건은 컨센서스보다 이르고 높은 목표가를 제시",
);
assert.equal(
  new Set(desks.map((desk) => desk.targetPrice)).size,
  desks.length,
  "기관별 목표가가 획일적이지 않아야 한다",
);

console.log(
  `✅ analyst: 회사 리포트·파생 제외·고/저평가 의견·근거 검증 통과 (중립 예시 목표 ${mid.targetPrice})`,
);

/**
 * 예약 확정 국면 '게-트 대전쟁' 회귀 테스트.
 * - 시작 전/진행/종료 스케줄이 정확한지
 * - 섹터·진영별 수익률 부호가 시나리오와 맞는지(방산·식품·금·학원채 진영별)
 * - 각 단계 시작에 뉴스 이벤트가 한 번씩 생성되는지
 */
import assert from "node:assert";
import {
  WAR_START_SESSION,
  WAR_WINNER,
  WAR_LOSER,
  SCHEDULED_WAR_DURATION_SESSIONS,
  SCHEDULED_WAR_PHASES,
  SCHEDULED_WAR_REGIONS,
  getActiveScheduledWar,
  getScheduledWarFrontline,
  scheduledWarReturnForStock,
  getScheduledWarEventsForSession,
} from "../src/lib/market/scheduledWar";
import type { StockDefinition } from "../src/lib/types/market";

// ── 스케줄 경계 ──
assert.equal(getActiveScheduledWar(WAR_START_SESSION - 1), null, "시작 전은 비활성");
assert.ok(getActiveScheduledWar(WAR_START_SESSION), "시작 세션은 활성");
assert.equal(
  getActiveScheduledWar(WAR_START_SESSION + SCHEDULED_WAR_DURATION_SESSIONS),
  null,
  "종료 후는 비활성",
);
assert.equal(
  getActiveScheduledWar(WAR_START_SESSION)!.phase.id,
  "outbreak",
  "첫 단계는 개전",
);
assert.ok(
  WAR_WINNER !== WAR_LOSER && ["gehenna", "trinity"].includes(WAR_WINNER),
  "승/패 진영이 결정론적으로 갈린다",
);
assert.equal(SCHEDULED_WAR_REGIONS.length, 18, "대전쟁 전역은 18개 지역");
assert.equal(
  new Set(SCHEDULED_WAR_REGIONS.map((region) => region.id)).size,
  SCHEDULED_WAR_REGIONS.length,
  "지역 ID는 중복되지 않는다",
);

// ── 홈 전황판: 점유율은 항상 100%, 전 계정에서 세션별로 동일 ──
const regionalSnapshots = new Set<string>();
for (
  let session = WAR_START_SESSION;
  session < WAR_START_SESSION + SCHEDULED_WAR_DURATION_SESSIONS;
  session++
) {
  const active = getActiveScheduledWar(session)!;
  const frontline = getScheduledWarFrontline(active);
  assert.equal(
    Math.round((frontline.gehennaControl + frontline.trinityControl) * 1_000),
    100_000,
    "진영 점유율 합계는 100%",
  );
  assert.ok(
    frontline.gehennaControl >= 20 && frontline.gehennaControl <= 80,
    "게헨나 점유율 표시 범위",
  );
  assert.equal(
    frontline.regions.length,
    SCHEDULED_WAR_REGIONS.length,
    "모든 전쟁 지역 표시",
  );
  assert.equal(
    frontline.gehennaRegions +
      frontline.trinityRegions +
      frontline.contestedRegions,
    SCHEDULED_WAR_REGIONS.length,
    "지역 상태 합계",
  );
  assert.deepEqual(
    getScheduledWarFrontline(active).regions,
    frontline.regions,
    "같은 전역 세션은 모든 호출에서 동일한 점령 상황",
  );
  regionalSnapshots.add(
    frontline.regions.map((region) => region.controller).join(","),
  );
  assert.ok(frontline.headline.length > 0 && frontline.situation.length > 0);
}
assert.ok(regionalSnapshots.size >= 4, "전쟁 진행에 따라 지역 점령 상황이 변화");
assert.equal(
  getScheduledWarFrontline(getActiveScheduledWar(WAR_START_SESSION)!).leader,
  null,
  "개전 첫 거래일은 백중세",
);
assert.equal(
  getScheduledWarFrontline(
    getActiveScheduledWar(WAR_START_SESSION + 3)!,
  ).leader,
  WAR_WINNER,
  "전면전부터 결정론적 우세 진영 표시",
);
const finalFrontline = getScheduledWarFrontline(
  getActiveScheduledWar(
    WAR_START_SESSION + SCHEDULED_WAR_DURATION_SESSIONS - 1,
  )!,
);
assert.ok(
  (WAR_WINNER === "gehenna"
    ? finalFrontline.gehennaRegions
    : finalFrontline.trinityRegions) >
    (WAR_LOSER === "gehenna"
      ? finalFrontline.gehennaRegions
      : finalFrontline.trinityRegions),
  "종전 뒤 승리 진영이 더 많은 지역을 점령",
);

const stock = (over: Partial<StockDefinition>): StockDefinition =>
  ({
    id: "x",
    ticker: "X",
    name: "x",
    instrumentType: "company",
    sector: "기술",
    initialPrice: 10000,
    volatility: 0.05,
    drift: 0,
    beta: 1,
    ...over,
  }) as StockDefinition;

const SESSION_SECONDS = 3600;
const ret = (s: StockDefinition, session: number) => {
  const active = getActiveScheduledWar(session)!;
  return scheduledWarReturnForStock(active, s, SESSION_SECONDS);
};

const outbreak = WAR_START_SESSION; // 개전
const armistice =
  WAR_START_SESSION + 3 + 5 + 3; // outbreak(3)+fullwar(5)+stalemate(3) → 종전 시작

// ── 개전 단계 부호 ──
const normal = stock({ id: "generic", sector: "기술", beta: 1.2 });
const defense = stock({ id: "bahbk", sector: "방산", beta: 1.1 });
const foodProd = stock({ id: "carrot", sector: "식품·외식", subsector: "농축산물 생산·판매" });
const foodDining = stock({ id: "tehty", sector: "식품·외식", subsector: "다이닝 프랜차이즈·식자재 유통" });
const gold = stock({ id: "gldx", sector: "ETF", subsector: "금 ETF", beta: -0.1 });
const shortBond = stock({ id: "sbnd", sector: "ETF", subsector: "단기채 ETF" });
const gehennaBond = stock({ id: "baghb", sector: "채권", subsector: "학원채" });
const trinityBond = stock({ id: "batrb", sector: "채권", subsector: "학원채" });
const abydosBond = stock({ id: "baabb", sector: "채권", subsector: "학원채" });
const millenniumBond = stock({ id: "bamlb", sector: "채권", subsector: "학원채" });

assert.ok(ret(normal, outbreak) < 0, "개전: 일반주 하락");
assert.ok(ret(defense, outbreak) > 0, "개전: 방산 급등");
assert.ok(ret(foodProd, outbreak) > 0, "개전: 식품 생산 급등");
assert.ok(ret(foodDining, outbreak) < 0, "개전: 외식은 일반주처럼 하락(생산만 수혜)");
assert.ok(ret(gold, outbreak) > 0, "개전: 금 급등");
assert.ok(ret(shortBond, outbreak) > 0, "개전: 단기채 급등");
assert.ok(ret(millenniumBond, outbreak) > 0, "개전: 밀레니엄 학원채 급등");
assert.ok(ret(abydosBond, outbreak) < 0, "개전: 아비도스 학원채 폭락");

// ── 종전 단계 부호 ──
assert.ok(ret(defense, armistice) < 0, "종전: 방산 폭락");
assert.ok(ret(normal, armistice) > 0, "종전: 일반주 반등");
const winnerBond = WAR_WINNER === "gehenna" ? gehennaBond : trinityBond;
const loserBond = WAR_WINNER === "gehenna" ? trinityBond : gehennaBond;
assert.ok(ret(winnerBond, armistice) > 0, "종전: 승리 진영 학원채 폭등");
assert.ok(ret(loserBond, armistice) < 0, "종전: 패배 진영 학원채 폭락");

// ── 이벤트: 각 단계 시작 세션에 1건, 그 외엔 0건 ──
let starts = 0;
for (let s = WAR_START_SESSION; s < WAR_START_SESSION + SCHEDULED_WAR_DURATION_SESSIONS; s++) {
  const evs = getScheduledWarEventsForSession(s);
  starts += evs.length;
  assert.ok(evs.length <= 1, "단계 시작마다 최대 1건");
}
assert.equal(starts, SCHEDULED_WAR_PHASES.length, "단계 수만큼 이벤트 생성");
assert.equal(
  getScheduledWarEventsForSession(WAR_START_SESSION - 1).length,
  0,
  "시작 전 이벤트 없음",
);

console.log(
  `✅ scheduled-war: 스케줄·섹터/진영 부호·이벤트 검증 통과 (승리 진영 ${WAR_WINNER}, ${SCHEDULED_WAR_DURATION_SESSIONS}거래일)`,
);

import assert from "node:assert/strict";
import {
  calculateCoveredCallDistribution,
  COVERED_CALL_INTERVAL_DAYS,
  MAX_DISTRIBUTION_CATCHUP_PERIODS,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
  settleDistributionSchedule,
} from "../src/lib/market/distributions.ts";
import {
  MAX_SALARY_CATCHUP_PERIODS,
  SALARY_AMOUNT,
  SALARY_INTERVAL_DAYS,
  settleSalary,
} from "../src/lib/market/salary.ts";

const beforeMonthly = settleDistributionSchedule(
  100,
  119,
  COVERED_CALL_INTERVAL_DAYS,
);
assert.deepEqual(beforeMonthly.dueSessions, []);
assert.equal(beforeMonthly.lastSession, 100);

const monthly = settleDistributionSchedule(
  100,
  225,
  COVERED_CALL_INTERVAL_DAYS,
);
// 6주기 미지급이어도 최근 MAX 주기만 현금 지급, 체크포인트는 전부 전진
assert.deepEqual(monthly.dueSessions, [180, 200, 220]);
assert.equal(monthly.lastSession, 220);
assert.equal(monthly.dueSessions.length, MAX_DISTRIBUTION_CATCHUP_PERIODS);
assert.deepEqual(
  settleDistributionSchedule(
    monthly.lastSession,
    225,
    COVERED_CALL_INTERVAL_DAYS,
  ).dueSessions,
  [],
);

const quarterly = settleDistributionSchedule(
  100,
  225,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
);
assert.deepEqual(quarterly.dueSessions, [160, 220]);
assert.equal(quarterly.lastSession, 220);

const firstDistribution = calculateCoveredCallDistribution(
  10_000,
  12,
  "vncc",
  120,
);
const retriedDistribution = calculateCoveredCallDistribution(
  10_000,
  12,
  "vncc",
  120,
);
assert.equal(firstDistribution, retriedDistribution);
assert.ok(firstDistribution >= 85 && firstDistribution <= 115);

const weekly = settleDistributionSchedule(
  100,
  116,
  SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
);
assert.deepEqual(weekly.dueSessions, [105, 110, 115]);
assert.equal(weekly.lastSession, 115);
const singleStockDistribution = calculateCoveredCallDistribution(
  10_000,
  40,
  "baridc-covered-call",
  105,
  SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
);
assert.ok(singleStockDistribution >= 70 && singleStockDistribution <= 97);

const salary = settleSalary(100, 145);
assert.equal(salary.periods, 2);
assert.equal(salary.lastSalarySession, 140);
assert.equal(salary.amount, SALARY_AMOUNT * 2);

// 체크포인트 회귀(0)로 수천 회차가 쌓여도 현금은 상한만 지급하고 체크포인트는 따라잡는다.
const flooded = settleSalary(0, 1000);
assert.equal(flooded.periods, MAX_SALARY_CATCHUP_PERIODS);
assert.equal(flooded.amount, SALARY_AMOUNT * MAX_SALARY_CATCHUP_PERIODS);
assert.equal(
  flooded.lastSalarySession,
  Math.floor(1000 / SALARY_INTERVAL_DAYS) * SALARY_INTERVAL_DAYS,
);
assert.deepEqual(settleSalary(flooded.lastSalarySession, 1000).periods, 0);

const floodedDist = settleDistributionSchedule(0, 1000, COVERED_CALL_INTERVAL_DAYS);
assert.equal(floodedDist.dueSessions.length, MAX_DISTRIBUTION_CATCHUP_PERIODS);
assert.equal(
  floodedDist.lastSession,
  Math.floor(1000 / COVERED_CALL_INTERVAL_DAYS) * COVERED_CALL_INTERVAL_DAYS,
);

console.log("cashflow schedule scenarios passed");

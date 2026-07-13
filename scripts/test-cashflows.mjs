import assert from "node:assert/strict";
import {
  calculateCoveredCallDistribution,
  COVERED_CALL_INTERVAL_DAYS,
  QUARTERLY_DIVIDEND_INTERVAL_DAYS,
  SINGLE_STOCK_COVERED_CALL_INTERVAL_DAYS,
  settleDistributionSchedule,
} from "../src/lib/market/distributions.ts";
import {
  SALARY_AMOUNT,
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
assert.deepEqual(monthly.dueSessions, [120, 140, 160, 180, 200, 220]);
assert.equal(monthly.lastSession, 220);
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

console.log("cashflow schedule scenarios passed");

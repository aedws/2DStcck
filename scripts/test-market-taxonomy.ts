import assert from "node:assert";
import { STOCK_DEFINITIONS, getCompanyDefinitions } from "../src/data/stocks";
import { resolveEventTemplate } from "../src/lib/market/engine";
import {
  COMPANY_SECTOR_ORDER,
  economicSectorsForStock,
  fundFilterLabel,
  instrumentTypeOf,
  strategyFilterLabel,
} from "../src/lib/market/taxonomy";

const byId = new Map(STOCK_DEFINITIONS.map((stock) => [stock.id, stock]));
const companies = getCompanyDefinitions();

assert.equal(companies.length, 54);
assert.deepEqual(
  [...new Set(companies.map((stock) => stock.sector))].sort((a, b) =>
    a.localeCompare(b, "ko"),
  ),
  [...COMPANY_SECTOR_ORDER].sort((a, b) => a.localeCompare(b, "ko")),
);

const countBy = <T>(items: T[], keyOf: (item: T) => string) => {
  const counts = new Map<string, number>();
  for (const item of items) {
    const key = keyOf(item);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return counts;
};

const instrumentCounts = countBy(STOCK_DEFINITIONS, instrumentTypeOf);
assert.equal(instrumentCounts.get("company"), 54);
assert.equal(instrumentCounts.get("etf"), 8);
assert.equal(instrumentCounts.get("strategy"), 247);
assert.equal(instrumentCounts.get("index"), 1);
assert.equal(instrumentCounts.get("future"), 1);

const strategies = STOCK_DEFINITIONS.filter(
  (stock) => instrumentTypeOf(stock) === "strategy",
);
const strategyCounts = countBy(strategies, strategyFilterLabel);
assert.equal(strategyCounts.get("레버리지"), 64);
assert.equal(strategyCounts.get("인버스"), 64);
assert.equal(strategyCounts.get("곱버스"), 64);
assert.equal(strategyCounts.get("커버드콜"), 55);

const funds = STOCK_DEFINITIONS.filter(
  (stock) => instrumentTypeOf(stock) === "etf",
);
const fundCounts = countBy(funds, (stock) => fundFilterLabel(stock.fundType));
assert.equal(fundCounts.get("종합·성장"), 2);
assert.equal(fundCounts.get("섹터"), 2);
assert.equal(fundCounts.get("채권"), 2);
assert.equal(fundCounts.get("원자재"), 1);
assert.equal(fundCounts.get("배당·인컴"), 1);

const defenseEvent = resolveEventTemplate(
  {
    category: "sector",
    sector: "방산",
    tag: "지정학",
    title: "방산 사건",
    description: "방산 시장 태그 보존 검사",
    impact: 0.05,
  },
  Date.UTC(2026, 6, 25),
  () => 0.5,
);
assert.deepEqual(
  defenseEvent?.affectedStockIds.sort(),
  ["bahbk", "bakaya", "baridc"],
);

const semiconductorEtf = byId.get("semix");
assert.ok(semiconductorEtf);
assert.deepEqual(
  [...economicSectorsForStock(semiconductorEtf, byId)],
  ["반도체"],
);

const nagusaLeverage = byId.get("nagusa-leverage-2x");
assert.ok(nagusaLeverage);
assert.deepEqual(
  [...economicSectorsForStock(nagusaLeverage, byId)],
  ["식품·외식"],
);

console.log("market sector · ETF · strategy taxonomy scenarios passed");

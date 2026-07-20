import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { STOCK_DEFINITIONS } from "../src/data/stocks";
import {
  getShareStructure,
  isSupplyLimitedStock,
} from "../src/lib/market/shareSupply";

const limited = STOCK_DEFINITIONS.filter(isSupplyLimitedStock);
assert.ok(limited.length > 0, "보통주가 있어야 한다");

for (const stock of limited) {
  const structure = getShareStructure(stock);
  assert.ok(structure, `${stock.ticker}: 자본 구조 누락`);
  assert.ok(structure.issuedShares > 0, `${stock.ticker}: 발행주식수`);
  assert.ok(structure.floatShares > 0, `${stock.ticker}: 유통주식수`);
  assert.ok(
    structure.floatShares <= structure.issuedShares,
    `${stock.ticker}: 유통주식수가 발행주식수를 초과`,
  );
}

for (const stock of STOCK_DEFINITIONS.filter(
  (item) => ["ETF", "채권", "지수", "선물"].includes(item.sector),
)) {
  assert.equal(isSupplyLimitedStock(stock), false, `${stock.ticker}: 무제한 상품`);
}

const sql = readFileSync(
  new URL("../supabase/migrations/20260720190000_stock_supply.sql", import.meta.url),
  "utf8",
);
for (const stock of limited) {
  assert.match(sql, new RegExp(`\\('${stock.id}', '${stock.ticker}',`));
}
assert.match(sql, /create or replace function public\.adjust_stock_supply/);
assert.match(sql, /create or replace function public\.apply_stock_split/);

console.log(`✅ stock-supply: ${limited.length}개 보통주 자본 구조·SQL 시드 일치`);

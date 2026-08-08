import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { STOCK_DEFINITIONS } from "../src/data/stocks";
import { isDelisted, isListed, isUpcomingIpo } from "../src/lib/market/ipo";

const delistingMs = Date.UTC(2026, 7, 9, 0, 0);
const expectedPrices: Record<string, number> = {
  lcid: 11900,
  "lcid-inverse": 1448,
  "lcid-inverse-2x": 1607,
  "lcid-leverage-2x": 2251,
};

for (const [stockId, settlementPrice] of Object.entries(expectedPrices)) {
  const stock = STOCK_DEFINITIONS.find((candidate) => candidate.id === stockId);
  assert.ok(stock, `${stockId} definition required`);
  assert.equal(stock.delistingEpochMs, delistingMs);
  assert.equal(stock.delistingPrice, settlementPrice);
  assert.equal(isListed(stock, delistingMs - 1), true);
  assert.equal(isListed(stock, delistingMs), false);
  assert.equal(isDelisted(stock, delistingMs), true);
  assert.equal(isUpcomingIpo(stock, delistingMs), false);
}

const migration = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/20260809050000_apply_remaining_feedback.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
assert.match(migration, /lcid-safe-delisting-20260809/);
assert.match(migration, /game_saves_20_safe_player_company_delistings/);
assert.match(migration, /562,772,694,035,191/);
assert.match(migration, /delisted_at is null/);

const ledgerMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/20260809051000_persist_player_company_delisting_settlements.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
assert.match(ledgerMigration, /player_company_delisting_settlements/);
assert.match(ledgerMigration, /v_ledger_applied/);
assert.match(ledgerMigration, /primary key \(user_id, stock_id\)/);

console.log("safe player-company delisting tests passed");

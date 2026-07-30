import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  exactOwnershipPercent,
  formatExactShareQuantity,
} from "../src/lib/supabase/playerCompanyOwnership";

assert.equal(exactOwnershipPercent("600000", "1000000"), 60);
assert.equal(exactOwnershipPercent("333333.333333", "1000000"), 33.333333);
assert.equal(
  exactOwnershipPercent("900719925474099300000", "1801439850948198600000"),
  50,
);
assert.equal(formatExactShareQuantity("1234567890.25"), "1,234,567,890.25");

const migrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260731050000_player_company_actual_founder_ownership.sql",
    import.meta.url,
  ),
);
const migration = readFileSync(migrationPath, "utf8");

assert.match(migration, /player_company_account_holding_quantity/);
assert.match(migration, /get_player_company_founder_ownership_summary/);
assert.match(migration, /v_founder \* 100 \/ v_total/);
assert.match(migration, /v_founder \+ v_eligible_others/);
assert.match(migration, /held_since_session <= v_session - 90/);
assert.match(
  migration,
  /v_weight := public\.player_company_account_holding_quantity/,
);
assert.doesNotMatch(
  migration,
  /v_state\.total_shares\s*-\s*v_state\.public_shares/,
);

console.log("player company ownership tests passed");

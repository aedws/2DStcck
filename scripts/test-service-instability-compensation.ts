import assert from "node:assert";
import { readFileSync } from "node:fs";
import {
  SERVER_INSTABILITY_COMPENSATION_CENTS,
  SERVER_INSTABILITY_COMPENSATION_DEADLINE_MS,
  SERVER_INSTABILITY_COMPENSATION_ID,
  parseServiceCompensationClaimResult,
} from "../src/lib/market/serviceCompensation";

assert.equal(SERVER_INSTABILITY_COMPENSATION_ID, "server-instability-20260814");
assert.equal(SERVER_INSTABILITY_COMPENSATION_CENTS, 10_000_000_000);
assert.equal(
  new Date(SERVER_INSTABILITY_COMPENSATION_DEADLINE_MS).toISOString(),
  "2026-08-14T14:59:59.999Z",
);

assert.deepEqual(
  parseServiceCompensationClaimResult({
    status: "granted",
    amountCents: 10_000_000_000,
    walletRevision: 42,
  }),
  {
    status: "granted",
    amountCents: 10_000_000_000,
    walletRevision: 42,
    message: undefined,
  },
);

assert.equal(
  parseServiceCompensationClaimResult({ status: "unknown" }).status,
  "error",
);

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260809053000_server_instability_login_compensation.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(migration, /v_amount_cents constant numeric := 10000000000/);
assert.match(migration, /2026-08-14 14:59:59\.999\+00/);
assert.match(
  migration,
  /claim_server_instability_compensation_20260814/,
);
assert.match(migration, /primary key \(compensation_id, user_id\)/);

console.log("server instability compensation contract tests passed");

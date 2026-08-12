import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  isServiceRebuildPublicPath,
  isServiceRebuildClosed,
  SERVICE_REBUILD_CUTOFF_MS,
  serviceUpdateHref,
} from "../src/lib/serviceShutdown";

assert.equal(
  SERVICE_REBUILD_CUTOFF_MS,
  Date.parse("2026-08-09T15:00:00.000Z"),
  "자정 KST가 15:00 UTC로 고정되어야 한다",
);
assert.equal(isServiceRebuildClosed(SERVICE_REBUILD_CUTOFF_MS - 1), false);
assert.equal(isServiceRebuildClosed(SERVICE_REBUILD_CUTOFF_MS), true);
assert.equal(serviceUpdateHref(), "https://vstock-v2.vstock-market.workers.dev/");
assert.equal(serviceUpdateHref("/2DStock/"), "https://vstock-v2.vstock-market.workers.dev/");
assert.equal(isServiceRebuildPublicPath("/service-update"), false);
assert.equal(isServiceRebuildPublicPath("/2DStock/service-update/"), false);
assert.equal(isServiceRebuildPublicPath("/login"), false);
assert.equal(isServiceRebuildPublicPath("/2DStock/login/"), false);
assert.equal(isServiceRebuildPublicPath("/admin"), true);
assert.equal(isServiceRebuildPublicPath("/2DStock/admin/"), true);
assert.equal(isServiceRebuildPublicPath("/"), false);
assert.equal(isServiceRebuildPublicPath("/trade"), false);

const feedbackMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260809113000_keep_v2_feedback_open.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(feedbackMigration, /tg_table_name = 'feedback'/);
assert.doesNotMatch(feedbackMigration, /tg_table_name = 'game_saves'/);
assert.doesNotMatch(feedbackMigration, /tg_table_name = 'bug_reports'/);

const feedbackOnlyUnlockMigration = readFileSync(
  new URL(
    "../supabase/migrations/20260810013000_unprotect_feedback_only.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(
  feedbackOnlyUnlockMigration,
  /drop trigger if exists service_rebuild_shutdown_guard on public\.feedback/i,
);
assert.doesNotMatch(feedbackOnlyUnlockMigration, /game_saves|player_companies|stock_requests/i);

console.log("service shutdown cutoff tests passed");

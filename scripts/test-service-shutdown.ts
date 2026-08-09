import assert from "node:assert/strict";
import {
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
assert.equal(serviceUpdateHref(), "/service-update/");
assert.equal(serviceUpdateHref("/2DStock/"), "/2DStock/service-update/");

console.log("service shutdown cutoff tests passed");


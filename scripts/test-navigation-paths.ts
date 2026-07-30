import assert from "node:assert/strict";

import {
  isPortfolioPath,
  isTradePath,
  normalizePathname,
} from "../src/lib/navigation/paths";

assert.equal(normalizePathname("/trade/"), "/trade");
assert.equal(normalizePathname("/portfolio/"), "/portfolio");
assert.equal(normalizePathname("/"), "/");
assert.equal(isTradePath("/trade/"), true);
assert.equal(isTradePath("/stock/carrot/"), true);
assert.equal(isTradePath("/amc/trade/"), true);
assert.equal(isPortfolioPath("/portfolio/"), true);
assert.equal(isPortfolioPath("/trade/"), false);

console.log("navigation trailing-slash scenarios passed");

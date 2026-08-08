import assert from "node:assert/strict";
import {
  getActivePreferredShares,
  isPreferredActive,
  reconcilePreferredShares,
} from "../src/lib/player/preferredShares";
import type { CharacterConcentration } from "../src/lib/market/characterConcentration";
import type { PreferredShare } from "../src/lib/types/market";

const share: PreferredShare = {
  characterId: "chr_test",
  companyId: "test",
  ticker: "TEST",
  companyName: "Test",
  emoji: "🎖️",
  shares: 2,
  faceValue: 100,
  dividendPerShare: 400,
  issuedSession: 1,
  issuedAt: 1,
  lastIssuedSession: 1,
};

const diversified: CharacterConcentration = {
  ranked: [],
  heldCount: 5,
  topCharacterShare: 0,
  topTwoCharacterShare: 0,
  topThreeCharacterShare: 0,
  oneAndOnly: false,
  twinStar: false,
  tripleHarmonia: false,
  focusedCharacterIds: [],
};

const result = reconcilePreferredShares(
  {},
  [share],
  [share.characterId, "historical-missing"],
  10,
  10,
  {
    stocks: [],
    concentration: diversified,
  },
);

assert.equal(result.shares[0]?.shares, 2);
assert.equal(result.issuedCharacterIds.includes("historical-missing"), true);
assert.equal(getActivePreferredShares(result.shares, diversified).length, 1);
assert.equal(isPreferredActive(share, diversified), true);

console.log("preferred-share preservation tests passed");

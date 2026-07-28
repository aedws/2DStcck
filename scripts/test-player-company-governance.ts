import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  getPlayerCompanyDecisionEventsForSession,
  setPlayerCompanyMarketActions,
  type PlayerCompanyMarketAction,
} from "../src/lib/market/playerCompanyMarketActions";
import {
  MARKET_EPOCH_MS,
  SESSION_DURATION_MS,
} from "../src/lib/market/constants";
import {
  PLAYER_COMPANY_LONG_TERM_VOTE_SESSIONS,
  PLAYER_COMPANY_QUARTER_SESSIONS,
  PLAYER_COMPANY_VOTE_WINDOW_SESSIONS,
} from "../src/lib/supabase/playerCompanyGovernance";

assert.equal(PLAYER_COMPANY_QUARTER_SESSIONS, 24);
assert.equal(PLAYER_COMPANY_VOTE_WINDOW_SESSIONS, 24);
assert.equal(PLAYER_COMPANY_LONG_TERM_VOTE_SESSIONS, 90);

const session = Math.floor(MARKET_EPOCH_MS / SESSION_DURATION_MS) + 48;
const action: PlayerCompanyMarketAction = {
  id: "board-result",
  sequence: 1,
  stockId: "player-test",
  ticker: "PLAY",
  actionType: "board",
  shares: 0,
  totalSharesBefore: 100_000,
  publicSharesBefore: 40_000,
  totalSharesAfter: 100_000,
  publicSharesAfter: 40_000,
  priceFactor: 1.04,
  priceCents: 1,
  effectiveTick:
    (session * SESSION_DURATION_MS - MARKET_EPOCH_MS) / 1_000,
  createdAt: new Date(session * SESSION_DURATION_MS).toISOString(),
  headline: "PLAY 분기 실적 · 연구개발 성과",
  description: "다음 분기 매출 성장률에 +4.5%p 반영됐습니다.",
  earningsGrowthDelta: 4.5,
  reputationDelta: 4,
};
setPlayerCompanyMarketActions([action]);
const events = getPlayerCompanyDecisionEventsForSession(session);
assert.equal(events.length, 1);
assert.equal(events[0].tag, "분기 실적");
assert.ok(Math.abs(events[0].impact - 0.04) < 1e-9);
assert.match(events[0].description, /성장률/);

const migrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260729010000_player_company_governance_cycle.sql",
    import.meta.url,
  ),
);
const migration = readFileSync(migrationPath, "utf8");
assert.match(migration, /v_resolve_session := v_session \+ 24/);
assert.match(migration, /held_since_session <= v_session - 90/);
assert.match(migration, /p_vote not in \('yes', 'no'\)/);
assert.match(migration, /v_value > 0\.5/);
assert.match(migration, /v_value > 0\.2/);
assert.match(migration, /player_company_governance_votes/);
assert.match(migration, /apply_player_company_reputation/);
assert.match(migration, /earnings_growth_delta/);

setPlayerCompanyMarketActions([]);
console.log("player company governance tests passed");

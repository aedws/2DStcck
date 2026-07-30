import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  advancePlayerCompanyManagement,
  announcePlayerCompanyGuidance,
  choosePlayerCompanyCrisisStrategy,
  createPlayerCompanyManagement,
  issuePlayerCompanyBond,
  playerCompanyCreditRating,
  playerCompanyCreditScore,
  setPlayerCompanyRegularDividendPolicy,
  setPlayerCompanyStockOptionPolicy,
  signPlayerCompanySupplyContract,
  PLAYER_COMPANY_QUARTER_SESSIONS,
} from "../src/lib/player/playerCompanyManagement";

const context = {
  companyId: "player-test",
  ticker: "TEST",
  sector: "기술",
  capital: 100_000_000_000,
  reputation: 20,
  currentSession: 100,
};

let management = createPlayerCompanyManagement(context);
assert.equal(management.nextRegularDividendSession, 124);
assert.equal(
  playerCompanyCreditRating(playerCompanyCreditScore(management, context)),
  "AAA",
);

const guidance = announcePlayerCompanyGuidance(
  management,
  context,
  -20,
  -30,
);
assert.equal(guidance.success, true);
management = guidance.management;
assert.equal(management.guidance?.resolveSession, 124);

const bond = issuePlayerCompanyBond(management, context, 0.1, 3);
assert.equal(bond.success, true);
management = bond.management;
assert.equal(management.debt, 10_000_000_000);
assert.equal(management.bonds[0].maturitySession, 196);
assert.equal(
  issuePlayerCompanyBond(management, context, 0.1, 3).success,
  false,
  "같은 거래일 회사채 반복 발행을 막아야 합니다.",
);

const contract = signPlayerCompanySupplyContract(
  management,
  context,
  "semiconductor",
);
assert.equal(contract.success, true);
management = contract.management;
assert.ok(management.supplyResilience > 20);

const options = setPlayerCompanyStockOptionPolicy(
  management,
  context,
  0.05,
);
assert.equal(options.success, true);
management = options.management;
assert.equal(management.stockOptionPoolRate, 0.05);

const regularDividend = setPlayerCompanyRegularDividendPolicy(
  management,
  context,
  true,
  0.01,
);
assert.equal(regularDividend.success, true);
management = regularDividend.management;
assert.equal(management.regularDividendEnabled, true);

const crisis = choosePlayerCompanyCrisisStrategy(
  management,
  context,
  "crisis-1",
  "글로벌 신용 경색",
  "cash-defense",
);
assert.equal(crisis.success, true);
management = crisis.management;
assert.equal(
  management.crisisDecisions.some(
    (decision) => decision.crisisKey === "crisis-1",
  ),
  true,
);
assert.equal(
  choosePlayerCompanyCrisisStrategy(
    management,
    context,
    "crisis-1",
    "글로벌 신용 경색",
    "restructuring",
  ).success,
  false,
);

const advanced = advancePlayerCompanyManagement(management, {
  ...context,
  currentSession: context.currentSession + PLAYER_COMPANY_QUARTER_SESSIONS,
});
assert.equal(advanced.success, true);
assert.equal(advanced.management.guidance?.status, "met");
assert.ok(advanced.management.guidanceCredibility > 70);

const activistMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/20260731040000_company_strategy_activist_votes.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
assert.match(activistMigration, /ceo_change/);
assert.match(activistMigration, /asset_sale/);
assert.match(activistMigration, /player_company_activist_result_trigger/);
assert.match(activistMigration, /price_factor = v_factor/);

const marketEventMigration = readFileSync(
  fileURLToPath(
    new URL(
      "../supabase/migrations/20260731041000_company_strategy_market_events.sql",
      import.meta.url,
    ),
  ),
  "utf8",
);
assert.match(marketEventMigration, /record_player_company_strategy_event/);
assert.match(marketEventMigration, /management,history/);
assert.match(marketEventMigration, /when 'positive' then 1\.05/);
assert.match(marketEventMigration, /player_company_market_actions/);

console.log("player company management tests passed");

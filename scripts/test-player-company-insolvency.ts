import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const migrationPath = fileURLToPath(
  new URL(
    "../supabase/migrations/20260731060000_player_company_insolvency_control.sql",
    import.meta.url,
  ),
);
const migration = readFileSync(migrationPath, "utf8");

assert.match(migration, /create table if not exists public\.player_company_control_rights/);
assert.match(migration, /original_founder_id uuid not null/);
assert.match(migration, /controller_id uuid not null/);
assert.match(
  migration,
  /option_type in \('rehabilitation', 'trust', 'rescue-loan', 'm-and-a'\)/,
);
assert.match(migration, /v_resolves := v_session \+ 24/);
assert.match(migration, /floor\(v_total \* 0\.10\)/);
assert.match(migration, /v_case\.rescue_loan_cents \* 1\.15/);
assert.match(migration, /round\(v_capital \* 0\.25\)/);
assert.match(migration, /set status = 'auction'/);
assert.match(migration, /set controller_id = v_buyer/);
assert.match(migration, /control_source = 'm-and-a'/);
assert.match(migration, /player_company_effective_voting_weight/);
assert.match(
  migration,
  /public\.player_company_account_holding_quantity\(p_user_id, p_stock_id\) \+/,
);

// 권한은 현재 경영권자에게, 분기 실적과 주총 결과는 원 법인 장부에 귀속한다.
assert.match(
  migration,
  /where stock_id = v_stock_id and controller_id = v_user/,
);
assert.match(
  migration,
  /v_control\.original_founder_id,\s+p_decision_type/,
);
assert.match(
  migration,
  /v_control\.original_founder_id,\s+p_proposal_type/,
);
assert.match(migration, /player_company_finish_recovery/);

const panelPath = fileURLToPath(
  new URL(
    "../src/components/company/PlayerCompanyInsolvencyPanel.tsx",
    import.meta.url,
  ),
);
const panel = readFileSync(panelPath, "utf8");
assert.match(panel, /법인 회생 관리/);
assert.match(panel, /지분 보호 신탁/);
assert.match(panel, /긴급 회생대출/);
assert.match(panel, /공개매각·M&A/);
assert.match(panel, /운영 회사 포트폴리오/);
assert.match(panel, /PlayerCompanyBoardPanel/);
assert.match(panel, /PlayerCompanyGovernancePanel/);
assert.match(panel, /개인 지갑을 직접 차감하는 발행·배당·소각 버튼/);

console.log("player company insolvency tests passed");

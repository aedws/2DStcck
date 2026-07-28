import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LONG_TERM_SHAREHOLDER_SESSIONS,
  SHAREHOLDER_LETTER_BODY_MAX_LENGTH,
  SHAREHOLDER_LETTER_COOLDOWN_SESSIONS,
  SHAREHOLDER_LETTER_TITLE_MAX_LENGTH,
  isLongTermShareholder,
  nextShareholderLetterSession,
  validateShareholderLetterDraft,
} from "../src/lib/player/shareholderLetters";

assert.equal(LONG_TERM_SHAREHOLDER_SESSIONS, 20);
assert.equal(SHAREHOLDER_LETTER_COOLDOWN_SESSIONS, 20);
assert.equal(SHAREHOLDER_LETTER_TITLE_MAX_LENGTH, 80);
assert.equal(SHAREHOLDER_LETTER_BODY_MAX_LENGTH, 500);

assert.equal(
  isLongTermShareholder({
    quantity: 1,
    heldSinceSession: 100,
    currentSession: 119,
  }),
  false,
);
assert.equal(
  isLongTermShareholder({
    quantity: 1,
    heldSinceSession: 100,
    currentSession: 120,
  }),
  true,
);
assert.equal(
  isLongTermShareholder({
    quantity: 0.999999,
    heldSinceSession: 1,
    currentSession: 999,
  }),
  false,
);
assert.equal(
  isLongTermShareholder({
    quantity: 10,
    heldSinceSession: null,
    currentSession: 999,
  }),
  false,
);

assert.equal(nextShareholderLetterSession(null, 500), 500);
assert.equal(nextShareholderLetterSession(490, 500), 510);
assert.equal(nextShareholderLetterSession(400, 500), 500);

assert.deepEqual(
  validateShareholderLetterDraft("  2분기 주주서한  ", "  함께해 주셔서 감사합니다.  "),
  {
    valid: true,
    title: "2분기 주주서한",
    body: "함께해 주셔서 감사합니다.",
  },
);
assert.equal(validateShareholderLetterDraft("", "본문").valid, false);
assert.equal(validateShareholderLetterDraft("제목", "").valid, false);
assert.equal(
  validateShareholderLetterDraft(
    "가".repeat(SHAREHOLDER_LETTER_TITLE_MAX_LENGTH + 1),
    "본문",
  ).valid,
  false,
);
assert.equal(
  validateShareholderLetterDraft(
    "제목",
    "가".repeat(SHAREHOLDER_LETTER_BODY_MAX_LENGTH + 1),
  ).valid,
  false,
);
assert.equal(
  validateShareholderLetterDraft("제목", "https://example.com을 확인하세요.").valid,
  false,
);

const migration = readFileSync(
  new URL(
    "../supabase/migrations/20260728230000_player_company_shareholder_letters.sql",
    import.meta.url,
  ),
  "utf8",
);
assert.match(migration, /game_saves_player_company_shareholder_streaks/);
assert.match(migration, /streak[.]current_quantity >= 1/);
assert.match(migration, /v_session - streak[.]held_since_session >= 20/);
assert.match(migration, /streak[.]user_id <> v_user/);
assert.match(migration, /raise exception 'letter_cooldown'/);
assert.match(migration, /raise exception 'no_eligible_shareholders'/);
assert.match(migration, /char_length[(]v_body[)] > 500/);
assert.match(migration, /mark_all_shareholder_letters_read/);

console.log("player company shareholder letter tests passed");

import assert from "node:assert/strict";
import {
  CHARACTER_DIALOGUE_CATEGORY,
  FEEDBACK_REWARD_CENTS,
  MARKET_PHASE_CATEGORY,
  MARKET_PHASE_REWARD_CENTS,
  feedbackResponseEffectCents,
  serializeFeedbackCategory,
} from "../src/lib/supabase/feedback";

assert.equal(
  MARKET_PHASE_REWARD_CENTS,
  100_000_000,
  "국면 추가 반영 보상은 $1,000,000이어야 함",
);
assert.equal(
  feedbackResponseEffectCents(MARKET_PHASE_CATEGORY, "done"),
  MARKET_PHASE_REWARD_CENTS,
  "국면 반영 완료 시 전용 보상 지급",
);
assert.equal(
  feedbackResponseEffectCents(MARKET_PHASE_CATEGORY, "declined"),
  0,
  "무료 신청이므로 반려 환불 없음",
);
assert.equal(
  feedbackResponseEffectCents(CHARACTER_DIALOGUE_CATEGORY, "done"),
  FEEDBACK_REWARD_CENTS,
  "캐릭터 대사 보상은 기존 금액 유지",
);
assert.equal(
  serializeFeedbackCategory("거래·체결", "V2 최초 플레이어"),
  "V2 최초 플레이어 · 거래·체결",
);
assert.equal(serializeFeedbackCategory(undefined, "V2 최초 플레이어"), "V2 최초 플레이어");
assert.equal(serializeFeedbackCategory("  기타  "), "기타");

console.log("feedback reward policy tests passed");

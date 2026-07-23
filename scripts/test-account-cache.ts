import assert from "node:assert";
import { marketStorageKey } from "../src/lib/storage/safeLocalStorage";
import {
  resolvedResponseIdsWithPaymentEvidence,
  shouldRecoverFailedLocalWallet,
} from "../src/lib/market/cloudSyncGuards";
import { parseGameSaveWriteRpcResponse } from "../src/lib/supabase/cloudSave";

const guest = marketStorageKey(null);
const phoneAccount = marketStorageKey("account-a");
const desktopAccount = marketStorageKey("account-a");
const otherAccount = marketStorageKey("account-b");

assert.equal(phoneAccount, desktopAccount, "같은 계정이 기기마다 다른 캐시 키를 사용함");
assert.notEqual(guest, phoneAccount, "게스트와 로그인 지갑 캐시가 섞임");
assert.notEqual(phoneAccount, otherAccount, "서로 다른 로그인 계정 캐시가 섞임");

assert.equal(
  shouldRecoverFailedLocalWallet({
    localActivityAt: 3_000,
    cloudActivityAt: 2_000,
    cloudUpdatedAt: 2_500,
    localSaveFailedAt: 0,
  }),
  false,
  "새 기기 로컬 캐시는 명시적 저장 실패 없이 서버 지갑을 덮으면 안 됨",
);
assert.equal(
  shouldRecoverFailedLocalWallet({
    localActivityAt: 3_000,
    cloudActivityAt: 2_000,
    cloudUpdatedAt: 2_500,
    localSaveFailedAt: 2_800,
  }),
  true,
  "서버 갱신 뒤 실제 저장 실패가 발생한 로컬 활동만 복구해야 함",
);

const feedbackId = "feedback-response-id";
const resolvedByPayment = resolvedResponseIdsWithPaymentEvidence(
  [],
  [
    {
      id: `feedback-reward-${feedbackId}`,
      kind: "compensation",
      sourceId: "feedback",
      dueSession: 1,
      amount: 5_000_000,
      timestamp: 1,
    },
  ],
  "feedback-reward-",
);
assert.equal(
  resolvedByPayment.has(feedbackId),
  true,
  "처리 배열이 유실돼도 기존 지급 거래가 중복 보상을 막아야 함",
);

assert.deepEqual(
  parseGameSaveWriteRpcResponse({
    saved: true,
    conflict: false,
    revision: 8,
  }),
  { status: "saved", revision: 8 },
  "CAS 저장 성공 revision을 유지해야 함",
);
assert.deepEqual(
  parseGameSaveWriteRpcResponse({
    saved: false,
    conflict: true,
    revision: "9",
  }),
  { status: "conflict", revision: 9 },
  "다른 탭의 선행 저장은 conflict로 구분해야 함",
);
assert.deepEqual(
  parseGameSaveWriteRpcResponse(null),
  { status: "failed", revision: 0 },
  "잘못된 RPC 응답을 저장 성공으로 처리하면 안 됨",
);

console.log("account-scoped local cache scenarios passed");

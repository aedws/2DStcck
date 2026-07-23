import assert from "node:assert";
import { marketStorageKey } from "../src/lib/storage/safeLocalStorage";
import {
  resolvedResponseIdsWithPaymentEvidence,
  shouldRecoverFailedLocalWallet,
} from "../src/lib/market/cloudSyncGuards";

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

console.log("account-scoped local cache scenarios passed");

import assert from "node:assert";
import { marketStorageKey } from "../src/lib/storage/safeLocalStorage";

const guest = marketStorageKey(null);
const phoneAccount = marketStorageKey("account-a");
const desktopAccount = marketStorageKey("account-a");
const otherAccount = marketStorageKey("account-b");

assert.equal(phoneAccount, desktopAccount, "같은 계정이 기기마다 다른 캐시 키를 사용함");
assert.notEqual(guest, phoneAccount, "게스트와 로그인 지갑 캐시가 섞임");
assert.notEqual(phoneAccount, otherAccount, "서로 다른 로그인 계정 캐시가 섞임");

console.log("account-scoped local cache scenarios passed");

import assert from "node:assert";
import {
  zeroDteExpiry,
  isZeroDteExpiry,
  listExpiriesWithZeroDte,
  optionPremium,
  intrinsic,
} from "../src/lib/market/options";
import type { StockState } from "../src/lib/types/market";

const N = 1000; // 임의 현재 거래일(정수)

// 만기 헬퍼
assert.equal(zeroDteExpiry(N), N + 1);
assert.equal(zeroDteExpiry(N + 0.7), N + 1); // 소수 세션도 오늘 마감 기준
assert.equal(isZeroDteExpiry(N + 1, N), true);
assert.equal(isZeroDteExpiry(N + 10, N), false);

const list = listExpiriesWithZeroDte(N);
assert.ok(list[0] === N + 1, "0DTE가 가장 이른 만기여야 함");
for (let i = 1; i < list.length; i++) assert.ok(list[i] > list[i - 1], "오름차순");
assert.ok(new Set(list).size === list.length, "중복 없음");

const stock = {
  id: "x",
  currentPrice: 10000,
  volatility: 0.4,
} as unknown as StockState;
const rate = 0.03;
const strike = 10000; // ATM
const expiry = zeroDteExpiry(N); // N+1

// 세타: 세션이 만기에 가까워질수록 ATM 프리미엄이 줄어든다.
const early = optionPremium("call", strike, expiry, stock, N + 0.05, rate);
const mid = optionPremium("call", strike, expiry, stock, N + 0.5, rate);
const late = optionPremium("call", strike, expiry, stock, N + 0.95, rate);
assert.ok(early > mid && mid > late, `세타 소멸 실패: ${early} ${mid} ${late}`);
assert.ok(early > 0, "장중 초반 ATM 0DTE는 시간가치가 있어야 함");

// 만기 도달 시 내재가치로 수렴.
const atExpiry = optionPremium("call", strike, expiry, stock, expiry, rate);
assert.equal(atExpiry, intrinsic("call", stock.currentPrice, strike));

// ITM 콜은 내재가치 이상.
const itmStrike = 9000;
const itm = optionPremium("call", itmStrike, expiry, stock, N + 0.5, rate);
assert.ok(
  itm >= intrinsic("call", stock.currentPrice, itmStrike),
  "ITM 프리미엄이 내재가치보다 작음",
);

// 표준 만기(N+10)는 같은 시점에 0DTE보다 프리미엄이 크다(잔존만기 김).
const standardExpiry = list[list.length - 1];
const standard = optionPremium("call", strike, standardExpiry, stock, N + 0.5, rate);
assert.ok(standard > mid, "표준 만기가 0DTE보다 프리미엄이 커야 함");

console.log("zero-dte option scenarios passed");

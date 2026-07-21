import type { CashPayment } from "@/lib/types/market";
import { SESSION_DURATION_MS } from "@/lib/market/constants";

/**
 * 전 계정 1회 지급 운영 보상. 지급 여부는 지갑의 claimedCompensationIds 에
 * 영구 기록되어 로컬·클라우드 어느 경로로 복원해도 중복 지급되지 않는다.
 * 신규 계정은 생성 시점에 전부 지급 완료로 시작해 대상이 아니다.
 */
export interface OperationalCompensation {
  /** 지급 기록 키 — 바꾸면 새 보상으로 간주돼 다시 지급된다. */
  id: string;
  amountCents: number;
}

/** 발행량 제한(공유 유통 재고) 롤백 보상 $100,000. */
export const OPERATIONAL_COMPENSATIONS: OperationalCompensation[] = [
  { id: "supply-rollback-20260720", amountCents: 10_000_000 },
];

export function normalizeClaimedCompensationIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((id): id is string => typeof id === "string")
    .slice(0, 50);
}

/**
 * 아직 못 받은 운영 보상을 현금·지급 내역에 반영한다. 시즌·랭킹 성과에서
 * 제외되도록 compensation 지급으로 기록한다(멱등).
 */
export function settleOperationalCompensations(input: {
  cash: number;
  cashPayments: CashPayment[];
  claimedCompensationIds: unknown;
  now?: number;
}): {
  cash: number;
  cashPayments: CashPayment[];
  claimedCompensationIds: string[];
  grantedCents: number;
  reconciledCents: number;
} {
  const claimed = normalizeClaimedCompensationIds(input.claimedCompensationIds);
  const compensationByPaymentId = new Map(
    OPERATIONAL_COMPENSATIONS.map((compensation) => [
      `operational-${compensation.id}`,
      compensation,
    ]),
  );
  const paymentEvidence = new Set<string>();
  let reconciledCents = 0;
  const dedupedPayments = input.cashPayments.filter((payment) => {
    const compensation = compensationByPaymentId.get(payment.id);
    if (!compensation) return true;
    if (paymentEvidence.has(compensation.id)) {
      // 같은 고유 보상 ID가 두 번 기록됐다면 실제 현금도 두 번 더해진 상태다.
      reconciledCents += compensation.amountCents;
      return false;
    }
    paymentEvidence.add(compensation.id);
    return true;
  });
  const effectiveClaimed = [...new Set([...paymentEvidence, ...claimed])];
  const pending = OPERATIONAL_COMPENSATIONS.filter(
    (compensation) => !effectiveClaimed.includes(compensation.id),
  );
  if (pending.length === 0) {
    return {
      cash: input.cash - reconciledCents,
      cashPayments: dedupedPayments,
      claimedCompensationIds: effectiveClaimed.slice(0, 50),
      grantedCents: 0,
      reconciledCents,
    };
  }
  const now = input.now ?? Date.now();
  const dueSession = Math.floor(now / SESSION_DURATION_MS);
  const payments: CashPayment[] = pending.map((compensation) => ({
    id: `operational-${compensation.id}`,
    kind: "compensation",
    sourceId: "operations",
    dueSession,
    amount: compensation.amountCents,
    timestamp: now,
  }));
  const grantedCents = payments.reduce((sum, payment) => sum + payment.amount, 0);
  return {
    cash: input.cash - reconciledCents + grantedCents,
    cashPayments: [...payments, ...dedupedPayments].slice(0, 200),
    claimedCompensationIds: [
      ...pending.map((compensation) => compensation.id),
      ...effectiveClaimed,
    ].slice(0, 50),
    grantedCents,
    reconciledCents,
  };
}

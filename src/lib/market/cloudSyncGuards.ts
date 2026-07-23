import type { CashPayment } from "@/lib/types/market";

export interface LocalWalletRecoveryDecision {
  localActivityAt: number;
  cloudActivityAt: number;
  cloudUpdatedAt: number;
  localSaveFailedAt: number;
}

/**
 * 클라우드 대신 로컬 캐시를 복구 원본으로 쓰는 유일한 경우.
 * 같은 계정의 새 기기에 남은 독립 캐시가 서버 지갑을 덮지 않도록, 실제
 * 클라우드 저장 실패 표식이 서버 갱신보다 최신일 때만 로컬을 우선한다.
 */
export function shouldRecoverFailedLocalWallet({
  localActivityAt,
  cloudActivityAt,
  cloudUpdatedAt,
  localSaveFailedAt,
}: LocalWalletRecoveryDecision): boolean {
  if (
    !Number.isFinite(localSaveFailedAt) ||
    localSaveFailedAt <= 0 ||
    localSaveFailedAt <= cloudUpdatedAt
  ) {
    return false;
  }
  return (
    Number.isFinite(localActivityAt) &&
    localActivityAt > Math.max(cloudActivityAt, cloudUpdatedAt)
  );
}

/**
 * 처리 ID 배열이 유실·잘린 경우에도 이미 생성된 지급 거래를 증거로 사용한다.
 * 다른 기기에서 같은 운영 회신을 다시 열어도 동일 지급 ID는 한 번만 처리된다.
 */
export function resolvedResponseIdsWithPaymentEvidence(
  resolvedIds: readonly string[],
  cashPayments: readonly CashPayment[],
  paymentPrefix: string,
): Set<string> {
  const resolved = new Set(
    resolvedIds.filter((id): id is string => typeof id === "string" && !!id),
  );
  for (const payment of cashPayments) {
    if (payment.id.startsWith(paymentPrefix)) {
      const responseId = payment.id.slice(paymentPrefix.length);
      if (responseId) resolved.add(responseId);
    }
  }
  return resolved;
}

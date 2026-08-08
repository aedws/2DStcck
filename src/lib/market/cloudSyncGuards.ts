import type { CashPayment } from "@/lib/types/market";

export interface LocalWalletRecoveryDecision {
  localActivityAt: number;
  cloudActivityAt: number;
  cloudUpdatedAt: number;
  localSaveFailedAt: number;
  localAccountResetAt: number;
  cloudAccountResetAt: number;
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
  localAccountResetAt,
  cloudAccountResetAt,
}: LocalWalletRecoveryDecision): boolean {
  if (
    !Number.isFinite(localAccountResetAt) ||
    !Number.isFinite(cloudAccountResetAt) ||
    localAccountResetAt < cloudAccountResetAt
  ) {
    return false;
  }
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
 * 클라우드와 로컬(localStorage)의 "확인 처리" ID 집합을 합집합으로 병합한다.
 *
 * 확인 ID(버그·피드백·IPO 회신, 배당 수령, 세금 이벤트 등)는 한번 세워지면
 * 절대 되돌리지 않는 누적 플래그다. 그런데 이 필드들은 클라우드 저장 트리거에
 * 빠져 있던 시기가 있어 클라우드 쪽이 비어 있을 수 있는데, 로그인 시 클라우드
 * 값으로 통째로 덮어쓰면 로컬에 쌓인 확인기록이 사라져 과거 회신 팝업이 매
 * 접속마다 재발했다(도메인 이전으로 localStorage가 초기화되며 표면화). 합집합
 * 병합으로 어느 쪽 기록도 잃지 않게 한다. 최신 항목을 앞에 두고 cap 으로 자른다.
 */
export function mergeAckIds(
  cloudIds: readonly string[] | undefined,
  localIds: readonly string[] | undefined,
  cap = 300,
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const source of [cloudIds ?? [], localIds ?? []]) {
    for (const id of source) {
      if (typeof id !== "string" || !id || seen.has(id)) continue;
      seen.add(id);
      merged.push(id);
    }
  }
  return merged.slice(0, cap);
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

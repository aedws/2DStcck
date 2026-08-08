export const SERVER_INSTABILITY_COMPENSATION_ID =
  "server-instability-20260814";

/** $100M, stored in cents. */
export const SERVER_INSTABILITY_COMPENSATION_CENTS = 10_000_000_000;

/** 2026-08-14 23:59:59.999 KST. The server remains authoritative. */
export const SERVER_INSTABILITY_COMPENSATION_DEADLINE_MS = Date.parse(
  "2026-08-14T14:59:59.999Z",
);

export type ServiceCompensationClaimStatus =
  | "granted"
  | "already_claimed"
  | "expired"
  | "missing_save"
  | "error";

export interface ServiceCompensationClaimResult {
  status: ServiceCompensationClaimStatus;
  amountCents: number;
  walletRevision: number;
  message?: string;
}

export function parseServiceCompensationClaimResult(
  value: unknown,
): ServiceCompensationClaimResult {
  if (!value || typeof value !== "object") {
    return {
      status: "error",
      amountCents: 0,
      walletRevision: 0,
      message: "invalid response",
    };
  }

  const record = value as Record<string, unknown>;
  const allowed = new Set<ServiceCompensationClaimStatus>([
    "granted",
    "already_claimed",
    "expired",
    "missing_save",
  ]);
  const rawStatus = typeof record.status === "string" ? record.status : "";
  const status = allowed.has(rawStatus as ServiceCompensationClaimStatus)
    ? (rawStatus as ServiceCompensationClaimStatus)
    : "error";
  const amount = Number(record.amountCents ?? record.amount_cents ?? 0);
  const revision = Number(record.walletRevision ?? record.wallet_revision ?? 0);

  return {
    status,
    amountCents:
      Number.isSafeInteger(amount) && amount >= 0 ? amount : 0,
    walletRevision:
      Number.isSafeInteger(revision) && revision >= 0 ? revision : 0,
    message: typeof record.message === "string" ? record.message : undefined,
  };
}

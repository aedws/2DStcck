/**
 * A finite JavaScript number may be enormous while its authoritative integer
 * representation is still preserved in the exact wallet field. Such balances
 * are imprecise for arithmetic display, but they are not an overflow reset.
 */
export function isExactBackedFiniteAmount(
  value: number,
  exactValue: unknown,
): boolean {
  if (!Number.isFinite(value) || typeof exactValue !== "string") return false;
  const trimmed = exactValue.trim();
  if (!/^-?\d+$/.test(trimmed)) return false;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) && parsed === value;
}


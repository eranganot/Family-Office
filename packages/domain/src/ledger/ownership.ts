import Decimal from "decimal.js";

export interface OwnershipShareInput {
  familyMemberId: string;
  sharePct: string | number;
}

export type OwnershipValidation = { valid: true } | { valid: false; reason: string };

/** Invariant: shares per ledger item must sum to exactly 100 with no duplicate members. */
export function validateOwnershipShares(shares: OwnershipShareInput[]): OwnershipValidation {
  if (shares.length === 0) return { valid: false, reason: "OWNERSHIP_EMPTY" };
  const ids = new Set(shares.map((s) => s.familyMemberId));
  if (ids.size !== shares.length) return { valid: false, reason: "OWNERSHIP_DUPLICATE_MEMBER" };
  let sum = new Decimal(0);
  for (const s of shares) {
    const d = new Decimal(s.sharePct);
    if (!d.isFinite() || d.lte(0) || d.gt(100)) return { valid: false, reason: "OWNERSHIP_SHARE_OUT_OF_RANGE" };
    sum = sum.plus(d);
  }
  if (!sum.equals(100)) return { valid: false, reason: "OWNERSHIP_SUM_NOT_100" };
  return { valid: true };
}

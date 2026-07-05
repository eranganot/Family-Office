import Decimal from "decimal.js";

export interface MortgageTrackInput {
  trackType: string;
  principalRemaining: string | number;
  annualRatePct: string | number;
  cpiLinked: boolean;
  endDate: Date;
}

export type MortgageValidation = { valid: true } | { valid: false; reason: string };

/** Israeli mortgages are multi-track. Invariants: at least one track, sane rates and principals. */
export function validateMortgageTracks(tracks: MortgageTrackInput[]): MortgageValidation {
  if (tracks.length === 0) return { valid: false, reason: "MORTGAGE_NO_TRACKS" };
  for (const t of tracks) {
    const principal = new Decimal(t.principalRemaining);
    if (!principal.isFinite() || principal.lte(0)) return { valid: false, reason: "TRACK_PRINCIPAL_INVALID" };
    const rate = new Decimal(t.annualRatePct);
    if (!rate.isFinite() || rate.lt(0) || rate.gt(30)) return { valid: false, reason: "TRACK_RATE_INVALID" };
    if (Number.isNaN(t.endDate.getTime())) return { valid: false, reason: "TRACK_END_DATE_INVALID" };
  }
  return { valid: true };
}

export function totalPrincipal(tracks: MortgageTrackInput[]): Decimal {
  return tracks.reduce((acc, t) => acc.plus(new Decimal(t.principalRemaining)), new Decimal(0));
}

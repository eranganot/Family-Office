/**
 * M40b — what the household can actually DO about a recurring commitment.
 *
 * This exists because `BehavioralClass` answers a different question than the one the
 * opportunity analyzers need to ask, and M40a got that wrong twice in one day.
 *
 *   BehavioralClass  → "is this predictable enough to budget?"  (FIXED vs VARIABLE)
 *   CommitmentPolicy → "can the household exit or reprice it?"  (this file)
 *
 * They are orthogonal, and treating the first as a proxy for the second produced two
 * opposite failures from the same root:
 *
 *   - Denylist on behaviour  → the MORTGAGE was offered for cancellation, because a
 *     mortgage is the most regular monthly charge a household has.
 *   - Allowlist on behaviour → the analyzer found ₪6/month, because `utilities.subscriptions`
 *     — the literal Subscriptions category — is FIXED_CONTRACTUAL, as are mobile, cloud
 *     software and internet/TV. Every real subscription sits in the banned class.
 *
 * So the policy is stated explicitly per category, as data. Two independent flags:
 *
 *   cancellable   the household can stop paying it unilaterally and simply not have it
 *   renegotiable  the household can keep it but pay less — reprice, switch supplier,
 *                 change tier
 *
 * Insurance is deliberately `renegotiable` but NOT `cancellable`: coverage level is a
 * protection decision owned by `engine-strategy/analyzers/insurance.ts`, which checks for
 * GAPS. Operations telling the owner to drop cover would put two engines in direct
 * contradiction about the same contract — and life cover is often irreversible, since
 * re-underwriting after aging or a diagnosis is not guaranteed at the old rate. Repricing
 * the same cover contradicts nothing.
 *
 * A mortgage is neither here: refinancing is strategy's MORTGAGE_ABOVE_BENCHMARK finding,
 * which already benchmarks the track rate against the BOI policy rate.
 */

export interface CommitmentPolicy {
  cancellable: boolean;
  renegotiable: boolean;
}

const NEITHER: CommitmentPolicy = { cancellable: false, renegotiable: false };
const BOTH: CommitmentPolicy = { cancellable: true, renegotiable: true };
const REPRICE_ONLY: CommitmentPolicy = { cancellable: false, renegotiable: true };

/**
 * Longest-prefix wins, so a specific key can override its parent. Anything not listed is
 * NEITHER — an unknown category is never assumed actionable.
 */
const POLICY: ReadonlyArray<readonly [string, CommitmentPolicy]> = [
  // --- Cancellable AND renegotiable: real discretionary services.
  ["utilities.subscriptions", BOTH],
  ["utilities.cloud_software", BOTH],
  ["leisure", BOTH],
  ["healthcare.gym", BOTH],

  // --- Reprice only: needed, but the price is negotiable and suppliers are switchable.
  ["utilities.mobile", REPRICE_ONLY],
  ["utilities", REPRICE_ONLY],
  ["housing.internet_tv", REPRICE_ONLY],
  ["housing.electricity", REPRICE_ONLY], // IL supplier switching
  ["housing.gas", REPRICE_ONLY],
  ["insurance", REPRICE_ONLY],
  ["housing.home_insurance", REPRICE_ONLY],
  ["transport.vehicle_insurance", REPRICE_ONLY],

  // --- Neither. Stated explicitly rather than left to the default, because these are the
  //     ones that caused harm when they leaked through.
  ["housing.mortgage", NEITHER], // refinance = strategy's MORTGAGE_ABOVE_BENCHMARK
  ["housing.rent", NEITHER],
  ["housing.arnona", NEITHER], // statutory
  ["housing.water", NEITHER], // no supplier choice in IL
  ["housing.vaad_bayit", NEITHER],
  ["debt", NEITHER],
  ["taxes", NEITHER],
  ["savings", NEITHER], // contributions are capital deployed, not expense (D7)
  ["education", NEITHER],
  ["other", NEITHER], // the suspense bucket — never judge an unclassified row
];

export function commitmentPolicy(categoryKey: string | null): CommitmentPolicy {
  if (categoryKey === null || categoryKey.length === 0) return NEITHER;
  let best: CommitmentPolicy = NEITHER;
  let bestLen = -1;
  for (const [prefix, policy] of POLICY) {
    const hit = categoryKey === prefix || categoryKey.startsWith(`${prefix}.`);
    if (hit && prefix.length > bestLen) {
      best = policy;
      bestLen = prefix.length;
    }
  }
  return best;
}

/** The household can stop paying this and simply not have it. */
export function canCancel(categoryKey: string | null): boolean {
  return commitmentPolicy(categoryKey).cancellable;
}

/** The household can keep this but pay less for it. */
export function canRenegotiate(categoryKey: string | null): boolean {
  return commitmentPolicy(categoryKey).renegotiable;
}

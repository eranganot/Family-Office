import { UNCLASSIFIED_KEY, canCancel } from "@wealthos/domain";
import type { OpportunityFinding, OpportunityInput, OpportunityTxn } from "./types";

/**
 * M40 — dormant / redundant subscription analyzer.
 *
 * A subscription is a merchantKey that charges on a regular monthly-ish cadence.
 * "Dormant" means the cadence STOPPED being matched by anything the household
 * did with it — but WealthOS has no usage telemetry, so it cannot observe use.
 *
 * What it CAN observe, and what this analyzer is therefore built on: the charge
 * is still recurring, and there is no offsetting signal in the ledger. So the
 * finding is deliberately framed as "confirm you still use this", never as
 * "you do not use this". Claiming the latter would be a guess dressed as a fact.
 *
 * Detection rules, all conservative:
 *  - >= 3 charges from one merchantKey (two points make a line, three make a habit)
 *  - median inter-charge gap between 25 and 35 days (monthly cadence)
 *  - amount stable within 15% (a varying amount is usage-based, not a subscription)
 *  - dormancy: the merchant has been charging for at least
 *    `leakage_subscription_dormant_days` without ever being reclassified away
 *    from a recurring/drag posture
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;
const DAY_MS = 86_400_000;

const MIN_CHARGES = 3;
const MIN_GAP_DAYS = 25;
const MAX_GAP_DAYS = 35;
const MAX_AMOUNT_SPREAD = 0.15;

export interface SubscriptionCluster {
  merchantKey: string;
  charges: number;
  medianGapDays: number;
  monthlyBase: number;
  firstSeen: Date;
  lastSeen: Date;
  daysRunning: number;
  daysSinceLastCharge: number;
}

function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1]! + s[mid]!) / 2 : s[mid]!;
}

/**
 * ⚠️ M40a-fix — the eligibility rule is an ALLOWLIST, not a denylist.
 *
 * The first version excluded TRANSFER and SAVINGS_FLOW and let everything else through.
 * That shipped a card telling the owner to "start with פועלים_משכנתא at ₪15,072/month —
 * the biggest decision here" and to "cancel directly with the provider". It was advising
 * him to cancel his mortgage, and it inflated the headline saving by ~₪181k/year.
 *
 * The cause is structural, not a typo: `FIXED_CONTRACTUAL` is defined in the schema as
 * "mortgage, arnona, tuition, insurance premiums" — obligations that are BY CONSTRUCTION
 * a stable monthly amount from a consistent merchant, which is exactly the shape this
 * analyzer hunts for. A recurring-payment detector that does not exclude the category of
 * unstoppable recurring payments will always find them first, because they are the
 * largest and the most regular.
 *
 * So: only two behavioural classes can ever be a cancellable subscription, and an
 * unclassified row is NOT one of them. Silence beats a confident wrong instruction.
 */
/**
 * ⚠️ M40b — eligibility moved OFF the behavioural axis entirely.
 *
 * M40a tried a denylist on `BehavioralClass` (shipped a "cancel your mortgage" card), then
 * an allowlist on it (found ₪6/month, because `utilities.subscriptions` — the literal
 * Subscriptions category — is FIXED_CONTRACTUAL, along with mobile, cloud software and
 * internet/TV). Both failed for the same reason: `BehavioralClass` answers "is this
 * budgetable?", not "can the household get out of it?".
 *
 * That second question now has its own answer in `domain/operations/commitment-policy`.
 * See that file for why insurance is repriceable but never cancellable.
 */

/**
 * ⚠️ SECOND M40a defect, caught in re-QA — the behavioural allowlist ALONE is not enough.
 *
 * `other.unclassified` (the suspense bucket) carries
 * `defaultBehavioralClass: "VARIABLE_DISCRETIONARY"`. So **"we do not know what this is"
 * and "this is discretionary spending" are the same value by the time the analyzer sees
 * it.** The `behavioral !== null` guard therefore never fired: an unclassified row is not
 * null, it is discretionary.
 *
 * That is how מגדל_מבטחים_חיים — a life insurance policy — was offered for cancellation
 * after the mortgage was fixed. No merchant rule matched "מגדל", so it fell to the
 * suspense bucket and inherited "discretionary".
 *
 * Whole-category exclusions below are defence in depth on top of that. Insurance
 * especially: `engine-strategy/analyzers/insurance.ts` checks for coverage GAPS, so an
 * operations engine proposing cancellation would put two engines in direct contradiction
 * about the same contract. Cancelling life cover is also frequently irreversible —
 * re-underwriting after aging or a diagnosis is not guaranteed at the old rate.
 */
/** Unclassified rows are refused outright: the suspense bucket is not a verdict. */
function isSuspense(key: string | null): boolean {
  return key === null || key === UNCLASSIFIED_KEY || key.startsWith("other.");
}

/**
 * Shape only: could this row be PART of a recurring commitment at all? No policy here.
 *
 * TRANSFER and SAVINGS_FLOW are excluded structurally rather than by policy: a movement
 * between the household's own accounts, or a pension contribution, is not an expense in the
 * first place (owner decision D7), so it can be neither cancelled nor repriced.
 */
function isRecurringShape(t: OpportunityTxn): boolean {
  return (
    t.status === "BOOKED" &&
    t.amountBase !== null &&
    t.amountBase < 0 && // outflow only
    t.merchantKey !== null &&
    t.behavioral !== "TRANSFER" &&
    t.behavioral !== "SAVINGS_FLOW"
  );
}

/** Can the household stop paying this entirely? (subscription analyzer's question) */
function subscriptionEligible(t: OpportunityTxn): boolean {
  return (
    // A payment that is evidence for a mapped ledger stream (mortgage track, loan,
    // insurance policy) is an obligation however regular it looks. Holds even when the
    // classification is wrong or missing — the likely state on a fresh import.
    t.ledgerItemId === null && !isSuspense(t.categoryKey) && canCancel(t.categoryKey)
  );
}

/**
 * Rows that look like a subscription but were deliberately not treated as one. Reported
 * in the finding so the exclusion is VISIBLE — an owner who wonders why a charge is
 * missing should be able to see that we chose not to guess, rather than assume the
 * feature is broken.
 */
export function countExcludedRecurring(txns: OpportunityTxn[]): {
  contractual: number;
  unclassified: number;
} {
  let contractual = 0;
  let unclassified = 0;
  for (const t of txns) {
    if (t.status !== "BOOKED" || t.amountBase === null || t.amountBase >= 0) continue;
    if (t.merchantKey === null) continue;
    if (t.behavioral === "TRANSFER" || t.behavioral === "SAVINGS_FLOW") continue;
    if (isSuspense(t.categoryKey)) unclassified += 1;
    else if (!canCancel(t.categoryKey) || t.ledgerItemId !== null) contractual += 1;
  }
  return { contractual, unclassified };
}

/**
 * Pure cadence detection — NO policy. Split out in M40b because `analyzeRenegotiation`
 * needs the same monthly-cluster logic over a DIFFERENT eligible set. When the two were
 * one function, renegotiation silently returned nothing: it filtered for `renegotiable`
 * categories and then handed them to a clusterer that required `cancellable`, which is the
 * exact complement. A shared helper that quietly re-applies one caller's policy to another
 * caller's data cannot work.
 */
export function clusterRecurring(txns: OpportunityTxn[], asOf: Date): SubscriptionCluster[] {
  const byMerchant = new Map<string, OpportunityTxn[]>();
  for (const t of txns) {
    if (!isRecurringShape(t)) continue;
    const key = t.merchantKey!;
    byMerchant.set(key, [...(byMerchant.get(key) ?? []), t]);
  }

  const clusters: SubscriptionCluster[] = [];
  for (const [merchantKey, rows] of byMerchant) {
    if (rows.length < MIN_CHARGES) continue;
    const sorted = [...rows].sort((a, b) => a.bookedAt.getTime() - b.bookedAt.getTime());

    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i += 1) {
      gaps.push((sorted[i]!.bookedAt.getTime() - sorted[i - 1]!.bookedAt.getTime()) / DAY_MS);
    }
    const medianGapDays = round2(median(gaps));
    if (medianGapDays < MIN_GAP_DAYS || medianGapDays > MAX_GAP_DAYS) continue;

    const amounts = sorted.map((t) => Math.abs(t.amountBase!));
    const mean = amounts.reduce((s, a) => s + a, 0) / amounts.length;
    if (mean <= 0) continue;
    const spread = (Math.max(...amounts) - Math.min(...amounts)) / mean;
    if (spread > MAX_AMOUNT_SPREAD) continue;

    const firstSeen = sorted[0]!.bookedAt;
    const lastSeen = sorted[sorted.length - 1]!.bookedAt;
    clusters.push({
      merchantKey,
      charges: sorted.length,
      medianGapDays,
      monthlyBase: round2(mean),
      firstSeen,
      lastSeen,
      daysRunning: Math.round((lastSeen.getTime() - firstSeen.getTime()) / DAY_MS),
      daysSinceLastCharge: Math.round((asOf.getTime() - lastSeen.getTime()) / DAY_MS),
    });
  }
  return clusters.sort((a, b) => b.monthlyBase - a.monthlyBase);
}

/** Recurring clusters the household could stop paying entirely. */
export function clusterSubscriptions(txns: OpportunityTxn[], asOf: Date): SubscriptionCluster[] {
  return clusterRecurring(txns.filter(subscriptionEligible), asOf);
}

export function analyzeSubscriptions(input: OpportunityInput): OpportunityFinding[] {
  const dormantDays = input.assumptions.subscriptionDormantDays;
  const clusters = clusterSubscriptions(input.transactions, input.asOf);

  // "Running longer than the dormancy horizon and still charging" is the signal we
  // can actually evidence. A cluster that stopped charging is NOT leakage — it is
  // already cancelled, and flagging it would send the owner to cancel nothing.
  const candidates = clusters.filter(
    (c) => c.daysRunning >= dormantDays && c.daysSinceLastCharge <= MAX_GAP_DAYS * 2,
  );
  if (candidates.length === 0) return [];

  // M40b materiality floor. A card costs the owner attention; below the registry floor
  // the saving does not repay reading it. Applied to the TOTAL, not per-merchant, so
  // several small charges can still add up to something worth a look.
  const gross = candidates.reduce((s, c) => s + c.monthlyBase, 0);
  if (gross < input.assumptions.minMonthlyBase) return [];

  const monthlyTotal = round2(candidates.reduce((s, c) => s + c.monthlyBase, 0));
  const excluded = countExcludedRecurring(input.transactions);

  return [
    {
      code: "OPERATIONAL_SUBSCRIPTION_REVIEW_DUE",
      severity: "NOTICE",
      metrics: {
        subscriptionCount: candidates.length,
        monthlyTotalBase: monthlyTotal,
        annualTotalBase: round2(monthlyTotal * 12),
        dormantDays,
        excludedContractual: excluded.contractual,
        excludedUnclassified: excluded.unclassified,
        subscribableCategoryNote: "insurance, debt, tax and savings categories are never listed",
        largestMerchant: candidates[0]!.merchantKey,
        largestMonthlyBase: candidates[0]!.monthlyBase,
        merchants: candidates
          .slice(0, 5)
          .map((c) => `${c.merchantKey}:${c.monthlyBase}`)
          .join(", "),
      },
      evidenceItemIds: [],
    },
  ];
}

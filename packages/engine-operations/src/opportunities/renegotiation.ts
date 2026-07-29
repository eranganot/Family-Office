import { canCancel, canRenegotiate } from "@wealthos/domain";
import { clusterRecurring } from "./subscriptions";
import type { OpportunityFinding, OpportunityInput, OpportunityTxn } from "./types";

/**
 * M40b — recurring commitments the household can keep but pay LESS for.
 *
 * This exists because M40a's QA exposed a gap between two extremes. Excluding every
 * `FIXED_CONTRACTUAL` category (the fix for the "cancel your mortgage" defect) also
 * removed telecom, mobile, electricity and insurance — the commitments with the most
 * reliable household savings in Israel, precisely because they renew silently at a worse
 * rate than a new customer is offered.
 *
 * The distinction is `commitment-policy`'s, not this file's: `renegotiable` means the
 * household can keep the thing and pay less. This analyzer NEVER proposes cancellation —
 * for insurance that would contradict `engine-strategy/analyzers/insurance.ts`, which
 * checks for coverage gaps on the same policy.
 *
 * What it deliberately does NOT do: estimate how much can be saved. WealthOS does not know
 * what the market rate for the owner's mobile plan is, and inventing a "you could save 30%"
 * figure would be exactly the confident-wrong number M40a already shipped once. The finding
 * carries the CURRENT spend — a real, observed number — and frames the saving as unknown
 * until the owner gets a quote.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Grouped for the owner's benefit: one phone call usually covers a whole group. */
function groupOf(categoryKey: string): string {
  if (categoryKey.startsWith("insurance") || categoryKey.endsWith("_insurance")) return "INSURANCE";
  if (categoryKey.startsWith("utilities.mobile") || categoryKey.startsWith("housing.internet_tv"))
    return "TELECOM";
  if (categoryKey.startsWith("housing.electricity") || categoryKey.startsWith("housing.gas"))
    return "ENERGY";
  return "SERVICES";
}

function eligible(t: OpportunityTxn): boolean {
  return (
    t.status === "BOOKED" &&
    t.amountBase !== null &&
    t.amountBase < 0 &&
    t.merchantKey !== null &&
    t.categoryKey !== null &&
    canRenegotiate(t.categoryKey) &&
    // Reprice-ONLY. Anything also cancellable (a streaming service, cloud software) is
    // already on the subscription card, which offers "downgrade a tier" among its
    // alternatives. Listing the same merchant on two cards would double the apparent
    // amount of work and let the owner act on it twice.
    !canCancel(t.categoryKey)
  );
}

export function analyzeRenegotiation(input: OpportunityInput): OpportunityFinding[] {
  const eligibleTxns = input.transactions.filter(eligible);
  if (eligibleTxns.length === 0) return [];

  // Same cadence detection as subscriptions, over a DIFFERENT eligible set. Must be
  // `clusterRecurring`, not `clusterSubscriptions` — the latter re-applies the
  // cancellable filter, which is the exact complement of renegotiable, so this analyzer
  // would silently return nothing.
  const clusters = clusterRecurring(eligibleTxns, input.asOf);
  if (clusters.length === 0) return [];

  const categoryByMerchant = new Map<string, string>();
  for (const t of eligibleTxns) {
    if (t.merchantKey && t.categoryKey) categoryByMerchant.set(t.merchantKey, t.categoryKey);
  }

  const monthlyTotal = round2(clusters.reduce((s, c) => s + c.monthlyBase, 0));
  if (monthlyTotal < input.assumptions.minMonthlyBase) return [];

  const groups = new Map<string, number>();
  for (const c of clusters) {
    const g = groupOf(categoryByMerchant.get(c.merchantKey) ?? "");
    groups.set(g, round2((groups.get(g) ?? 0) + c.monthlyBase));
  }
  const largest = clusters[0]!;

  return [
    {
      code: "OPERATIONAL_RENEGOTIABLE_COMMITMENTS",
      severity: "NOTICE",
      metrics: {
        commitmentCount: clusters.length,
        monthlyTotalBase: monthlyTotal,
        annualTotalBase: round2(monthlyTotal * 12),
        largestMerchant: largest.merchantKey,
        largestMonthlyBase: largest.monthlyBase,
        largestGroup: groupOf(categoryByMerchant.get(largest.merchantKey) ?? ""),
        groups: [...groups.entries()].map(([g, v]) => `${g}:${v}`).join(", "),
        merchants: clusters
          .slice(0, 6)
          .map((c) => `${c.merchantKey}:${c.monthlyBase}`)
          .join(", "),
      },
      evidenceItemIds: [],
    },
  ];
}

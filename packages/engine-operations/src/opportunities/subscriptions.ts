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

function eligible(t: OpportunityTxn): boolean {
  return (
    t.status === "BOOKED" &&
    t.amountBase !== null &&
    t.amountBase < 0 && // outflow only
    t.merchantKey !== null &&
    t.behavioral !== "TRANSFER" &&
    t.behavioral !== "SAVINGS_FLOW"
  );
}

export function clusterSubscriptions(txns: OpportunityTxn[], asOf: Date): SubscriptionCluster[] {
  const byMerchant = new Map<string, OpportunityTxn[]>();
  for (const t of txns) {
    if (!eligible(t)) continue;
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

  const monthlyTotal = round2(candidates.reduce((s, c) => s + c.monthlyBase, 0));

  return [
    {
      code: "OPERATIONAL_SUBSCRIPTION_REVIEW_DUE",
      severity: "NOTICE",
      metrics: {
        subscriptionCount: candidates.length,
        monthlyTotalBase: monthlyTotal,
        annualTotalBase: round2(monthlyTotal * 12),
        dormantDays,
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

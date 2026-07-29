import type { OpportunityFinding, OpportunityInput, OpportunityTxn } from "./types";

/**
 * M40 — expense-leakage analyzer.
 *
 * Leakage is the FINANCIAL_DRAG behavioural bucket: amlot, FX markup, overdraft
 * interest, dormant subscriptions. It is money that buys the household nothing,
 * which is what makes it the cheapest thing to fix.
 *
 * Two deliberate refusals:
 *  - A transaction with `amountBase === null` (no FX rate) is NOT treated as zero.
 *    It suppresses the finding for its month, because a partial leakage total
 *    understates the drag and a recommendation built on it would be wrong low.
 *  - Trend needs at least two complete months. With one month there is a level
 *    but no direction, and "rising" is the whole reason a NOTICE becomes a WARNING.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

const monthKey = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;

interface MonthBucket {
  key: string;
  drag: number;
  /** True when some drag row in this month had no base amount — total is unsafe. */
  incomplete: boolean;
}

/** Only settled, non-transfer rows count. PENDING has not left the account. */
function isCountable(t: OpportunityTxn): boolean {
  return t.status === "BOOKED" && t.behavioral === "FINANCIAL_DRAG";
}

export function bucketDragByMonth(txns: OpportunityTxn[]): MonthBucket[] {
  const byMonth = new Map<string, MonthBucket>();
  for (const t of txns) {
    if (!isCountable(t)) continue;
    const key = monthKey(t.bookedAt);
    const b = byMonth.get(key) ?? { key, drag: 0, incomplete: false };
    if (t.amountBase === null) b.incomplete = true;
    else b.drag += Math.abs(t.amountBase);
    byMonth.set(key, b);
  }
  return [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export function analyzeLeakage(input: OpportunityInput): OpportunityFinding[] {
  const { assumptions } = input;
  const buckets = bucketDragByMonth(input.transactions).filter((b) => !b.incomplete);
  if (buckets.length === 0) return [];

  const window = buckets.slice(-Math.max(1, Math.trunc(assumptions.baselineMonths)));
  const monthlyAvg = round2(window.reduce((s, b) => s + b.drag, 0) / window.length);
  if (monthlyAvg <= assumptions.leakageFeeNoticeBase) return [];

  // Direction, not just level. Compare the latest complete month against the mean
  // of the ones before it inside the same window; with a single month there is no
  // trend and the finding stays a NOTICE.
  const latest = window[window.length - 1];
  const priors = window.slice(0, -1);
  const priorAvg = priors.length > 0 ? priors.reduce((s, b) => s + b.drag, 0) / priors.length : null;
  const trendPct =
    priorAvg !== null && priorAvg > 0 ? round2(((latest!.drag - priorAvg) / priorAvg) * 100) : null;
  const rising = trendPct !== null && trendPct > 0;

  // Which merchants the drag actually came from — a leakage number with no name
  // attached is not actionable.
  const byMerchant = new Map<string, number>();
  const windowKeys = new Set(window.map((b) => b.key));
  for (const t of input.transactions) {
    if (!isCountable(t) || t.amountBase === null) continue;
    if (!windowKeys.has(monthKey(t.bookedAt))) continue;
    const key = t.merchantKey ?? t.categoryKey ?? "unattributed";
    byMerchant.set(key, (byMerchant.get(key) ?? 0) + Math.abs(t.amountBase));
  }
  const top = [...byMerchant.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);

  return [
    {
      code: "OPERATIONAL_LEAKAGE_ABOVE_NOTICE",
      severity: rising ? "WARNING" : "NOTICE",
      metrics: {
        monthlyLeakageBase: monthlyAvg,
        annualLeakageBase: round2(monthlyAvg * 12),
        thresholdBase: assumptions.leakageFeeNoticeBase,
        monthsObserved: window.length,
        latestMonth: latest!.key,
        latestMonthBase: round2(latest!.drag),
        trendPct: trendPct ?? "n/a",
        topSources: top.map(([k, v]) => `${k}:${round2(v)}`).join(", ") || "unattributed",
        topSourceCount: top.length,
      },
      evidenceItemIds: [],
    },
  ];
}

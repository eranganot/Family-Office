import type { PrismaClient } from "@wealthos/db";
import { assumptionRegistry } from "@wealthos/registry";
import { buildSnapshot } from "./snapshot-service";

/**
 * M41 — monthly review: the snapshot and the drift check that run when a period closes.
 *
 * Closing a month already freezes the OPERATIONAL figures (`computed`, `pins`,
 * `engineVersion`). What it did not freeze is the HOUSEHOLD those figures describe,
 * which is what a later strategy rerun compares against. So a close now also takes a
 * review snapshot and pins it to the period.
 *
 * The snapshot is taken BEFORE the drift check on purpose: the drift finding is
 * evidence about a specific household state, and an alert that cannot say which state
 * it was looking at is not reproducible.
 */

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const round2 = (n: number): number => Math.round(n * 100) / 100;

export type DriftOutcome =
  | {
      checked: true;
      raised: boolean;
      driftPct: number;
      baselineBase: number;
      realisedBase: number;
      monthsInBaseline: number;
      /** Either side still contains unverified rows. Reported, never a reason to refuse. */
      isProvisional: boolean;
    }
  | { checked: false; reason: "NO_BASELINE_MONTHS" | "SURPLUS_NOT_COMPUTED" };

export interface CloseReviewResult {
  snapshotId: string;
  drift: DriftOutcome;
  alertId: string | null;
}

async function driftThresholdPct(db: PrismaClient, householdId: string): Promise<number> {
  const rows = await assumptionRegistry(db).all(householdId);
  const v = rows.find((r) => r.key === "operations_surplus_drift_pct")?.value;
  return typeof v === "number" ? v : 20;
}

/**
 * Baseline for "is this month unusual".
 *
 * The assumption's own description says "deviation from the approved plan's
 * assumption" — but no approved-plan monthly-surplus figure exists anywhere in the
 * schema. `committedPlan` carries booleans (deploysIdleCash, investsGrowth, …), not a
 * surplus. Rather than invent a field or read a JSON shape nobody guarantees, the
 * baseline is the mean of PREVIOUSLY CLOSED months. That is a fact the system actually
 * holds, and it answers the question the alert exists to ask: has the household's
 * surplus stopped behaving the way the plan was built on top of?
 *
 * ---------------------------------------------------------------------------
 * PROVISIONAL MONTHS ARE INCLUDED — AND THE FIRST VERSION OF THIS WAS WRONG
 * ---------------------------------------------------------------------------
 * This function originally required `surplusIsProvisional: false`, by analogy with the
 * EOY projection. QA killed it: EVERY closed month in the owner's household is
 * provisional, because closing with unverified rows is explicitly ALLOWED (the
 * non-blocking rule is a deliberate design decision of this whole module). So the
 * baseline was always empty, drift always reported NO_BASELINE_MONTHS, and the feature
 * could never fire for the only household that exists. Individually defensible
 * exclusion, collectively a disabled feature — the exact M40b failure shape.
 *
 * The correct rule is not "provisional is unusable", it is **the standard depends on the
 * consequence**:
 *   - DEPLOYING CASH against a provisional surplus moves real money, so
 *     `allocationHandoffReadiness` still refuses it outright.
 *   - A DRIFT ALERT prompts a review. Comparing provisional to provisional is sound,
 *     because the same unverified-row bias sits on both sides of the ratio, and a
 *     ratio is far more robust to a shared bias than a level is.
 *
 * The provisional status of both sides is carried into the alert so the reader can
 * discount it, rather than silently withheld.
 */
async function surplusBaseline(
  db: PrismaClient,
  householdId: string,
  year: number,
  month: number,
): Promise<{ meanBase: number; months: number; anyProvisional: boolean } | null> {
  const priors = await db.operatingPeriod.findMany({
    where: {
      householdId,
      status: "CLOSED",
      surplusBase: { not: null },
      OR: [{ year: { lt: year } }, { year, month: { lt: month } }],
    },
    select: { surplusBase: true, surplusIsProvisional: true },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 6,
  });
  if (priors.length === 0) return null;
  const mean = priors.reduce((s, p) => s + num(p.surplusBase), 0) / priors.length;
  return {
    meanBase: round2(mean),
    months: priors.length,
    anyProvisional: priors.some((p) => p.surplusIsProvisional),
  };
}

function severityFor(absDriftPct: number, thresholdPct: number): "LOW" | "MEDIUM" | "HIGH" {
  if (absDriftPct >= thresholdPct * 3) return "HIGH";
  if (absDriftPct >= thresholdPct * 2) return "MEDIUM";
  return "LOW";
}

/**
 * Runs after a period is CLOSED. Takes the review snapshot, pins it to the period, and
 * raises a drift alert when the realised surplus has moved away from the baseline the
 * plan was built on.
 *
 * A drift alert is deliberately NOT raised silently in both directions without saying
 * which: surplus coming in far ABOVE plan is also worth a strategy rerun (there is
 * money the plan is not deploying), so the sign is carried in the detail and the title
 * rather than only the magnitude.
 */
export interface SurplusDriftAlertView {
  id: string;
  severity: string;
  title: string;
  titleHe: string | null;
  year: number | null;
  month: number | null;
  driftPct: number | null;
  direction: string | null;
  realisedBase: number | null;
  baselineBase: number | null;
  monthsInBaseline: number | null;
  isProvisional: boolean;
  createdAt: string;
}

/**
 * M41 — open surplus-drift alerts, newest first.
 *
 * Read-only and OPEN-only. A resolved alert is history, and showing it alongside a live
 * one would make a household that has already acted look like one that has not.
 */
export async function listSurplusDriftAlerts(
  db: PrismaClient,
  householdId: string,
): Promise<SurplusDriftAlertView[]> {
  const rows = await db.monitoringAlert.findMany({
    where: { householdId, kind: "SURPLUS_DRIFT", status: "OPEN" },
    orderBy: { createdAt: "desc" },
    take: 12,
  });
  const n = (d: Record<string, unknown>, k: string): number | null =>
    typeof d[k] === "number" ? (d[k] as number) : null;
  return rows.map((r) => {
    const d = (r.detail ?? {}) as Record<string, unknown>;
    return {
      id: r.id,
      severity: r.severity,
      title: r.title,
      titleHe: r.titleHe,
      year: n(d, "year"),
      month: n(d, "month"),
      driftPct: n(d, "driftPct"),
      direction: typeof d["direction"] === "string" ? (d["direction"] as string) : null,
      realisedBase: n(d, "realisedBase"),
      baselineBase: n(d, "baselineBase"),
      monthsInBaseline: n(d, "monthsInBaseline"),
      isProvisional: d["isProvisional"] === true,
      createdAt: r.createdAt.toISOString(),
    };
  });
}

export interface AllocationHandoffReadiness {
  ready: boolean;
  reason:
    | "READY"
    | "PERIOD_NOT_CLOSED"
    | "SURPLUS_NOT_COMPUTED"
    | "SURPLUS_PROVISIONAL"
    | "SURPLUS_NOT_POSITIVE"
    | "WRONG_PHASE";
  verifiedSurplusBase: number | null;
  workflowState: string;
  year: number;
  month: number;
}

/**
 * M41 — surplus → deployment engine hand-off, readiness half.
 *
 * The operations module must NOT re-implement allocation, and equally must not smuggle
 * itself past the four-phase state machine. `runAllocation` sits behind
 * `workflowGuard("ALLOCATION")`, and the operational workspace is deliberately
 * cross-phase (owner decision D2) — so calling it from here would let a MAPPING-phase
 * household generate a deployment plan, which is exactly what the guard exists to stop.
 *
 * So this reports whether the hand-off CAN happen and what the verified figure is; the
 * plan itself is still generated by the existing engine, behind the existing guard.
 *
 * A provisional surplus is refused rather than deployed. Committing money against a
 * figure that still contains unverified transactions is the one place in this module
 * where being wrong moves real cash.
 */
export async function allocationHandoffReadiness(
  db: PrismaClient,
  householdId: string,
  year: number,
  month: number,
): Promise<AllocationHandoffReadiness> {
  const household = await db.household.findUniqueOrThrow({
    where: { id: householdId },
    select: { workflowState: true },
  });
  const period = await db.operatingPeriod.findUnique({
    where: { householdId_year_month: { householdId, year, month } },
    select: { status: true, surplusBase: true, surplusIsProvisional: true },
  });

  const base = { workflowState: household.workflowState, year, month };

  if (!period || period.status !== "CLOSED") {
    return { ...base, ready: false, reason: "PERIOD_NOT_CLOSED", verifiedSurplusBase: null };
  }
  if (period.surplusBase === null) {
    return { ...base, ready: false, reason: "SURPLUS_NOT_COMPUTED", verifiedSurplusBase: null };
  }
  const surplus = round2(num(period.surplusBase));
  if (period.surplusIsProvisional) {
    return { ...base, ready: false, reason: "SURPLUS_PROVISIONAL", verifiedSurplusBase: surplus };
  }
  if (surplus <= 0) {
    return { ...base, ready: false, reason: "SURPLUS_NOT_POSITIVE", verifiedSurplusBase: surplus };
  }
  if (household.workflowState !== "ALLOCATION" && household.workflowState !== "STRATEGY") {
    return { ...base, ready: false, reason: "WRONG_PHASE", verifiedSurplusBase: surplus };
  }
  return { ...base, ready: true, reason: "READY", verifiedSurplusBase: surplus };
}

export async function runCloseReview(
  db: PrismaClient,
  householdId: string,
  year: number,
  month: number,
): Promise<CloseReviewResult> {
  const { snapshotId } = await buildSnapshot(db, householdId, "MANUAL");

  await db.operatingPeriod.update({
    where: { householdId_year_month: { householdId, year, month } },
    data: { reviewSnapshotId: snapshotId },
  });

  const period = await db.operatingPeriod.findUniqueOrThrow({
    where: { householdId_year_month: { householdId, year, month } },
    select: { surplusBase: true, surplusIsProvisional: true },
  });

  if (period.surplusBase === null) {
    return { snapshotId, drift: { checked: false, reason: "SURPLUS_NOT_COMPUTED" }, alertId: null };
  }

  const baseline = await surplusBaseline(db, householdId, year, month);
  if (baseline === null) {
    // First closed month: there is nothing to be unusual against. Reported, not guessed.
    return { snapshotId, drift: { checked: false, reason: "NO_BASELINE_MONTHS" }, alertId: null };
  }

  const realised = num(period.surplusBase);
  const thresholdPct = await driftThresholdPct(db, householdId);

  // A zero baseline cannot produce a percentage. Refuse rather than divide.
  if (baseline.meanBase === 0) {
    return { snapshotId, drift: { checked: false, reason: "NO_BASELINE_MONTHS" }, alertId: null };
  }

  const driftPct = round2(((realised - baseline.meanBase) / Math.abs(baseline.meanBase)) * 100);
  const raised = Math.abs(driftPct) >= thresholdPct;

  const drift: DriftOutcome = {
    checked: true,
    raised,
    driftPct,
    baselineBase: baseline.meanBase,
    realisedBase: round2(realised),
    monthsInBaseline: baseline.months,
    isProvisional: period.surplusIsProvisional || baseline.anyProvisional,
  };

  /*
   * M41c — supersede any OPEN drift alert for THIS month before writing a new one.
   *
   * QA closed March twice and got two identical HIGH alerts. Closing a month is a
   * repeatable action (close, reopen, reclassify, close again), so without this the
   * alert list grows by one every time — and an inbox that shows the same finding four
   * times trains the owner to ignore all four. Same rule the Opportunity Center uses:
   * a rerun supersedes its own prior output rather than appending to it.
   *
   * RESOLVED, not deleted: the alert genuinely was raised and acted on the audit trail
   * should keep it. Only the newest one stays OPEN.
   */
  await db.monitoringAlert.updateMany({
    where: {
      householdId,
      kind: "SURPLUS_DRIFT",
      status: "OPEN",
      detail: { path: ["year"], equals: year },
      AND: [{ detail: { path: ["month"], equals: month } }],
    },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });

  if (!raised) return { snapshotId, drift, alertId: null };

  const below = driftPct < 0;
  const run = await db.monitoringRun.create({
    data: {
      householdId,
      snapshotId,
      trigger: "PERIOD_CLOSE",
      severity: severityFor(Math.abs(driftPct), thresholdPct),
      driftReport: {
        source: "OPERATIONS_MONTHLY_CLOSE",
        year,
        month,
        realisedBase: drift.realisedBase,
        baselineBase: baseline.meanBase,
        monthsInBaseline: baseline.months,
        driftPct,
        thresholdPct,
        provisional: period.surplusIsProvisional,
        baselineAnyProvisional: baseline.anyProvisional,
      },
      // This run is a targeted surplus check, not the nightly sweep. Saying "nothing
      // was swept" is honest; leaving the field shaped like a completed sweep would
      // make a later reader think staleness had been checked here.
      stalenessReport: { swept: [], evaluated: 0, note: "NOT_A_STALENESS_SWEEP" },
    },
    select: { id: true },
  });

  const alert = await db.monitoringAlert.create({
    data: {
      householdId,
      runId: run.id,
      kind: "SURPLUS_DRIFT",
      severity: severityFor(Math.abs(driftPct), thresholdPct),
      title: below
        ? `Monthly surplus is ${Math.abs(driftPct)}% below the recent baseline`
        : `Monthly surplus is ${driftPct}% above the recent baseline`,
      titleHe: below
        ? `העודף החודשי נמוך ב-${Math.abs(driftPct)}% מהבסיס האחרון`
        : `העודף החודשי גבוה ב-${driftPct}% מהבסיס האחרון`,
      detail: {
        year,
        month,
        realisedBase: drift.realisedBase,
        baselineBase: baseline.meanBase,
        deltaBase: round2(realised - baseline.meanBase),
        driftPct,
        thresholdPct,
        monthsInBaseline: baseline.months,
        // Surplus ABOVE plan is not good news to be ignored: it is money the approved
        // plan is not deploying, and it warrants the same rerun as a shortfall.
        direction: below ? "BELOW" : "ABOVE",
        // Both sides may contain unverified rows. A ratio survives a bias that sits on
        // both sides far better than a level does, so this is a caveat on the figure —
        // not a reason to have withheld it. Withholding is what disabled this feature
        // in its first version.
        isProvisional: period.surplusIsProvisional || baseline.anyProvisional,
      },
      recommendedAction: "RERUN_STRATEGY",
    },
    select: { id: true },
  });

  return { snapshotId, drift, alertId: alert.id };
}

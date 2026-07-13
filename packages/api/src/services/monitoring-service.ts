import type { PrismaClient, DriftSeverity as DbDriftSeverity } from "@wealthos/db";
import { ledgerRepo } from "@wealthos/db";
import { SnapshotPayloadSchema } from "@wealthos/domain";
import {
  detectDrift,
  sweepStaleness,
  MONITORING_ENGINE_VERSION,
  type DriftFinding,
  type DriftThresholds,
  type StalenessInput,
} from "@wealthos/engine-monitoring";
import { assumptionRegistry } from "@wealthos/registry";
import { buildSnapshot } from "./snapshot-service";

export interface MonitoringCycleResult {
  runId: string;
  snapshotId: string;
  baselineSnapshotId: string | null;
  severity: DbDriftSeverity;
  driftFindings: number;
  itemsFlaggedStale: number;
  alertsOpened: number;
}

interface AlertDraft {
  kind: string;
  severity: DbDriftSeverity;
  title: string;
  titleHe: string;
  detail: Record<string, unknown>;
  recommendedAction: string;
}

const DRIFT_TITLES: Record<string, { en: string; he: string }> = {
  NET_WORTH_DRIFT: { en: "Net worth has moved materially since your strategy", he: "השווי הנקי השתנה משמעותית מאז האסטרטגיה" },
  LIQUIDITY_DRIFT: { en: "Liquidity mix has shifted since your strategy", he: "תמהיל הנזילות השתנה מאז האסטרטגיה" },
  CONCENTRATION_DRIFT: { en: "A single holding has grown more concentrated", he: "אחזקה בודדת הפכה מרוכזת יותר" },
  GOAL_FUNDING_DRIFT: { en: "Goal funding coverage has changed", he: "כיסוי מימון היעדים השתנה" },
  ITEM_ADDED: { en: "New holdings appeared since your strategy baseline", he: "נוספו אחזקות חדשות מאז בסיס האסטרטגיה" },
  ITEM_REMOVED: { en: "Holdings are missing versus your strategy baseline", he: "חסרות אחזקות ביחס לבסיס האסטרטגיה" },
};

function toDbSeverity(s: DriftFinding["severity"]): DbDriftSeverity {
  return s as DbDriftSeverity;
}

/**
 * The M9 monitoring cycle — the beating heart of Phase 4. Runs on a schedule
 * (apps/worker cron) or on demand. It:
 *   1. takes a SCHEDULED snapshot (same builder as strategy — one source of truth),
 *   2. compares it to the latest strategy baseline via the pure DriftDetector,
 *   3. sweeps the ledger for stale valuations and flips VERIFIED → STALE,
 *   4. records an immutable MonitoringRun plus actionable MonitoringAlerts.
 *
 * It never changes workflow phase itself — that is the re-evaluation flow's job,
 * gated and human-initiated. Monitoring only observes and raises alerts.
 */
export async function runMonitoringCycle(
  db: PrismaClient,
  householdId: string,
  trigger: "CRON" | "MANUAL",
  now: Date = new Date(),
): Promise<MonitoringCycleResult> {
  const { snapshotId, payload } = await buildSnapshot(db, householdId, "SCHEDULED");

  // Thresholds are owned by the AssumptionRegistry — nothing hard-coded here.
  const reg = assumptionRegistry(db);
  const [nw, liq, conc, goal, alloc, staleCfg] = await Promise.all([
    reg.current("drift_net_worth_pct", householdId),
    reg.current("drift_liquidity_pct", householdId),
    reg.current("drift_concentration_pct", householdId),
    reg.current("drift_goal_funding_pct", householdId),
    reg.current("drift_allocation_pct", householdId),
    reg.current("staleness_days_by_kind", householdId),
  ]);
  const thresholds: DriftThresholds = {
    netWorthPct: Number(nw.value),
    liquidityPct: Number(liq.value),
    concentrationPct: Number(conc.value),
    goalFundingPct: Number(goal.value),
    allocationPct: Number(alloc.value),
  };
  const thresholdsByKind = staleCfg.value as Record<string, number>;

  // Baseline = the most recent snapshot strategy was built on.
  const baselineRow = await db.householdSnapshot.findFirst({
    where: { householdId, kind: "PRE_STRATEGY" },
    orderBy: { takenAt: "desc" },
  });
  const baseline = baselineRow ? SnapshotPayloadSchema.parse(baselineRow.payload) : null;

  const drift = detectDrift(payload, baseline, thresholds);

  // Staleness sweep over the live ledger.
  const items = await ledgerRepo.list(db, householdId);
  const stalenessInput: StalenessInput[] = items.map((i) => ({
    id: i.id,
    name: i.name,
    kind: i.kind,
    verification: i.verification,
    latestValuationAsOf: i.latestValuation?.asOf ?? null,
  }));
  const staleness = sweepStaleness(stalenessInput, now, thresholdsByKind);

  // Build alert drafts.
  const alertDrafts: AlertDraft[] = drift.findings.map((f) => {
    const t = DRIFT_TITLES[f.kind] ?? { en: f.kind, he: f.kind };
    return {
      kind: f.kind,
      severity: toDbSeverity(f.severity),
      title: t.en,
      titleHe: t.he,
      detail: { ...f.detail, baseline: f.baseline, current: f.current, delta: f.delta, threshold: f.thresholdCrossed },
      recommendedAction: f.recommendedAction,
    };
  });
  if (staleness.stale.length > 0) {
    alertDrafts.push({
      kind: "STALENESS",
      severity: "MEDIUM",
      title: `${staleness.stale.length} holding(s) have stale valuations and need re-verification`,
      titleHe: `${staleness.stale.length} אחזקות עם הערכות שווי מיושנות הדורשות אימות מחדש`,
      detail: { staleItems: staleness.stale, evaluated: staleness.evaluated },
      recommendedAction: "REVERIFY",
    });
  }

  const runSeverity: DbDriftSeverity = alertDrafts.reduce<DbDriftSeverity>((acc, a) => rankSev(a.severity) > rankSev(acc) ? a.severity : acc, "NONE");

  // Persist atomically: flip stale items, write the run, write alerts, audit.
  const runId = await db.$transaction(async (tx) => {
    for (const s of staleness.stale) {
      await tx.ledgerItem.update({ where: { id: s.id }, data: { verification: "STALE" } });
    }
    const run = await tx.monitoringRun.create({
      data: {
        householdId,
        snapshotId,
        baselineSnapshotId: baselineRow?.id ?? null,
        trigger,
        severity: runSeverity,
        driftReport: {
          engineVersion: MONITORING_ENGINE_VERSION,
          hasBaseline: drift.hasBaseline,
          severity: drift.severity,
          baselineMetrics: drift.baselineMetrics,
          currentMetrics: drift.currentMetrics,
          findings: drift.findings,
        } as never,
        stalenessReport: {
          swept: staleness.stale.map((s) => s.id),
          stale: staleness.stale,
          evaluated: staleness.evaluated,
          thresholdsByKind: staleness.thresholdsByKind,
        } as never,
        itemsFlaggedStale: staleness.stale.length,
        alerts: {
          create: alertDrafts.map((a) => ({
            householdId,
            kind: a.kind,
            severity: a.severity,
            title: a.title,
            titleHe: a.titleHe,
            detail: a.detail as never,
            recommendedAction: a.recommendedAction,
          })),
        },
      },
    });
    await tx.auditEvent.create({
      data: {
        householdId,
        actor: trigger === "CRON" ? "system" : "user",
        eventType: "monitoring.cycle",
        entity: "MonitoringRun",
        entityId: run.id,
        payload: { trigger, severity: runSeverity, driftFindings: drift.findings.length, itemsFlaggedStale: staleness.stale.length } as never,
      },
    });
    return run.id;
  });

  return {
    runId,
    snapshotId,
    baselineSnapshotId: baselineRow?.id ?? null,
    severity: runSeverity,
    driftFindings: drift.findings.length,
    itemsFlaggedStale: staleness.stale.length,
    alertsOpened: alertDrafts.length,
  };
}

function rankSev(s: DbDriftSeverity): number {
  return { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 }[s];
}

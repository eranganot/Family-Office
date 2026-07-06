import type { SnapshotPayload } from "@wealthos/domain";
import { computeMetrics, type HouseholdMetrics } from "./metrics";

/** Severity ladder shared with the DB DriftSeverity enum. */
export type DriftSeverity = "NONE" | "LOW" | "MEDIUM" | "HIGH";

export type DriftKind =
  | "NET_WORTH_DRIFT"
  | "LIQUIDITY_DRIFT"
  | "CONCENTRATION_DRIFT"
  | "GOAL_FUNDING_DRIFT"
  | "ITEM_ADDED"
  | "ITEM_REMOVED";

export type RecommendedAction = "REVERIFY" | "RERUN_STRATEGY" | "REVIEW";

export interface DriftFinding {
  kind: DriftKind;
  severity: DriftSeverity;
  /** Baseline metric value (null when not applicable, e.g. item add/remove). */
  baseline: number | null;
  current: number | null;
  /** Signed magnitude of the change actually measured (relative % or percentage points). */
  delta: number | null;
  thresholdCrossed: number;
  recommendedAction: RecommendedAction;
  detail: Record<string, number | string | string[] | null>;
}

export interface DriftThresholds {
  /** Relative net-worth change (%) vs baseline that constitutes drift. */
  netWorthPct: number;
  /** Liquid-share change in percentage points. */
  liquidityPct: number;
  /** Single-asset concentration increase in percentage points. */
  concentrationPct: number;
  /** Goal-coverage change in percentage points. */
  goalFundingPct: number;
}

export interface DriftReport {
  hasBaseline: boolean;
  baselineMetrics: HouseholdMetrics | null;
  currentMetrics: HouseholdMetrics;
  findings: DriftFinding[];
  /** Highest severity across findings. */
  severity: DriftSeverity;
}

const SEVERITY_RANK: Record<DriftSeverity, number> = { NONE: 0, LOW: 1, MEDIUM: 2, HIGH: 3 };

/** A crossed threshold is MEDIUM; twice the threshold or beyond is HIGH. */
function severityFor(magnitude: number, threshold: number): DriftSeverity {
  if (magnitude < threshold) return "NONE";
  return magnitude >= threshold * 2 ? "HIGH" : "MEDIUM";
}

function maxSeverity(findings: DriftFinding[]): DriftSeverity {
  return findings.reduce<DriftSeverity>(
    (acc, f) => (SEVERITY_RANK[f.severity] > SEVERITY_RANK[acc] ? f.severity : acc),
    "NONE",
  );
}

/**
 * DriftDetector: compares the current monitoring snapshot against the strategy
 * baseline snapshot. Every threshold is supplied by the caller (from the
 * AssumptionRegistry) — nothing is hard-coded. Pure and deterministic.
 *
 * With no baseline (strategy never run) the report carries the current metrics
 * and no findings; monitoring still records the snapshot.
 */
export function detectDrift(
  current: SnapshotPayload,
  baseline: SnapshotPayload | null,
  thresholds: DriftThresholds,
): DriftReport {
  const currentMetrics = computeMetrics(current);
  if (!baseline) {
    return { hasBaseline: false, baselineMetrics: null, currentMetrics, findings: [], severity: "NONE" };
  }
  const baselineMetrics = computeMetrics(baseline);
  const findings: DriftFinding[] = [];

  // Net worth — relative change against the baseline magnitude.
  if (Math.abs(baselineMetrics.netWorth) > 0) {
    const deltaPct = ((currentMetrics.netWorth - baselineMetrics.netWorth) / Math.abs(baselineMetrics.netWorth)) * 100;
    const sev = severityFor(Math.abs(deltaPct), thresholds.netWorthPct);
    if (sev !== "NONE") {
      findings.push({
        kind: "NET_WORTH_DRIFT",
        severity: sev,
        baseline: Math.round(baselineMetrics.netWorth),
        current: Math.round(currentMetrics.netWorth),
        delta: round1(deltaPct),
        thresholdCrossed: thresholds.netWorthPct,
        recommendedAction: "RERUN_STRATEGY",
        detail: { direction: deltaPct >= 0 ? "UP" : "DOWN", deltaPct: round1(deltaPct) },
      });
    }
  }

  // Liquid share — percentage-point change.
  findings.push(...ppFinding("LIQUIDITY_DRIFT", baselineMetrics.liquidSharePct, currentMetrics.liquidSharePct, thresholds.liquidityPct, "RERUN_STRATEGY", false));

  // Concentration — only an INCREASE in single-asset share is a risk.
  findings.push(...ppFinding("CONCENTRATION_DRIFT", baselineMetrics.topConcentrationPct, currentMetrics.topConcentrationPct, thresholds.concentrationPct, "RERUN_STRATEGY", true));

  // Goal coverage — percentage-point change either direction.
  findings.push(...ppFinding("GOAL_FUNDING_DRIFT", baselineMetrics.goalCoveragePct, currentMetrics.goalCoveragePct, thresholds.goalFundingPct, "RERUN_STRATEGY", false));

  // Composition changes — items that appeared or disappeared since the baseline.
  const baseIds = new Set(baseline.items.map((i) => i.id));
  const curIds = new Set(current.items.map((i) => i.id));
  const added = current.items.filter((i) => !baseIds.has(i.id)).map((i) => i.id);
  const removed = baseline.items.filter((i) => !curIds.has(i.id)).map((i) => i.id);
  if (added.length > 0) {
    findings.push({
      kind: "ITEM_ADDED", severity: "LOW", baseline: baseIds.size, current: curIds.size, delta: added.length,
      thresholdCrossed: 0, recommendedAction: "REVIEW", detail: { addedItemIds: added, count: added.length },
    });
  }
  if (removed.length > 0) {
    findings.push({
      kind: "ITEM_REMOVED", severity: "LOW", baseline: baseIds.size, current: curIds.size, delta: removed.length,
      thresholdCrossed: 0, recommendedAction: "REVIEW", detail: { removedItemIds: removed, count: removed.length },
    });
  }

  return { hasBaseline: true, baselineMetrics, currentMetrics, findings, severity: maxSeverity(findings) };
}

/** Build a percentage-point drift finding, or nothing if within threshold or incomputable. */
function ppFinding(
  kind: DriftKind,
  baseline: number | null,
  current: number | null,
  threshold: number,
  action: RecommendedAction,
  increaseOnly: boolean,
): DriftFinding[] {
  if (baseline === null || current === null) return [];
  const deltaPp = current - baseline;
  const magnitude = increaseOnly ? Math.max(0, deltaPp) : Math.abs(deltaPp);
  const sev = severityFor(magnitude, threshold);
  if (sev === "NONE") return [];
  return [{
    kind,
    severity: sev,
    baseline: round1(baseline),
    current: round1(current),
    delta: round1(deltaPp),
    thresholdCrossed: threshold,
    recommendedAction: action,
    detail: { baselinePct: round1(baseline), currentPct: round1(current), deltaPp: round1(deltaPp) },
  }];
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

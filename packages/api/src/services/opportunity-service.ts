import type { PrismaClient } from "@wealthos/db";
import {
  runOpportunityAnalyzers,
  type OpportunityCalendarEvent,
  type OpportunityFinding,
  type OpportunityTxn,
} from "@wealthos/engine-operations";
import {
  ENGINE_VERSION,
  generateOperationalRecommendations,
  scorePriority,
  type OperationalDraft,
  type PriorityWeights,
} from "@wealthos/engine-strategy";
import { assumptionRegistry } from "@wealthos/registry";
import { buildSnapshot } from "./snapshot-service";

/**
 * M40a — the operational opportunity pipeline.
 *
 *   transactions + calendar → analyzers → drafts → validated → Recommendation
 *
 * It is the strategic pipeline's twin, and stays a twin on purpose: same
 * `Rationale` schema, same product-reference validator, same assumption pinning,
 * same "an ACCEPTED item is never re-proposed" rule. What differs is the cadence
 * (monthly, from observed transactions) and `origin=OPERATIONAL`, which is the
 * only thing that keeps the two inboxes apart.
 *
 * Isolation guarantee: a run supersedes ONLY `origin=OPERATIONAL` proposals.
 * Strategic recommendations are never touched by an operations run, and vice
 * versa — otherwise importing a bank statement would quietly wipe the strategy
 * inbox.
 */

const num = (v: unknown): number => (v == null ? 0 : Number(v));
const DAY_MS = 86_400_000;

export interface OpportunityRunResult {
  ran: true;
  snapshotId: string;
  created: number;
  supersededCount: number;
  findings: string[];
  unmappedFindings: string[];
  /** True when any consumed tax matrix is still `ownerReviewed=false` (B2/B3). */
  usesUnreviewedTaxFigures: boolean;
}

/** Thresholds for the opportunity analyzers — Registry only, never hardcoded. */
async function opportunityAssumptions(db: PrismaClient, householdId: string) {
  const rows = await assumptionRegistry(db).all(householdId);
  const map = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  const n = (k: string, fallback: number): number => {
    const v = map[k];
    return typeof v === "number" ? v : fallback;
  };
  return {
    values: {
      baselineMonths: n("operations_baseline_months", 3),
      leakageFeeNoticeBase: n("leakage_bank_fee_monthly_notice_base", 40),
      subscriptionDormantDays: n("leakage_subscription_dormant_days", 90),
      calendarWindowDays: n("calendar_upcoming_window_days", 60),
    },
    weights: map["priority_weights"] as PriorityWeights,
    rowsByKey: new Map(rows.map((r) => [r.key, r] as const)),
  };
}

/**
 * Transactions for the analyzer window. The window is the baseline window plus the
 * dormancy horizon, because subscription detection needs history that predates the
 * leakage baseline — a 3-month leakage window cannot evidence a 90-day dormancy.
 */
async function loadOpportunityTxns(
  db: PrismaClient,
  householdId: string,
  asOf: Date,
  baselineMonths: number,
  dormantDays: number,
): Promise<OpportunityTxn[]> {
  const lookbackDays = Math.max(baselineMonths * 31, dormantDays + 62);
  const since = new Date(asOf.getTime() - lookbackDays * DAY_MS);
  const rows = await db.transaction.findMany({
    where: { householdId, bookedAt: { gte: since }, isDuplicateOf: null },
    select: {
      id: true,
      bookedAt: true,
      amountBase: true,
      status: true,
      merchantKey: true,
      isRecurringCandidate: true,
      behavioralClass: true,
      // M40a-fix: the subscription analyzer must be able to tell an obligation from a
      // subscription. A row that is evidence for a mapped ledger stream is never
      // cancellable, however regular it looks.
      ledgerItemId: true,
      category: { select: { key: true, defaultBehavioralClass: true } },
    },
    orderBy: { bookedAt: "asc" },
  });

  return rows.map((t) => ({
    id: t.id,
    bookedAt: t.bookedAt,
    amountBase: t.amountBase === null ? null : num(t.amountBase),
    status: t.status,
    categoryKey: t.category?.key ?? null,
    // An owner override beats the category default — that is the whole point of
    // having both columns.
    behavioral: t.behavioralClass ?? t.category?.defaultBehavioralClass ?? null,
    merchantKey: t.merchantKey,
    isRecurringCandidate: t.isRecurringCandidate,
    ledgerItemId: t.ledgerItemId,
  }));
}

async function loadCalendarEvents(
  db: PrismaClient,
  householdId: string,
  asOf: Date,
  windowDays: number,
): Promise<OpportunityCalendarEvent[]> {
  const rows = await db.calendarEvent.findMany({
    where: {
      householdId,
      status: { in: ["SCHEDULED", "DUE"] },
      dueDate: {
        gte: new Date(asOf.getTime() - DAY_MS),
        lte: new Date(asOf.getTime() + windowDays * DAY_MS),
      },
    },
    orderBy: { dueDate: "asc" },
  });
  return rows.map((e) => ({
    id: e.id,
    kind: e.kind,
    titleEn: e.titleEn,
    titleHe: e.titleHe,
    dueDate: e.dueDate,
    amountBase: e.amountBase === null ? null : num(e.amountBase),
    isCashImpacting: e.isCashImpacting,
    sourceNote: e.sourceNote,
  }));
}

/**
 * Any tax matrix the household's figures rest on that the owner has not signed off
 * (blockers B2/B3). Reported, never suppressed: the opportunity is still real, but
 * a number derived from unreviewed figures must say so on its face.
 */
async function hasUnreviewedTaxFigures(db: PrismaClient): Promise<boolean> {
  const unreviewed = await db.taxRuleSet.count({
    where: { ownerReviewed: false, taxYear: { gte: new Date().getUTCFullYear() } },
  });
  return unreviewed > 0;
}

export async function runOpportunities(
  db: PrismaClient,
  householdId: string,
  asOf: Date = new Date(),
): Promise<OpportunityRunResult> {
  const a = await opportunityAssumptions(db, householdId);

  const [transactions, calendarEvents, unreviewedTax] = await Promise.all([
    loadOpportunityTxns(db, householdId, asOf, a.values.baselineMonths, a.values.subscriptionDormantDays),
    loadCalendarEvents(db, householdId, asOf, a.values.calendarWindowDays),
    hasUnreviewedTaxFigures(db),
  ]);

  const findings: OpportunityFinding[] = runOpportunityAnalyzers({
    asOf,
    assumptions: a.values,
    transactions,
    calendarEvents,
  });

  // Reproducibility: an operational recommendation pins a snapshot exactly as a
  // strategic one does. Reuse the newest existing snapshot when there is one —
  // building a fresh snapshot per statement import would flood the history with
  // near-identical rows and make "which snapshot produced this" meaningless.
  const latest = await db.householdSnapshot.findFirst({
    where: { householdId },
    orderBy: { takenAt: "desc" },
    select: { id: true },
  });
  const snapshotId = latest?.id ?? (await buildSnapshot(db, householdId, "MANUAL")).snapshotId;

  const { drafts, unmappedFindings } = generateOperationalRecommendations(findings, asOf);

  let created = 0;
  let supersededCount = 0;

  await db.$transaction(async (tx) => {
    const superseded = await tx.recommendation.updateMany({
      where: { householdId, origin: "OPERATIONAL", status: "PROPOSED" },
      data: { status: "SUPERSEDED" },
    });
    supersededCount = superseded.count;

    // Same rule as strategy: an item the owner already ACCEPTED is not re-proposed,
    // which is what stopped duplicate cards appearing on every rerun.
    const acceptedTypes = new Set(
      (
        await tx.recommendation.findMany({
          where: { householdId, origin: "OPERATIONAL", status: { in: ["ACCEPTED", "IMPLEMENTED"] } },
          select: { type: true },
        })
      ).map((r) => r.type),
    );

    for (const draft of drafts) {
      if (acceptedTypes.has(draft.type)) continue;
      await persistOperationalDraft(tx, {
        householdId,
        snapshotId,
        draft,
        weights: a.weights,
        rowsByKey: a.rowsByKey,
      });
      created += 1;
    }
  });

  return {
    ran: true,
    snapshotId,
    created,
    supersededCount,
    findings: findings.map((f) => f.code),
    unmappedFindings,
    usesUnreviewedTaxFigures: unreviewedTax,
  };
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function persistOperationalDraft(
  tx: Tx,
  args: {
    householdId: string;
    snapshotId: string;
    draft: OperationalDraft;
    weights: PriorityWeights;
    rowsByKey: Map<string, { id: string; version: number }>;
  },
): Promise<void> {
  const { householdId, snapshotId, draft, weights, rowsByKey } = args;
  const pins = draft.assumptionKeysUsed
    .map((k) => rowsByKey.get(k)?.id)
    .filter((id): id is string => Boolean(id));

  await tx.recommendation.create({
    data: {
      householdId,
      snapshotId,
      engineVersion: ENGINE_VERSION,
      type: draft.type,
      title: draft.title,
      titleHe: draft.titleHe,
      rationale: draft.rationale as never,
      rationaleHe: draft.rationaleHe as never,
      actionItems: { en: draft.actionItems, he: draft.actionItemsHe } as never,
      confidenceScore: draft.confidence,
      // Operational findings are computed from OBSERVED transactions, not from the
      // mapped ledger, so ledger completeness is not the right denominator. 100 here
      // means "the observation is complete", and the analyzers already refuse to emit
      // when a month is missing FX conversion.
      dataCompletenessScore: 100,
      priorityScore: String(scorePriority(draft, weights)),
      status: "PROPOSED",
      origin: "OPERATIONAL",
      cadence: draft.cadence,
      difficulty: draft.difficulty,
      reversibility: draft.reversibility,
      impactMonthlyBase: draft.impactMonthlyBase === null ? null : String(draft.impactMonthlyBase),
      impactAnnualBase: draft.impactAnnualBase === null ? null : String(draft.impactAnnualBase),
      impactEoyBase: draft.impactEoyBase === null ? null : String(draft.impactEoyBase),
      expiresAt: draft.expiresAtISO === null ? null : new Date(`${draft.expiresAtISO}T00:00:00.000Z`),
      assumptionPins: { create: [...new Set(pins)].map((assumptionId) => ({ assumptionId })) },
    },
  });
}

export interface OperationalRecommendationView {
  id: string;
  type: string;
  title: string;
  titleHe: string | null;
  status: string;
  priorityScore: number;
  confidenceScore: number;
  cadence: string;
  difficulty: string | null;
  reversibility: string | null;
  impactMonthlyBase: number | null;
  impactAnnualBase: number | null;
  impactEoyBase: number | null;
  expiresAt: string | null;
  daysUntilExpiry: number | null;
  generatedAt: string;
  rationale: unknown;
  rationaleHe: unknown;
  actionItems: unknown;
}

/** The Opportunity Center read model. Expired items are reported, never hidden. */
export async function listOpportunities(
  db: PrismaClient,
  householdId: string,
  asOf: Date = new Date(),
): Promise<{ items: OperationalRecommendationView[]; totalMonthlyBase: number; totalAnnualBase: number }> {
  const rows = await db.recommendation.findMany({
    where: { householdId, origin: "OPERATIONAL", status: { in: ["PROPOSED", "ACCEPTED", "IMPLEMENTED"] } },
    orderBy: [{ priorityScore: "desc" }, { generatedAt: "desc" }],
  });

  const items = rows.map((r) => {
    const expiresAt = r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : null;
    return {
      id: r.id,
      type: r.type,
      title: r.title,
      titleHe: r.titleHe,
      status: r.status,
      priorityScore: num(r.priorityScore),
      confidenceScore: r.confidenceScore,
      cadence: r.cadence,
      difficulty: r.difficulty,
      reversibility: r.reversibility,
      impactMonthlyBase: r.impactMonthlyBase === null ? null : num(r.impactMonthlyBase),
      impactAnnualBase: r.impactAnnualBase === null ? null : num(r.impactAnnualBase),
      impactEoyBase: r.impactEoyBase === null ? null : num(r.impactEoyBase),
      expiresAt,
      daysUntilExpiry:
        r.expiresAt === null
          ? null
          : Math.round(
              (Date.UTC(
                r.expiresAt.getUTCFullYear(),
                r.expiresAt.getUTCMonth(),
                r.expiresAt.getUTCDate(),
              ) -
                Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), asOf.getUTCDate())) /
                DAY_MS,
            ),
      generatedAt: r.generatedAt.toISOString(),
      rationale: r.rationale,
      rationaleHe: r.rationaleHe,
      actionItems: r.actionItems,
    };
  });

  // Only PROPOSED items count toward the headline: an ACCEPTED saving is already
  // banked, and adding it again would let the same shekel be claimed twice.
  const proposed = items.filter((i) => i.status === "PROPOSED");
  const round2 = (n: number): number => Math.round(n * 100) / 100;
  return {
    items,
    totalMonthlyBase: round2(proposed.reduce((s, i) => s + (i.impactMonthlyBase ?? 0), 0)),
    totalAnnualBase: round2(proposed.reduce((s, i) => s + (i.impactAnnualBase ?? 0), 0)),
  };
}

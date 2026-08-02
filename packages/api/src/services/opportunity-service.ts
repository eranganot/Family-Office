import type { PrismaClient } from "@wealthos/db";
import {
  runOpportunityAnalyzers,
  type OpportunityCalendarEvent,
  type OpportunityFinding,
  type OpportunityFxRate,
  type OpportunityTxn,
} from "@wealthos/engine-operations";
import {
  ENGINE_VERSION,
  generateOperationalRecommendations,
  prerequisiteTypesFor,
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
  /** M40c — dependency edges written this run (both ends created in the same run). */
  dependencyCount: number;
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
      minMonthlyBase: n("opportunity_min_monthly_base", 25),
      fxMarkupNoticePct: n("leakage_fx_markup_notice_pct", 1.5),
      minCoveragePct: n("opportunity_min_coverage_pct", 70),
      cashflowHorizonDays: n("cashflow_timing_horizon_days", 180),
      cashflowPeakNoticePct: n("cashflow_peak_month_notice_pct", 40),
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
      // M40c: the FX analyzer divides the ILS charge by the foreign original to
      // recover the rate actually applied. `originalCurrency` is what makes that
      // division safe — the same column also holds an instalment's ILS סכום עסקה.
      originalAmount: true,
      originalCurrency: true,
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
    originalAmount: t.originalAmount === null ? null : num(t.originalAmount),
    originalCurrency: t.originalCurrency,
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

/**
 * M40c — reference rates for the FX-spread analyzer.
 *
 * Loaded for the same window as the transactions plus a week of slack, because the
 * analyzer benchmarks each row against the most recent rate published ON OR BEFORE its
 * booking date and a row booked on day one of the window needs the rate that preceded
 * it. Every source is loaded, not just BOI: the analyzer prefers BOI deterministically
 * but must be able to fall back rather than silently drop a row as unpriceable.
 */
async function loadFxRates(
  db: PrismaClient,
  baseCurrency: string,
  asOf: Date,
  lookbackDays: number,
): Promise<OpportunityFxRate[]> {
  const since = new Date(asOf.getTime() - (lookbackDays + 7) * DAY_MS);
  const rows = await db.fxRate.findMany({
    where: { to: baseCurrency, asOf: { gte: since, lte: asOf } },
    orderBy: { asOf: "desc" },
  });
  return rows.map((r) => ({
    from: r.from,
    to: r.to,
    rate: num(r.rate),
    asOf: r.asOf,
    source: r.source,
  }));
}

/**
 * Calendar events for the analyzers.
 *
 * M40c: loaded over the LONGER of the deadline window and the cash-flow timing
 * horizon. `analyzeDeadlines` re-filters to `calendarWindowDays` internally, so
 * widening the load here cannot change what it reports — it only gives the timing
 * analyzer the months it needs to establish a typical month.
 */
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

  // The base currency is the household's own, read rather than assumed: an analyzer
  // that hardcoded "ILS" would silently mis-handle any household configured otherwise.
  const household = await db.household.findUniqueOrThrow({
    where: { id: householdId },
    select: { baseCurrency: true },
  });
  const lookbackDays = Math.max(
    a.values.baselineMonths * 31,
    a.values.subscriptionDormantDays + 62,
  );

  const [transactions, calendarEvents, fxRates, unreviewedTax] = await Promise.all([
    loadOpportunityTxns(db, householdId, asOf, a.values.baselineMonths, a.values.subscriptionDormantDays),
    loadCalendarEvents(
      db,
      householdId,
      asOf,
      Math.max(a.values.calendarWindowDays, a.values.cashflowHorizonDays),
    ),
    loadFxRates(db, household.baseCurrency, asOf, lookbackDays),
    hasUnreviewedTaxFigures(db),
  ]);

  const findings: OpportunityFinding[] = runOpportunityAnalyzers({
    asOf,
    baseCurrency: household.baseCurrency,
    assumptions: a.values,
    transactions,
    calendarEvents,
    fxRates,
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
  let dependencyCount = 0;

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

    /*
     * M42 — ONE open card per type, enforced twice.
     *
     * QA found the same "5 scheduled reviews within 60 days" card rendered twice. Two
     * ways that can happen, and the supersede above closes neither:
     *
     *  1. Two drafts in one run sharing a type. `idByType` already assumed one-per-type
     *     (it keeps the last id), but the loop happily inserted both rows — so the map
     *     was silently lying about what had been written.
     *  2. Two runs racing — a double-click on recompute. Both supersede the same set,
     *     both then insert. Re-reading PROPOSED types INSIDE this transaction, after the
     *     supersede, closes that: the loser sees the winner's row and skips.
     *
     * Same rule the Opportunity Center already applies to ACCEPTED types, and the same
     * one M41d had to add for drift alerts. An inbox showing one finding twice trains
     * the owner to ignore both.
     */
    const openTypes = new Set(
      (
        await tx.recommendation.findMany({
          where: { householdId, origin: "OPERATIONAL", status: "PROPOSED" },
          select: { type: true },
        })
      ).map((r) => r.type),
    );

    const idByType = new Map<string, string>();
    for (const draft of drafts) {
      if (acceptedTypes.has(draft.type)) continue;
      if (openTypes.has(draft.type)) continue;
      openTypes.add(draft.type);
      const id = await persistOperationalDraft(tx, {
        householdId,
        snapshotId,
        draft,
        weights: a.weights,
        rowsByKey: a.rowsByKey,
      });
      idByType.set(draft.type, id);
      created += 1;
    }

    /*
     * M40c — the dependency graph, written in the SAME transaction as the cards.
     *
     * Only edges where BOTH ends were created in this run are written. A prerequisite
     * that did not fire this time is not a missing dependency, it is a resolved one:
     * if the subscriptions analyzer found nothing, there is nothing to do first, and
     * pointing at a superseded row from a previous run would block the dependent
     * against work that is already irrelevant.
     */
    for (const draft of drafts) {
      const dependentId = idByType.get(draft.type);
      if (!dependentId) continue;
      for (const prereqType of prerequisiteTypesFor(draft.type)) {
        const prerequisiteId = idByType.get(prereqType);
        if (!prerequisiteId || prerequisiteId === dependentId) continue;
        await tx.recommendationDependency.create({ data: { dependentId, prerequisiteId } });
        dependencyCount += 1;
      }
    }
  });

  return {
    ran: true,
    snapshotId,
    created,
    supersededCount,
    dependencyCount,
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
): Promise<string> {
  const { householdId, snapshotId, draft, weights, rowsByKey } = args;
  const pins = draft.assumptionKeysUsed
    .map((k) => rowsByKey.get(k)?.id)
    .filter((id): id is string => Boolean(id));

  const row = await tx.recommendation.create({
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
    select: { id: true },
  });
  return row.id;
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
  /**
   * M40c — true when a prerequisite of this item is still outstanding. Acting out of
   * order is not forbidden by the API (the owner may know something the engine does
   * not); the UI surfaces it so a decision made out of order is a CHOICE rather than
   * an accident.
   */
  isBlocked: boolean;
  blockedByEn: string[];
  blockedByHe: string[];
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

  /*
   * M40c — resolve the dependency graph for the rows on screen.
   *
   * A prerequisite only BLOCKS while it is still outstanding. Once it is IMPLEMENTED
   * the work is done; once it is REJECTED or SUPERSEDED the question is closed. In
   * both cases the dependent is free, and continuing to show a lock would strand it
   * permanently behind an item the owner has already dealt with.
   */
  const ids = rows.map((r) => r.id);
  const edges = ids.length
    ? await db.recommendationDependency.findMany({
        where: { dependentId: { in: ids } },
        select: {
          dependentId: true,
          prerequisite: { select: { title: true, titleHe: true, status: true } },
        },
      })
    : [];
  const blockers = new Map<string, Array<{ title: string; titleHe: string | null }>>();
  for (const e of edges) {
    if (e.prerequisite.status !== "PROPOSED" && e.prerequisite.status !== "ACCEPTED") continue;
    const list = blockers.get(e.dependentId) ?? [];
    list.push({ title: e.prerequisite.title, titleHe: e.prerequisite.titleHe });
    blockers.set(e.dependentId, list);
  }

  /*
   * M42 QA — ONE card per type, newest wins.
   *
   * QA saw the same "5 scheduled reviews" finding twice: one ACCEPTED, one IMPLEMENTED.
   * The generation-side guard cannot help here — these are historical rows in terminal
   * states, created before that guard existed and legitimately kept for the audit trail.
   * What was wrong is showing them all: the Opportunity Center is a view of the CURRENT
   * position, not a ledger of every row ever written.
   *
   * The dependency and status queries above run against the full set, so nothing is lost
   * from the graph — only the rendering collapses.
   */
  const newestByType = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const seen = newestByType.get(r.type);
    if (!seen || r.generatedAt > seen.generatedAt) newestByType.set(r.type, r);
  }
  const visible = [...newestByType.values()].sort(
    (a, b) => num(b.priorityScore) - num(a.priorityScore),
  );

  const items = visible.map((r) => {
    const expiresAt = r.expiresAt ? r.expiresAt.toISOString().slice(0, 10) : null;
    const blocking = blockers.get(r.id) ?? [];
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
      isBlocked: blocking.length > 0,
      blockedByEn: blocking.map((b) => b.title),
      blockedByHe: blocking.map((b) => b.titleHe ?? b.title),
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

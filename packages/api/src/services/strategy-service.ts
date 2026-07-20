import type { PrismaClient } from "@wealthos/db";
import {
  ENGINE_VERSION,
  evaluateGate,
  generateRecommendations,
  runAnalyzers,
  scorePriority,
  synthesizeStrategy,
  type AnalyzerContext,
  type DataGapReport,
  type FundingSummary,
  type PriorityWeights,
} from "@wealthos/engine-strategy";
import { computeFundingGaps, type AssetInput, type GoalInput } from "@wealthos/engine-goals";
import { assumptionRegistry, taxRegistry } from "@wealthos/registry";
import { buildSnapshot } from "./snapshot-service";
import { latestBoiRate } from "./boi-rate-service";

export type StrategyRunResult =
  | { ran: true; snapshotId: string; created: number; supersededCount: number; unmappedFindings: string[] }
  | { ran: false; snapshotId: string; dataGap: DataGapReport };

/**
 * The Phase-3 pipeline: snapshot → gate → analyze → generate → score → persist.
 * Reproducible: every recommendation pins its snapshot, engine version, and the
 * exact assumption rows (id+version) it consumed. Previous PROPOSED
 * recommendations are superseded on each run (accepted ones are kept).
 */
export async function runStrategy(db: PrismaClient, householdId: string): Promise<StrategyRunResult> {
  const { snapshotId, payload } = await buildSnapshot(db, householdId, "PRE_STRATEGY");

  const reg = assumptionRegistry(db);
  // M25 fix: engines consume EVERY current assumption (defaults + household overrides).
  // Previously a hard-coded subset meant questionnaire/wizard overrides (risk_*, allocation_*)
  // were silently ignored at run time while the UI displayed them.
  const allAssumptions = await reg.all(householdId);
  const assumptionRows = new Map(allAssumptions.map((row) => [row.key, row] as const));
  const assumptions = Object.fromEntries(allAssumptions.map((row) => [row.key, row.value]));

  const gate = evaluateGate(payload, {
    minCompleteness: Number(assumptions["strategy_min_completeness"]),
    minConfidence: Number(assumptions["strategy_min_confidence"]),
  });
  if (!gate.pass) return { ran: false, snapshotId, dataGap: gate.report };

  const taxYear = new Date().getFullYear();
  const taxReg = taxRegistry(db).forYear(taxYear);
  const hishtalmut = await taxReg.get("HISHTALMUT_CEILINGS");
  const pension = await taxReg.get("PENSION_CEILINGS");
  const boi = await latestBoiRate(db);

  // M30 — align strategy with the household's APPROVED allocation plan: strategy won't
  // re-recommend actions the household already committed to in the allocation phase.
  const committedPlan = await buildCommittedPlan(db, householdId);

  const ctx: AnalyzerContext = {
    assumptions,
    taxRules: { HISHTALMUT_CEILINGS: hishtalmut.payload, PENSION_CEILINGS: pension.payload },
    marketRates: { boiRatePct: boi?.value ?? null },
    committedPlan,
  };

  const findings = runAnalyzers(payload, ctx);
  const { drafts, unmappedFindings } = generateRecommendations(findings);
  const weights = assumptions["priority_weights"] as PriorityWeights;

  const goalsByType = new Map<string, string[]>();
  for (const g of payload.goals) {
    goalsByType.set(g.type, [...(goalsByType.get(g.type) ?? []), g.id]);
  }

  // M34 — the pinned strategy synthesis (Variant A): a high-level bilingual plan
  // narrative computed from the SAME snapshot + assumptions + approved allocation
  // plan the recommendations use. Regenerated only here, so the plan the owner
  // reads is exactly the plan that produced the action items below.
  const funding = await buildFundingSummary(db, householdId, payload, Number(assumptions["goal_projection_real_return_pct"] ?? 3));
  const synthesis = synthesizeStrategy({
    snapshot: payload,
    assumptions,
    committed: committedPlan,
    approvedPlanDateISO: committedPlan?.approvedAtISO ?? null,
    funding,
    actionsTotal: drafts.length,
  });
  const synthesisPins = synthesis.assumptionKeysUsed
    .map((key) => {
      const row = assumptionRows.get(key);
      return row ? { key, version: row.version } : null;
    })
    .filter((p): p is { key: string; version: number } => p !== null);

  let created = 0;
  let supersededCount = 0;
  await db.$transaction(async (tx) => {
    const superseded = await tx.recommendation.updateMany({
      where: { householdId, status: "PROPOSED" },
      data: { status: "SUPERSEDED" },
    });
    supersededCount = superseded.count;

    // Don't re-propose a finding the owner already ACCEPTED — that produced duplicate cards
    // (an accepted copy plus a fresh proposed copy) on every rerun.
    const acceptedTypes = new Set(
      (await tx.recommendation.findMany({ where: { householdId, status: "ACCEPTED" }, select: { type: true } })).map((r) => r.type),
    );

    for (const draft of drafts) {
      if (acceptedTypes.has(draft.type)) continue;
      const confidence = Math.min(draft.confidence, gate.confidenceCap);
      const goalIds = draft.goalTypesImproved.flatMap((t) => goalsByType.get(t) ?? []);
      const pins = draft.assumptionKeysUsed
        .map((k) => assumptionRows.get(k)?.id)
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
          confidenceScore: confidence,
          dataCompletenessScore: payload.dataQuality.completenessScore,
          priorityScore: String(scorePriority(draft, weights)),
          status: "PROPOSED",
          assumptionPins: { create: [...new Set(pins)].map((assumptionId) => ({ assumptionId })) },
          goalImpacts: {
            create: goalIds.map((goalId) => ({ goalId, impactDescription: draft.rationale.expectedImpact })),
          },
          evidence: {
            create: draft.evidenceItemIds.map((ledgerItemId) => ({ ledgerItemId, description: "Analyzer evidence" })),
          },
        },
      });
      created += 1;
    }

    await tx.strategyPlan.create({
      data: {
        householdId,
        snapshotId,
        engineVersion: ENGINE_VERSION,
        narrative: { en: synthesis.en, he: synthesis.he } as never,
        metrics: synthesis.metrics as never,
        pins: synthesisPins as never,
      },
    });
  });

  return { ran: true, snapshotId, created, supersededCount, unmappedFindings };
}


interface CandidateLite { id: string; kind: string; evidenceItemIds: string[] }
interface PlansLite { candidates?: CandidateLite[] }
type WorkingPlanLite = Record<string, { enabled: boolean; amount: number }>;

/** Summarize the latest APPROVED allocation plan into suppression flags for the analyzers. */
async function buildCommittedPlan(db: PrismaClient, householdId: string) {
  const row = await db.allocationPlan.findFirst({ where: { householdId, status: "APPROVED" }, orderBy: { approvedAt: "desc" } });
  if (!row) return undefined;
  const plan = row.plan as unknown as PlansLite;
  if (!Array.isArray(plan.candidates)) return undefined;
  const wp = (row.workingPlan ?? {}) as WorkingPlanLite;
  const byId = new Map(plan.candidates.map((c) => [c.id, c]));
  let deploysIdleCash = false, investsGrowth = false, taxDeposited = false, repaidTrackCount = 0;
  const repaidTrackItemIds: string[] = [];
  for (const [id, sel] of Object.entries(wp)) {
    if (!sel.enabled || sel.amount <= 0) continue;
    const c = byId.get(id);
    if (!c) continue;
    if (c.kind === "INVEST_GROWTH" || c.kind === "INVEST_DEFENSIVE") deploysIdleCash = true;
    if (c.kind === "INVEST_GROWTH") investsGrowth = true;
    if (c.kind === "TAX_CEILING_HISHTALMUT" || c.kind === "TAX_CEILING_PENSION") { deploysIdleCash = true; taxDeposited = true; }
    if (c.kind === "REPAY_EXPENSIVE_DEBT" || c.kind === "REPAY_DEBT") { deploysIdleCash = true; repaidTrackCount += 1; repaidTrackItemIds.push(...c.evidenceItemIds); }
  }
  const approvedAtISO = (row.approvedAt ?? row.createdAt).toISOString();
  return { deploysIdleCash, investsGrowth, repaidTrackItemIds, taxDeposited, repaidTrackCount, approvedAtISO };
}

/** Build the funding-gap summary the synthesis narrates, from the pinned snapshot (+ earmarks). */
async function buildFundingSummary(
  db: PrismaClient,
  householdId: string,
  payload: Awaited<ReturnType<typeof buildSnapshot>>["payload"],
  realReturnPct: number,
): Promise<FundingSummary> {
  const earmarks = new Map(
    (await db.ledgerItem.findMany({ where: { householdId }, select: { id: true, earmarkedGoalId: true } })).map(
      (l) => [l.id, l.earmarkedGoalId] as const,
    ),
  );
  const assets: AssetInput[] = payload.items.map((i) => ({
    id: i.id,
    kind: i.kind,
    accountType: i.accountType ?? undefined,
    valueILS: i.valueBase !== null ? String(i.valueBase) : null,
    verified: i.verified,
    earmarkedGoalId: earmarks.get(i.id) ?? null,
  }));
  const goals: GoalInput[] = payload.goals.map((g) => ({
    id: g.id,
    name: g.name,
    type: g.type,
    priority: g.priority,
    targetDate: g.targetDate ? new Date(g.targetDate) : null,
    requiredFundingILS: g.requiredFundingBase !== null ? String(g.requiredFundingBase) : null,
  }));
  const report = computeFundingGaps(goals, assets, realReturnPct, new Date());
  const computable = report.results.filter((r) => r.computable);
  const goalsFunded = computable.filter((r) => Number(r.gapILS ?? "0") <= 0).length;
  const priorityById = new Map(goals.map((g) => [g.id, g.priority] as const));
  const top = computable
    .filter((r) => Number(r.gapILS ?? "0") > 0)
    .sort((a, b) => (priorityById.get(a.goalId) ?? 99) - (priorityById.get(b.goalId) ?? 99))[0];
  return {
    goalsTotal: payload.goals.length,
    goalsFunded,
    topGoalName: top?.name ?? null,
    topGoalMonthlySavingILS: top?.requiredMonthlySavingILS ? Math.round(Number(top.requiredMonthlySavingILS)) : null,
  };
}

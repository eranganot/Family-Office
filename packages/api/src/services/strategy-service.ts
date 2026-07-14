import type { PrismaClient } from "@wealthos/db";
import {
  ENGINE_VERSION,
  evaluateGate,
  generateRecommendations,
  runAnalyzers,
  scorePriority,
  type AnalyzerContext,
  type DataGapReport,
  type PriorityWeights,
} from "@wealthos/engine-strategy";
import { assumptionRegistry, taxRegistry } from "@wealthos/registry";
import { buildSnapshot } from "./snapshot-service";

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
  const assumptionKeys = [
    "emergency_fund_months", "expected_real_return_equity_pct", "inflation_il_pct",
    "emergency_fund_months", "insurance_survivor_expense_months",
    "concentration_single_asset_max_pct", "concentration_institution_max_pct",
    "currency_foreign_min_pct", "currency_foreign_max_pct", "management_fee_notice_pct",
    "mortgage_cpi_linked_max_pct", "expensive_debt_rate_pct", "large_loan_notice_base",
    "priority_weights", "strategy_min_completeness", "strategy_min_confidence",
  ];
  const assumptionRows = new Map(
    await Promise.all(assumptionKeys.map(async (k) => [k, await reg.current(k, householdId)] as const)),
  );
  const assumptions = Object.fromEntries([...assumptionRows].map(([k, row]) => [k, row.value]));

  const gate = evaluateGate(payload, {
    minCompleteness: Number(assumptions["strategy_min_completeness"]),
    minConfidence: Number(assumptions["strategy_min_confidence"]),
  });
  if (!gate.pass) return { ran: false, snapshotId, dataGap: gate.report };

  const taxYear = new Date().getFullYear();
  const taxReg = taxRegistry(db).forYear(taxYear);
  const hishtalmut = await taxReg.get("HISHTALMUT_CEILINGS");
  const pension = await taxReg.get("PENSION_CEILINGS");
  const ctx: AnalyzerContext = {
    assumptions,
    taxRules: { HISHTALMUT_CEILINGS: hishtalmut.payload, PENSION_CEILINGS: pension.payload },
  };

  const findings = runAnalyzers(payload, ctx);
  const { drafts, unmappedFindings } = generateRecommendations(findings);
  const weights = assumptions["priority_weights"] as PriorityWeights;

  const goalsByType = new Map<string, string[]>();
  for (const g of payload.goals) {
    goalsByType.set(g.type, [...(goalsByType.get(g.type) ?? []), g.id]);
  }

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
  });

  return { ran: true, snapshotId, created, supersededCount, unmappedFindings };
}

import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext, Finding } from "../findings";
import { isCash, sum, valued } from "./pools";

/**
 * Whole-net-worth asset-allocation analyzer (strategy-level ONLY — asset classes,
 * never products). The growth/defensive split of each investable account comes from
 * the owner-maintained growthSharePct; cash-type accounts are defensive by definition.
 * Accounts with unknown mix are EXCLUDED AND REPORTED (never guessed); if too much of
 * the investable base is unknown, the comparison itself is refused as a data gap.
 *
 * Target growth share is derived deterministically from the three risk-questionnaire
 * assumptions (documented rule):
 *   base by loss tolerance (1→30, 2→50, 3→70)
 *   + horizon adjustment (≥15y → +10, <5y → −10)
 *   + income-stability adjustment (1→−5, 3→+5)
 *   clamped to [20, 90].
 */

export function deriveTargetGrowthPct(assumptions: Record<string, unknown>): number {
  const tolerance = Number(assumptions["risk_loss_tolerance"] ?? 2);
  const stability = Number(assumptions["risk_income_stability"] ?? 2);
  const horizonYears = Number(assumptions["risk_horizon_years"] ?? 20);
  const drawdown = Number(assumptions["risk_drawdown_reaction"] ?? 2);
  const experience = Number(assumptions["risk_investment_experience"] ?? 2);
  const flexibility = Number(assumptions["risk_spending_flexibility"] ?? 2);
  const base = tolerance <= 1 ? 30 : tolerance >= 3 ? 70 : 50;
  const horizonAdj = horizonYears >= 15 ? 10 : horizonYears < 5 ? -10 : 0;
  const stabilityAdj = stability <= 1 ? -5 : stability >= 3 ? 5 : 0;
  // Behavioral answers: stated reaction to a real 30% drop outweighs stated tolerance.
  const drawdownAdj = drawdown <= 1 ? -10 : drawdown >= 3 ? 5 : 0;
  const experienceAdj = experience <= 1 ? -5 : experience >= 3 ? 5 : 0;
  const flexibilityAdj = flexibility <= 1 ? -5 : flexibility >= 3 ? 5 : 0;
  return Math.min(90, Math.max(20, base + horizonAdj + stabilityAdj + drawdownAdj + experienceAdj + flexibilityAdj));
}

export function analyzeAllocation(snapshot: SnapshotPayload, ctx: AnalyzerContext): Finding[] {
  const findings: Finding[] = [];
  const bandPct = Number(ctx.assumptions["allocation_rebalance_band_pct"] ?? 10);
  const reMaxPct = Number(ctx.assumptions["allocation_real_estate_max_pct"] ?? 60);
  const unknownMaxPct = Number(ctx.assumptions["allocation_mix_unknown_max_pct"] ?? 50);
  const targetGrowthPct = deriveTargetGrowthPct(ctx.assumptions);
  const horizonYears = Number(ctx.assumptions["risk_horizon_years"] ?? 20);

  const assets = valued(snapshot.items).filter((i) => ["ACCOUNT", "REAL_ESTATE", "OTHER_ASSET"].includes(i.kind));
  const grossAssets = sum(assets);
  if (grossAssets <= 0) return findings;

  // --- structural: real-estate share of gross assets -------------------------
  const reItems = assets.filter((i) => i.kind === "REAL_ESTATE");
  const reTotal = sum(reItems);
  const reSharePct = (reTotal / grossAssets) * 100;
  if (reSharePct > reMaxPct) {
    findings.push({
      code: "ALLOCATION_REAL_ESTATE_HIGH",
      severity: "NOTICE",
      metrics: { reSharePct: round1(reSharePct), thresholdPct: reMaxPct },
      evidenceItemIds: reItems.map((i) => i.id),
    });
  }

  // --- rebalanceable: growth vs defensive over investable accounts -----------
  const investable = assets.filter((i) => i.kind === "ACCOUNT");
  const investableTotal = sum(investable);
  if (investableTotal <= 0) return findings;

  let growth = 0;
  let defensive = 0;
  const unknown: typeof investable = [];
  for (const i of investable) {
    const v = i.valueBase ?? 0;
    if (i.growthSharePct !== null && i.growthSharePct !== undefined) {
      growth += (v * i.growthSharePct) / 100;
      defensive += (v * (100 - i.growthSharePct)) / 100;
    } else if (isCash(i)) {
      defensive += v; // cash is defensive by definition — no guess involved
    } else {
      unknown.push(i);
    }
  }
  const unknownTotal = sum(unknown);
  const unknownSharePct = (unknownTotal / investableTotal) * 100;

  if (unknown.length > 0) {
    findings.push({
      code: "ALLOCATION_MIX_UNKNOWN",
      severity: unknownSharePct > unknownMaxPct ? "WARNING" : "INFO",
      metrics: {
        unknownCount: unknown.length,
        unknownSharePct: round1(unknownSharePct),
        maxPct: unknownMaxPct,
        itemNames: unknown.map((i) => i.name).slice(0, 5).join(", "),
      },
      evidenceItemIds: unknown.map((i) => i.id),
    });
  }

  const estimated = investable.filter((i) => i.growthShareEstimated && i.growthSharePct !== null);
  if (estimated.length > 0) {
    findings.push({
      code: "ALLOCATION_MIX_ESTIMATED",
      severity: "INFO",
      metrics: {
        estimatedCount: estimated.length,
        estimatedSharePct: round1((sum(estimated) / investableTotal) * 100),
        itemNames: estimated.map((i) => i.name).slice(0, 5).join(", "),
      },
      evidenceItemIds: estimated.map((i) => i.id),
    });
  }

  // Refuse the comparison when too much of the base is unknown — data gap, not advice.
  if (unknownSharePct > unknownMaxPct) return findings;

  const knownTotal = growth + defensive;
  if (knownTotal <= 0) return findings;
  const currentGrowthPct = (growth / knownTotal) * 100;
  const gapPct = targetGrowthPct - currentGrowthPct;
  const shiftBase = Math.abs((gapPct / 100) * knownTotal);

  const common = {
    currentPct: round1(currentGrowthPct),
    targetPct: targetGrowthPct,
    bandPct,
    gapPct: round1(Math.abs(gapPct)),
    shiftBase: Math.round(shiftBase),
    horizonYears,
  };
  if (gapPct > bandPct && !ctx.committedPlan?.investsGrowth) {
    findings.push({
      code: "ALLOCATION_GROWTH_BELOW_TARGET",
      severity: "WARNING",
      metrics: common,
      evidenceItemIds: investable.filter((i) => !unknown.includes(i)).map((i) => i.id),
    });
  } else if (-gapPct > bandPct) {
    findings.push({
      code: "ALLOCATION_GROWTH_ABOVE_TARGET",
      severity: "WARNING",
      metrics: common,
      evidenceItemIds: investable.filter((i) => !unknown.includes(i)).map((i) => i.id),
    });
  }

  return findings;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

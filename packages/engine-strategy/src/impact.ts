import type { SnapshotPayload } from "@wealthos/domain";
import type { AnalyzerContext } from "./findings";
import { isCash, sum, valued } from "./analyzers/pools";
import type { DeploymentStepKind } from "./deployment";

/**
 * M28 — plan impact simulation. Given the household's snapshot and the SELECTED
 * working-plan actions (kind + amount + rate), computes a before→after picture of
 * the components the plan touches, plus a deterministic real-terms projection of
 * the extra net worth the plan produces over the household's horizon.
 *
 * Honesty notes (documented): deploying free cash does NOT change net worth TODAY
 * (cash → debt-payoff or investment is a like-for-like swap). The impact is on the
 * FUTURE trajectory (interest avoided, expected returns), on liquidity (cash falls),
 * on the allocation mix, and on tax captured. The projection compares "leave the
 * cash idle" (≈0% real) against the plan, so the delta is purely the plan's effect.
 * Guaranteed-return logic (debt) uses the REAL rate (nominal − inflation, floored 0).
 */

export interface PlanSelection {
  kind: DeploymentStepKind;
  amount: number;
  ratePct: number | null; // for debt
}

export interface PlanImpact {
  horizonYears: number;
  liquidCashBefore: number;
  liquidCashAfter: number;
  bufferTargetBase: number;
  growthPctBefore: number | null;
  growthPctAfter: number | null;
  targetGrowthPct: number;
  totalDebtBefore: number;
  totalDebtAfter: number;
  annualInterestBefore: number;
  annualInterestAfter: number;
  taxCeilingsCaptured: number;
  goalGapBefore: number | null;
  goalGapAfter: number | null;
  /** Extra real net worth at the horizon vs leaving the free cash idle. */
  projectedExtraNetWorth: number;
  /** Component breakdown of that delta. */
  extraFromInvesting: number;
  extraFromDebt: number;
  extraFromTax: number;
}

const round = (n: number) => Math.round(n);

export function computePlanImpact(snapshot: SnapshotPayload, ctx: AnalyzerContext, selections: PlanSelection[], bufferTargetBase: number, targetGrowthPct: number): PlanImpact {
  const horizonYears = Math.max(1, Number(ctx.assumptions["risk_horizon_years"] ?? 20));
  const expectedReturn = Number(ctx.assumptions["expected_real_return_equity_pct"] ?? 4.5) / 100;
  const inflation = Number(ctx.assumptions["inflation_il_pct"] ?? 2.5) / 100;

  // --- liquidity -------------------------------------------------------------
  const cashBase = sum(valued(snapshot.items).filter(isCash));
  const deployed = selections.filter((s) => s.kind !== "TAX_VERIFY_PAYROLL" && s.kind !== "BUFFER_TOP_UP").reduce((t, s) => t + s.amount, 0);
  const liquidCashAfter = cashBase - deployed;

  // --- debt ------------------------------------------------------------------
  let totalDebt = 0;
  let annualInterest = 0;
  for (const it of snapshot.items) {
    if (it.kind === "MORTGAGE" && it.mortgageTracks) {
      for (const tk of it.mortgageTracks) {
        totalDebt += tk.principalRemaining;
        annualInterest += (tk.principalRemaining * tk.annualRatePct) / 100;
      }
    }
  }
  const debtSel = selections.filter((s) => s.kind === "REPAY_EXPENSIVE_DEBT" || s.kind === "REPAY_DEBT");
  const debtRepaid = debtSel.reduce((t, s) => t + s.amount, 0);
  const interestAvoidedYear = debtSel.reduce((t, s) => t + (s.amount * (s.ratePct ?? 0)) / 100, 0);

  // --- allocation ------------------------------------------------------------
  const investable = valued(snapshot.items).filter((i) => i.kind === "ACCOUNT");
  let growth = 0, knownMix = 0, unknown = 0;
  for (const i of investable) {
    const v = i.valueBase ?? 0;
    if (i.growthSharePct !== null && i.growthSharePct !== undefined) { growth += (v * i.growthSharePct) / 100; knownMix += v; }
    else if (isCash(i)) knownMix += v; else unknown += v;
  }
  const mixKnown = knownMix + unknown === 0 || unknown / (knownMix + unknown) <= 0.5;
  const growthAdded = selections.filter((s) => s.kind === "INVEST_GROWTH").reduce((t, s) => t + s.amount, 0);
  const defensiveAdded = selections.filter((s) => s.kind === "INVEST_DEFENSIVE").reduce((t, s) => t + s.amount, 0);
  const investedTotal = growthAdded + defensiveAdded;
  const growthPctBefore = mixKnown && knownMix > 0 ? (growth / knownMix) * 100 : null;
  const knownAfter = knownMix + investedTotal;
  const growthPctAfter = mixKnown && knownAfter > 0 ? ((growth + growthAdded) / knownAfter) * 100 : null;

  // --- tax -------------------------------------------------------------------
  const taxCaptured = selections.filter((s) => s.kind === "TAX_CEILING_HISHTALMUT" || s.kind === "TAX_CEILING_PENSION").reduce((t, s) => t + s.amount, 0);

  // --- goals (PV gap: required − assets, funded goals only) ------------------
  const assetsTotal = sum(valued(snapshot.items).filter((i) => ["ACCOUNT", "REAL_ESTATE", "OTHER_ASSET"].includes(i.kind)));
  const requiredTotal = snapshot.goals.filter((g) => g.requiredFundingBase !== null).reduce((t, g) => t + (g.requiredFundingBase ?? 0), 0);
  const goalGapBefore = requiredTotal > 0 ? Math.max(0, requiredTotal - assetsTotal) : null;
  // Investing and tax deposits keep assets whole (cash→investment) so the gap is unchanged today;
  // but debt repayment converts an asset (cash) into equity (lower liability) — net assets side flat too.
  // The gap moves with FUTURE growth, captured in the projection below; today's gap is essentially unchanged.
  const goalGapAfter = goalGapBefore;

  // --- projection (real terms, vs idle cash) ---------------------------------
  const grow = (amt: number, realRate: number) => amt * (Math.pow(1 + realRate, horizonYears) - 1);
  const extraFromInvesting = grow(investedTotal, expectedReturn);
  const extraFromDebt = debtSel.reduce((t, s) => t + grow(s.amount, Math.max(0, (s.ratePct ?? 0) / 100 - inflation)), 0);
  const extraFromTax = grow(taxCaptured, expectedReturn); // tax-advantaged ≈ growth, tax-free
  const projectedExtraNetWorth = extraFromInvesting + extraFromDebt + extraFromTax;

  return {
    horizonYears,
    liquidCashBefore: round(cashBase),
    liquidCashAfter: round(liquidCashAfter),
    bufferTargetBase: round(bufferTargetBase),
    growthPctBefore: growthPctBefore === null ? null : Math.round(growthPctBefore * 10) / 10,
    growthPctAfter: growthPctAfter === null ? null : Math.round(growthPctAfter * 10) / 10,
    targetGrowthPct,
    totalDebtBefore: round(totalDebt),
    totalDebtAfter: round(totalDebt - debtRepaid),
    annualInterestBefore: round(annualInterest),
    annualInterestAfter: round(annualInterest - interestAvoidedYear),
    taxCeilingsCaptured: round(taxCaptured),
    goalGapBefore: goalGapBefore === null ? null : round(goalGapBefore),
    goalGapAfter: goalGapAfter === null ? null : round(goalGapAfter),
    projectedExtraNetWorth: round(projectedExtraNetWorth),
    extraFromInvesting: round(extraFromInvesting),
    extraFromDebt: round(extraFromDebt),
    extraFromTax: round(extraFromTax),
  };
}

import { describe, expect, it } from "vitest";
import { computeHealthScore, type HealthScoreInput } from "../src/index";

/**
 * M42 — health score.
 *
 * The load-bearing tests are the refusals. A composite out of 100 is read as a verdict,
 * so the ways it could quietly lie — scoring an unmeasured component as zero, or
 * renormalising two components up to a confident-looking headline — matter more than
 * the arithmetic.
 */

const WEIGHTS = { cashflow: 30, liquidity: 25, leakage: 15, execution: 15, goals: 15 };

/** A household where every component is measurable and healthy. */
const input = (over: Partial<HealthScoreInput> = {}): HealthScoreInput => ({
  weights: WEIGHTS,
  minWeightCoveragePct: 60,
  monthlySurplusBase: 2000,
  monthlyIncomeBase: 10000, // 20% → full cashflow score
  workingCapitalAvailableBase: 30000,
  workingCapitalTargetBase: 30000, // at target → full
  monthlyLeakageBase: 0,
  monthlyExpensesBase: 8000, // no leakage → full
  actionsCommitted: 4,
  actionsCompleted: 4, // all done → full
  goalsRequiredBase: 1000,
  goalsFundedBase: 1000, // fully funded → full
  ...over,
});

describe("health score", () => {
  it("scores a fully healthy, fully measured household at 100", () => {
    const r = computeHealthScore(input());
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.score).toBe(100);
      expect(r.weightCoveredPct).toBe(100);
      expect(r.unmeasured).toEqual([]);
    }
  });

  /** THE rule this file exists to protect. */
  it("REFUSES an unmeasured component instead of scoring it zero", () => {
    // A household with no goals set is not a household failing at goals.
    const r = computeHealthScore(input({ goalsRequiredBase: null, goalsFundedBase: null }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      // Still 100: the measured components are all perfect, and the missing one is
      // excluded rather than dragging the score to 85.
      expect(r.score).toBe(100);
      expect(r.unmeasured).toEqual(["goals"]);
      expect(r.weightCoveredPct).toBe(85);
    }
  });

  it("REFUSES the composite when too little weight is measurable", () => {
    // Only cashflow (30 of 100) is measurable — well under the 60% floor.
    const r = computeHealthScore(
      input({
        workingCapitalAvailableBase: null,
        workingCapitalTargetBase: null,
        monthlyLeakageBase: null,
        monthlyExpensesBase: null,
        actionsCommitted: null,
        actionsCompleted: null,
        goalsRequiredBase: null,
        goalsFundedBase: null,
      }),
    );
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("INSUFFICIENT_COVERAGE");
      expect(r.weightCoveredPct).toBe(30);
      // The components still come back, so the UI can show what WAS measured.
      expect(r.components).toHaveLength(5);
    }
  });

  it("does not read 'nothing committed yet' as 0% execution", () => {
    // A household that has just started has nothing to have executed.
    const r = computeHealthScore(input({ actionsCommitted: 0, actionsCompleted: 0 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.unmeasured).toContain("execution");
      expect(r.score).toBe(100);
    }
  });

  it("inverts leakage — more drag is a WORSE score", () => {
    const clean = computeHealthScore(input({ monthlyLeakageBase: 0 }));
    const leaky = computeHealthScore(input({ monthlyLeakageBase: 400 })); // 5% of 8000
    expect(clean.ok && leaky.ok).toBe(true);
    if (clean.ok && leaky.ok) expect(leaky.score).toBeLessThan(clean.score);
  });

  it("floors a negative surplus at 0 rather than dragging other components negative", () => {
    const r = computeHealthScore(input({ monthlySurplusBase: -5000 }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const cf = r.components.find((c) => c.key === "cashflow")!;
      expect(cf.ok && cf.score).toBe(0);
      // Everything else is perfect, so the composite is the remaining weight: 70/100.
      expect(r.score).toBe(70);
    }
  });

  it("refuses cashflow when there is no income to be a share of", () => {
    const r = computeHealthScore(input({ monthlyIncomeBase: 0 }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.unmeasured).toContain("cashflow");
  });

  it("weights components by the registry, not equally", () => {
    // Zeroing cashflow (weight 30) must cost more than zeroing leakage (weight 15).
    const noCashflow = computeHealthScore(input({ monthlySurplusBase: 0 }));
    const allLeakage = computeHealthScore(input({ monthlyLeakageBase: 8000 }));
    expect(noCashflow.ok && allLeakage.ok).toBe(true);
    if (noCashflow.ok && allLeakage.ok) {
      expect(noCashflow.score).toBeLessThan(allLeakage.score);
    }
  });

  it("reports coverage alongside the score, so a partial score is never bare", () => {
    const r = computeHealthScore(input({ monthlyLeakageBase: null, monthlyExpensesBase: null }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.weightCoveredPct).toBe(85);
      expect(r.unmeasured).toEqual(["leakage"]);
    }
  });
});

import { describe, expect, it } from "vitest";
import type { FundingGapReport, GoalGapResult } from "@wealthos/engine-goals";
import { goalFundingTotals } from "../src/services/goals-service";

/**
 * M43 — collapsing the per-goal funding report into the two numbers the health score
 * consumes.
 *
 * The arithmetic is trivial; the two RULES are not, and they are what these tests
 * protect. Both are ways this function could produce a confident, wrong headline:
 *
 *  1. Funding is CAPPED PER GOAL. An over-funded goal may not lend its excess to an
 *     underfunded one.
 *  2. A goal that cannot be computed is EXCLUDED, not scored as unfunded. Missing a
 *     target date is a data gap, not a financial failure.
 */

const goal = (over: Partial<GoalGapResult> & { goalId: string }): GoalGapResult => ({
  name: over.goalId,
  computable: true,
  allocatedNowILS: "0.00",
  earmarkedNowILS: "0.00",
  projectedValueILS: "0.00",
  requiredILS: "0.00",
  gapILS: "0.00",
  requiredMonthlySavingILS: "0.00",
  yearsToTarget: 10,
  ...over,
});

const report = (results: GoalGapResult[]): FundingGapReport => ({
  results,
  pools: { liquidILS: "0.00", retirementILS: "0.00" },
  excludedUnverifiedCount: 0,
  realReturnPctUsed: 3,
});

describe("goalFundingTotals", () => {
  it("sums required and funded across computable goals", () => {
    const t = goalFundingTotals(
      report([
        goal({ goalId: "a", requiredILS: "1000.00", projectedValueILS: "600.00" }),
        goal({ goalId: "b", requiredILS: "1000.00", projectedValueILS: "400.00" }),
      ]),
    );
    expect(t.requiredBase).toBe(2000);
    expect(t.fundedBase).toBe(1000);
    expect(t.computableGoals).toBe(2);
    expect(t.totalGoals).toBe(2);
  });

  /**
   * THE rule this file exists for. Without the cap, a retirement projected at 10x its
   * target would carry an entirely unfunded education goal to a 100% headline — the
   * household would read "goals: fully funded" while a child's education has nothing
   * behind it. Aggregation is where a per-item finding goes to die.
   */
  it("CAPS funding per goal — an over-funded goal cannot mask an unfunded one", () => {
    const t = goalFundingTotals(
      report([
        goal({ goalId: "retirement", requiredILS: "1000.00", projectedValueILS: "9000.00" }),
        goal({ goalId: "education", requiredILS: "1000.00", projectedValueILS: "0.00" }),
      ]),
    );
    expect(t.requiredBase).toBe(2000);
    // 1000 (capped from 9000) + 0, NOT 9000.
    expect(t.fundedBase).toBe(1000);
  });

  it("EXCLUDES non-computable goals rather than scoring them unfunded", () => {
    const t = goalFundingTotals(
      report([
        goal({ goalId: "funded", requiredILS: "1000.00", projectedValueILS: "1000.00" }),
        { goalId: "no-date", name: "no-date", computable: false, reason: "NO_TARGET_DATE" },
        { goalId: "no-amount", name: "no-amount", computable: false, reason: "NO_REQUIRED_FUNDING" },
      ]),
    );
    // 100% of what could be measured - a missing target date must not read as a failure.
    expect(t.requiredBase).toBe(1000);
    expect(t.fundedBase).toBe(1000);
    // ...but the shortfall in coverage is reported, so the 100% cannot pass as complete.
    expect(t.computableGoals).toBe(1);
    expect(t.totalGoals).toBe(3);
  });

  it("REFUSES (null) when no goal is computable — never 0/0", () => {
    const t = goalFundingTotals(
      report([{ goalId: "x", name: "x", computable: false, reason: "NO_TARGET_DATE" }]),
    );
    expect(t.requiredBase).toBeNull();
    expect(t.fundedBase).toBeNull();
    expect(t.totalGoals).toBe(1);
  });

  it("REFUSES when there are no goals at all", () => {
    const t = goalFundingTotals(report([]));
    expect(t.requiredBase).toBeNull();
    expect(t.fundedBase).toBeNull();
  });

  it("REFUSES when every computable goal requires zero — there is no ratio to take", () => {
    const t = goalFundingTotals(
      report([goal({ goalId: "zero", requiredILS: "0.00", projectedValueILS: "500.00" })]),
    );
    expect(t.requiredBase).toBeNull();
    expect(t.fundedBase).toBeNull();
  });

  it("a fully funded household reads 100%, not more", () => {
    const t = goalFundingTotals(
      report([goal({ goalId: "a", requiredILS: "1000.00", projectedValueILS: "5000.00" })]),
    );
    expect(t.fundedBase).toBe(t.requiredBase);
  });
});

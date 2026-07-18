import { describe, expect, it } from "vitest";
import { computeDeploymentPlan } from "../src/deployment";
import { CTX, expense, item, snapshot } from "./fixtures";

const ctx = (over: Record<string, unknown> = {}, tax: Record<string, unknown> = {}) => ({
  assumptions: { ...CTX.assumptions, ...over },
  taxRules: { ...CTX.taxRules, ...tax },
});

const flow = (flowType: string, monthly: number, owners: string[] = ["m1"]) =>
  item({ kind: "CASH_FLOW", accountType: null, valueBase: null, ownerMemberIds: owners,
    cashFlow: { flowType, direction: "IN", amountBase: monthly, frequency: "MONTHLY" } });

describe("computeDeploymentPlan", () => {
  it("REFUSES to deploy when expenses are unknown — never guesses the buffer", () => {
    const plan = computeDeploymentPlan(snapshot([item({ accountType: "BANK_CHECKING", valueBase: 500_000 })]), ctx());
    expect(plan.notes).toContain("EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED");
    expect(plan.steps).toHaveLength(0);
    expect(plan.freeCashBase).toBe(0);
  });

  it("below-buffer cash yields a single top-up step and no deployment", () => {
    const plan = computeDeploymentPlan(snapshot([item({ accountType: "BANK_CHECKING", valueBase: 30_000 }), expense(10_000)]), ctx());
    expect(plan.steps.map((s) => s.kind)).toEqual(["BUFFER_TOP_UP"]);
    expect(plan.steps[0]!.amountBase).toBe(30_000); // 60k target − 30k cash
  });

  it("waterfall order: expensive debt first, then hishtalmut ceiling, then invest split by target", () => {
    const s = snapshot([
      item({ accountType: "BANK_CHECKING", valueBase: 200_000 }), // 60k buffer → 140k free
      expense(10_000),
      item({
        kind: "MORTGAGE", accountType: null, valueBase: 500_000,
        mortgageTracks: [{ trackType: "PRIME", principalRemaining: 40_000, annualRatePct: 9.5, cpiLinked: false, endDate: "2040-01-01" }],
      }),
      item({ accountType: "BROKERAGE_IL", valueBase: 100_000, growthSharePct: 50 }),
    ]);
    const plan = computeDeploymentPlan(s, ctx());
    expect(plan.freeCashBase).toBe(140_000);
    const kinds = plan.steps.map((x) => x.kind);
    expect(kinds[0]).toBe("REPAY_EXPENSIVE_DEBT");
    expect(plan.steps[0]!.amountBase).toBe(40_000);
    expect(kinds).toContain("TAX_CEILING_HISHTALMUT"); // fixture tax rules carry a hishtalmut ceiling
    expect(kinds).toContain("INVEST_GROWTH");
    // Everything allocated, nothing left dangling
    const total = plan.steps.reduce((t, x) => t + x.amountBase, 0);
    expect(total + plan.leftoverBase).toBe(140_000);
    expect(plan.leftoverBase).toBe(0);
  });

  it("skips ceilings already filled by mapped contribution flows", () => {
    const s = snapshot([
      item({ accountType: "BANK_CHECKING", valueBase: 100_000 }),
      expense(10_000),
      flow("HISHTALMUT_CONTRIBUTION", 2_000), // 24k/yr > 20,566 ceiling → filled
    ]);
    const plan = computeDeploymentPlan(s, ctx());
    expect(plan.steps.map((x) => x.kind)).not.toContain("TAX_CEILING_HISHTALMUT");
  });

  it("does not split growth/defensive when too much of the mix is unknown", () => {
    const s = snapshot([
      item({ accountType: "BANK_CHECKING", valueBase: 100_000 }),
      expense(10_000),
      item({ accountType: "BROKERAGE_IL", valueBase: 500_000 }), // unknown mix dominates
    ]);
    const plan = computeDeploymentPlan(s, { assumptions: { ...CTX.assumptions }, taxRules: {} });
    expect(plan.notes).toContain("MIX_UNKNOWN_INVEST_UNSPLIT");
    expect(plan.steps.filter((x) => x.kind === "INVEST_DEFENSIVE")).toHaveLength(0);
  });

  it("growth amount moves the mix toward the derived target (new-money-only)", () => {
    const s = snapshot([
      item({ accountType: "BANK_CHECKING", valueBase: 160_000 }), // 60k buffer → 100k free; cash counts defensive-known
      expense(10_000),
      item({ accountType: "GEMEL_LEHASHKAA", valueBase: 100_000, growthSharePct: 0 }),
    ]);
    const plan = computeDeploymentPlan(s, { assumptions: { ...CTX.assumptions }, taxRules: {} }); // target 60% (2,2,20 defaults); no tax rules → invest gets all
    const growthStep = plan.steps.find((x) => x.kind === "INVEST_GROWTH");
    expect(growthStep).toBeDefined();
    // all 100k goes to growth (desired 60% of 360k=216k, current growth 0)
    expect(growthStep!.amountBase).toBe(100_000);
  });
});

import { describe, expect, it } from "vitest";
import { computeDeploymentPlans, type DeploymentVariantKey } from "../src/deployment";
import { CTX, expense, item, snapshot } from "./fixtures";

const ctx = (over: Record<string, unknown> = {}) => ({ assumptions: { ...CTX.assumptions, ...over }, taxRules: { ...CTX.taxRules } });
const noTax = (over: Record<string, unknown> = {}) => ({ assumptions: { ...CTX.assumptions, ...over }, taxRules: {} });

const flow = (flowType: string, monthly: number, owners: string[] = ["m1"]) =>
  item({ kind: "CASH_FLOW", accountType: null, valueBase: null, ownerMemberIds: owners,
    cashFlow: { flowType, direction: "IN", amountBase: monthly, frequency: "MONTHLY" } });

const variant = (p: ReturnType<typeof computeDeploymentPlans>, key: DeploymentVariantKey) =>
  p.variants.find((v) => v.key === key)!;

// Fixture member m1 is EMPLOYED (see fixtures) — deposits must NOT be suggested for them.
const selfEmployed = { id: "m2", name: "דנה", role: "ADULT" as const, birthDate: "1986-01-01", employmentStatus: "SELF_EMPLOYED" };

describe("computeDeploymentPlans (M26 variants)", () => {
  it("REFUSES to deploy when expenses are unknown — never guesses the buffer", () => {
    const p = computeDeploymentPlans(snapshot([item({ accountType: "BANK_CHECKING", valueBase: 500_000 })]), ctx());
    expect(p.notes).toContain("EXPENSES_UNKNOWN_DEPLOYMENT_REFUSED");
    expect(p.variants).toHaveLength(0);
  });

  it("below-buffer cash yields a single-variant top-up plan", () => {
    const p = computeDeploymentPlans(snapshot([item({ accountType: "BANK_CHECKING", valueBase: 30_000 }), expense(10_000)]), ctx());
    expect(p.variants).toHaveLength(1);
    expect(p.variants[0]!.steps.map((s) => s.kind)).toEqual(["BUFFER_TOP_UP"]);
  });

  it("EMPLOYED members get a payroll-verification step, never a lump-sum deposit", () => {
    const p = computeDeploymentPlans(snapshot([item({ accountType: "BANK_CHECKING", valueBase: 200_000 }), expense(10_000)]), ctx());
    const b = variant(p, "BALANCED");
    const kinds = b.steps.map((s) => s.kind);
    expect(kinds).toContain("TAX_VERIFY_PAYROLL");
    expect(kinds).not.toContain("TAX_CEILING_HISHTALMUT");
    expect(kinds).not.toContain("TAX_CEILING_PENSION");
    const verify = b.steps.find((s) => s.kind === "TAX_VERIFY_PAYROLL")!;
    expect(verify.amountBase).toBe(0);
  });

  it("SELF_EMPLOYED members still get capped deposit steps", () => {
    const s = snapshot([item({ accountType: "BANK_CHECKING", valueBase: 200_000 }), expense(10_000)]);
    s.members = [...s.members, selfEmployed];
    const p = computeDeploymentPlans(s, ctx());
    const b = variant(p, "BALANCED");
    const hish = b.steps.find((x) => x.kind === "TAX_CEILING_HISHTALMUT");
    expect(hish).toBeDefined();
    expect(hish!.detailHe).toContain("דנה");
  });

  it("variant philosophies differ on debt: GROWTH none, BALANCED expensive-only, DEBT_FREE all", () => {
    const s = snapshot([
      item({ accountType: "BANK_CHECKING", valueBase: 400_000 }),
      expense(10_000),
      item({
        kind: "MORTGAGE", accountType: null, valueBase: 800_000,
        mortgageTracks: [
          { trackType: "PRIME", principalRemaining: 50_000, annualRatePct: 9.5, cpiLinked: false, endDate: "2040-01-01" },
          { trackType: "FIXED_UNLINKED", principalRemaining: 100_000, annualRatePct: 3.0, cpiLinked: false, endDate: "2040-01-01" },
        ],
      }),
      item({ accountType: "BROKERAGE_IL", valueBase: 100_000, growthSharePct: 60 }),
    ]);
    const p = computeDeploymentPlans(s, noTax());
    const debtKinds = (k: DeploymentVariantKey) => variant(p, k).steps.filter((x) => x.kind.startsWith("REPAY")).length;
    expect(debtKinds("GROWTH")).toBe(0);
    expect(debtKinds("BALANCED")).toBe(1); // only the 9.5% track
    expect(debtKinds("DEBT_FREE")).toBe(2); // both tracks, rate-desc
    expect(variant(p, "DEBT_FREE").summary.debtRepaidBase).toBe(150_000);
    expect(variant(p, "GROWTH").summary.investedBase).toBeGreaterThan(variant(p, "DEBT_FREE").summary.investedBase);
  });

  it("every variant carries bilingual pros/cons/risks and per-step goal impact", () => {
    const s = snapshot([
      item({ accountType: "BANK_CHECKING", valueBase: 200_000 }),
      expense(10_000),
      item({ accountType: "BROKERAGE_IL", valueBase: 100_000, growthSharePct: 60 }),
    ]);
    s.goals = [{ id: "g1", type: "RETIREMENT", name: "פרישה", priority: 1, targetDate: "2050-01-01", requiredFundingBase: 6_000_000 }];
    const p = computeDeploymentPlans(s, noTax());
    for (const v of p.variants) {
      expect(v.prosHe.length).toBeGreaterThan(0);
      expect(v.consHe.length).toBeGreaterThan(0);
      expect(v.risksHe.length).toBeGreaterThan(0);
      for (const st of v.steps) {
        expect(st.id).toMatch(new RegExp(`^${v.key.toLowerCase()}-s\\d+$`));
        expect(st.goalImpactHe.length).toBeGreaterThan(0);
      }
    }
    const invest = variant(p, "GROWTH").steps.find((x) => x.kind === "INVEST_GROWTH")!;
    expect(invest.goalImpactHe).toContain("פרישה");
  });

  it("amounts reconcile: steps + leftover = free cash in every variant (money steps only)", () => {
    const s = snapshot([
      item({ accountType: "BANK_CHECKING", valueBase: 300_000 }),
      expense(10_000),
      item({
        kind: "MORTGAGE", accountType: null, valueBase: 500_000,
        mortgageTracks: [{ trackType: "PRIME", principalRemaining: 40_000, annualRatePct: 9.5, cpiLinked: false, endDate: "2040-01-01" }],
      }),
      item({ accountType: "BROKERAGE_IL", valueBase: 100_000, growthSharePct: 50 }),
    ]);
    s.members = [...s.members, selfEmployed];
    const p = computeDeploymentPlans(s, ctx());
    for (const v of p.variants) {
      const total = v.steps.reduce((t, x) => t + x.amountBase, 0);
      expect(total + v.leftoverBase, v.key).toBe(p.freeCashBase);
    }
  });
});

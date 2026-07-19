import { describe, expect, it } from "vitest";
import { computePlanImpact, type PlanSelection } from "../src/impact";
import { CTX, item, snapshot } from "./fixtures";

const ctx = (over: Record<string, unknown> = {}) => ({ assumptions: { ...CTX.assumptions, risk_horizon_years: 20, expected_real_return_equity_pct: 5, inflation_il_pct: 2.5, ...over }, taxRules: { ...CTX.taxRules } });

describe("computePlanImpact", () => {
  const base = snapshot([
    item({ accountType: "BANK_CHECKING", valueBase: 500_000 }),
    item({ accountType: "BROKERAGE_IL", valueBase: 300_000, growthSharePct: 40 }),
    item({ kind: "MORTGAGE", accountType: null, valueBase: 600_000, mortgageTracks: [
      { trackType: "PRIME", principalRemaining: 200_000, annualRatePct: 6, cpiLinked: false, endDate: "2040-01-01" },
    ] }),
  ]);

  it("liquidity falls by the deployed amount; debt/interest fall by repayment", () => {
    const sel: PlanSelection[] = [{ kind: "REPAY_EXPENSIVE_DEBT", amount: 100_000, ratePct: 6 }];
    const im = computePlanImpact(base, ctx(), sel, 60_000, 60);
    expect(im.liquidCashBefore).toBe(500_000);
    expect(im.liquidCashAfter).toBe(400_000);
    expect(im.totalDebtBefore).toBe(200_000);
    expect(im.totalDebtAfter).toBe(100_000);
    expect(im.annualInterestBefore).toBe(12_000);
    expect(im.annualInterestAfter).toBe(6_000);
  });

  it("investing moves the growth share toward target and projects extra net worth", () => {
    const sel: PlanSelection[] = [{ kind: "INVEST_GROWTH", amount: 200_000, ratePct: null }];
    const im = computePlanImpact(base, ctx(), sel, 60_000, 70);
    // before: 120k growth / 800k known = 15%; after: 320k / 1,000k = 32%
    expect(im.growthPctBefore).toBe(15);
    expect(im.growthPctAfter).toBe(32);
    // 200k at 5% real over 20y: 200k*((1.05^20)-1) ≈ 200k*1.653 ≈ 330,660
    expect(im.extraFromInvesting).toBeGreaterThan(300_000);
    expect(im.projectedExtraNetWorth).toBe(im.extraFromInvesting);
  });

  it("debt uses the REAL rate for its guaranteed return", () => {
    const sel: PlanSelection[] = [{ kind: "REPAY_EXPENSIVE_DEBT", amount: 100_000, ratePct: 6 }];
    const im = computePlanImpact(base, ctx({ inflation_il_pct: 2.5 }), sel, 60_000, 60);
    // real rate 3.5% over 20y: 100k*((1.035^20)-1) ≈ 100k*0.989 ≈ 98,900
    expect(im.extraFromDebt).toBeGreaterThan(90_000);
    expect(im.extraFromDebt).toBeLessThan(110_000);
  });

  it("tax deposits count as tax-free growth in the projection", () => {
    const sel: PlanSelection[] = [{ kind: "TAX_CEILING_HISHTALMUT", amount: 20_000, ratePct: null }];
    const im = computePlanImpact(base, ctx(), sel, 60_000, 60);
    expect(im.taxCeilingsCaptured).toBe(20_000);
    expect(im.extraFromTax).toBeGreaterThan(0);
  });

  it("goal gap reported from funded goals (PV, unchanged by the swap today)", () => {
    const s2 = snapshot([
      item({ accountType: "BANK_CHECKING", valueBase: 500_000 }),
    ]);
    s2.goals = [{ id: "g1", type: "RETIREMENT", name: "פרישה", priority: 1, targetDate: "2050-01-01", requiredFundingBase: 2_000_000 }];
    const im = computePlanImpact(s2, ctx(), [{ kind: "INVEST_GROWTH", amount: 100_000, ratePct: null }], 60_000, 60);
    expect(im.goalGapBefore).toBe(1_500_000); // 2M − 500k assets
    expect(im.goalGapAfter).toBe(1_500_000);
  });
});

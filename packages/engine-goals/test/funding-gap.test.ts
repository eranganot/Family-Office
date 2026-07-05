import { describe, expect, it } from "vitest";
import { classifyPool, computeFundingGaps, type AssetInput, type GoalInput } from "../src/funding-gap";

const NOW = new Date("2026-01-01T00:00:00Z");
const asset = (over: Partial<AssetInput> = {}): AssetInput => ({
  id: "a", kind: "ACCOUNT", accountType: "BANK_CHECKING", valueILS: "100000", verified: true, ...over,
});
const goal = (over: Partial<GoalInput> = {}): GoalInput => ({
  id: "g", name: "goal", type: "PROPERTY_PURCHASE", priority: 1,
  targetDate: new Date("2031-01-01T00:00:00Z"), requiredFundingILS: "500000", ...over,
});

describe("classifyPool", () => {
  it("separates retirement money from liquid; ignores non-asset kinds", () => {
    expect(classifyPool(asset({ accountType: "PENSION_COMPREHENSIVE" }))).toBe("RETIREMENT");
    expect(classifyPool(asset({ accountType: "KEREN_HISHTALMUT" }))).toBe("LIQUID");
    expect(classifyPool(asset({ accountType: "GEMEL_LEHASHKAA" }))).toBe("LIQUID");
    expect(classifyPool(asset({ kind: "OTHER_ASSET", accountType: undefined }))).toBe("LIQUID");
    expect(classifyPool(asset({ kind: "REAL_ESTATE" }))).toBeNull();
    expect(classifyPool(asset({ kind: "MORTGAGE" }))).toBeNull();
  });
});

describe("computeFundingGaps", () => {
  it("fully funded goal: zero gap, zero required saving", () => {
    // PV needed at 3% over 5y for 500k ≈ 431,304; give plenty
    const r = computeFundingGaps([goal()], [asset({ valueILS: "600000" })], 3, NOW);
    const g = r.results[0]!;
    expect(g.computable).toBe(true);
    expect(g.gapILS).toBe("0.00");
    expect(g.requiredMonthlySavingILS).toBe("0.00");
    expect(Number(g.projectedValueILS)).toBeCloseTo(500000, -2);
  });

  it("unfunded goal: gap equals requirement; monthly saving via annuity", () => {
    const r = computeFundingGaps([goal()], [], 3, NOW);
    const g = r.results[0]!;
    expect(g.gapILS).toBe("500000.00");
    // 60 months at ~0.2466%/mo → factor ≈ 64.6 → ≈ ₪7,73x/mo
    expect(Number(g.requiredMonthlySavingILS)).toBeGreaterThan(7000);
    expect(Number(g.requiredMonthlySavingILS)).toBeLessThan(8500);
  });

  it("priority-ordered allocation: goal 1 drains the pool before goal 2", () => {
    const goals = [
      goal({ id: "g1", priority: 1, requiredFundingILS: "300000" }),
      goal({ id: "g2", priority: 2, requiredFundingILS: "300000" }),
    ];
    const r = computeFundingGaps(goals, [asset({ valueILS: "280000" })], 3, NOW);
    const [g1, g2] = r.results;
    expect(Number(g1!.allocatedNowILS)).toBeCloseTo(258782, -2); // PV of 300k
    expect(Number(g2!.allocatedNowILS)).toBeCloseTo(280000 - 258782, -2); // remainder
    expect(Number(g2!.gapILS)).toBeGreaterThan(Number(g1!.gapILS)!);
  });

  it("retirement goals may use retirement money; property goals may not", () => {
    const assets = [asset({ id: "p", accountType: "PENSION_COMPREHENSIVE", valueILS: "1000000" })];
    const property = computeFundingGaps([goal()], assets, 3, NOW);
    expect(property.results[0]!.allocatedNowILS).toBe("0.00");
    const retirement = computeFundingGaps(
      [goal({ type: "RETIREMENT", requiredFundingILS: "800000" })], assets, 3, NOW,
    );
    expect(Number(retirement.results[0]!.allocatedNowILS)).toBeGreaterThan(0);
    expect(retirement.results[0]!.gapILS).toBe("0.00");
  });

  it("unverified assets are excluded and counted; incomputable goals carry reasons", () => {
    const r = computeFundingGaps(
      [
        goal({ id: "nodate", targetDate: null }),
        goal({ id: "noamount", requiredFundingILS: null }),
        goal({ id: "past", targetDate: new Date("2020-01-01") }),
      ],
      [asset({ verified: false })],
      3,
      NOW,
    );
    expect(r.excludedUnverifiedCount).toBe(1);
    expect(r.pools.liquidILS).toBe("0.00");
    expect(r.results.map((x) => x.reason)).toEqual(["NO_TARGET_DATE", "NO_REQUIRED_FUNDING", "TARGET_IN_PAST"]);
  });

  it("zero real return degrades gracefully (linear annuity)", () => {
    const r = computeFundingGaps([goal({ requiredFundingILS: "60000" })], [], 0, NOW);
    expect(Number(r.results[0]!.requiredMonthlySavingILS)).toBeCloseTo(1000, 0); // 60k over 60 months
  });
});

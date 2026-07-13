import { describe, expect, it } from "vitest";
import { analyzeAllocation, deriveTargetGrowthPct } from "../src/analyzers/index";
import { generateRecommendations } from "../src/generators";
import { CTX, item, snapshot } from "./fixtures";

const ctx = (over: Record<string, unknown> = {}) => ({ ...CTX, assumptions: { ...CTX.assumptions, ...over } });

describe("deriveTargetGrowthPct", () => {
  it("derives the documented rule table and clamps", () => {
    expect(deriveTargetGrowthPct({ risk_loss_tolerance: 2, risk_income_stability: 2, risk_horizon_years: 20 })).toBe(60); // 50+10
    expect(deriveTargetGrowthPct({ risk_loss_tolerance: 1, risk_income_stability: 1, risk_horizon_years: 3 })).toBe(20); // 30-10-5 clamped
    expect(deriveTargetGrowthPct({ risk_loss_tolerance: 3, risk_income_stability: 3, risk_horizon_years: 30 })).toBe(85); // 70+10+5
  });
});

describe("analyzeAllocation", () => {
  it("flags growth below target with shift amount (cash counted defensive without guessing)", () => {
    const s = snapshot([
      item({ accountType: "BANK_DEPOSIT", valueBase: 700_000 }), // cash → defensive
      item({ accountType: "KEREN_HISHTALMUT", valueBase: 300_000, growthSharePct: 50 }),
    ]);
    const f = analyzeAllocation(s, ctx());
    const below = f.find((x) => x.code === "ALLOCATION_GROWTH_BELOW_TARGET");
    expect(below).toBeDefined();
    expect(below!.metrics["currentPct"]).toBe(15); // 150k/1M
    expect(below!.metrics["targetPct"]).toBe(60);
    expect(Number(below!.metrics["shiftBase"])).toBeGreaterThan(0);
  });

  it("flags growth above target", () => {
    const s = snapshot([
      item({ accountType: "BROKERAGE_IL", valueBase: 900_000, growthSharePct: 100 }),
      item({ accountType: "BANK_DEPOSIT", valueBase: 100_000 }),
    ]);
    const f = analyzeAllocation(s, ctx());
    expect(f.some((x) => x.code === "ALLOCATION_GROWTH_ABOVE_TARGET")).toBe(true);
  });

  it("is silent inside the band", () => {
    const s = snapshot([
      item({ accountType: "BROKERAGE_IL", valueBase: 600_000, growthSharePct: 100 }),
      item({ accountType: "BANK_DEPOSIT", valueBase: 400_000 }),
    ]);
    const f = analyzeAllocation(s, ctx());
    expect(f.filter((x) => x.code.startsWith("ALLOCATION_GROWTH"))).toEqual([]);
  });

  it("REFUSES the comparison when unknown mix exceeds the threshold — reports, never guesses", () => {
    const s = snapshot([
      item({ accountType: "KEREN_HISHTALMUT", valueBase: 600_000 }), // unknown mix
      item({ accountType: "BANK_DEPOSIT", valueBase: 400_000 }),
    ]);
    const f = analyzeAllocation(s, ctx());
    const unknown = f.find((x) => x.code === "ALLOCATION_MIX_UNKNOWN");
    expect(unknown).toBeDefined();
    expect(unknown!.severity).toBe("WARNING"); // 60% unknown > 50% max
    expect(f.some((x) => x.code.startsWith("ALLOCATION_GROWTH"))).toBe(false);
  });

  it("reports unknown mix as INFO below the refusal threshold but still compares", () => {
    const s = snapshot([
      item({ accountType: "KEREN_HISHTALMUT", valueBase: 200_000 }), // unknown (20%)
      item({ accountType: "BROKERAGE_IL", valueBase: 500_000, growthSharePct: 80 }),
      item({ accountType: "BANK_DEPOSIT", valueBase: 300_000 }),
    ]);
    const f = analyzeAllocation(s, ctx());
    expect(f.find((x) => x.code === "ALLOCATION_MIX_UNKNOWN")!.severity).toBe("INFO");
  });

  it("flags a structurally property-heavy balance sheet (never a sell instruction)", () => {
    const s = snapshot([
      item({ kind: "REAL_ESTATE", accountType: null, valueBase: 2_000_000, name: "דירה" }),
      item({ accountType: "BANK_DEPOSIT", valueBase: 500_000 }),
    ]);
    const f = analyzeAllocation(s, ctx());
    const re = f.find((x) => x.code === "ALLOCATION_REAL_ESTATE_HIGH");
    expect(re).toBeDefined();
    expect(re!.metrics["reSharePct"]).toBe(80);
  });

  it("every allocation finding maps to a bilingual, product-free draft", () => {
    const s = snapshot([
      item({ kind: "REAL_ESTATE", accountType: null, valueBase: 2_000_000 }),
      item({ accountType: "KEREN_HISHTALMUT", valueBase: 100_000 }),
      item({ accountType: "BANK_DEPOSIT", valueBase: 500_000 }),
      item({ accountType: "BROKERAGE_IL", valueBase: 200_000, growthSharePct: 30 }),
    ]);
    const findings = analyzeAllocation(s, ctx());
    expect(findings.length).toBeGreaterThanOrEqual(2);
    const { drafts, unmappedFindings } = generateRecommendations(findings);
    expect(unmappedFindings).toEqual([]);
    for (const d of drafts) {
      expect(/[֐-׿]/.test(d.rationaleHe.why)).toBe(true);
    }
  });
});

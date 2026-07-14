import { describe, expect, it } from "vitest";
import { analyzeTaxUtilization } from "../src/analyzers/tax-utilization";
import { generateRecommendations } from "../src/generators";
import { RationaleSchema } from "../src/rationale";
import { CTX, contribution, snapshot } from "./fixtures";

const codes = (items: Parameters<typeof snapshot>[0], over = {}) =>
  analyzeTaxUtilization(snapshot(items, over), CTX).map((f) => f.code);

describe("tax-year utilization tracker (B3)", () => {
  it("flags underutilized study-fund headroom when deposits are below the ceiling", () => {
    // 1000/mo -> 12,000/yr vs 20,566 ceiling
    const found = codes([contribution(1_000, "HISHTALMUT_CONTRIBUTION")]);
    expect(found).toContain("TAX_HISHTALMUT_UNDERUTILIZED");
  });

  it("flags underutilized pension headroom", () => {
    const found = codes([contribution(1_000, "PENSION_CONTRIBUTION")]);
    expect(found).toContain("TAX_PENSION_UNDERUTILIZED");
  });

  it("does not flag when the ceiling is fully used", () => {
    // 2000/mo -> 24,000/yr >= 20,566 ceiling
    const found = codes([contribution(2_000, "HISHTALMUT_CONTRIBUTION")]);
    expect(found).not.toContain("TAX_HISHTALMUT_UNDERUTILIZED");
  });

  it("does not assess a member with no mapped contributions (no guessing)", () => {
    const found = codes([]);
    expect(found).toHaveLength(0);
  });

  it("skips utilization when the base currency is not ILS (ILS-denominated ceilings)", () => {
    const found = codes([contribution(1_000, "HISHTALMUT_CONTRIBUTION")], { baseCurrency: "USD" });
    expect(found).toHaveLength(0);
  });

  it("reports the unused headroom, utilization %, and months remaining", () => {
    const findings = analyzeTaxUtilization(snapshot([contribution(1_000, "HISHTALMUT_CONTRIBUTION")]), CTX);
    const f = findings.find((x) => x.code === "TAX_HISHTALMUT_UNDERUTILIZED")!;
    expect(f.metrics.depositedBase).toBe(12_000);
    expect(f.metrics.ceilingBase).toBe(20_566);
    expect(f.metrics.unusedBase).toBe(8_566);
    expect(f.metrics.utilizationPct).toBe(58);
    expect(Number(f.metrics.monthsRemaining)).toBeGreaterThan(0);
  });

  it("maps to valid, product-free bilingual recommendations", () => {
    const findings = analyzeTaxUtilization(
      snapshot([contribution(1_000, "HISHTALMUT_CONTRIBUTION"), contribution(1_500, "PENSION_CONTRIBUTION")]),
      CTX,
    );
    const { drafts, unmappedFindings } = generateRecommendations(findings);
    expect(unmappedFindings).toHaveLength(0);
    expect(drafts.length).toBe(findings.length);
    for (const d of drafts) {
      RationaleSchema.parse(d.rationale);
      RationaleSchema.parse(d.rationaleHe);
    }
  });
});

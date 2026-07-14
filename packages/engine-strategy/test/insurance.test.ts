import { describe, expect, it } from "vitest";
import { analyzeInsurance } from "../src/analyzers/insurance";
import { generateRecommendations } from "../src/generators";
import { RationaleSchema } from "../src/rationale";
import { CTX, expense, income, item, mortgageItem, policy, snapshot } from "./fixtures";

const codes = (items: ReturnType<typeof item>[]) =>
  analyzeInsurance(snapshot(items), CTX).map((f) => f.code);

describe("insurance-gap analyzer (B2)", () => {
  it("flags a survivor gap for an earner with no life cover", () => {
    // earner 20k/mo, expenses 10k/mo → required 10k*60 = 600k; has disability so only survivor fires
    const found = codes([
      income(20_000, ["m1"]),
      expense(10_000),
      policy({ policyType: "DISABILITY", insuredMemberId: "m1" }),
    ]);
    expect(found).toContain("INSURANCE_SURVIVOR_GAP");
    expect(found).not.toContain("INSURANCE_DISABILITY_MISSING");
  });

  it("clears the survivor gap when life cover meets the target", () => {
    const found = codes([
      income(20_000, ["m1"]),
      expense(10_000),
      policy({ policyType: "DISABILITY", insuredMemberId: "m1" }),
      policy({ policyType: "LIFE", insuredMemberId: "m1", coverageAmountBase: 600_000 }),
    ]);
    expect(found).not.toContain("INSURANCE_SURVIVOR_GAP");
  });

  it("flags missing disability cover for an active earner", () => {
    const found = codes([income(20_000, ["m1"]), expense(10_000), policy({ policyType: "LIFE", insuredMemberId: "m1", coverageAmountBase: 1_000_000 })]);
    expect(found).toContain("INSURANCE_DISABILITY_MISSING");
  });

  it("comprehensive pension counts as disability cover (IL embeds א.כ.ע) — no standalone recommendation", () => {
    const found = codes([
      income(20_000, ["m1"]),
      expense(10_000),
      item({ accountType: "PENSION_COMPREHENSIVE", ownerMemberIds: ["m1"], valueBase: 100_000 }),
      policy({ policyType: "LIFE", insuredMemberId: "m1", coverageAmountBase: 1_000_000 }),
    ]);
    expect(found).not.toContain("INSURANCE_DISABILITY_MISSING");
  });

  it("does not assess earners who are not mapped as income owners (no earners → no findings)", () => {
    const found = codes([expense(10_000)]);
    expect(found).toHaveLength(0);
  });

  it("flags a mortgage-life gap when cover is below outstanding principal", () => {
    const found = codes([
      income(20_000, ["m1"]),
      policy({ policyType: "DISABILITY", insuredMemberId: "m1" }),
      mortgageItem(1_500_000),
      policy({ policyType: "MORTGAGE_LIFE", coverageAmountBase: 500_000 }),
    ]);
    expect(found).toContain("INSURANCE_MORTGAGE_LIFE_GAP");
  });

  it("clears the mortgage-life gap when fully covered", () => {
    const found = codes([
      income(20_000, ["m1"]),
      policy({ policyType: "DISABILITY", insuredMemberId: "m1" }),
      mortgageItem(1_500_000),
      policy({ policyType: "MORTGAGE_LIFE", coverageAmountBase: 1_500_000 }),
    ]);
    expect(found).not.toContain("INSURANCE_MORTGAGE_LIFE_GAP");
  });

  it("every insurance finding maps to a valid, product-free bilingual recommendation", () => {
    const findings = analyzeInsurance(
      snapshot([income(20_000, ["m1"]), expense(10_000), mortgageItem(1_500_000)]),
      CTX,
    );
    const { drafts, unmappedFindings } = generateRecommendations(findings);
    expect(unmappedFindings).toHaveLength(0);
    expect(drafts.length).toBe(findings.length);
    for (const d of drafts) {
      RationaleSchema.parse(d.rationale);
      RationaleSchema.parse(d.rationaleHe);
      expect(d.title.length).toBeGreaterThan(0);
      expect(d.titleHe.length).toBeGreaterThan(0);
    }
  });
});

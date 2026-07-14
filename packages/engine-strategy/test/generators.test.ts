import { describe, expect, it } from "vitest";
import { runAnalyzers } from "../src/analyzers/index";
import { generateRecommendations } from "../src/generators";
import { RationaleSchema } from "../src/rationale";
import { validateStrategyText } from "../src/validator";
import { CTX, expense, item, snapshot } from "./fixtures";

describe("product-reference validator", () => {
  it("rejects security/product mentions in any language", () => {
    expect(validateStrategyText(["Buy shares of a great company"]).valid).toBe(false);
    expect(validateStrategyText(["Consider an S&P 500 tracker"]).valid).toBe(false);
    expect(validateStrategyText(["מומלץ לרכוש קרן מחקה על מדד"]).valid).toBe(false);
    expect(validateStrategyText(["תעודת סל מצוינת"]).valid).toBe(false);
    expect(validateStrategyText(["NYSE:ABCD looks cheap"]).valid).toBe(false);
  });
  it("accepts strategy-level language", () => {
    expect(validateStrategyText([
      "Increase retirement allocation via tax-advantaged wrappers",
      "להגדיל את החיסכון הפנסיוני",
      "Reduce concentration by diverting new savings",
    ]).valid).toBe(true);
  });
});

describe("generators", () => {
  it("every finding from a rich household maps to a valid, product-free draft", () => {
    const rich = snapshot([
      item({ valueBase: 500_000 }), // idle cash
      expense(10_000),
      item({ name: "תיק מרוכז", accountType: "BROKERAGE_IL", institutionName: "ברוקר", valueBase: 900_000 }),
      item({
        kind: "MORTGAGE", accountType: null, valueBase: 800_000,
        mortgageTracks: [
          { trackType: "FIXED_LINKED", principalRemaining: 700_000, annualRatePct: 3.1, cpiLinked: true, endDate: "2045-01-01" },
          { trackType: "PRIME", principalRemaining: 100_000, annualRatePct: 9.5, cpiLinked: false, endDate: "2045-01-01" },
        ],
      }),
      item({ accountType: "KEREN_HISHTALMUT", managementFeePct: 1.1, valueBase: 150_000 }),
    ]);
    const findings = runAnalyzers(rich, CTX);
    const { drafts, unmappedFindings } = generateRecommendations(findings);
    expect(unmappedFindings).toEqual([]); // every emitted finding code has a generator
    expect(drafts.length).toBeGreaterThanOrEqual(5);
    for (const d of drafts) {
      expect(() => RationaleSchema.parse(d.rationale)).not.toThrow();
      expect(() => RationaleSchema.parse(d.rationaleHe)).not.toThrow();
      expect(d.titleHe.length).toBeGreaterThan(3);
      // Hebrew rationale must actually be Hebrew (and share the enum horizon)
      expect(/[\u0590-\u05FF]/.test(d.rationaleHe.why)).toBe(true);
      expect(/[\u0590-\u05FF]/.test(d.rationaleHe.expectedImpact)).toBe(true);
      expect(d.rationaleHe.timeHorizon).toBe(d.rationale.timeHorizon);
      // M23c: computed steps, both languages, Hebrew actually Hebrew
      expect(d.actionItems.length).toBeGreaterThanOrEqual(1);
      expect(d.actionItemsHe.length).toBeGreaterThanOrEqual(1);
      expect(/[\u0590-\u05FF]/.test(d.actionItemsHe.join(" "))).toBe(true);
      const weights = Object.values(d.subscores);
      expect(weights.every((w) => w >= 0 && w <= 100)).toBe(true);
      expect(d.confidence).toBeGreaterThanOrEqual(60);
    }
  });

  it("unknown finding codes are reported, never guessed at", () => {
    const { drafts, unmappedFindings } = generateRecommendations([
      { code: "SOMETHING_NEW", severity: "INFO", metrics: {}, evidenceItemIds: [] },
    ]);
    expect(drafts).toEqual([]);
    expect(unmappedFindings).toEqual(["SOMETHING_NEW"]);
  });
});

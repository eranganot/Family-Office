import { describe, expect, it } from "vitest";
import { evaluateGate } from "../src/gate";
import { scorePriority } from "../src/scoring";
import { item, snapshot } from "./fixtures";

const draft = {
  type: "X", title: "t", titleHe: "ת",
  rationale: {} as never,
  rationaleHe: {} as never,
  actionItems: ["x"], actionItemsHe: ["איקס"],
  subscores: { impact: 80, ease: 60, taxBenefit: 40, riskReduction: 70, goalContribution: 50, urgency: 30 },
  confidence: 80, evidenceItemIds: [], goalTypesImproved: [], assumptionKeysUsed: [],
};

describe("scorePriority", () => {
  it("weights subscores per the assumption weights", () => {
    const equal = scorePriority(draft, { impact: 1, ease: 1, taxBenefit: 1, riskReduction: 1, goalContribution: 1, urgency: 1 });
    expect(equal).toBeCloseTo((80 + 60 + 40 + 70 + 50 + 30) / 6, 1);
    const impactOnly = scorePriority(draft, { impact: 100, ease: 0, taxBenefit: 0, riskReduction: 0, goalContribution: 0, urgency: 0 });
    expect(impactOnly).toBe(80);
    expect(() => scorePriority(draft, { impact: 0, ease: 0, taxBenefit: 0, riskReduction: 0, goalContribution: 0, urgency: 0 })).toThrow("PRIORITY_WEIGHTS_INVALID");
  });
});

describe("evaluateGate", () => {
  const thresholds = { minCompleteness: 80, minConfidence: 60 };
  it("passes clean data and caps confidence at the data confidence", () => {
    const r = evaluateGate(snapshot([item()]), thresholds);
    expect(r).toEqual({ pass: true, confidenceCap: 90 });
  });
  it("refuses with a data-gap report on weak completeness, low confidence, or pending suspense", () => {
    const weak = snapshot([item()], {
      dataQuality: { completenessScore: 40, confidenceScore: 50, pendingSuspense: 2, unconvertedItemIds: ["x"] },
    });
    const r = evaluateGate(weak, thresholds);
    expect(r.pass).toBe(false);
    if (!r.pass) {
      expect(r.report.guidance).toEqual(["COMPLETENESS_BELOW_80", "CONFIDENCE_BELOW_60", "PENDING_SUSPENSE"]);
      expect(r.report.unconvertedItemIds).toEqual(["x"]);
    }
  });
});

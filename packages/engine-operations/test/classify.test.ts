import { describe, expect, it } from "vitest";
import { classify, reconcileWithSign } from "../src/classify";
import { UNCLASSIFIED_KEY } from "../src/categories";

const MIN = 0.85; // operations_classification_min_confidence default

const c = (desc: string, ownerMemory?: Map<string, { categoryKey: string; behavioral: "FIXED_CONTRACTUAL" | "VARIABLE_DISCRETIONARY" | "FINANCIAL_DRAG" | "SAVINGS_FLOW" | "TRANSFER" }>) =>
  classify({ descriptionRedacted: desc }, { minConfidence: MIN, ownerMemory });

describe("classify — deterministic, no model", () => {
  it("is reproducible: identical input yields identical output", () => {
    expect(c("SPOTIFY P43CD5B1CB")).toEqual(c("SPOTIFY P43CD5B1CB"));
  });

  it("classifies a Latin subscription and marks it fixed/contractual", () => {
    const r = c("SPOTIFY P43CD5B1CB");
    expect(r.categoryKey).toBe("utilities.subscriptions");
    expect(r.behavioral).toBe("FIXED_CONTRACTUAL");
    expect(r.suspense).toBe(false);
  });

  it("classifies Hebrew merchants, including reversed (visual-order) text", () => {
    const logical = "חשבון חשמל";
    const visual = [...logical].reverse().join("");
    expect(c(logical).categoryKey).toBe("housing.electricity");
    expect(c(visual).categoryKey).toBe("housing.electricity");
  });

  it("routes card fees to FINANCIAL_DRAG — the leakage optimisation target", () => {
    const r = c("דמי כרטיס");
    expect(r.categoryKey).toBe("financial_fees.card_fees");
    expect(r.behavioral).toBe("FINANCIAL_DRAG");
  });

  it("classifies pension/hishtalmut as SAVINGS_FLOW, never an expense", () => {
    expect(c("קרן השתלמות").behavioral).toBe("SAVINGS_FLOW");
    expect(c("מנורה מבטחים").behavioral).toBe("SAVINGS_FLOW");
  });

  it("treats a card settlement as TRANSFER so it cannot double-count", () => {
    const r = c("ישראכרט בעמ");
    expect(r.categoryKey).toBe("transfers.card_settlement");
    expect(r.behavioral).toBe("TRANSFER");
  });

  it("falls back to Other/Unclassified at zero confidence for an unknown merchant", () => {
    const r = c("ZZQQ WIDGET EMPORIUM");
    expect(r.categoryKey).toBe(UNCLASSIFIED_KEY);
    expect(r.confidence).toBe(0);
    expect(r.suspense).toBe(true);
    expect(r.method).toBe("FALLBACK");
  });

  it("sends a strong-but-uncertain match to Suspense PRE-FILLED, not silently applied", () => {
    // "ביטוח" alone is deliberately below threshold: it could be any policy type.
    const r = c("ביטוח כלשהו");
    expect(r.confidence).toBeLessThan(MIN);
    expect(r.suspense).toBe(true);
    expect(r.categoryKey).toBe("insurance.life"); // pre-filled for the owner to confirm
  });

  it("stamps the rules version onto every result for reproducibility", () => {
    expect(c("WOLT").ruleVersion).toMatch(/^merchant-rules@/);
  });

  it("prefers a SPECIFIC rule over a general one (ordering matters)", () => {
    expect(c("ביטוח דירה").categoryKey).toBe("housing.home_insurance");
    expect(c("ביטוח חובה").categoryKey).toBe("transport.vehicle_insurance");
  });
});

describe("classify — owner memory is how it learns without a model", () => {
  it("an owner decision beats any rule, at full confidence", () => {
    const key = classify({ descriptionRedacted: "WOLT" }, { minConfidence: MIN }).merchantKey;
    const memory = new Map([[key, { categoryKey: "food.restaurants", behavioral: "VARIABLE_DISCRETIONARY" as const }]]);
    const r = c("WOLT", memory);
    expect(r.categoryKey).toBe("food.restaurants"); // not the rule's food.delivery
    expect(r.method).toBe("OWNER");
    expect(r.confidence).toBe(1);
    expect(r.suspense).toBe(false);
  });

  it("owner memory generalises across reference codes from the same merchant", () => {
    const a = classify({ descriptionRedacted: "SPOTIFY P43CD5B1CB" }, { minConfidence: MIN });
    const b = classify({ descriptionRedacted: "SPOTIFY Q99XX1A2BC" }, { minConfidence: MIN });
    expect(a.merchantKey).toBe(b.merchantKey);
    const memory = new Map([[a.merchantKey, { categoryKey: "entertainment.culture", behavioral: "VARIABLE_DISCRETIONARY" as const }]]);
    expect(c("SPOTIFY Q99XX1A2BC", memory).categoryKey).toBe("entertainment.culture");
  });
});

describe("reconcileWithSign — direction sanity", () => {
  const isIncome = (k: string) => k.startsWith("income.");

  it("demotes a salary rule that fired on an OUTFLOW", () => {
    const r = classify({ descriptionRedacted: "משכורת" }, { minConfidence: MIN });
    expect(r.suspense).toBe(false);
    const fixed = reconcileWithSign(r, -5000, isIncome, MIN);
    expect(fixed.suspense).toBe(true);
    expect(fixed.confidence).toBeLessThan(MIN);
  });

  it("leaves a salary rule alone on an INFLOW", () => {
    const r = classify({ descriptionRedacted: "משכורת" }, { minConfidence: MIN });
    expect(reconcileWithSign(r, 28000, isIncome, MIN).suspense).toBe(false);
  });

  it("never overrides an explicit owner decision", () => {
    const key = classify({ descriptionRedacted: "משכורת" }, { minConfidence: MIN }).merchantKey;
    const memory = new Map([[key, { categoryKey: "income.salary.base", behavioral: "FIXED_CONTRACTUAL" as const }]]);
    const r = c("משכורת", memory);
    expect(reconcileWithSign(r, -5000, isIncome, MIN).method).toBe("OWNER");
  });
});

describe("rule selection — highest confidence, not first in the list", () => {
  it("a specific salary rule beats a generic transfer rule regardless of order", () => {
    // Real fault: "העברה משכורת" matched the generic transfer rule (0.6) before the
    // salary rule (0.95) purely by array position, and was booked as a TRANSFER.
    // Transfers are excluded from BOTH income and expenses, so an entire salary
    // disappeared from the month with no error anywhere.
    const r = c("העברה משכורת");
    expect(r.categoryKey).toBe("income.salary.base");
    expect(r.behavioral).not.toBe("TRANSFER");
    expect(r.confidence).toBe(0.95);
  });

  it("still classifies a genuine transfer as a transfer", () => {
    const r = c("העברה ל/דנה/תשלום");
    expect(r.behavioral).toBe("TRANSFER");
  });

  it("prefers the more specific insurance rule over the generic one", () => {
    expect(c("ביטוח דירה").categoryKey).toBe("housing.home_insurance");
    expect(c("ביטוח חובה").categoryKey).toBe("transport.vehicle_insurance");
  });

  it("a low-confidence match still wins when it is the ONLY match", () => {
    const r = c("ביטוח כלשהו");
    expect(r.categoryKey).toBe("insurance.life");
    expect(r.suspense).toBe(true);
  });
});

import { describe, expect, it } from "vitest";
import { IL_2026 } from "../src/seed-data/il-2026";

/**
 * These rates were seeded WRONG once and nothing caught it.
 *
 * `3.5% / 12.0%` appears all over the web and reads like a bituach-leumi rate. It is not:
 * it is the PRE-2025 COMBINED bituach leumi + health tax employee deduction (BL reduced
 * was 0.40% before Jan 2025). Seeding it as "bituach leumi alone" overstated the reduced
 * band by 3.4x and the full band by 1.7x — a silent error that would have propagated into
 * every net-income projection in the strategy engine.
 *
 * It was caught by reconciling against a real form 106. That is the same discipline the
 * statement importer uses: check the computed figure against the document's own printed
 * total. These tests pin the result so it cannot regress.
 *
 * No household figures are stored here — only the derived arithmetic identity.
 */
describe("IL 2026 bituach leumi / health tax employee rates", () => {
  const r = IL_2026.BITUACH_LEUMI.employeeRates;

  it("the combined deduction decomposes exactly into BL + health tax", () => {
    // If this fails, one of the three pairs has drifted away from the other two.
    expect(r.bituachLeumiOnly.reducedPct + r.healthTax.reducedPct).toBeCloseTo(r.reducedPct, 2);
    expect(r.bituachLeumiOnly.fullPct + r.healthTax.fullPct).toBeCloseTo(r.fullPct, 2);
  });

  it("bituach leumi alone is 1.04% / 7.00%, NOT the 3.5% / 12.0% combined pair", () => {
    expect(r.bituachLeumiOnly.reducedPct).toBe(1.04);
    expect(r.bituachLeumiOnly.fullPct).toBe(7.0);
    // The specific wrong value that was seeded. Named so the mistake cannot come back
    // quietly under a plausible-looking edit.
    expect(r.bituachLeumiOnly.reducedPct).not.toBe(3.5);
    expect(r.bituachLeumiOnly.fullPct).not.toBe(12.0);
  });

  it("reproduces a real 2025 payslip to within 5 ILS", () => {
    // Reconciliation target from an owner-supplied form 106. Only the derived base and
    // the two withheld totals are used; no identifying figures are stored.
    const liableBase = 608_338;
    const reducedBand = 7_522 * 12; // 60% of average wage, monthly threshold x 12
    const fullBand = liableBase - reducedBand;

    const bl = (reducedBand * r.bituachLeumiOnly.reducedPct + fullBand * r.bituachLeumiOnly.fullPct) / 100;
    const health = (reducedBand * r.healthTax.reducedPct + fullBand * r.healthTax.fullPct) / 100;

    expect(Math.abs(bl - 37_200)).toBeLessThan(5);
    expect(Math.abs(health - 29_696)).toBeLessThan(5);
  });
});

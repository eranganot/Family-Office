import { describe, expect, it } from "vitest";
import { canCancel, canRenegotiate, commitmentPolicy } from "../src/operations/commitment-policy";

/**
 * These tests encode the two M40a production defects as rules, not as anecdotes.
 * BehavioralClass is NOT the axis: `housing.mortgage` and `utilities.subscriptions` are
 * BOTH `FIXED_CONTRACTUAL`, and they must land on opposite sides of every question here.
 */
describe("commitment policy", () => {
  it("never lets a mortgage be cancelled or renegotiated by this engine", () => {
    // Refinancing is engine-strategy's MORTGAGE_ABOVE_BENCHMARK, which benchmarks the
    // track rate against the BOI policy rate. Operations must not duplicate it.
    expect(commitmentPolicy("housing.mortgage")).toEqual({ cancellable: false, renegotiable: false });
  });

  it("treats insurance as repriceable but NEVER cancellable", () => {
    for (const key of [
      "insurance",
      "insurance.life",
      "insurance.health",
      "insurance.disability",
      "insurance.long_term_care",
      "housing.home_insurance",
      "transport.vehicle_insurance",
    ]) {
      expect(canCancel(key)).toBe(false);
      expect(canRenegotiate(key)).toBe(true);
    }
  });

  it("lets real subscriptions be cancelled even though they are FIXED_CONTRACTUAL", () => {
    // The M40a-fix regression: `utilities.subscriptions` is the literal Subscriptions
    // category AND is FIXED_CONTRACTUAL. Banning the behavioural class banned the feature.
    expect(canCancel("utilities.subscriptions")).toBe(true);
    expect(canCancel("utilities.cloud_software")).toBe(true);
    expect(canCancel("leisure.streaming")).toBe(true);
  });

  it("treats telecom and energy as repriceable, not cancellable", () => {
    for (const key of ["utilities.mobile", "housing.internet_tv", "housing.electricity", "housing.gas"]) {
      expect(canCancel(key)).toBe(false);
      expect(canRenegotiate(key)).toBe(true);
    }
  });

  it("refuses everything for statutory, debt, savings and unclassified", () => {
    for (const key of [
      "housing.arnona",
      "taxes.bituach_leumi",
      "debt.loan_repayment",
      "savings.pension",
      "other.unclassified",
      "other",
      null,
      "",
    ]) {
      expect(canCancel(key)).toBe(false);
      expect(canRenegotiate(key)).toBe(false);
    }
  });

  it("resolves by LONGEST prefix so a child can override its parent", () => {
    // `utilities` is reprice-only; `utilities.subscriptions` beneath it is cancellable.
    expect(canCancel("utilities")).toBe(false);
    expect(canCancel("utilities.subscriptions")).toBe(true);
    // `housing` is unlisted (neither) but `housing.electricity` is repriceable.
    expect(canRenegotiate("housing.electricity")).toBe(true);
    expect(canRenegotiate("housing.rent")).toBe(false);
  });

  it("defaults an UNKNOWN category to no action at all", () => {
    expect(commitmentPolicy("something.we.never.defined")).toEqual({
      cancellable: false,
      renegotiable: false,
    });
  });
});

import { describe, expect, it } from "vitest";
import { wizardAnswersToAssumptions, type WizardAnswers } from "../src/wizard";

const base: WizardAnswers = {
  bufferMonths: 6, spendRigidity: 2, nagging: 2, concentrationSensitivity: 2,
  israelDependence: 2, regretType: 2, homeView: 2, driftSpeed: 2, feeImportance: 2,
  largeLoanBase: 100_000,
};
const val = (out: ReturnType<typeof wizardAnswersToAssumptions>, key: string) =>
  out.find((o) => o.key === key)!.value;

describe("wizardAnswersToAssumptions", () => {
  it("neutral answers reproduce the conservative defaults", () => {
    const out = wizardAnswersToAssumptions(base);
    expect(val(out, "emergency_fund_months")).toBe(6);
    expect(val(out, "concentration_single_asset_max_pct")).toBe(30);
    expect(val(out, "currency_foreign_min_pct")).toBe(15);
    expect(val(out, "allocation_rebalance_band_pct")).toBe(10);
    expect(val(out, "drift_net_worth_pct")).toBe(10);
    expect((val(out, "staleness_days_by_kind") as Record<string, number>)["ACCOUNT"]).toBe(400);
  });

  it("rigid spending + fragile income push the safety thresholds up", () => {
    const out = wizardAnswersToAssumptions({ ...base, bufferMonths: 9, spendRigidity: 1 });
    expect(val(out, "emergency_fund_months")).toBe(11);
    expect(val(out, "insurance_survivor_expense_months")).toBe(72);
  });

  it("loss-averse regret tightens the rebalance band; drift speed scales alerts", () => {
    const out = wizardAnswersToAssumptions({ ...base, regretType: 1, driftSpeed: 1 });
    expect(val(out, "allocation_rebalance_band_pct")).toBe(7);
    expect(val(out, "drift_net_worth_pct")).toBe(7);
    expect(val(out, "drift_concentration_pct")).toBe(4); // 5×0.7 rounded
  });

  it("everything-in-Israel raises the foreign-exposure floor and ceiling", () => {
    const out = wizardAnswersToAssumptions({ ...base, israelDependence: 1 });
    expect(val(out, "currency_foreign_min_pct")).toBe(25);
    expect(val(out, "currency_foreign_max_pct")).toBe(60);
  });

  it("fee-sensitive scales the per-type map down 15%", () => {
    const out = wizardAnswersToAssumptions({ ...base, feeImportance: 1 });
    const map = val(out, "management_fee_notice_by_type") as Record<string, number>;
    for (const v of Object.values(map)) expect(v).toBeLessThan(1);
  });

  it("emergency months clamp to [3,12]", () => {
    expect(val(wizardAnswersToAssumptions({ ...base, bufferMonths: 12, spendRigidity: 1 }), "emergency_fund_months")).toBe(12);
    expect(val(wizardAnswersToAssumptions({ ...base, bufferMonths: 3, spendRigidity: 3 }), "emergency_fund_months")).toBe(3);
  });
});

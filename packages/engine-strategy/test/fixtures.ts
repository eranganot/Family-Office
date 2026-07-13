import type { SnapshotItem, SnapshotPayload } from "@wealthos/domain";

export const item = (over: Partial<SnapshotItem> = {}): SnapshotItem => ({
  id: "i-" + Math.random().toString(36).slice(2, 8),
  kind: "ACCOUNT",
  name: "חשבון",
  currency: "ILS",
  accountType: "BANK_CHECKING",
  institutionName: "בנק סינתטי",
  liquidityClass: null,
  managementFeePct: null,
  growthSharePct: null,
  valueBase: 100_000,
  valueAsOf: "2026-06-01",
  verified: true,
  ownerMemberIds: ["m1"],
  mortgageTracks: null,
  cashFlow: null,
  ...over,
});

export const snapshot = (items: SnapshotItem[], over: Partial<SnapshotPayload> = {}): SnapshotPayload => ({
  schemaVersion: 1,
  takenAt: "2026-07-01T00:00:00.000Z",
  baseCurrency: "ILS",
  workflowState: "STRATEGY",
  members: [
    { id: "m1", name: "ערן", role: "ADULT", birthDate: "1985-01-01", employmentStatus: "EMPLOYED" },
  ],
  items,
  goals: [],
  fxRatesUsed: [],
  dataQuality: { completenessScore: 100, confidenceScore: 90, pendingSuspense: 0, unconvertedItemIds: [] },
  ...over,
});

export const CTX = {
  assumptions: {
    emergency_fund_months: 6,
    concentration_single_asset_max_pct: 30,
    concentration_institution_max_pct: 50,
    currency_foreign_min_pct: 10,
    currency_foreign_max_pct: 50,
    management_fee_notice_pct: 0.8,
    mortgage_cpi_linked_max_pct: 60,
    expensive_debt_rate_pct: 8,
    large_loan_notice_base: 100_000,
    risk_loss_tolerance: 2,
    risk_income_stability: 2,
    risk_horizon_years: 20,
    allocation_rebalance_band_pct: 10,
    allocation_real_estate_max_pct: 60,
    allocation_mix_unknown_max_pct: 50,
  },
  taxRules: { HISHTALMUT_CEILINGS: { selfEmployedExemptDepositAnnualILS: 20_566 } },
};

export const expense = (monthly: number) =>
  item({
    kind: "CASH_FLOW",
    accountType: null,
    valueBase: null,
    cashFlow: { flowType: "LIVING_EXPENSE", direction: "OUT", amountBase: monthly, frequency: "MONTHLY" },
  });

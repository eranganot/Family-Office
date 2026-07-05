/** Conservative system defaults. Households override via the registry UI (new versions). */
export const DEFAULT_ASSUMPTIONS: Array<{
  key: string;
  value: unknown;
  unit: string;
  description: string;
}> = [
  { key: "expected_real_return_equity_pct", value: 4.5, unit: "PCT", description: "Long-run real return, global equities (conservative)" },
  { key: "expected_real_return_bonds_pct", value: 1.5, unit: "PCT", description: "Long-run real return, investment-grade bonds (conservative)" },
  { key: "inflation_il_pct", value: 2.5, unit: "PCT", description: "Long-run Israeli CPI assumption (BOI target band midpoint+)" },
  { key: "goal_projection_real_return_pct", value: 3.0, unit: "PCT", description: "Real return used for goal funding projections (conservative blend)" },
  { key: "emergency_fund_months", value: 6, unit: "MONTHS", description: "Target emergency fund in months of expenses" },
  { key: "low_confidence_threshold", value: 50, unit: "SCORE", description: "Items below this confidence are flagged in verification" },
  {
    key: "staleness_days_by_kind",
    value: { ACCOUNT: 400, REAL_ESTATE: 800, MORTGAGE: 400, LOAN: 400, CASH_FLOW: 400, INSURANCE: 800, OTHER_ASSET: 800, OTHER_LIABILITY: 800 },
    unit: "DAYS",
    description: "Valuation staleness thresholds per ledger kind",
  },
  {
    key: "priority_weights",
    value: { impact: 30, ease: 15, taxBenefit: 15, riskReduction: 20, goalContribution: 15, urgency: 5 },
    unit: "WEIGHTS",
    description: "Recommendation priority-score weights (sum 100); consumed by the M6 strategy engine",
  },
];

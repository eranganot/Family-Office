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
  { key: "strategy_min_completeness", value: 80, unit: "SCORE", description: "Strategy engine refuses to run below this data completeness" },
  { key: "strategy_min_confidence", value: 60, unit: "SCORE", description: "Strategy engine refuses to run below this data confidence" },
  { key: "concentration_single_asset_max_pct", value: 30, unit: "PCT", description: "Single-position share of assets that triggers a concentration warning" },
  { key: "concentration_institution_max_pct", value: 50, unit: "PCT", description: "Single-institution share of assets that triggers a notice" },
  { key: "currency_foreign_min_pct", value: 10, unit: "PCT", description: "Minimum foreign-currency share before home-bias notice" },
  { key: "currency_foreign_max_pct", value: 50, unit: "PCT", description: "Maximum foreign-currency share before excess notice" },
  { key: "management_fee_notice_pct", value: 0.8, unit: "PCT", description: "Management fee (from balance) above which fee-drag is flagged" },
  { key: "mortgage_cpi_linked_max_pct", value: 60, unit: "PCT", description: "CPI-linked share of mortgage principal that triggers a notice" },
  { key: "expensive_debt_rate_pct", value: 8, unit: "PCT", description: "Debt rate above which early repayment is suggested" },
  { key: "large_loan_notice_base", value: 100000, unit: "ILS", description: "Non-mortgage loan size that triggers review" },
  { key: "drift_net_worth_pct", value: 10, unit: "PCT", description: "Relative net-worth change vs strategy baseline that constitutes drift (M9 monitoring)" },
  { key: "drift_liquidity_pct", value: 10, unit: "PCT_POINTS", description: "Change in liquid-asset share (percentage points) vs baseline that constitutes drift" },
  { key: "drift_concentration_pct", value: 5, unit: "PCT_POINTS", description: "Increase in single-asset concentration (percentage points) vs baseline that constitutes drift" },
  { key: "drift_goal_funding_pct", value: 10, unit: "PCT_POINTS", description: "Change in a goal's funded ratio (percentage points) vs baseline that constitutes drift" },
  {
    key: "priority_weights",
    value: { impact: 30, ease: 15, taxBenefit: 15, riskReduction: 20, goalContribution: 15, urgency: 5 },
    unit: "WEIGHTS",
    description: "Recommendation priority-score weights (sum 100); consumed by the M6 strategy engine",
  },
];

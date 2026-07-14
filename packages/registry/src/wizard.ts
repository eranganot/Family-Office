import { DEFAULT_ASSUMPTIONS } from "./assumption-defaults";

/**
 * M23b — plain-language assumptions wizard (owner decision: lifestyle only;
 * market numbers stay system-owned). Pure, deterministic mapper from ten
 * no-finance-knowledge answers to threshold-assumption values. The router
 * writes ONLY values that differ from the current ones (no gratuitous
 * versioning/invalidation).
 */

export interface WizardAnswers {
  /** Months needed to reorganize if income stopped, without selling investments (3|6|9|12). */
  bufferMonths: number;
  /** How rigid is the monthly spend: 1=mostly fixed, 2=about half, 3=mostly flexible. */
  spendRigidity: 1 | 2 | 3;
  /** How much should the system nag about fresh data: 1=a lot, 2=balanced, 3=little. */
  nagging: 1 | 2 | 3;
  /** Sensitivity to one asset falling: 1=very, 2=normal, 3=not much. */
  concentrationSensitivity: 1 | 2 | 3;
  /** How much of your economic future depends on Israel: 1=everything, 2=most, 3=part. */
  israelDependence: 1 | 2 | 3;
  /** What bothers more: 1=losses, 2=balanced, 3=missing gains. */
  regretType: 1 | 2 | 3;
  /** Your home is: 1=a home not an investment, 2=both, 3=an asset like any other. */
  homeView: 1 | 2 | 3;
  /** How fast do you want to know something moved: 1=immediately, 2=monthly-ish, 3=quarterly-ish. */
  driftSpeed: 1 | 2 | 3;
  /** Fee alerts: 1=very important, 2=normal. */
  feeImportance: 1 | 2;
  /** Loan size below which it's not worth a discussion (base currency). */
  largeLoanBase: number;
}

export type WizardOutput = Array<{ key: string; value: number | Record<string, number> }>;

function defaultOf(key: string): unknown {
  const row = DEFAULT_ASSUMPTIONS.find((d) => d.key === key);
  if (!row) throw new Error(`WIZARD_UNKNOWN_DEFAULT:${key}`);
  return row.value;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const scaleMap = (base: Record<string, number>, factor: number): Record<string, number> =>
  Object.fromEntries(Object.entries(base).map(([k, v]) => [k, Math.round(v * factor)]));

export function wizardAnswersToAssumptions(a: WizardAnswers): WizardOutput {
  const out: WizardOutput = [];

  const bufferAdj = a.spendRigidity === 1 ? 2 : a.spendRigidity === 3 ? -1 : 0;
  out.push({ key: "emergency_fund_months", value: clamp(a.bufferMonths + bufferAdj, 3, 12) });

  out.push({
    key: "insurance_survivor_expense_months",
    value: a.spendRigidity === 1 ? 72 : a.spendRigidity === 3 ? 48 : 60,
  });

  const staleBase = defaultOf("staleness_days_by_kind") as Record<string, number>;
  const staleFactor = a.nagging === 1 ? 0.5 : a.nagging === 3 ? 1.5 : 1;
  out.push({ key: "staleness_days_by_kind", value: scaleMap(staleBase, staleFactor) });
  out.push({ key: "low_confidence_threshold", value: a.nagging === 1 ? 60 : a.nagging === 3 ? 40 : 50 });

  out.push({
    key: "concentration_single_asset_max_pct",
    value: a.concentrationSensitivity === 1 ? 20 : a.concentrationSensitivity === 3 ? 40 : 30,
  });

  out.push({ key: "currency_foreign_min_pct", value: a.israelDependence === 1 ? 25 : a.israelDependence === 3 ? 10 : 15 });
  out.push({ key: "currency_foreign_max_pct", value: a.israelDependence === 1 ? 60 : a.israelDependence === 3 ? 40 : 50 });

  out.push({ key: "allocation_rebalance_band_pct", value: a.regretType === 1 ? 7 : a.regretType === 3 ? 15 : 10 });

  out.push({ key: "allocation_real_estate_max_pct", value: a.homeView === 1 ? 70 : a.homeView === 3 ? 50 : 60 });

  const driftFactor = a.driftSpeed === 1 ? 0.7 : a.driftSpeed === 3 ? 1.5 : 1;
  for (const key of ["drift_allocation_pct", "drift_net_worth_pct", "drift_liquidity_pct", "drift_goal_funding_pct"]) {
    out.push({ key, value: Math.max(1, Math.round(Number(defaultOf(key)) * driftFactor)) });
  }
  out.push({ key: "drift_concentration_pct", value: Math.max(1, Math.round(Number(defaultOf("drift_concentration_pct")) * driftFactor)) });

  const feeBase = defaultOf("management_fee_notice_by_type") as Record<string, number>;
  const feeMap =
    a.feeImportance === 1
      ? Object.fromEntries(Object.entries(feeBase).map(([k, v]) => [k, Math.round(v * 0.85 * 100) / 100]))
      : feeBase;
  out.push({ key: "management_fee_notice_by_type", value: feeMap });

  out.push({ key: "large_loan_notice_base", value: Math.max(0, Math.round(a.largeLoanBase)) });

  return out;
}

/**
 * M40 — the opportunity analyzer contracts.
 *
 * `OpportunityFinding` is deliberately STRUCTURALLY IDENTICAL to
 * `engine-strategy`'s `Finding`. It is redeclared here rather than imported so
 * that `engine-operations` never depends on `engine-strategy`: doc 04 sanctions
 * exactly one direction between the two engines (strategy may read operations'
 * read-model types), and importing back the other way would make that a real
 * cycle. Structural typing means the operational findings drop straight into the
 * existing generator pipeline with no adapter and no duplicated validator.
 */

export type OpportunitySeverity = "INFO" | "NOTICE" | "WARNING";

export interface OpportunityFinding {
  code: string;
  severity: OpportunitySeverity;
  metrics: Record<string, number | string>;
  /**
   * Ledger item ids ONLY — this is what `RecommendationEvidence.ledgerItemId`
   * accepts. Operational evidence that lives in `Transaction` rows is carried in
   * `metrics` (counts, merchant keys, amounts) instead of being forced into a
   * foreign key that does not point at it.
   */
  evidenceItemIds: string[];
}

/** Thresholds every operational analyzer reads. Never hardcoded — Registry only. */
export interface OpportunityAssumptions {
  /** `operations_baseline_months` — trailing window for a monthly baseline. */
  baselineMonths: number;
  /** `leakage_bank_fee_monthly_notice_base` — monthly drag above which we flag. */
  leakageFeeNoticeBase: number;
  /** `leakage_subscription_dormant_days` — dormancy horizon for a recurring charge. */
  subscriptionDormantDays: number;
  /** `calendar_upcoming_window_days` — deadline horizon. */
  calendarWindowDays: number;
  /**
   * `opportunity_min_monthly_base` — M40b materiality floor. Below this, a recurring
   * charge does not earn a card. M40a shipped a full bilingual card with three action
   * steps for a ₪6/month parking charge; the cost of reading it exceeded the saving.
   */
  minMonthlyBase: number;
  /**
   * `leakage_fx_markup_notice_pct` — M40c. Implied conversion spread, in percent,
   * above which a foreign-currency card earns a card of its own.
   */
  fxMarkupNoticePct: number;
  /**
   * `opportunity_min_coverage_pct` — M40c. The refuse-and-report-coverage floor
   * (owner decision, 2026-07-29). An analyzer that can only price a fraction of the
   * relevant rows must REFUSE to emit a figure rather than publish one built on the
   * fraction and quietly lower its confidence score. A low confidence number still
   * reads as a number; a refusal reads as a refusal.
   */
  minCoveragePct: number;
}

/**
 * One reference exchange rate. `asOf` is a DATE (no time component) exactly as the
 * `FxRate` table stores it.
 */
export interface OpportunityFxRate {
  from: string;
  to: string;
  rate: number;
  asOf: Date;
  /** BOI | MANUAL | ... — carried so a finding can name the benchmark it used. */
  source: string;
}

/** One observed transaction, reduced to what the opportunity analyzers need. */
export interface OpportunityTxn {
  id: string;
  bookedAt: Date;
  /** Signed, BASE currency. `null` when no FxRate existed — never guessed. */
  amountBase: number | null;
  /**
   * M40c — the סכום עסקה, when the institution booked one that differs from the charge.
   *
   * For a foreign card purchase the statement carries BOTH numbers: 10.00 USD
   * transacted, 29.79 ILS charged. `amountBase` is the charge; this is the original.
   * Dividing one by the other recovers the rate actually applied, which is the only
   * way to see a conversion spread — the spread is priced into the rate and is never
   * billed as a line.
   */
  originalAmount: number | null;
  /**
   * M40c — ISO-4217 of `originalAmount`, and the reason the pair is safe to divide.
   * The same column carries an instalment plan's ILS סכום עסקה, which would otherwise
   * be indistinguishable from a conversion and imply an enormous fictional markup.
   * `null` on rows imported before the column existed: unknown, never assumed.
   */
  originalCurrency: string | null;
  status: "PENDING" | "BOOKED" | "VOID";
  categoryKey: string | null;
  behavioral:
    | "FIXED_CONTRACTUAL"
    | "VARIABLE_DISCRETIONARY"
    | "FINANCIAL_DRAG"
    | "SAVINGS_FLOW"
    | "TRANSFER"
    | null;
  merchantKey: string | null;
  isRecurringCandidate: boolean;
  /**
   * Set when this transaction is evidence for a canonical LEDGER stream — a mortgage
   * track, a loan, an insurance policy. Load-bearing for the subscription analyzer:
   * a payment against a mapped obligation is never a cancellable subscription.
   */
  ledgerItemId: string | null;
}

/** One scheduled calendar event, reduced to what the deadline analyzer needs. */
export interface OpportunityCalendarEvent {
  id: string;
  kind: string;
  titleEn: string;
  titleHe: string;
  dueDate: Date;
  amountBase: number | null;
  isCashImpacting: boolean;
  /** STATUTORY | HOUSEHOLD | DERIVED — a statutory miss costs more than a review slip. */
  sourceNote: string | null;
}

export interface OpportunityInput {
  /** "Now" is injected so every analyzer is deterministic under test. */
  asOf: Date;
  /** Household base currency (ILS). Injected, never assumed by an analyzer. */
  baseCurrency: string;
  assumptions: OpportunityAssumptions;
  transactions: OpportunityTxn[];
  calendarEvents: OpportunityCalendarEvent[];
  /** M40c — reference rates the FX analyzer benchmarks against. */
  fxRates: OpportunityFxRate[];
}

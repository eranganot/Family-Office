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
}

/** One observed transaction, reduced to what the opportunity analyzers need. */
export interface OpportunityTxn {
  id: string;
  bookedAt: Date;
  /** Signed, BASE currency. `null` when no FxRate existed — never guessed. */
  amountBase: number | null;
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
  assumptions: OpportunityAssumptions;
  transactions: OpportunityTxn[];
  calendarEvents: OpportunityCalendarEvent[];
}

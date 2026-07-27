import type { Refusal } from "./types";

/**
 * Statement date-range normalisation.
 *
 * A statement may cover a single month, several months, or an arbitrary range. Turning
 * it into a monthly baseline requires dividing by the ACTIVE DAYS the statement actually
 * covers — never by a hardcoded 30, and never by the calendar span when the statement
 * only partially covers it.
 */
export type StatementRangeKind = "SINGLE_MONTH" | "MULTI_MONTH" | "CUSTOM";

export interface StatementRange {
  start: Date;
  end: Date;
  activeDays: number;
  kind: StatementRangeKind;
}

const DAY_MS = 86_400_000;

export function detectStatementRange(start: Date, end: Date): StatementRange {
  const activeDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1);
  const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();

  // A full calendar month, or a range wholly inside one month, is SINGLE_MONTH.
  let kind: StatementRangeKind;
  if (sameMonth) kind = "SINGLE_MONTH";
  else if (activeDays >= 55) kind = "MULTI_MONTH";
  else kind = "CUSTOM";

  return { start, end, activeDays, kind };
}

export interface MonthlyBaseline {
  ok: true;
  amountBase: number;
  method: "OBSERVED" | "NORMALISED" | "DECLARED";
  sampleDays: number;
  /** 0..1 — how much of a month the sample actually covers, capped at 1. */
  coverageRatio: number;
}

const AVG_MONTH_DAYS = 30.436875; // mean Gregorian month; avoids a 28-vs-31 bias

/**
 * Convert an observed total over `range` into a monthly figure.
 *
 * Refuses below `minActiveDays` (`operations_normalisation_min_days`, default 20)
 * rather than extrapolating: scaling 5 days of spend up to a month is not a
 * measurement, it is a guess, and the engines never guess.
 */
export function normaliseToMonthly(
  totalBase: number,
  range: StatementRange,
  minActiveDays: number,
): MonthlyBaseline | Refusal {
  if (range.activeDays < minActiveDays) {
    return {
      ok: false,
      reason: "INSUFFICIENT_COVERAGE",
      detail: { activeDays: range.activeDays, required: minActiveDays },
    };
  }
  // A single full month needs no scaling — report it as OBSERVED, which is stronger
  // evidence than a normalised figure and is labelled as such downstream.
  if (range.kind === "SINGLE_MONTH" && range.activeDays >= 28) {
    return {
      ok: true,
      amountBase: Math.round(totalBase * 100) / 100,
      method: "OBSERVED",
      sampleDays: range.activeDays,
      coverageRatio: 1,
    };
  }
  const monthly = (totalBase / range.activeDays) * AVG_MONTH_DAYS;
  return {
    ok: true,
    amountBase: Math.round(monthly * 100) / 100,
    method: "NORMALISED",
    sampleDays: range.activeDays,
    coverageRatio: Math.min(1, range.activeDays / AVG_MONTH_DAYS),
  };
}

/**
 * Average a category across N whole months of history (`operations_baseline_months`).
 * Months with no observation are NOT treated as zero — a missing month is missing data,
 * not evidence of no spending, and averaging zeros in would understate the baseline.
 */
export function baselineFromMonths(
  monthlyTotals: ReadonlyArray<number | null>,
): MonthlyBaseline | Refusal {
  const observed = monthlyTotals.filter((v): v is number => v !== null);
  if (observed.length === 0) {
    return { ok: false, reason: "INSUFFICIENT_COVERAGE", detail: { months: 0 } };
  }
  const mean = observed.reduce((a, b) => a + b, 0) / observed.length;
  return {
    ok: true,
    amountBase: Math.round(mean * 100) / 100,
    method: observed.length === 1 ? "OBSERVED" : "NORMALISED",
    sampleDays: Math.round(observed.length * AVG_MONTH_DAYS),
    coverageRatio: Math.min(1, observed.length / monthlyTotals.length),
  };
}

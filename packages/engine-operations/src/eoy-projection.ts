/**
 * M41 — end-of-year projection: current trajectory vs optimised.
 *
 * This is the seam M40c deliberately left open. The Action Center returns
 * `eoyUnavailableReason=EOY_PROJECTION_ARRIVES_IN_M41` rather than a number, because a
 * plausible-looking forecast produced by no forecaster is the confident-wrong figure
 * this module keeps having to remove. This file is the forecaster.
 *
 * ---------------------------------------------------------------------------
 * WHAT "OPTIMISED" MEANS, AND WHAT IT DELIBERATELY DOES NOT
 * ---------------------------------------------------------------------------
 * The optimised line adds ONLY the recurring monthly impact of recommendations the
 * owner has ACCEPTED but not yet IMPLEMENTED, from the month he accepted them onward.
 * It is "what happens if you finish what you already said yes to" — not "what happens
 * if you take every suggestion".
 *
 * That distinction is the whole integrity of the chart:
 *   - PROPOSED items are excluded. Adding them would let the projection promise money
 *     from decisions never made, and the gap between the lines would measure the
 *     engine's optimism rather than the household's follow-through.
 *   - IMPLEMENTED items are excluded from the DELTA because their effect is already
 *     landing in observed surplus. Counting them again would double-count the one
 *     saving that actually happened — the failure this codebase has now hit in three
 *     separate costumes.
 *   - Items with a null `impactMonthlyBase` contribute NOTHING. A renegotiation or a
 *     cash-flow-timing card carries no saving by construction; inventing one here
 *     would smuggle back exactly the figure those generators refused to state.
 *
 * ---------------------------------------------------------------------------
 * REFUSALS
 * ---------------------------------------------------------------------------
 *  - Fewer than `minMonths` CLOSED months → no projection at all. A trajectory drawn
 *    through one point is a straight line through an accident, and it would be drawn
 *    with the same confident styling as a real one.
 *  - PROVISIONAL months (containing unverified transactions) are excluded from the
 *    run-rate and REPORTED. Their surplus is not yet a fact.
 *  - Months are never assumed to be zero. A month with no closed period is missing
 *    data, not a month with no surplus — averaging zeros in would understate the
 *    run-rate and make the optimised gap look larger than it is.
 */

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** One closed month's verified result. */
export interface ClosedMonth {
  year: number;
  /** 1–12. */
  month: number;
  surplusBase: number;
  /** True when the month still contained unverified rows at close. */
  isProvisional: boolean;
}

/** An accepted-but-unfinished action's recurring benefit. */
export interface PendingImpact {
  recommendationId: string;
  /** `null` when the action has no quantified saving — contributes nothing. */
  impactMonthlyBase: number | null;
  /** Month the owner accepted it (1–12) and its year. */
  acceptedYear: number;
  acceptedMonth: number;
}

export interface EoyProjectionInput {
  /** "Now" is injected so the projection is deterministic under test. */
  asOf: Date;
  closedMonths: ClosedMonth[];
  pendingImpacts: PendingImpact[];
  /** Minimum CLOSED, non-provisional months before a trajectory may be drawn. */
  minMonths: number;
}

export interface EoyMonthPoint {
  /** yyyy-mm. */
  key: string;
  /** Cumulative surplus on the current trajectory, base currency. */
  currentBase: number;
  /** Cumulative surplus if accepted actions are finished, base currency. */
  optimisedBase: number;
  /** True for months already closed — the line is observed, not forecast. */
  isActual: boolean;
}

export type EoyProjection =
  | {
      ok: true;
      monthlyRunRateBase: number;
      monthsObserved: number;
      monthsProvisionalExcluded: number;
      /** Cumulative surplus at 31 Dec on each line. */
      currentEoyBase: number;
      optimisedEoyBase: number;
      /** What finishing the accepted work is worth by 31 Dec. */
      deltaBase: number;
      pendingCount: number;
      /** Accepted actions carrying no quantified saving — counted, never estimated. */
      pendingWithoutImpact: number;
      series: EoyMonthPoint[];
    }
  | { ok: false; reason: "NOT_ENOUGH_CLOSED_MONTHS"; monthsObserved: number; minMonths: number };

const keyOf = (y: number, m: number): string => `${y}-${String(m).padStart(2, "0")}`;

export function projectEndOfYear(input: EoyProjectionInput): EoyProjection {
  const year = input.asOf.getUTCFullYear();
  const thisMonth = input.asOf.getUTCMonth() + 1; // 1–12

  const inYear = input.closedMonths.filter((m) => m.year === year);
  const verified = inYear.filter((m) => !m.isProvisional);
  const provisionalExcluded = inYear.length - verified.length;

  if (verified.length < input.minMonths) {
    return {
      ok: false,
      reason: "NOT_ENOUGH_CLOSED_MONTHS",
      monthsObserved: verified.length,
      minMonths: input.minMonths,
    };
  }

  // Run-rate from VERIFIED closed months only. Missing months are missing data, not
  // zero-surplus months, so the denominator is what was observed.
  const runRate = round2(verified.reduce((s, m) => s + m.surplusBase, 0) / verified.length);

  const actualByMonth = new Map(verified.map((m) => [m.month, m.surplusBase] as const));

  // Recurring benefit available in a given month: an accepted action contributes from
  // the month it was accepted onward, and only if it carries a quantified saving.
  const impactInMonth = (m: number): number => {
    let total = 0;
    for (const p of input.pendingImpacts) {
      if (p.impactMonthlyBase === null) continue;
      if (p.acceptedYear > year) continue;
      if (p.acceptedYear === year && p.acceptedMonth > m) continue;
      total += p.impactMonthlyBase;
    }
    return total;
  };

  const series: EoyMonthPoint[] = [];
  let current = 0;
  let optimised = 0;

  for (let m = 1; m <= 12; m += 1) {
    const actual = actualByMonth.get(m);
    const isActual = actual !== undefined;

    // An actual month is what happened — the optimised line cannot rewrite the past,
    // so both lines carry the same observed figure and only the FUTURE diverges.
    const currentMonthly = isActual ? actual : runRate;
    const optimisedMonthly = isActual ? actual : runRate + impactInMonth(m);

    current = round2(current + currentMonthly);
    optimised = round2(optimised + optimisedMonthly);
    series.push({
      key: keyOf(year, m),
      currentBase: current,
      optimisedBase: optimised,
      // A month that is neither closed nor in the future (the month in progress) is
      // still a forecast: it has not been closed, so its surplus is not yet a fact.
      isActual: isActual && m < thisMonth,
    });
  }

  return {
    ok: true,
    monthlyRunRateBase: runRate,
    monthsObserved: verified.length,
    monthsProvisionalExcluded: provisionalExcluded,
    currentEoyBase: current,
    optimisedEoyBase: optimised,
    deltaBase: round2(optimised - current),
    pendingCount: input.pendingImpacts.length,
    pendingWithoutImpact: input.pendingImpacts.filter((p) => p.impactMonthlyBase === null).length,
    series,
  };
}

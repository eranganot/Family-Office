import { describe, expect, it } from "vitest";
import {
  projectEndOfYear,
  type ClosedMonth,
  type EoyProjectionInput,
  type PendingImpact,
} from "../src/index";

/**
 * M41 — EOY projection.
 *
 * The load-bearing cases are the two ways this chart could lie: counting PROPOSED
 * items (promising money from decisions never made) and inventing a saving for an
 * action that deliberately carries none. Both would show up as a wider optimised gap,
 * which is exactly the direction a projection is tempting to be wrong in.
 */

const ASOF = new Date(Date.UTC(2026, 6, 29)); // 29 Jul 2026 — July is in progress

const closed = (month: number, surplusBase: number, isProvisional = false): ClosedMonth => ({
  year: 2026,
  month,
  surplusBase,
  isProvisional,
});

const pending = (impactMonthlyBase: number | null, acceptedMonth = 1): PendingImpact => ({
  recommendationId: `r${acceptedMonth}-${impactMonthlyBase ?? "null"}`,
  impactMonthlyBase,
  acceptedYear: 2026,
  acceptedMonth,
});

const input = (over: Partial<EoyProjectionInput>): EoyProjectionInput => ({
  asOf: ASOF,
  closedMonths: [closed(1, 1000), closed(2, 1000), closed(3, 1000)],
  pendingImpacts: [],
  minMonths: 3,
  ...over,
});

describe("EOY projection", () => {
  it("REFUSES to draw a trajectory through too few closed months", () => {
    // A line through one point is a straight line through an accident, and it would be
    // drawn with exactly the same confident styling as a real one.
    const r = projectEndOfYear(input({ closedMonths: [closed(1, 1000)] }));
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.reason).toBe("NOT_ENOUGH_CLOSED_MONTHS");
      expect(r.monthsObserved).toBe(1);
    }
  });

  /**
   * M41c's lesson, applied here after QA closed FIVE provisional months and still got
   * "0 of 3". Excluding provisional months excluded every month this household has.
   */
  it("INCLUDES provisional months in the run-rate, and reports how many", () => {
    const r = projectEndOfYear(
      input({
        closedMonths: [closed(1, 1000), closed(2, 1000), closed(3, 1000), closed(4, 1000, true)],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.monthlyRunRateBase).toBe(1000);
      expect(r.monthsObserved).toBe(4);
      expect(r.monthsProvisionalExcluded).toBe(1);
    }
  });

  it("projects when EVERY closed month is provisional — the owner's actual case", () => {
    const r = projectEndOfYear(
      input({
        closedMonths: [closed(1, 1000, true), closed(2, 1000, true), closed(3, 1000, true)],
      }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monthlyRunRateBase).toBe(1000);
  });

  it("projects the rest of the year at the observed run-rate", () => {
    const r = projectEndOfYear(input({}));
    expect(r.ok).toBe(true);
    if (r.ok) {
      // 3 actual months at 1,000 + 9 forecast months at the 1,000 run-rate.
      expect(r.currentEoyBase).toBe(12000);
      expect(r.series).toHaveLength(12);
    }
  });

  it("adds ONLY accepted work to the optimised line", () => {
    const r = projectEndOfYear(input({ pendingImpacts: [pending(500, 1)] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      // The past cannot be rewritten: Jan–Mar are closed, so the benefit applies to the
      // 9 remaining months only.
      expect(r.deltaBase).toBe(4500);
      expect(r.optimisedEoyBase).toBe(16500);
    }
  });

  /** An action that carries no saving must not acquire one here. */
  it("contributes NOTHING for an accepted action with a null impact", () => {
    // Renegotiation and cash-flow-timing cards leave impactMonthlyBase null by design.
    // Inventing a figure here would smuggle back the exact number those generators
    // refused to state.
    const r = projectEndOfYear(input({ pendingImpacts: [pending(null, 1), pending(null, 2)] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.deltaBase).toBe(0);
      expect(r.optimisedEoyBase).toBe(r.currentEoyBase);
      expect(r.pendingCount).toBe(2);
      expect(r.pendingWithoutImpact).toBe(2);
    }
  });

  it("counts an action only from the month it was accepted onward", () => {
    // Accepted in September: it cannot have been saving money since January.
    const r = projectEndOfYear(input({ pendingImpacts: [pending(500, 9)] }));
    expect(r.ok).toBe(true);
    // Sep, Oct, Nov, Dec = 4 months.
    if (r.ok) expect(r.deltaBase).toBe(2000);
  });

  it("never lets the optimised line rewrite a month that already closed", () => {
    const r = projectEndOfYear(input({ pendingImpacts: [pending(500, 1)] }));
    expect(r.ok).toBe(true);
    if (r.ok) {
      const march = r.series.find((p) => p.key === "2026-03")!;
      // March is closed; both lines must carry the same observed cumulative figure.
      expect(march.currentBase).toBe(march.optimisedBase);
      expect(march.isActual).toBe(true);
    }
  });

  it("treats the month in progress as forecast, not as fact", () => {
    // July is not closed yet, so its surplus is not observed even though it is not
    // in the future either.
    const r = projectEndOfYear(input({}));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.series.find((p) => p.key === "2026-07")!.isActual).toBe(false);
  });

  it("does not treat a month with no closed period as a zero-surplus month", () => {
    // Jan and Mar closed, Feb never closed. The run-rate is the mean of what was
    // OBSERVED; averaging a zero in for February would understate it.
    const r = projectEndOfYear(
      input({ closedMonths: [closed(1, 900), closed(3, 1100), closed(4, 1000)], minMonths: 3 }),
    );
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.monthlyRunRateBase).toBe(1000);
  });

  it("sums multiple accepted actions", () => {
    const r = projectEndOfYear(input({ pendingImpacts: [pending(300, 1), pending(200, 1)] }));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.deltaBase).toBe(4500);
  });
});

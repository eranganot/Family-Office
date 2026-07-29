import { describe, expect, it } from "vitest";
import {
  analyzeCashflowTiming,
  type OpportunityAssumptions,
  type OpportunityCalendarEvent,
  type OpportunityInput,
} from "../src/index";

/**
 * M40c — cash-flow timing.
 *
 * The load-bearing case here is "a spike made entirely of statutory dates earns no
 * card". A tax date cannot be moved, so a finding that reports one is telling the
 * owner his September is expensive while offering no action he is permitted to take.
 * That is how an inbox teaches someone to ignore it.
 */

const ASOF = new Date(Date.UTC(2026, 6, 29)); // 29 Jul 2026

const A: OpportunityAssumptions = {
  baselineMonths: 3,
  leakageFeeNoticeBase: 40,
  subscriptionDormantDays: 90,
  calendarWindowDays: 60,
  minMonthlyBase: 25,
  fxMarkupNoticePct: 1.5,
  minCoveragePct: 70,
  cashflowHorizonDays: 180,
  cashflowPeakNoticePct: 40,
};

let seq = 0;
const ev = (
  month: number,
  day: number,
  amountBase: number | null,
  statutory = false,
  titleEn = `event-${(seq += 1)}`,
): OpportunityCalendarEvent => ({
  id: `e${seq}`,
  kind: statutory ? "TAX_DEADLINE" : "INSURANCE_RENEWAL",
  titleEn,
  titleHe: `${titleEn}-he`,
  dueDate: new Date(Date.UTC(2026, month, day)),
  amountBase,
  isCashImpacting: true,
  sourceNote: statutory ? "STATUTORY" : "HOUSEHOLD",
});

const input = (over: Partial<OpportunityInput>): OpportunityInput => ({
  asOf: ASOF,
  baseCurrency: "ILS",
  assumptions: A,
  transactions: [],
  calendarEvents: [],
  fxRates: [],
  ...over,
});

/** Aug/Oct/Nov quiet at 1,000 each; September spikes to 5,000 (all movable). */
const SPIKE = [
  ev(7, 10, -1000),
  ev(8, 5, -3000, false, "annual-insurance"),
  ev(8, 12, -2000, false, "school-payment"),
  ev(9, 10, -1000),
  ev(10, 10, -1000),
];

describe("cash-flow timing analyzer", () => {
  it("flags a month whose committed outflows cluster above a typical month", () => {
    const f = analyzeCashflowTiming(input({ calendarEvents: SPIKE }));
    expect(f).toHaveLength(1);
    expect(f[0]?.code).toBe("OPERATIONAL_CASHFLOW_TIMING_SPIKE");
    expect(f[0]?.metrics["peakMonth"]).toBe("2026-09");
    expect(f[0]?.metrics["peakMonthBase"]).toBe(5000);
    expect(f[0]?.metrics["typicalMonthBase"]).toBe(1000);
    expect(f[0]?.metrics["excessBase"]).toBe(4000);
    expect(f[0]?.metrics["largestMovableEn"]).toBe("annual-insurance");
  });

  it("names the lightest month as somewhere to move the payment TO", () => {
    // A card that says "September is heavy" without saying where to put things is
    // an observation, not an action.
    const f = analyzeCashflowTiming(input({ calendarEvents: SPIKE }));
    expect(String(f[0]?.metrics["lightestMonth"])).toMatch(/^2026-(08|10|11)$/);
  });

  /** THE refusal this analyzer is built around. */
  it("emits NOTHING when the entire spike is statutory and cannot be moved", () => {
    const immovable = [
      ev(7, 10, -1000),
      ev(8, 5, -3000, true, "income-tax-instalment"),
      ev(8, 12, -2000, true, "bituach-leumi"),
      ev(9, 10, -1000),
      ev(10, 10, -1000),
    ];
    expect(analyzeCashflowTiming(input({ calendarEvents: immovable }))).toEqual([]);
  });

  it("still reports a mixed spike, and separates movable from statutory", () => {
    const mixed = [
      ev(7, 10, -1000),
      ev(8, 5, -3000, true, "income-tax-instalment"),
      ev(8, 12, -2000, false, "school-payment"),
      ev(9, 10, -1000),
      ev(10, 10, -1000),
    ];
    const f = analyzeCashflowTiming(input({ calendarEvents: mixed }));
    expect(f).toHaveLength(1);
    expect(f[0]?.metrics["movableBase"]).toBe(2000);
    expect(f[0]?.metrics["statutoryBase"]).toBe(3000);
    // Movable (2,000) does not by itself clear the 4,000 excess, so this is a NOTICE:
    // the owner can soften the month but cannot fix it.
    expect(f[0]?.severity).toBe("NOTICE");
  });

  it("raises severity when the movable part alone would clear the spike", () => {
    const f = analyzeCashflowTiming(input({ calendarEvents: SPIKE }));
    expect(f[0]?.severity).toBe("WARNING");
  });

  it("stays silent when the heaviest month is within the notice threshold", () => {
    const flat = [ev(7, 10, -1000), ev(8, 5, -1200), ev(9, 10, -1000), ev(10, 10, -1000)];
    expect(analyzeCashflowTiming(input({ calendarEvents: flat }))).toEqual([]);
  });

  it("refuses with fewer than three complete months — two months have no typical month", () => {
    const short = [ev(7, 10, -1000), ev(8, 5, -5000)];
    expect(analyzeCashflowTiming(input({ calendarEvents: short }))).toEqual([]);
  });

  it("counts an event with no amount as unpriced, never as zero", () => {
    // Counted as zero, this row would flatten the very peak the analyzer looks for.
    const withNull = [...SPIKE, ev(8, 20, null, false, "unpriced-renewal")];
    const f = analyzeCashflowTiming(input({ calendarEvents: withNull }));
    expect(f).toHaveLength(1);
    expect(f[0]?.metrics["unpricedEvents"]).toBe(1);
    expect(f[0]?.metrics["peakMonthBase"]).toBe(5000);
  });

  it("REFUSES entirely when too many scheduled items have no amount", () => {
    const mostlyNull = [
      ...SPIKE,
      ev(8, 20, null),
      ev(8, 21, null),
      ev(9, 20, null),
      ev(9, 21, null),
      ev(10, 20, null),
    ];
    expect(analyzeCashflowTiming(input({ calendarEvents: mostlyNull }))).toEqual([]);
  });

  it("ignores events that are not cash-impacting", () => {
    const withReview = [
      ...SPIKE,
      { ...ev(9, 15, -9999, false, "review-only"), isCashImpacting: false },
    ];
    const f = analyzeCashflowTiming(input({ calendarEvents: withReview }));
    expect(f[0]?.metrics["peakMonthBase"]).toBe(5000);
  });

  it("suppresses a spike smaller than the materiality floor", () => {
    const tiny = [ev(7, 10, -10), ev(8, 5, -30), ev(9, 10, -10), ev(10, 10, -10)];
    expect(analyzeCashflowTiming(input({ calendarEvents: tiny }))).toEqual([]);
  });

  it("stays silent on an empty calendar", () => {
    expect(analyzeCashflowTiming(input({ calendarEvents: [] }))).toEqual([]);
  });
});

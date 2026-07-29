import { describe, expect, it } from "vitest";
import {
  analyzeFxMarkup,
  priceFxRows,
  referenceRateOn,
  type OpportunityAssumptions,
  type OpportunityFxRate,
  type OpportunityInput,
  type OpportunityTxn,
} from "../src/index";

/**
 * M40c — FX conversion spread.
 *
 * The load-bearing test in this file is "reads an instalment plan as a conversion".
 * `originalAmount` carries the סכום עסקה for BOTH a foreign purchase and an Israeli
 * instalment plan, so without `originalCurrency` a ₪1,200-over-12 purchase divides out
 * to a ~92% markup. That is the same shape of defect as M40a's mortgage-cancellation
 * card: correct arithmetic over the wrong input set.
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

function txn(p: Partial<OpportunityTxn> & { bookedAt: Date }): OpportunityTxn {
  return {
    id: Math.random().toString(36).slice(2),
    status: "BOOKED",
    amountBase: null,
    originalAmount: null,
    originalCurrency: null,
    categoryKey: "discretionary.travel",
    behavioral: "VARIABLE_DISCRETIONARY",
    merchantKey: "merchant",
    isRecurringCandidate: false,
    ledgerItemId: null,
    ...p,
  };
}

/** A foreign card purchase: `chargedIls` hit the account, `foreign` was transacted. */
const fx = (
  day: number,
  foreign: number,
  chargedIls: number,
  currency = "USD",
  over: Partial<OpportunityTxn> = {},
): OpportunityTxn =>
  txn({
    bookedAt: new Date(Date.UTC(2026, 6, day)),
    amountBase: -chargedIls,
    originalAmount: foreign,
    originalCurrency: currency,
    ...over,
  });

const rate = (day: number, r: number, from = "USD", source = "BOI"): OpportunityFxRate => ({
  from,
  to: "ILS",
  rate: r,
  asOf: new Date(Date.UTC(2026, 6, day)),
  source,
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

// A spread big enough to clear both the percentage threshold and the materiality
// floor: 1,000 USD a day for three days, each converted ~4% above the reference.
const SPREAD_ROWS = [fx(1, 1000, 3848), fx(2, 1000, 3848), fx(3, 1000, 3848)];
const SPREAD_RATES = [rate(1, 3.7), rate(2, 3.7), rate(3, 3.7)];

describe("reference rate lookup", () => {
  it("uses the most recent rate published on or before the booking date", () => {
    const r = referenceRateOn([rate(1, 3.6), rate(5, 3.7)], "USD", "ILS", new Date(Date.UTC(2026, 6, 6)));
    expect(r?.rate).toBe(3.7);
  });

  it("REFUSES a rate published after the booking date", () => {
    // Benchmarking against tomorrow's rate manufactures a markup out of ordinary drift.
    const r = referenceRateOn([rate(10, 3.9)], "USD", "ILS", new Date(Date.UTC(2026, 6, 6)));
    expect(r).toBeNull();
  });

  it("carries the last published rate forward within the staleness window", () => {
    // BOI does not publish on weekends or holidays, so a Friday rate is the rate in
    // force on the Saturday. Without this a normal weekend purchase would be unpriceable
    // and would drag coverage below the floor for no good reason.
    const r = referenceRateOn([rate(1, 3.7)], "USD", "ILS", new Date(Date.UTC(2026, 6, 6)));
    expect(r?.rate).toBe(3.7);
  });

  it("refuses a rate staler than a week rather than reaching further back", () => {
    const r = referenceRateOn([rate(1, 3.7)], "USD", "ILS", new Date(Date.UTC(2026, 6, 20)));
    expect(r).toBeNull();
  });

  it("prefers BOI over another source for the same day, deterministically", () => {
    const r = referenceRateOn(
      [rate(3, 3.9, "USD", "MANUAL"), rate(3, 3.7, "USD", "BOI")],
      "USD",
      "ILS",
      new Date(Date.UTC(2026, 6, 3)),
    );
    expect(r?.source).toBe("BOI");
    expect(r?.rate).toBe(3.7);
  });
});

describe("fx markup analyzer", () => {
  it("flags a conversion spread above the registry threshold", () => {
    const f = analyzeFxMarkup(input({ transactions: SPREAD_ROWS, fxRates: SPREAD_RATES }));
    expect(f).toHaveLength(1);
    expect(f[0]?.code).toBe("OPERATIONAL_FX_MARKUP_ABOVE_NOTICE");
    // 3848 paid vs 3700 reference = exactly 4%.
    expect(f[0]?.metrics["markupPct"]).toBe(4);
    expect(f[0]?.metrics["coveragePct"]).toBe(100);
    expect(f[0]?.metrics["worstCurrency"]).toBe("USD");
  });

  it("stays silent when the rate received matches the reference", () => {
    const clean = [fx(1, 1000, 3700), fx(2, 1000, 3700), fx(3, 1000, 3700)];
    expect(analyzeFxMarkup(input({ transactions: clean, fxRates: SPREAD_RATES }))).toEqual([]);
  });

  it("stays silent when the spread is under the threshold", () => {
    // 1% — real, but below the 1.5% notice threshold.
    const thin = [fx(1, 1000, 3737), fx(2, 1000, 3737), fx(3, 1000, 3737)];
    expect(analyzeFxMarkup(input({ transactions: thin, fxRates: SPREAD_RATES }))).toEqual([]);
  });

  /**
   * THE defect this milestone's migration exists to prevent.
   *
   * A ₪1,200 purchase split into 12 monthly instalments books originalAmount=1200
   * (ILS) against a ₪100 charge. Divide without checking the currency and the implied
   * "rate" is 0.083 against a reference of 1.0 — a 92% markup on an entirely ordinary
   * Israeli instalment plan.
   */
  it("does NOT read an Israeli instalment plan as a currency conversion", () => {
    // originalCurrency === base is the whole defence. Nothing about the amounts
    // distinguishes this from a foreign purchase.
    const instalments = [1, 2, 3].map((d) => fx(d, 1200, 100, "ILS"));
    expect(analyzeFxMarkup(input({ transactions: instalments, fxRates: SPREAD_RATES }))).toEqual([]);
    expect(priceFxRows(input({ transactions: instalments })).candidates).toBe(0);
  });

  it("REFUSES to emit a figure when coverage falls below the floor", () => {
    // Four conversions, only one with a usable reference rate = 25% coverage.
    //
    // The rows are spaced more than RATE_STALENESS_DAYS apart on purpose. A single
    // published rate stays valid for a week — BOI does not publish on weekends or
    // holidays, so carrying the last rate forward is correct, not a leak. Rows one day
    // apart would ALL price off the day-1 rate and coverage would be 100%.
    const rows = [fx(1, 1000, 3848), fx(10, 1000, 3848), fx(17, 1000, 3848), fx(24, 1000, 3848)];
    const only = [rate(1, 3.7)];
    const res = priceFxRows(input({ transactions: rows, fxRates: only }));
    expect(res.candidates).toBe(4);
    expect(res.priced).toHaveLength(1);
    expect(res.unpricedNoRate).toBe(3);
    // A real markup exists on the row it could price. It is still withheld.
    expect(analyzeFxMarkup(input({ transactions: rows, fxRates: only }))).toEqual([]);
  });

  it("counts a row with no reference rate as unpriced, never as zero markup", () => {
    // If the unpriced row were folded in at zero it would halve the average to 2%.
    const rows = [...SPREAD_ROWS, fx(20, 1000, 3848)];
    const f = analyzeFxMarkup(input({ transactions: rows, fxRates: SPREAD_RATES }));
    expect(f).toHaveLength(1);
    expect(f[0]?.metrics["markupPct"]).toBe(4);
    expect(f[0]?.metrics["unpricedNoRate"]).toBe(1);
  });

  it("ignores rows imported before originalCurrency was recorded", () => {
    // Unknown, not assumed domestic and not assumed foreign: they are not candidates,
    // so they neither inflate nor deflate coverage.
    const legacy = [fx(1, 1000, 3848), fx(2, 1000, 3848), fx(3, 1000, 3848)].map((t) => ({
      ...t,
      originalCurrency: null,
    }));
    expect(priceFxRows(input({ transactions: legacy, fxRates: SPREAD_RATES })).candidates).toBe(0);
    expect(analyzeFxMarkup(input({ transactions: legacy, fxRates: SPREAD_RATES }))).toEqual([]);
  });

  it("excludes an inbound conversion so it cannot cancel out real card spread", () => {
    const inbound = fx(2, 1000, 3848);
    inbound.amountBase = 3560; // positive = money coming in
    const res = priceFxRows(input({ transactions: [...SPREAD_ROWS, inbound], fxRates: SPREAD_RATES }));
    expect(res.candidates).toBe(3);
  });

  it("excludes FINANCIAL_DRAG rows, which the leakage card already counts", () => {
    const feeRow = fx(2, 100, 384, "USD", { behavioral: "FINANCIAL_DRAG" });
    const res = priceFxRows(input({ transactions: [...SPREAD_ROWS, feeRow], fxRates: SPREAD_RATES }));
    expect(res.candidates).toBe(3);
  });

  it("counts an UNCLASSIFIED foreign purchase — the suspense default must not exclude it", () => {
    // `other.unclassified` defaults to VARIABLE_DISCRETIONARY, so an unclassified row is
    // indistinguishable from a discretionary one by `behavioral` alone. This analyzer
    // never gates on classification, so the spread is still measured.
    const rows = SPREAD_ROWS.map((t) => ({ ...t, categoryKey: "other.unclassified" }));
    const f = analyzeFxMarkup(input({ transactions: rows, fxRates: SPREAD_RATES }));
    expect(f).toHaveLength(1);
    expect(f[0]?.metrics["markupPct"]).toBe(4);
  });

  it("weights the markup by value, so one large bad conversion is not diluted", () => {
    // A large 4% conversion plus a tiny 0% one. A per-row mean would report 2%.
    const rows = [fx(1, 10000, 38480), fx(2, 10, 37)];
    const f = analyzeFxMarkup(input({ transactions: rows, fxRates: [rate(1, 3.7), rate(2, 3.7)] }));
    expect(f).toHaveLength(1);
    expect(Number(f[0]?.metrics["markupPct"])).toBeGreaterThan(3.9);
  });

  it("suppresses a spread below the materiality floor", () => {
    // A genuine 4% markup, but on 15 USD of spend: ₪22/month, under the ₪25 floor.
    // The percentage clears its threshold and the card is still withheld — the floor
    // is applied to the money, not to the ratio.
    const tiny = [fx(1, 5, 19.24), fx(2, 5, 19.24), fx(3, 5, 19.24)];
    expect(analyzeFxMarkup(input({ transactions: tiny, fxRates: SPREAD_RATES }))).toEqual([]);
  });

  it("stays silent on a household with no foreign spending at all", () => {
    expect(analyzeFxMarkup(input({ transactions: [], fxRates: SPREAD_RATES }))).toEqual([]);
  });
});

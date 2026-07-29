import { describe, expect, it } from "vitest";
import {
  analyzeDeadlines,
  analyzeLeakage,
  analyzeSubscriptions,
  clusterSubscriptions,
  runOpportunityAnalyzers,
  type OpportunityAssumptions,
  type OpportunityCalendarEvent,
  type OpportunityInput,
  type OpportunityTxn,
} from "../src/index";

const ASOF = new Date(Date.UTC(2026, 6, 29)); // 29 Jul 2026

const A: OpportunityAssumptions = {
  baselineMonths: 3,
  leakageFeeNoticeBase: 40,
  subscriptionDormantDays: 90,
  calendarWindowDays: 60,
};

function txn(p: Partial<OpportunityTxn> & { bookedAt: Date; amountBase: number | null }): OpportunityTxn {
  return {
    id: Math.random().toString(36).slice(2),
    status: "BOOKED",
    categoryKey: null,
    behavioral: "VARIABLE_DISCRETIONARY",
    merchantKey: null,
    isRecurringCandidate: false,
    ledgerItemId: null,
    ...p,
  };
}

const input = (over: Partial<OpportunityInput>): OpportunityInput => ({
  asOf: ASOF,
  assumptions: A,
  transactions: [],
  calendarEvents: [],
  ...over,
});

const drag = (y: number, m: number, d: number, amt: number, merchant = "bank_fee"): OpportunityTxn =>
  txn({
    bookedAt: new Date(Date.UTC(y, m - 1, d)),
    amountBase: -amt,
    behavioral: "FINANCIAL_DRAG",
    merchantKey: merchant,
  });

describe("leakage analyzer", () => {
  it("stays silent below the registry notice threshold", () => {
    const f = analyzeLeakage(
      input({ transactions: [drag(2026, 5, 3, 10), drag(2026, 6, 3, 12), drag(2026, 7, 3, 11)] }),
    );
    expect(f).toEqual([]);
  });

  it("flags drag above the threshold and reports the top sources", () => {
    const f = analyzeLeakage(
      input({
        transactions: [
          drag(2026, 5, 3, 60, "bank_amlot"),
          drag(2026, 6, 3, 60, "bank_amlot"),
          drag(2026, 7, 3, 60, "bank_amlot"),
          drag(2026, 7, 9, 20, "fx_markup"),
        ],
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("OPERATIONAL_LEAKAGE_ABOVE_NOTICE");
    expect(Number(f[0]!.metrics["monthlyLeakageBase"])).toBeCloseTo(66.67, 1);
    expect(String(f[0]!.metrics["topSources"])).toContain("bank_amlot");
  });

  it("escalates to WARNING only when the latest month is above the earlier ones", () => {
    const flat = analyzeLeakage(
      input({ transactions: [drag(2026, 5, 3, 100), drag(2026, 6, 3, 100), drag(2026, 7, 3, 100)] }),
    );
    expect(flat[0]!.severity).toBe("NOTICE");
    const rising = analyzeLeakage(
      input({ transactions: [drag(2026, 5, 3, 60), drag(2026, 6, 3, 60), drag(2026, 7, 3, 200)] }),
    );
    expect(rising[0]!.severity).toBe("WARNING");
  });

  it("EXCLUDES a month with an unconvertible row rather than counting it as zero", () => {
    // The July row has no base amount. Counting it as 0 would report a FALLING trend
    // on a month we simply could not measure — worse than reporting nothing.
    const f = analyzeLeakage(
      input({
        transactions: [
          drag(2026, 5, 3, 100),
          drag(2026, 6, 3, 100),
          drag(2026, 7, 3, 100),
          txn({ bookedAt: new Date(Date.UTC(2026, 6, 15)), amountBase: null, behavioral: "FINANCIAL_DRAG" }),
        ],
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.metrics["latestMonth"]).toBe("2026-06");
    expect(Number(f[0]!.metrics["monthsObserved"])).toBe(2);
  });

  it("ignores PENDING rows — an unsettled charge has not cost anything yet", () => {
    const pending = { ...drag(2026, 7, 3, 500), status: "PENDING" as const };
    const f = analyzeLeakage(input({ transactions: [drag(2026, 5, 3, 10), drag(2026, 6, 3, 10), pending] }));
    expect(f).toEqual([]);
  });
});

describe("subscription analyzer", () => {
  const monthly = (merchant: string, amt: number, months: number, endY = 2026, endM = 7): OpportunityTxn[] =>
    Array.from({ length: months }, (_, i) =>
      txn({
        bookedAt: new Date(Date.UTC(endY, endM - 1 - (months - 1 - i), 12)),
        amountBase: -amt,
        merchantKey: merchant,
      }),
    );

  it("clusters a steady monthly charge", () => {
    const clusters = clusterSubscriptions(monthly("streaming", 45, 6), ASOF);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.monthlyBase).toBe(45);
    expect(clusters[0]!.charges).toBe(6);
  });

  it("does NOT cluster a varying amount — that is usage-based, not a subscription", () => {
    const rows = monthly("grocery", 100, 6).map((t, i) => ({ ...t, amountBase: -(100 + i * 40) }));
    expect(clusterSubscriptions(rows, ASOF)).toEqual([]);
  });

  it("needs at least three charges", () => {
    expect(clusterSubscriptions(monthly("gym", 200, 2), ASOF)).toEqual([]);
  });

  it("flags only clusters that have been running past the dormancy horizon", () => {
    const young = analyzeSubscriptions(input({ transactions: monthly("newthing", 50, 3) })); // ~60 days
    expect(young).toEqual([]);
    const old = analyzeSubscriptions(input({ transactions: monthly("oldthing", 50, 6) })); // ~150 days
    expect(old).toHaveLength(1);
    expect(old[0]!.metrics["largestMerchant"]).toBe("oldthing");
  });

  it("does NOT flag a subscription that already stopped charging", () => {
    // Ended in Feb; cancelling it now would save nothing.
    const stale = analyzeSubscriptions(input({ transactions: monthly("cancelled", 50, 6, 2026, 2) }));
    expect(stale).toEqual([]);
  });

  it("excludes transfers and savings flows", () => {
    const rows = monthly("pension", 1000, 6).map((t) => ({ ...t, behavioral: "SAVINGS_FLOW" as const }));
    expect(analyzeSubscriptions(input({ transactions: rows }))).toEqual([]);
  });

  // ------------------------------------------------------------------
  // REGRESSION — the M40a defect the owner caught in QA on 2026-07-29.
  // The shipped card said: "start with פועלים_משכנתא at ₪15,072/month — the biggest
  // decision here" and "cancel directly with the provider". It was telling him to
  // cancel his mortgage, and 90% of a ₪16,794/month headline was that one row.
  // ------------------------------------------------------------------
  it("NEVER offers a mortgage as a cancellable subscription", () => {
    const mortgage = monthly("פועלים_משכנתא", 15071.52, 6).map((t) => ({
      ...t,
      behavioral: "FIXED_CONTRACTUAL" as const,
    }));
    expect(clusterSubscriptions(mortgage, ASOF)).toEqual([]);
    expect(analyzeSubscriptions(input({ transactions: mortgage }))).toEqual([]);
  });

  it("NEVER offers an insurance premium as a cancellable subscription", () => {
    const life = monthly("מגדל_מבטחים_חיים", 510.23, 6).map((t) => ({
      ...t,
      behavioral: "FIXED_CONTRACTUAL" as const,
    }));
    const dental = monthly("הראל_ביטוח_שיניים", 303.82, 6).map((t) => ({
      ...t,
      behavioral: "FIXED_CONTRACTUAL" as const,
    }));
    expect(analyzeSubscriptions(input({ transactions: [...life, ...dental] }))).toEqual([]);
  });

  it("excludes any charge that is evidence for a mapped ledger stream", () => {
    // Even if the behavioural class is wrong or missing, a payment linked to a ledger
    // item is a known obligation. Belt and braces, because the classification is the
    // thing most likely to be wrong on a fresh import.
    const linked = monthly("some_loan", 2000, 6).map((t) => ({
      ...t,
      behavioral: "VARIABLE_DISCRETIONARY" as const,
      ledgerItemId: "ledger-item-1",
    }));
    expect(analyzeSubscriptions(input({ transactions: linked }))).toEqual([]);
  });

  it("refuses to judge an UNCLASSIFIED recurring charge", () => {
    // Silence beats a confident wrong instruction: we cannot tell a streaming service
    // from a tuition payment before it is classified.
    const unknown = monthly("unknown_merchant", 400, 6).map((t) => ({
      ...t,
      behavioral: null,
    }));
    expect(analyzeSubscriptions(input({ transactions: unknown }))).toEqual([]);
  });

  it("still finds the real subscriptions mixed in beside the obligations", () => {
    // The owner's actual July data: a mortgage and two insurance policies that must be
    // excluded, plus two genuinely reviewable recurring services that must survive.
    const mortgage = monthly("פועלים_משכנתא", 15071.52, 6).map((t) => ({
      ...t,
      behavioral: "FIXED_CONTRACTUAL" as const,
    }));
    const dental = monthly("הראל_ביטוח_שיניים", 303.82, 6).map((t) => ({
      ...t,
      behavioral: "FIXED_CONTRACTUAL" as const,
    }));
    const bezeq = monthly("בזק_הוראת_קבע", 198, 6);
    const service = monthly("ht_waerermore", 380, 6);

    const f = analyzeSubscriptions(
      input({ transactions: [...mortgage, ...dental, ...bezeq, ...service] }),
    );
    expect(f).toHaveLength(1);
    expect(Number(f[0]!.metrics["subscriptionCount"])).toBe(2);
    // 578, not 16,794.
    expect(Number(f[0]!.metrics["monthlyTotalBase"])).toBeCloseTo(578, 2);
    expect(String(f[0]!.metrics["merchants"])).not.toContain("משכנתא");
    // The exclusion is reported, not silent.
    expect(Number(f[0]!.metrics["excludedContractual"])).toBeGreaterThan(0);
  });
});

describe("deadline analyzer", () => {
  const ev = (over: Partial<OpportunityCalendarEvent> & { dueDate: Date }): OpportunityCalendarEvent => ({
    id: Math.random().toString(36).slice(2),
    kind: "REVIEW",
    titleEn: "Something",
    titleHe: "משהו",
    amountBase: null,
    isCashImpacting: false,
    sourceNote: "HOUSEHOLD",
    ...over,
  });

  it("splits statutory dates from household reviews", () => {
    const f = analyzeDeadlines(
      input({
        calendarEvents: [
          ev({ dueDate: new Date(Date.UTC(2026, 7, 15)), sourceNote: "STATUTORY", titleEn: "BL payment" }),
          ev({ dueDate: new Date(Date.UTC(2026, 7, 20)), sourceNote: "HOUSEHOLD", titleEn: "Insurance review" }),
        ],
      }),
    );
    expect(f.map((x) => x.code).sort()).toEqual([
      "OPERATIONAL_HOUSEHOLD_REVIEW_DUE",
      "OPERATIONAL_STATUTORY_DEADLINE_NEAR",
    ]);
  });

  it("ignores events beyond the registry window and in the past", () => {
    const f = analyzeDeadlines(
      input({
        calendarEvents: [
          ev({ dueDate: new Date(Date.UTC(2026, 11, 31)) }), // 155 days away
          ev({ dueDate: new Date(Date.UTC(2026, 5, 1)) }), // past
        ],
      }),
    );
    expect(f).toEqual([]);
  });

  it("raises WARNING only for a statutory date inside 14 days", () => {
    const near = analyzeDeadlines(
      input({ calendarEvents: [ev({ dueDate: new Date(Date.UTC(2026, 7, 5)), sourceNote: "STATUTORY" })] }),
    );
    expect(near[0]!.severity).toBe("WARNING");
    const far = analyzeDeadlines(
      input({ calendarEvents: [ev({ dueDate: new Date(Date.UTC(2026, 8, 5)), sourceNote: "STATUTORY" })] }),
    );
    expect(far[0]!.severity).toBe("NOTICE");
  });

  it("carries the nearest due date forward as the expiry", () => {
    const f = analyzeDeadlines(
      input({
        calendarEvents: [
          ev({ dueDate: new Date(Date.UTC(2026, 7, 20)), sourceNote: "STATUTORY" }),
          ev({ dueDate: new Date(Date.UTC(2026, 7, 3)), sourceNote: "STATUTORY" }),
        ],
      }),
    );
    expect(f[0]!.metrics["expiresAtISO"]).toBe("2026-08-03");
    expect(f[0]!.metrics["nearestDaysAway"]).toBe(5);
  });

  it("sums cash impact only for cash-impacting events", () => {
    const f = analyzeDeadlines(
      input({
        calendarEvents: [
          ev({ dueDate: new Date(Date.UTC(2026, 7, 10)), amountBase: -5000, isCashImpacting: true }),
          ev({ dueDate: new Date(Date.UTC(2026, 7, 11)), amountBase: -9999, isCashImpacting: false }),
        ],
      }),
    );
    expect(f[0]!.metrics["cashImpactBase"]).toBe(5000);
  });
});

describe("analyzer suite", () => {
  it("is deterministic and emits nothing on an empty household", () => {
    expect(runOpportunityAnalyzers(input({}))).toEqual([]);
  });

  it("produces a stable ordering across runs", () => {
    const i = input({
      transactions: [drag(2026, 5, 3, 100), drag(2026, 6, 3, 100), drag(2026, 7, 3, 100)],
      calendarEvents: [
        {
          id: "e1",
          kind: "REVIEW",
          titleEn: "x",
          titleHe: "x",
          dueDate: new Date(Date.UTC(2026, 7, 5)),
          amountBase: null,
          isCashImpacting: false,
          sourceNote: "STATUTORY",
        },
      ],
    });
    expect(runOpportunityAnalyzers(i).map((f) => f.code)).toEqual(
      runOpportunityAnalyzers(i).map((f) => f.code),
    );
  });
});

import { describe, expect, it } from "vitest";
import {
  analyzeDeadlines,
  analyzeLeakage,
  analyzeRenegotiation,
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
  minMonthlyBase: 25,
  fxMarkupNoticePct: 1.5,
  minCoveragePct: 70,
  cashflowHorizonDays: 180,
  cashflowPeakNoticePct: 40,
};

function txn(p: Partial<OpportunityTxn> & { bookedAt: Date; amountBase: number | null }): OpportunityTxn {
  return {
    id: Math.random().toString(36).slice(2),
    status: "BOOKED",
    // A benign, genuinely-subscribable default. It must NOT be null or the suspense
    // bucket: both are now refused outright, which is the point of the second fix.
    categoryKey: "utilities.subscriptions",
    behavioral: "VARIABLE_DISCRETIONARY",
    merchantKey: null,
    isRecurringCandidate: false,
    ledgerItemId: null,
    // Domestic by default: no foreign original means the FX analyzer never treats a
    // fixture written for another analyzer as a conversion candidate.
    originalAmount: null,
    originalCurrency: null,
    ...p,
  };
}

const input = (over: Partial<OpportunityInput>): OpportunityInput => ({
  asOf: ASOF,
  baseCurrency: "ILS",
  assumptions: A,
  transactions: [],
  calendarEvents: [],
  fxRates: [],
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

  it("excludes transfers and savings flows structurally, whatever the category says", () => {
    // Not a policy question: a movement between the household's own accounts, or a pension
    // contribution, is not an expense at all (D7). It can be neither cancelled nor repriced.
    // The category is deliberately a cancellable one here, to prove behaviour still wins.
    for (const behavioral of ["SAVINGS_FLOW", "TRANSFER"] as const) {
      const rows = monthly("pension", 1000, 6).map((t) => ({
        ...t,
        behavioral,
        categoryKey: "utilities.subscriptions",
      }));
      expect(analyzeSubscriptions(input({ transactions: rows }))).toEqual([]);
      expect(analyzeRenegotiation(input({ transactions: rows }))).toEqual([]);
    }
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
      categoryKey: "housing.mortgage",
    }));
    expect(analyzeSubscriptions(input({ transactions: mortgage }))).toEqual([]);
  });

  it("NEVER offers an insurance premium as a cancellable subscription", () => {
    const life = monthly("מגדל_מבטחים_חיים", 510.23, 6).map((t) => ({
      ...t,
      behavioral: "FIXED_CONTRACTUAL" as const,
      categoryKey: "insurance.life",
    }));
    const dental = monthly("הראל_ביטוח_שיניים", 303.82, 6).map((t) => ({
      ...t,
      behavioral: "FIXED_CONTRACTUAL" as const,
      categoryKey: "insurance.health",
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

  it("refuses to judge a charge with NO category at all", () => {
    // Silence beats a confident wrong instruction: we cannot tell a streaming service
    // from a tuition payment before it is classified.
    const unknown = monthly("unknown_merchant", 400, 6).map((t) => ({
      ...t,
      behavioral: null,
      categoryKey: null,
    }));
    expect(analyzeSubscriptions(input({ transactions: unknown }))).toEqual([]);
    expect(analyzeRenegotiation(input({ transactions: unknown }))).toEqual([]);
  });

  // ------------------------------------------------------------------
  // REGRESSION 2 — the defect that SURVIVED the first fix (re-QA 2026-07-29).
  // `other.unclassified` carries defaultBehavioralClass VARIABLE_DISCRETIONARY, so an
  // unclassified row is NOT null by the time the analyzer sees it — it is "discretionary".
  // The behavioural allowlist alone therefore let מגדל_מבטחים_חיים (life insurance, no
  // matching merchant rule) through, and step 2 told the owner to start with it.
  // ------------------------------------------------------------------
  it("refuses a suspense-bucket row even though it arrives as VARIABLE_DISCRETIONARY", () => {
    const suspense = monthly("מגדל_מבטחים_חיים", 510.23, 6).map((t) => ({
      ...t,
      behavioral: "VARIABLE_DISCRETIONARY" as const, // what the fallback category gives it
      categoryKey: "other.unclassified",
    }));
    expect(analyzeSubscriptions(input({ transactions: suspense }))).toEqual([]);
  });

  it("NEVER offers an insurance-category charge, whatever its behavioural class says", () => {
    // engine-strategy's insurance analyzer checks for coverage GAPS. Operations proposing
    // cancellation would put two engines in contradiction about the same contract — and
    // cancelling life cover is frequently irreversible.
    for (const key of [
      "insurance.life",
      "insurance.health",
      "insurance.disability",
      "insurance.long_term_care",
      "housing.home_insurance",
      "transport.vehicle_insurance",
    ]) {
      const rows = monthly("some_insurer", 510, 6).map((t) => ({
        ...t,
        behavioral: "VARIABLE_DISCRETIONARY" as const, // deliberately the permissive class
        categoryKey: key,
      }));
      expect(analyzeSubscriptions(input({ transactions: rows }))).toEqual([]);
    }
  });

  it("NEVER offers debt service, tax or savings as a subscription", () => {
    for (const key of ["debt.loan_repayment", "taxes.bituach_leumi", "savings.pension", "housing.mortgage"]) {
      const rows = monthly("whatever", 900, 6).map((t) => ({
        ...t,
        behavioral: "VARIABLE_DISCRETIONARY" as const,
        categoryKey: key,
      }));
      expect(analyzeSubscriptions(input({ transactions: rows }))).toEqual([]);
    }
  });

  it("still finds a genuine classified subscription beside all of those", () => {
    const insurance = monthly("מגדל_מבטחים_חיים", 510.23, 6).map((t) => ({
      ...t,
      behavioral: "VARIABLE_DISCRETIONARY" as const,
      categoryKey: "other.unclassified",
    }));
    const streaming = monthly("streaming_svc", 55, 6).map((t) => ({
      ...t,
      categoryKey: "utilities.subscriptions",
    }));
    const f = analyzeSubscriptions(input({ transactions: [...insurance, ...streaming] }));
    expect(f).toHaveLength(1);
    expect(Number(f[0]!.metrics["subscriptionCount"])).toBe(1);
    expect(Number(f[0]!.metrics["monthlyTotalBase"])).toBeCloseTo(55, 2);
    expect(String(f[0]!.metrics["merchants"])).not.toContain("מבטחים");
    expect(Number(f[0]!.metrics["excludedUnclassified"])).toBeGreaterThan(0);
  });

  it("still finds the real subscriptions mixed in beside the obligations", () => {
    // The owner's actual July data. Mortgage and insurance must be excluded; Bezeq is
    // repriceable-not-cancellable so it belongs to the renegotiation analyzer, not here;
    // only the genuine digital subscription survives.
    const mortgage = monthly("פועלים_משכנתא", 15071.52, 6).map((t) => ({
      ...t,
      behavioral: "FIXED_CONTRACTUAL" as const,
      categoryKey: "housing.mortgage",
    }));
    const dental = monthly("הראל_ביטוח_שיניים", 303.82, 6).map((t) => ({
      ...t,
      behavioral: "FIXED_CONTRACTUAL" as const,
      categoryKey: "insurance.health",
    }));
    const bezeq = monthly("בזק_הוראת_קבע", 198, 6).map((t) => ({
      ...t,
      categoryKey: "housing.internet_tv",
    }));
    const service = monthly("ht_waerermore", 380, 6).map((t) => ({
      ...t,
      categoryKey: "utilities.cloud_software",
    }));

    const f = analyzeSubscriptions(
      input({ transactions: [...mortgage, ...dental, ...bezeq, ...service] }),
    );
    expect(f).toHaveLength(1);
    expect(Number(f[0]!.metrics["subscriptionCount"])).toBe(1);
    // 380, not 16,794.
    expect(Number(f[0]!.metrics["monthlyTotalBase"])).toBeCloseTo(380, 2);
    expect(String(f[0]!.metrics["merchants"])).not.toContain("משכנתא");
    // The exclusion is reported, not silent.
    expect(Number(f[0]!.metrics["excludedContractual"])).toBeGreaterThan(0);
  });

  it("suppresses a card below the registry materiality floor", () => {
    // M40a shipped a full bilingual card with three action steps for a ₪6/month parking
    // charge. The reading cost exceeded the saving.
    const parking = monthly("חניון_גבעתיים", 6, 6);
    expect(analyzeSubscriptions(input({ transactions: parking }))).toEqual([]);
    // ...but several small charges that ADD UP still earn one.
    const many = [
      ...monthly("svc_a", 10, 6),
      ...monthly("svc_b", 10, 6),
      ...monthly("svc_c", 10, 6),
    ];
    expect(analyzeSubscriptions(input({ transactions: many }))).toHaveLength(1);
  });
});

describe("renegotiation analyzer", () => {
  const monthly = (merchant: string, amt: number, months: number, categoryKey: string): OpportunityTxn[] =>
    Array.from({ length: months }, (_, i) =>
      txn({
        bookedAt: new Date(Date.UTC(2026, 7 - 1 - (months - 1 - i), 12)),
        amountBase: -amt,
        merchantKey: merchant,
        categoryKey,
      }),
    );

  it("picks up the repriceable commitments the subscription analyzer must not touch", () => {
    const f = analyzeRenegotiation(
      input({
        transactions: [
          ...monthly("מגדל_מבטחים_חיים", 510.23, 6, "insurance.life"),
          ...monthly("בזק_הוראת_קבע", 198, 6, "housing.internet_tv"),
        ],
      }),
    );
    expect(f).toHaveLength(1);
    expect(f[0]!.code).toBe("OPERATIONAL_RENEGOTIABLE_COMMITMENTS");
    expect(Number(f[0]!.metrics["commitmentCount"])).toBe(2);
    expect(Number(f[0]!.metrics["monthlyTotalBase"])).toBeCloseTo(708.23, 2);
    expect(String(f[0]!.metrics["groups"])).toContain("INSURANCE");
    expect(String(f[0]!.metrics["groups"])).toContain("TELECOM");
  });

  it("NEVER includes a mortgage, tax or unclassified row", () => {
    const f = analyzeRenegotiation(
      input({
        transactions: [
          ...monthly("פועלים_משכנתא", 15071.52, 6, "housing.mortgage"),
          ...monthly("mas", 900, 6, "taxes.bituach_leumi"),
          ...monthly("unknown", 700, 6, "other.unclassified"),
        ],
      }),
    );
    expect(f).toEqual([]);
  });

  it("respects the materiality floor", () => {
    expect(analyzeRenegotiation(input({ transactions: monthly("tiny", 5, 6, "utilities.mobile") }))).toEqual([]);
  });

  it("does not share the subscription analyzer's eligibility filter", () => {
    // The M40b bug this catches: analyzeRenegotiation called clusterSubscriptions, which
    // re-applies `cancellable` — the exact complement of `renegotiable` — so it could
    // never return anything. cancellable and renegotiable sets must stay disjoint here.
    const insuranceOnly = monthly("מגדל_מבטחים_חיים", 510.23, 6, "insurance.life");
    expect(analyzeSubscriptions(input({ transactions: insuranceOnly }))).toEqual([]);
    expect(analyzeRenegotiation(input({ transactions: insuranceOnly }))).toHaveLength(1);

    // ...and the two cards are DISJOINT: a cancellable item belongs to subscriptions only,
    // so the same merchant never appears twice and cannot be actioned twice.
    const streamingOnly = monthly("streaming", 55, 6, "utilities.subscriptions");
    expect(analyzeSubscriptions(input({ transactions: streamingOnly }))).toHaveLength(1);
    expect(analyzeRenegotiation(input({ transactions: streamingOnly }))).toEqual([]);
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

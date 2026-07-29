import { describe, expect, it } from "vitest";
import type { Finding } from "../src/findings";
import {
  generateOperationalRecommendations,
  operationalActionItemsFor,
  prerequisiteTypesFor,
  NEVER_BLOCKED_TYPES,
  OPERATIONAL_PREREQUISITES,
} from "../src/generators-operational";
import { RationaleSchema } from "../src/rationale";

const ASOF = new Date(Date.UTC(2026, 6, 29));

const leakage: Finding = {
  code: "OPERATIONAL_LEAKAGE_ABOVE_NOTICE",
  severity: "WARNING",
  metrics: {
    monthlyLeakageBase: 220,
    annualLeakageBase: 2640,
    thresholdBase: 40,
    monthsObserved: 3,
    latestMonth: "2026-07",
    latestMonthBase: 300,
    trendPct: 36.4,
    topSources: "bank_amlot:180, fx_markup:40",
    topSourceCount: 2,
  },
  evidenceItemIds: [],
};

const subs: Finding = {
  code: "OPERATIONAL_SUBSCRIPTION_REVIEW_DUE",
  severity: "NOTICE",
  metrics: {
    subscriptionCount: 3,
    monthlyTotalBase: 150,
    annualTotalBase: 1800,
    dormantDays: 90,
    largestMerchant: "streaming",
    largestMonthlyBase: 60,
    merchants: "streaming:60, gym:50, cloud:40",
    excludedContractual: 4,
    excludedUnclassified: 2,
  },
  evidenceItemIds: [],
};

const statutory: Finding = {
  code: "OPERATIONAL_STATUTORY_DEADLINE_NEAR",
  severity: "WARNING",
  metrics: {
    eventCount: 2,
    windowDays: 60,
    nearestTitleEn: "Hishtalmut ceiling check",
    nearestTitleHe: "בדיקת תקרת השתלמות",
    nearestDueDate: "2026-08-05",
    nearestDaysAway: 7,
    nearestKind: "CONTRIBUTION_DEADLINE",
    cashImpactBase: 12000,
    titlesEn: "Hishtalmut ceiling check · Year-end tax review",
    titlesHe: "בדיקת תקרת השתלמות · סקירת מס שנתית",
    expiresAtISO: "2026-08-05",
  },
  evidenceItemIds: [],
};

const review: Finding = {
  code: "OPERATIONAL_HOUSEHOLD_REVIEW_DUE",
  severity: "NOTICE",
  metrics: {
    eventCount: 1,
    windowDays: 60,
    nearestTitleEn: "Home insurance review",
    nearestTitleHe: "בדיקת ביטוח דירה",
    nearestDueDate: "2026-09-01",
    nearestDaysAway: 34,
    nearestKind: "REVIEW",
    cashImpactBase: 0,
    titlesEn: "Home insurance review",
    titlesHe: "בדיקת ביטוח דירה",
    expiresAtISO: "2026-09-01",
  },
  evidenceItemIds: [],
};

const renegotiate: Finding = {
  code: "OPERATIONAL_RENEGOTIABLE_COMMITMENTS",
  severity: "NOTICE",
  metrics: {
    commitmentCount: 2,
    monthlyTotalBase: 708.23,
    annualTotalBase: 8498.76,
    largestMerchant: "מגדל_מבטחים_חיים",
    largestMonthlyBase: 510.23,
    largestGroup: "INSURANCE",
    groups: "INSURANCE:510.23, TELECOM:198",
    merchants: "מגדל_מבטחים_חיים:510.23, בזק_הוראת_קבע:198",
  },
  evidenceItemIds: [],
};

const fxMarkup: Finding = {
  code: "OPERATIONAL_FX_MARKUP_ABOVE_NOTICE",
  severity: "WARNING",
  metrics: {
    markupPct: 4,
    thresholdPct: 1.5,
    excessBase: 444,
    monthlyExcessBase: 148,
    annualExcessBase: 1776,
    convertedVolumeBase: 11100,
    rowsPriced: 3,
    rowsCandidate: 3,
    coveragePct: 100,
    minCoveragePct: 70,
    unpricedNoRate: 0,
    spanDays: 90,
    currencies: "USD:444(4%)",
    benchmarkSource: "BOI",
    worstCurrency: "USD",
    worstImpliedRate: 3.85,
    worstReferenceRate: 3.7,
  },
  evidenceItemIds: [],
};

const timing: Finding = {
  code: "OPERATIONAL_CASHFLOW_TIMING_SPIKE",
  severity: "WARNING",
  metrics: {
    peakMonth: "2026-09",
    peakMonthBase: 5000,
    typicalMonthBase: 1000,
    excessBase: 4000,
    spikePct: 400,
    thresholdPct: 40,
    movableBase: 5000,
    statutoryBase: 0,
    movableCount: 2,
    largestMovableEn: "Annual home insurance",
    largestMovableHe: "ביטוח דירה שנתי",
    largestMovableBase: 3000,
    movableTitlesEn: "Annual home insurance · School payment",
    movableTitlesHe: "ביטוח דירה שנתי · תשלום בית ספר",
    lightestMonth: "2026-08",
    lightestMonthBase: 1000,
    monthsObserved: 4,
    horizonDays: 180,
    coveragePct: 100,
    minCoveragePct: 70,
    unpricedEvents: 0,
  },
  evidenceItemIds: [],
};

const ALL = [leakage, fxMarkup, subs, renegotiate, timing, statutory, review];

describe("operational generators", () => {
  it("maps every analyzer code — an unmapped operational finding is a bug, not a warning", () => {
    const { drafts, unmappedFindings } = generateOperationalRecommendations(ALL, ASOF);
    expect(unmappedFindings).toEqual([]);
    expect(drafts).toHaveLength(7);
  });

  it("NEVER claims relieved cash pressure as a saving on a timing card", () => {
    // Moving a payment saves nothing — it changes WHEN cash is needed, not how much.
    // Putting the relieved amount in the impact columns would feed it into the
    // Opportunity Center's savings headline and claim liquidity as income.
    const d = generateOperationalRecommendations([timing], ASOF).drafts[0]!;
    expect(d.impactMonthlyBase).toBeNull();
    expect(d.impactAnnualBase).toBeNull();
    expect(d.impactEoyBase).toBeNull();
    expect(d.rationale.liquidityImplications).toMatch(/never how much/i);
    expect(d.rationaleHe.liquidityImplications).toMatch(/לעולם לא כמה/);
  });

  it("tells the owner to leave statutory dates alone on a timing card", () => {
    // Proposing to move a tax date is not a strategy, it is advice with a penalty.
    const d = generateOperationalRecommendations([timing], ASOF).drafts[0]!;
    expect(d.actionItems.join(" ")).toMatch(/statutory items where they are/i);
    expect(d.actionItemsHe.join(" ")).toMatch(/סטטוטוריים במקומם/);
  });

  it("states FX coverage on the card rather than only in the confidence score", () => {
    // Owner decision 2026-07-29: an analyzer that could not use every row must SAY so.
    // A lowered confidence score is not a substitute — the reader sees the headline
    // number either way, and only the prose can explain what was left out.
    const d = generateOperationalRecommendations([fxMarkup], ASOF).drafts[0]!;
    expect(d.rationale.sensitivity).toMatch(/3 of 3 foreign-currency payments/);
    expect(d.rationale.sensitivity).toMatch(/100% coverage, floor 70%/);
    expect(d.rationaleHe.sensitivity).toMatch(/כיסוי 100%/);
  });

  it("names the FX spread as a spread, and never as a fee that was billed", () => {
    // The whole point of the card: a conversion spread appears on no statement line,
    // so telling the owner to look for a fee would send them hunting for nothing.
    const d = generateOperationalRecommendations([fxMarkup], ASOF).drafts[0]!;
    expect(d.rationale.why).toMatch(/never billed as a line|priced into the rate/i);
    expect(d.impactMonthlyBase).toBe(148);
    expect(d.assumptionKeysUsed).toContain("leakage_fx_markup_notice_pct");
    expect(d.assumptionKeysUsed).toContain("opportunity_min_coverage_pct");
  });

  it("NEVER claims current spend as a saving on a renegotiation card", () => {
    // The impact columns feed the Opportunity Center's headline "proposed savings" total.
    // Renegotiation knows the SPEND, not the saving — WealthOS has no market rate for a
    // mobile plan or an insurance policy. Putting spend there would claim the whole bill
    // as recoverable: the M40a mistake in a different costume.
    const d = generateOperationalRecommendations([renegotiate], ASOF).drafts[0]!;
    expect(d.impactMonthlyBase).toBeNull();
    expect(d.impactAnnualBase).toBeNull();
    expect(d.impactEoyBase).toBeNull();
    expect(d.rationale.sensitivity).toMatch(/not an estimated saving/i);
    expect(d.rationaleHe.sensitivity).toMatch(/אינו אומדן חיסכון/);
  });

  it("never tells the owner to cancel insurance cover", () => {
    // engine-strategy's insurance analyzer checks for coverage GAPS on the same policy.
    const d = generateOperationalRecommendations([renegotiate], ASOF).drafts[0]!;
    const allText = [
      d.title, d.titleHe, d.rationale.why, d.rationaleHe.why,
      ...d.actionItems, ...d.actionItemsHe,
      ...d.rationale.alternatives, ...d.rationaleHe.alternatives,
    ].join(" ");
    expect(allText).not.toMatch(/\bcancel\b/i);
    expect(allText).not.toMatch(/לבטל|ביטול/);
  });

  it("emits a FULL bilingual rationale that satisfies the same schema as strategy", () => {
    const { drafts } = generateOperationalRecommendations(ALL, ASOF);
    for (const d of drafts) {
      expect(() => RationaleSchema.parse(d.rationale)).not.toThrow();
      expect(() => RationaleSchema.parse(d.rationaleHe)).not.toThrow();
      expect(d.titleHe.length).toBeGreaterThan(0);
      expect(d.actionItems.length).toBeGreaterThan(0);
      expect(d.actionItemsHe.length).toBe(d.actionItems.length);
    }
  });

  it("carries the operating metadata the Recommendation columns expect", () => {
    const { drafts } = generateOperationalRecommendations([leakage], ASOF);
    const d = drafts[0]!;
    expect(d.cadence).toBe("MONTHLY");
    expect(d.difficulty).toBe("EASY");
    expect(d.reversibility).toBe("REVERSIBLE");
    expect(d.impactMonthlyBase).toBe(220);
    expect(d.impactAnnualBase).toBe(2640);
    // 29 Jul 2026 → Jul..Dec inclusive = 6 months left, not a full year.
    expect(d.impactEoyBase).toBe(220 * 6);
  });

  it("end-of-year impact depends on the injected date, not the wall clock", () => {
    const dec = generateOperationalRecommendations([leakage], new Date(Date.UTC(2026, 11, 15))).drafts[0]!;
    expect(dec.impactEoyBase).toBe(220);
  });

  it("gives deadlines an expiry and leaves recurring savings open-ended", () => {
    const [d] = generateOperationalRecommendations([statutory], ASOF).drafts;
    expect(d!.expiresAtISO).toBe("2026-08-05");
    expect(d!.impactMonthlyBase).toBeNull();
    const [l] = generateOperationalRecommendations([leakage], ASOF).drafts;
    expect(l!.expiresAtISO).toBeNull();
  });

  it("scores urgency by proximity, not by amount", () => {
    const near = generateOperationalRecommendations([statutory], ASOF).drafts[0]!;
    const far = generateOperationalRecommendations(
      [{ ...statutory, metrics: { ...statutory.metrics, nearestDaysAway: 55 } }],
      ASOF,
    ).drafts[0]!;
    expect(near.subscores.urgency).toBeGreaterThan(far.subscores.urgency);
  });

  it("marks a rising leakage trend as more urgent than a flat one", () => {
    const flat = generateOperationalRecommendations(
      [{ ...leakage, severity: "NOTICE", metrics: { ...leakage.metrics, trendPct: "n/a" } }],
      ASOF,
    ).drafts[0]!;
    const rising = generateOperationalRecommendations([leakage], ASOF).drafts[0]!;
    expect(rising.subscores.urgency).toBeGreaterThan(flat.subscores.urgency);
  });

  it("states what the subscription analyzer refused to consider, in both languages", () => {
    // The M40a QA defect was partly a transparency failure: the owner had no way to see
    // that contractual obligations were (or were not) being filtered out.
    const d = generateOperationalRecommendations([subs], ASOF).drafts[0]!;
    expect(d.rationale.sensitivity).toContain("4");
    expect(d.rationale.sensitivity).toMatch(/mortgage, loan or insurance/);
    expect(d.rationaleHe.sensitivity).toMatch(/משכנתא/);
  });

  it("throws on a code with no action items — the same rule M23c set for strategy", () => {
    expect(() => operationalActionItemsFor("NOT_A_REAL_CODE", {})).toThrow(/ACTION_ITEMS_MISSING/);
  });

  it("reports an unknown finding code instead of silently dropping it", () => {
    const { drafts, unmappedFindings } = generateOperationalRecommendations(
      [{ code: "OPERATIONAL_NOT_BUILT_YET", severity: "INFO", metrics: {}, evidenceItemIds: [] }],
      ASOF,
    );
    expect(drafts).toEqual([]);
    expect(unmappedFindings).toEqual(["OPERATIONAL_NOT_BUILT_YET"]);
  });

  it("passes the product-reference validator on every generated string", () => {
    // The validator runs inside generation and THROWS on a hit, so reaching this
    // line at all is the assertion. The negative case is proven below.
    expect(() => generateOperationalRecommendations(ALL, ASOF)).not.toThrow();
  });

  it("REJECTS a draft that names a product — proven with a deliberate violation", () => {
    // A validator that has never been seen to fail is indistinguishable from one
    // that does nothing (the M38q lesson). Force a product name through a metric
    // that lands in the rendered title.
    const poisoned: Finding = {
      ...statutory,
      metrics: { ...statutory.metrics, nearestTitleEn: "Buy shares in the index ETF" },
    };
    expect(() => generateOperationalRecommendations([poisoned], ASOF)).toThrow(
      /PRODUCT_REFERENCE_IN_GENERATOR/,
    );
  });

  it("NEVER gives a statutory deadline a prerequisite", () => {
    // An externally imposed date does not wait for the household to finish its admin.
    // A lock that delayed one would cause the exact penalty the card exists to prevent.
    for (const t of NEVER_BLOCKED_TYPES) {
      expect(prerequisiteTypesFor(t)).toEqual([]);
    }
    expect(prerequisiteTypesFor("MEET_STATUTORY_DEADLINE")).toEqual([]);
  });

  it("declares a prerequisite only where it changes the dependent's numbers", () => {
    // The map is deliberately sparse. A dependency asserted for tidiness blocks real
    // work for no reason, so this pins the ONE relationship that currently qualifies:
    // cancelling or repricing a payment inside the heavy month changes the peak, and
    // may remove the need to reschedule anything at all.
    expect(prerequisiteTypesFor("SMOOTH_CASHFLOW_TIMING")).toEqual([
      "REVIEW_RECURRING_SUBSCRIPTIONS",
      "RENEGOTIATE_RECURRING_COMMITMENTS",
    ]);
    expect(Object.keys(OPERATIONAL_PREREQUISITES)).toEqual(["SMOOTH_CASHFLOW_TIMING"]);
  });

  it("has no unknown type on either side of the prerequisite map", () => {
    // A typo'd type name would silently never match, producing a graph that looks
    // configured and enforces nothing — the M38q failure mode.
    const generated = new Set(
      generateOperationalRecommendations(ALL, ASOF).drafts.map((d) => d.type),
    );
    for (const [dependent, prereqs] of Object.entries(OPERATIONAL_PREREQUISITES)) {
      expect(generated).toContain(dependent);
      for (const p of prereqs) expect(generated).toContain(p);
    }
  });

  it("REJECTS a product name reaching the FX card through a metric", () => {
    // The FX card interpolates several free-text metrics into its action items, which
    // is exactly the shape of hole the M38q lesson warns about. Proven per-card, not
    // assumed to be covered because a different card is.
    const poisoned: Finding = {
      ...fxMarkup,
      metrics: { ...fxMarkup.metrics, worstCurrency: "the index ETF" },
    };
    expect(() => generateOperationalRecommendations([poisoned], ASOF)).toThrow(
      /PRODUCT_REFERENCE_IN_GENERATOR/,
    );
  });
});

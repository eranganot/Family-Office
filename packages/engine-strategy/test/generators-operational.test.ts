import { describe, expect, it } from "vitest";
import type { Finding } from "../src/findings";
import {
  generateOperationalRecommendations,
  operationalActionItemsFor,
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

const ALL = [leakage, subs, statutory, review];

describe("operational generators", () => {
  it("maps every analyzer code — an unmapped operational finding is a bug, not a warning", () => {
    const { drafts, unmappedFindings } = generateOperationalRecommendations(ALL, ASOF);
    expect(unmappedFindings).toEqual([]);
    expect(drafts).toHaveLength(4);
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
});

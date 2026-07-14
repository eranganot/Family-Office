import { describe, expect, it } from "vitest";
import { sweepRecommendationReviews } from "../src/recommendation-review";

const now = new Date("2026-07-14T00:00:00Z");
const rec = (over: Partial<Parameters<typeof sweepRecommendationReviews>[0][number]> = {}) => ({
  id: "r1", title: "Do X", titleHe: "לעשות X", implementationDate: new Date("2026-03-01"), hasActualOutcome: false, ...over,
});

describe("recommendation-review sweep (B4)", () => {
  it("flags an accepted rec past its date without an outcome", () => {
    const r = sweepRecommendationReviews([rec()], now);
    expect(r.overdue).toHaveLength(1);
    expect(r.overdue[0]!.daysOverdue).toBeGreaterThan(0);
  });
  it("does not flag when an outcome was already recorded", () => {
    expect(sweepRecommendationReviews([rec({ hasActualOutcome: true })], now).overdue).toHaveLength(0);
  });
  it("does not flag a rec with no implementation date (and does not count it)", () => {
    const r = sweepRecommendationReviews([rec({ implementationDate: null })], now);
    expect(r.overdue).toHaveLength(0);
    expect(r.evaluated).toBe(0);
  });
  it("does not flag a future implementation date", () => {
    expect(sweepRecommendationReviews([rec({ implementationDate: new Date("2026-12-01") })], now).overdue).toHaveLength(0);
  });
});

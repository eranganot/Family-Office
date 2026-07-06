import { describe, expect, it } from "vitest";
import { sweepStaleness, type StalenessInput } from "../src/index";

const NOW = new Date("2026-07-06T00:00:00Z");
const daysAgo = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const TH = { ACCOUNT: 400, REAL_ESTATE: 800 };

function item(over: Partial<StalenessInput>): StalenessInput {
  return { id: "i", name: "i", kind: "ACCOUNT", verification: "VERIFIED", latestValuationAsOf: daysAgo(10), ...over };
}

describe("sweepStaleness", () => {
  it("flags a verified item past its kind threshold", () => {
    const r = sweepStaleness([item({ id: "old", latestValuationAsOf: daysAgo(500) })], NOW, TH);
    expect(r.stale.map((s) => s.id)).toEqual(["old"]);
    expect(r.stale[0]!.ageDays).toBe(500);
    expect(r.stale[0]!.thresholdDays).toBe(400);
    expect(r.evaluated).toBe(1);
  });

  it("does not flag fresh verified items", () => {
    const r = sweepStaleness([item({ id: "fresh", latestValuationAsOf: daysAgo(100) })], NOW, TH);
    expect(r.stale).toHaveLength(0);
    expect(r.evaluated).toBe(1);
  });

  it("ignores unverified, rejected, and already-stale items", () => {
    const r = sweepStaleness(
      [
        item({ id: "u", verification: "UNVERIFIED", latestValuationAsOf: daysAgo(500) }),
        item({ id: "r", verification: "REJECTED", latestValuationAsOf: daysAgo(500) }),
        item({ id: "s", verification: "STALE", latestValuationAsOf: daysAgo(500) }),
      ],
      NOW,
      TH,
    );
    expect(r.stale).toHaveLength(0);
    expect(r.evaluated).toBe(0);
  });

  it("skips verified items with no valuation (nothing to age)", () => {
    const r = sweepStaleness([item({ id: "n", latestValuationAsOf: null })], NOW, TH);
    expect(r.stale).toHaveLength(0);
    expect(r.evaluated).toBe(0);
  });

  it("uses the per-kind threshold (real estate ages slower)", () => {
    const re = item({ id: "re", kind: "REAL_ESTATE", latestValuationAsOf: daysAgo(500) });
    const r = sweepStaleness([re], NOW, TH);
    expect(r.stale).toHaveLength(0); // 500 < 800
  });

  it("falls back to 400 days for unknown kinds", () => {
    const r = sweepStaleness([item({ id: "x", kind: "MYSTERY", latestValuationAsOf: daysAgo(500) })], NOW, TH);
    expect(r.stale.map((s) => s.id)).toEqual(["x"]);
    expect(r.stale[0]!.thresholdDays).toBe(400);
  });
});

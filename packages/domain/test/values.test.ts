import { describe, expect, it } from "vitest";
import { confidenceScore } from "../src/values/confidence-score";
import { DateRange } from "../src/values/date-range";
import { Percentage } from "../src/values/percentage";

describe("Percentage", () => {
  it("accepts [0,100] and rejects outside", () => {
    expect(Percentage.of(0).toString()).toBe("0%");
    expect(Percentage.of("100").toString()).toBe("100%");
    expect(() => Percentage.of(-0.01)).toThrow();
    expect(() => Percentage.of(100.01)).toThrow();
  });
  it("converts to ratio", () => {
    expect(Percentage.of("17.5").asRatio().toString()).toBe("0.175");
  });
});

describe("ConfidenceScore", () => {
  it("accepts integers 0-100 only", () => {
    expect(confidenceScore(0)).toBe(0);
    expect(confidenceScore(100)).toBe(100);
    expect(() => confidenceScore(101)).toThrow();
    expect(() => confidenceScore(-1)).toThrow();
    expect(() => confidenceScore(50.5)).toThrow();
  });
});

describe("DateRange", () => {
  it("enforces end >= start", () => {
    const s = new Date("2026-01-01");
    expect(() => DateRange.of(new Date("2026-02-01"), new Date("2026-01-01"))).toThrow();
    expect(DateRange.of(s).isOpenEnded()).toBe(true);
  });
  it("contains dates inclusively; open-ended contains the future", () => {
    const r = DateRange.of(new Date("2026-01-01"), new Date("2026-12-31"));
    expect(r.contains(new Date("2026-06-15"))).toBe(true);
    expect(r.contains(new Date("2027-01-01"))).toBe(false);
    const open = DateRange.of(new Date("2026-01-01"));
    expect(open.contains(new Date("2099-01-01"))).toBe(true);
    expect(open.contains(new Date("2025-12-31"))).toBe(false);
  });
});

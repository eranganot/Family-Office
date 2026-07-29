import { describe, expect, it } from "vitest";
import {
  HOUSEHOLD_TEMPLATE_RULES,
  IL_STATUTORY_RULES,
  nextOccurrence,
  occurrencesInWindow,
  type CalendarRule,
  SUGGESTED_DATE_RATIONALE,
  suggestedAnchorDate,
  rulesWithSuggestions,
} from "../src/operations/calendar-rules";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const rule = (over: Partial<CalendarRule>): CalendarRule => ({
  key: "t", kind: "REVIEW", titleEn: "t", titleHe: "t", cadence: "ANNUAL",
  day: 1, leadDays: 30, origin: "HOUSEHOLD", cashImpacting: false, defaultEnabled: true,
  ...over,
});

describe("nextOccurrence", () => {
  it("finds the next ANNUAL date after the given day", () => {
    const r = rule({ cadence: "ANNUAL", month: 4, day: 30 });
    expect(nextOccurrence(r, d("2026-01-15")).toISOString().slice(0, 10)).toBe("2026-04-30");
    expect(nextOccurrence(r, d("2026-05-01")).toISOString().slice(0, 10)).toBe("2027-04-30");
  });

  it("is strictly AFTER the reference date — today's deadline is not 'next'", () => {
    const r = rule({ cadence: "ANNUAL", month: 4, day: 30 });
    expect(nextOccurrence(r, d("2026-04-30")).toISOString().slice(0, 10)).toBe("2027-04-30");
  });

  it("CLAMPS to the last day of a short month instead of rolling over", () => {
    // A rule anchored on the 31st must land on 28/29 Feb, not 1–3 March. A rolled date
    // in a deadline calendar is a missed deadline.
    const r = rule({ cadence: "MONTHLY", day: 31 });
    expect(nextOccurrence(r, d("2026-02-01")).toISOString().slice(0, 10)).toBe("2026-02-28");
  });

  it("steps MONTHLY into the next month once this month's day has passed", () => {
    const r = rule({ cadence: "MONTHLY", day: 10 });
    expect(nextOccurrence(r, d("2026-03-15")).toISOString().slice(0, 10)).toBe("2026-04-10");
  });

  it("steps SEMI_ANNUAL by six months", () => {
    const r = rule({ cadence: "SEMI_ANNUAL", month: 1, day: 31 });
    expect(nextOccurrence(r, d("2026-02-01")).toISOString().slice(0, 10)).toBe("2026-07-31");
  });

  it("steps QUARTERLY by three months", () => {
    const r = rule({ cadence: "QUARTERLY", month: 1, day: 1 });
    expect(nextOccurrence(r, d("2026-02-01")).toISOString().slice(0, 10)).toBe("2026-04-01");
  });
});

describe("occurrencesInWindow", () => {
  it("lists every occurrence inside the window and none beyond it", () => {
    const r = rule({ cadence: "MONTHLY", day: 1 });
    const out = occurrencesInWindow(r, d("2026-01-05"), d("2026-04-10"));
    expect(out.map((x) => x.toISOString().slice(0, 10))).toEqual(["2026-02-01", "2026-03-01", "2026-04-01"]);
  });

  it("returns nothing when the window closes before the next occurrence", () => {
    const r = rule({ cadence: "ANNUAL", month: 12, day: 25 });
    expect(occurrencesInWindow(r, d("2026-01-01"), d("2026-03-01"))).toHaveLength(0);
  });

  it("terminates on a ONE_TIME rule instead of repeating it", () => {
    const r = rule({ cadence: "ONE_TIME", month: 6, day: 1 });
    expect(occurrencesInWindow(r, d("2026-01-01"), d("2030-01-01")).length).toBeLessThanOrEqual(1);
  });
});

describe("seeded rule sets", () => {
  it("has unique keys across both sets", () => {
    const keys = [...IL_STATUTORY_RULES, ...HOUSEHOLD_TEMPLATE_RULES].map((r) => r.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("every STATUTORY rule carries a source note or a fixed legal date", () => {
    for (const r of IL_STATUTORY_RULES) {
      expect(r.origin).toBe("STATUTORY");
      expect(r.month).toBeDefined();
    }
  });

  it("household rules that need the owner's own date ship DISABLED", () => {
    // Seeding a guessed renewal date would produce a confident, wrong calendar.
    const needsOwnerDate = ["vehicle.license", "vehicle.insurance", "insurance.home", "arnona.payment", "mortgage.reset"];
    for (const key of needsOwnerDate) {
      expect(HOUSEHOLD_TEMPLATE_RULES.find((r) => r.key === key)?.defaultEnabled).toBe(false);
    }
  });

  it("marks money-moving events as cash impacting so they reach the liquidity forecast", () => {
    expect(IL_STATUTORY_RULES.find((r) => r.key === "hishtalmut.ceiling_check")?.cashImpacting).toBe(true);
    expect(IL_STATUTORY_RULES.find((r) => r.key === "tax.year_end_review")?.cashImpacting).toBe(false);
  });
});

/**
 * Regression: every default-on rule must state its own month.
 *
 * Rules with no month fell back to 1 January, which put five unrelated household reviews
 * on the same fabricated day. The owner spotted it immediately — five items stacked on
 * 01/01 is not a schedule, it is a missing value wearing a date.
 */
describe("suggested dates are chosen, not defaulted", () => {
  const all = [...IL_STATUTORY_RULES, ...HOUSEHOLD_TEMPLATE_RULES];

  it("every default-enabled non-monthly rule declares a month", () => {
    const bad = all
      .filter((r) => r.defaultEnabled && r.cadence !== "MONTHLY" && r.month === undefined)
      .map((r) => r.key);
    expect(bad).toEqual([]);
  });

  it("no two default-enabled annual rules share the same day of the year", () => {
    const seen = new Map<string, string>();
    for (const r of all) {
      if (!r.defaultEnabled || r.cadence === "MONTHLY" || r.month === undefined) continue;
      const slot = `${r.month}-${r.day}`;
      expect(seen.has(slot), `${r.key} collides with ${seen.get(slot)} on ${slot}`).toBe(false);
      seen.set(slot, r.key);
    }
  });

  it("every default-on household review explains its suggested date", () => {
    const unexplained = HOUSEHOLD_TEMPLATE_RULES
      .filter((r) => r.defaultEnabled && !SUGGESTED_DATE_RATIONALE[r.key])
      .map((r) => r.key);
    expect(unexplained).toEqual([]);
  });
});

describe("suggestedAnchorDate", () => {
  const Y = 2026;

  it("returns the rule's own month and day", () => {
    // review.fees is mid-February: annual statements land in January.
    expect(suggestedAnchorDate("review.fees", Y)?.toISOString().slice(0, 10)).toBe("2026-02-15");
    // The provident deposit moved off the 25th so it can actually clear by 31 Dec.
    expect(suggestedAnchorDate("gemel.year_end_deposit", Y)?.toISOString().slice(0, 10)).toBe("2026-12-15");
  });

  it("gives monthly rules a day without inventing a month", () => {
    // Only the day matters for a monthly rule; January is just the anchor's carrier.
    expect(suggestedAnchorDate("review.emergency_fund", Y)?.getUTCDate()).toBe(10);
  });

  it("has no suggestion for rules the owner must date himself", () => {
    // Nobody but the owner knows when his home insurance renews.
    expect(suggestedAnchorDate("insurance.home", Y)).toBeNull();
    expect(suggestedAnchorDate("does.not.exist", Y)).toBeNull();
  });

  it("every rule offered for one-click apply actually yields a date", () => {
    for (const key of rulesWithSuggestions()) {
      expect(suggestedAnchorDate(key, Y), key).not.toBeNull();
    }
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { IL_2025 } from "../src/seed-data/il-2025";
import { IL_2026 } from "../src/seed-data/il-2026";
import { taxRegistry } from "../src/tax-registry";

/**
 * WO-1: from 2027-01-01 the current-year callers (allocation, strategy, scenarios)
 * must keep working on the latest seeded year, and say so. In-memory stand-in for
 * prisma.taxRuleSet covering exactly what the registry queries.
 */
type Row = { country: string; taxYear: number; ruleType: string; version: number; payload: unknown; source: string; ownerReviewed: boolean };

function fakeDb(rows: Row[]) {
  const matches = (r: Row, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => {
      const val = (r as Record<string, unknown>)[k];
      if (v && typeof v === "object" && "lte" in (v as object)) return (val as number) <= (v as { lte: number }).lte;
      return val === v;
    });
  const sortBy = (list: Row[], orderBy: unknown) => {
    const keys = (Array.isArray(orderBy) ? orderBy : [orderBy]).filter(Boolean) as Array<Record<string, "asc" | "desc">>;
    return [...list].sort((a, b) => {
      for (const o of keys) {
        const [k, dir] = Object.entries(o)[0]!;
        const d = ((a as never)[k] as number) - ((b as never)[k] as number);
        if (d !== 0) return dir === "desc" ? -d : d;
      }
      return 0;
    });
  };
  return {
    taxRuleSet: {
      findFirst: async ({ where, orderBy }: { where: Record<string, unknown>; orderBy?: unknown }) =>
        sortBy(rows.filter((r) => matches(r, where)), orderBy)[0] ?? null,
    },
  } as never;
}

function seedRows(years: Array<[number, Record<string, unknown>]>): Row[] {
  return years.flatMap(([taxYear, data]) =>
    Object.entries(data).map(([ruleType, payload]) => ({
      country: "IL", taxYear, ruleType, version: 1, payload, source: "seed", ownerReviewed: true,
    })),
  );
}

const SEEDED = seedRows([[2025, IL_2025], [2026, IL_2026]]);
const RULES_USED = ["HISHTALMUT_CEILINGS", "PENSION_CEILINGS", "CAPITAL_GAINS"] as const;

afterEach(() => vi.useRealTimers());

describe("tax registry: current-year fallback (WO-1)", () => {
  it("on 2027-01-02 every rule the engines use resolves to 2026, flagged as fallback", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2027-01-02T08:00:00Z"));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const reg = taxRegistry(fakeDb(SEEDED)).forCurrentYear();
    expect(reg.taxYear).toBe(2027);
    for (const rule of RULES_USED) {
      const r = await reg.getEffective(rule);
      expect(r).toMatchObject({ taxYear: 2026, requestedYear: 2027, fallback: true });
    }
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it("the strict get() still throws TAX_RULES_MISSING for 2027 (registry page behaviour unchanged)", async () => {
    await expect(taxRegistry(fakeDb(SEEDED)).forYear(2027).get("CAPITAL_GAINS")).rejects.toThrow("TAX_RULES_MISSING:IL:2027:CAPITAL_GAINS");
  });

  it("in 2026 the 2026 rules are used with no fallback", async () => {
    const r = await taxRegistry(fakeDb(SEEDED)).forCurrentYear(new Date("2026-11-05")).getEffective("PENSION_CEILINGS");
    expect(r).toMatchObject({ taxYear: 2026, requestedYear: 2026, fallback: false });
  });

  it("once 2027 is seeded it wins, and the newest version of a year wins", async () => {
    const rows = [...SEEDED, ...seedRows([[2027, IL_2026]])];
    rows.push({ ...rows.find((r) => r.taxYear === 2027 && r.ruleType === "CAPITAL_GAINS")!, version: 2, source: "v2" });
    const r = await taxRegistry(fakeDb(rows)).forYear(2027).getEffective("CAPITAL_GAINS");
    expect(r).toMatchObject({ taxYear: 2027, version: 2, source: "v2", fallback: false });
  });

  it("no rules at or before the year still fails loudly", async () => {
    await expect(taxRegistry(fakeDb(SEEDED)).forYear(2024).getEffective("CAPITAL_GAINS")).rejects.toThrow("TAX_RULES_MISSING:IL:2024");
  });

  it("currentYearStatus drives the UI notice", async () => {
    const reg = taxRegistry(fakeDb(SEEDED));
    expect(await reg.currentYearStatus(new Date("2027-01-02"))).toEqual({ currentYear: 2027, effectiveYear: 2026, fallback: true });
    expect(await reg.currentYearStatus(new Date("2026-06-01"))).toEqual({ currentYear: 2026, effectiveYear: 2026, fallback: false });
    expect(await reg.currentYearStatus(new Date("2024-06-01"))).toEqual({ currentYear: 2024, effectiveYear: null, fallback: false });
  });
});

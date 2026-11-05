import type { PrismaClient } from "@wealthos/db";
import { RULE_SCHEMAS, type RuleType } from "./schemas";

/**
 * TaxRegistry: the ONLY way calculations obtain tax parameters. Versioned and
 * year-keyed; no rate or ceiling may exist anywhere in engine code.
 * Missing rules throw — engines must fail loudly, never fall back to guesses.
 *
 * WO-1 (2026-11-05, owner decision): the "current year" callers (allocation,
 * strategy, scenarios) use `getEffective`, which takes the latest REVIEWED-SEEDED
 * year at or before the requested one. That is not a guess: it is the newest
 * published rule set, and the fallback is reported (`fallback: true`) and shown in
 * the UI, so a missing new-year seed degrades to "using 2026 rules" instead of a
 * 500 on 1 January. No rules at or before the year still throws TAX_RULES_MISSING.
 */
export class TaxRegistryYear {
  constructor(
    private readonly db: PrismaClient,
    readonly country: string,
    readonly taxYear: number,
  ) {}

  /** Latest version of a rule set, schema-validated on read. */
  async get<T extends RuleType>(ruleType: T): Promise<{
    version: number;
    payload: (typeof RULE_SCHEMAS)[T]["_output"];
    source: string;
  }> {
    const row = await this.db.taxRuleSet.findFirst({
      where: { country: this.country, taxYear: this.taxYear, ruleType },
      orderBy: { version: "desc" },
    });
    if (!row) {
      throw new Error(`TAX_RULES_MISSING:${this.country}:${this.taxYear}:${ruleType}`);
    }
    const payload = RULE_SCHEMAS[ruleType].parse(row.payload);
    return { version: row.version, payload: payload as never, source: row.source };
  }

  /**
   * Latest version of the rule set for this year, or - when this year has none -
   * of the latest earlier year. `fallback` is true when an earlier year was used.
   */
  async getEffective<T extends RuleType>(ruleType: T): Promise<{
    version: number;
    payload: (typeof RULE_SCHEMAS)[T]["_output"];
    source: string;
    taxYear: number;
    requestedYear: number;
    fallback: boolean;
  }> {
    const row = await this.db.taxRuleSet.findFirst({
      where: { country: this.country, taxYear: { lte: this.taxYear }, ruleType },
      orderBy: [{ taxYear: "desc" }, { version: "desc" }],
    });
    if (!row) {
      throw new Error(`TAX_RULES_MISSING:${this.country}:${this.taxYear}:${ruleType}`);
    }
    const fallback = row.taxYear !== this.taxYear;
    if (fallback) {
      console.warn(
        `[tax-registry] ${this.country} ${ruleType}: no ${this.taxYear} rules, using ${row.taxYear}`,
      );
    }
    const payload = RULE_SCHEMAS[ruleType].parse(row.payload);
    return {
      version: row.version,
      payload: payload as never,
      source: row.source,
      taxYear: row.taxYear,
      requestedYear: this.taxYear,
      fallback,
    };
  }

  async list(): Promise<Array<{ ruleType: string; version: number; payload: unknown; source: string; ownerReviewed: boolean }>> {
    const rows = await this.db.taxRuleSet.findMany({
      where: { country: this.country, taxYear: this.taxYear },
      orderBy: [{ ruleType: "asc" }, { version: "desc" }],
    });
    const seen = new Set<string>();
    return rows
      .filter((r) => (seen.has(r.ruleType) ? false : (seen.add(r.ruleType), true)))
      .map((r) => ({ ruleType: r.ruleType, version: r.version, payload: r.payload, source: r.source, ownerReviewed: r.ownerReviewed }));
  }

  /** D5: mark every version of a rule set as owner-reviewed. Returns rows updated. */
  async review(ruleType: string): Promise<number> {
    const res = await this.db.taxRuleSet.updateMany({
      where: { country: this.country, taxYear: this.taxYear, ruleType },
      data: { ownerReviewed: true },
    });
    return res.count;
  }
}

export function taxRegistry(db: PrismaClient, country = "IL") {
  return {
    forYear(taxYear: number): TaxRegistryYear {
      return new TaxRegistryYear(db, country, taxYear);
    },
    /** The calendar year's registry, for the "current year" callers. */
    forCurrentYear(now: Date = new Date()): TaxRegistryYear {
      return new TaxRegistryYear(db, country, now.getFullYear());
    },
    /** For the UI notice: is the current calendar year seeded, and if not, which year is used. */
    async currentYearStatus(now: Date = new Date()): Promise<{
      currentYear: number;
      effectiveYear: number | null;
      fallback: boolean;
    }> {
      const currentYear = now.getFullYear();
      const row = await db.taxRuleSet.findFirst({
        where: { country, taxYear: { lte: currentYear } },
        orderBy: { taxYear: "desc" },
        select: { taxYear: true },
      });
      const effectiveYear = row?.taxYear ?? null;
      return { currentYear, effectiveYear, fallback: effectiveYear !== null && effectiveYear !== currentYear };
    },
    async availableYears(): Promise<number[]> {
      const rows = await db.taxRuleSet.findMany({
        where: { country },
        select: { taxYear: true },
        distinct: ["taxYear"],
        orderBy: { taxYear: "desc" },
      });
      return rows.map((r) => r.taxYear);
    },
  };
}

import type { PrismaClient } from "@wealthos/db";
import { RULE_SCHEMAS, type RuleType } from "./schemas";

/**
 * TaxRegistry: the ONLY way calculations obtain tax parameters. Versioned and
 * year-keyed; no rate or ceiling may exist anywhere in engine code.
 * Missing rules throw — engines must fail loudly, never fall back to guesses.
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

  async list(): Promise<Array<{ ruleType: string; version: number; payload: unknown; source: string }>> {
    const rows = await this.db.taxRuleSet.findMany({
      where: { country: this.country, taxYear: this.taxYear },
      orderBy: [{ ruleType: "asc" }, { version: "desc" }],
    });
    const seen = new Set<string>();
    return rows
      .filter((r) => (seen.has(r.ruleType) ? false : (seen.add(r.ruleType), true)))
      .map((r) => ({ ruleType: r.ruleType, version: r.version, payload: r.payload, source: r.source }));
  }
}

export function taxRegistry(db: PrismaClient, country = "IL") {
  return {
    forYear(taxYear: number): TaxRegistryYear {
      return new TaxRegistryYear(db, country, taxYear);
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

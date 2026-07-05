/**
 * Idempotent registry seed: inserts version 1 of each rule set if absent.
 * NEVER overwrites an existing version — corrections create version 2 (owner-driven).
 * Runs in Railway preDeploy and locally via `npm run seed -w @wealthos/registry`.
 */
import { prisma } from "@wealthos/db";
import { IL_2025 } from "./seed-data/il-2025";
import { IL_2026 } from "./seed-data/il-2026";
import { RULE_SCHEMAS, type RuleType } from "./schemas";
import { DEFAULT_ASSUMPTIONS } from "./assumption-defaults";

export async function seedRegistries(db = prisma): Promise<{ taxSeeded: number; assumptionsSeeded: number }> {
  let taxSeeded = 0;
  for (const [taxYear, data] of [[2025, IL_2025], [2026, IL_2026]] as const) {
    for (const [ruleType, payload] of Object.entries(data)) {
      RULE_SCHEMAS[ruleType as RuleType].parse(payload); // validate before writing
      const existing = await db.taxRuleSet.findFirst({ where: { country: "IL", taxYear, ruleType } });
      if (existing) continue;
      await db.taxRuleSet.create({
        data: {
          country: "IL",
          taxYear,
          ruleType,
          version: 1,
          payload: payload as never,
          source: (payload as { meta: { sources: string[] } }).meta.sources.join(" | "),
        },
      });
      taxSeeded += 1;
    }
  }

  let assumptionsSeeded = 0;
  for (const def of DEFAULT_ASSUMPTIONS) {
    const existing = await db.assumption.findFirst({ where: { householdId: null, key: def.key } });
    if (existing) continue;
    await db.assumption.create({
      data: {
        householdId: null,
        key: def.key,
        version: 1,
        value: def.value as never,
        unit: def.unit,
        description: def.description,
        source: "CONSERVATIVE_DEFAULT",
      },
    });
    assumptionsSeeded += 1;
  }
  return { taxSeeded, assumptionsSeeded };
}

// CLI entry
if (process.argv[1]?.endsWith("seed.ts")) {
  seedRegistries()
    .then((r) => {
      console.log(`registry seed: ${r.taxSeeded} tax rule sets, ${r.assumptionsSeeded} assumptions`);
      process.exit(0);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

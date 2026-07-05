import type { Prisma, PrismaClient } from "@wealthos/db";

/**
 * AssumptionRegistry: system defaults (householdId = null) + household overrides.
 * Values are versioned and immutable — an override creates version latest+1.
 * Recommendations pin the exact assumption row (id + version) they used.
 */
export interface CurrentAssumption {
  id: string;
  key: string;
  version: number;
  value: unknown;
  unit: string | null;
  description: string;
  source: string;
  isOverride: boolean;
}

export function assumptionRegistry(db: PrismaClient) {
  return {
    /** Household override wins over system default; latest version of each. */
    async current(key: string, householdId?: string): Promise<CurrentAssumption> {
      if (householdId) {
        const override = await db.assumption.findFirst({
          where: { householdId, key },
          orderBy: { version: "desc" },
        });
        if (override) return toCurrent(override, true);
      }
      const def = await db.assumption.findFirst({
        where: { householdId: null, key },
        orderBy: { version: "desc" },
      });
      if (!def) throw new Error(`ASSUMPTION_MISSING:${key}`);
      return toCurrent(def, false);
    },

    async all(householdId?: string): Promise<CurrentAssumption[]> {
      const defaults = await latestPerKey(db, null);
      if (!householdId) return defaults.map((d) => toCurrent(d, false));
      const overrides = await latestPerKey(db, householdId);
      const overrideByKey = new Map(overrides.map((o) => [o.key, o]));
      return defaults.map((d) => {
        const o = overrideByKey.get(d.key);
        return o ? toCurrent(o, true) : toCurrent(d, false);
      });
    },

    /** Creates a new override version for the household. Returns the new row. */
    async setOverride(householdId: string, key: string, value: unknown): Promise<CurrentAssumption> {
      const def = await db.assumption.findFirst({ where: { householdId: null, key }, orderBy: { version: "desc" } });
      if (!def) throw new Error(`ASSUMPTION_MISSING:${key}`);
      const latest = await db.assumption.findFirst({
        where: { householdId, key },
        orderBy: { version: "desc" },
      });
      const created = await db.assumption.create({
        data: {
          householdId,
          key,
          version: (latest?.version ?? 0) + 1,
          value: value as Prisma.InputJsonValue,
          unit: def.unit,
          description: def.description,
          source: "USER",
        },
      });
      return toCurrent(created, true);
    },
  };
}

async function latestPerKey(db: PrismaClient, householdId: string | null) {
  const rows = await db.assumption.findMany({
    where: { householdId },
    orderBy: [{ key: "asc" }, { version: "desc" }],
  });
  const seen = new Set<string>();
  return rows.filter((r) => (seen.has(r.key) ? false : (seen.add(r.key), true)));
}

function toCurrent(
  row: { id: string; key: string; version: number; value: unknown; unit: string | null; description: string; source: string },
  isOverride: boolean,
): CurrentAssumption {
  return { id: row.id, key: row.key, version: row.version, value: row.value, unit: row.unit, description: row.description, source: row.source, isOverride };
}

import { calculateNetWorth, type CurrencyCode, type NetWorthItem } from "@wealthos/domain";
import { ledgerRepo } from "@wealthos/db";
import { z } from "zod";
import { DecimalString } from "../schemas/ledger";
import { protectedProcedure, router } from "../trpc";
import { requireHouseholdId } from "./ledger";

const CurrencyPair = z.object({
  from: z.enum(["ILS", "USD", "EUR"]),
  to: z.enum(["ILS", "USD", "EUR"]),
});

export const networthRouter = router({
  report: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    const household = await ctx.db.household.findFirstOrThrow({ select: { baseCurrency: true } });
    const items = await ledgerRepo.list(ctx.db, householdId);

    // Latest manual rate per pair.
    const allRates = await ctx.db.fxRate.findMany({ orderBy: { asOf: "desc" } });
    const seen = new Set<string>();
    const latestRates = allRates.filter((r) => {
      const key = `${r.from}->${r.to}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const nwItems: NetWorthItem[] = items.map((i) => ({
      id: i.id,
      name: i.name,
      kind: i.kind,
      currency: i.currency as CurrencyCode,
      latestValue: i.latestValuation ? i.latestValuation.value.toString() : null,
    }));

    return calculateNetWorth(
      nwItems,
      latestRates.map((r) => ({
        from: r.from as CurrencyCode,
        to: r.to as CurrencyCode,
        rate: r.rate.toString(),
      })),
      household.baseCurrency as CurrencyCode,
    );
  }),

  /** Liquid (ACCOUNT) assets split into growth / defensive / unknown-mix, ILS-converted.
   *  Known-mix from growthSharePct; cash types are defensive; the rest is unknown (never guessed). */
  liquidBreakdown: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    const household = await ctx.db.household.findFirstOrThrow({ select: { baseCurrency: true } });
    const base = household.baseCurrency as string;
    const items = await ledgerRepo.list(ctx.db, householdId);
    const allRates = await ctx.db.fxRate.findMany({ orderBy: { asOf: "desc" } });
    const seen = new Set<string>();
    const rate = new Map<string, number>();
    for (const r of allRates) { const k = `${r.from}->${r.to}`; if (seen.has(k)) continue; seen.add(k); rate.set(k, Number(r.rate)); }
    const toBase = (v: number, ccy: string): number | null => {
      if (ccy === base) return v;
      const d = rate.get(`${ccy}->${base}`); if (d) return v * d;
      const inv = rate.get(`${base}->${ccy}`); if (inv) return v / inv;
      return null;
    };
    const CASH = new Set(["BANK_CHECKING", "BANK_SAVINGS", "BANK_DEPOSIT", "CASH_OTHER"]);
    let growth = 0, defensive = 0, unknown = 0;
    for (const i of items) {
      if (i.kind !== "ACCOUNT" || !i.latestValuation) continue;
      const v = toBase(Number(i.latestValuation.value), i.currency);
      if (v === null) continue;
      const gs = i.accountDetail?.growthSharePct;
      if (gs !== null && gs !== undefined) { growth += (v * Number(gs)) / 100; defensive += (v * (100 - Number(gs))) / 100; }
      else if (CASH.has(i.accountDetail?.accountType ?? "")) { defensive += v; }
      else { unknown += v; }
    }
    return { base, growthILS: Math.round(growth), defensiveILS: Math.round(defensive), unknownILS: Math.round(unknown) };
  }),

  fxRates: protectedProcedure.query(({ ctx }) =>
    ctx.db.fxRate.findMany({ orderBy: [{ from: "asc" }, { to: "asc" }, { asOf: "desc" }] }),
  ),

  refreshFxFromBoi: protectedProcedure.mutation(async ({ ctx }) => {
    const { refreshFxFromBoi } = await import("../services/fx-service");
    return refreshFxFromBoi(ctx.db);
  }),

  boiRate: protectedProcedure.query(async ({ ctx }) => {
    const { latestBoiRate } = await import("../services/boi-rate-service");
    return latestBoiRate(ctx.db);
  }),

  refreshBoiRate: protectedProcedure.mutation(async ({ ctx }) => {
    const { refreshBoiRate } = await import("../services/boi-rate-service");
    return refreshBoiRate(ctx.db);
  }),

  setFxRate: protectedProcedure
    .input(CurrencyPair.extend({ rate: DecimalString, asOf: z.coerce.date() }))
    .mutation(async ({ ctx, input }) => {
      if (input.from === input.to) {
        throw new (await import("@trpc/server")).TRPCError({ code: "BAD_REQUEST", message: "SAME_CURRENCY" });
      }
      return ctx.db.fxRate.upsert({
        where: {
          from_to_asOf_source: { from: input.from, to: input.to, asOf: input.asOf, source: "MANUAL" },
        },
        create: { from: input.from, to: input.to, rate: input.rate, asOf: input.asOf, source: "MANUAL" },
        update: { rate: input.rate },
      });
    }),
});

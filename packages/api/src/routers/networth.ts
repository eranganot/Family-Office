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

  fxRates: protectedProcedure.query(({ ctx }) =>
    ctx.db.fxRate.findMany({ orderBy: [{ from: "asc" }, { to: "asc" }, { asOf: "desc" }] }),
  ),

  refreshFxFromBoi: protectedProcedure.mutation(async ({ ctx }) => {
    const { refreshFxFromBoi } = await import("../services/fx-service");
    return refreshFxFromBoi(ctx.db);
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

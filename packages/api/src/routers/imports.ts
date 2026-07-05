import { TRPCError } from "@trpc/server";
import { listAdapters } from "@wealthos/ingestion";
import { z } from "zod";
import { ImportError, runImport } from "../services/import-service";
import { OwnershipSchema } from "../schemas/ledger";
import { protectedProcedure, router } from "../trpc";
import { requireHouseholdId } from "./ledger";

export const importsRouter = router({
  adapters: protectedProcedure.query(() =>
    listAdapters().map((a) => ({ id: a.id, version: a.version })),
  ),

  run: protectedProcedure
    .input(
      z.object({
        documentId: z.uuid(),
        adapterId: z.string().optional(),
        defaultOwnership: OwnershipSchema,
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireHouseholdId(ctx.db);
      try {
        return await runImport(ctx.db, householdId, input);
      } catch (e) {
        if (e instanceof ImportError) {
          throw new TRPCError({ code: "BAD_REQUEST", message: e.code });
        }
        throw e;
      }
    }),

  batches: protectedProcedure.query(({ ctx }) =>
    ctx.db.importBatch.findMany({
      include: {
        document: { select: { filename: true, docType: true } },
        _count: { select: { importedFields: true, suspenseItems: true } },
      },
      orderBy: { startedAt: "desc" },
      take: 50,
    }),
  ),

  suspense: protectedProcedure
    .input(z.object({ status: z.enum(["PENDING", "RESOLVED", "DISCARDED"]).default("PENDING") }).optional())
    .query(({ ctx, input }) =>
      ctx.db.suspenseItem.findMany({
        where: { status: input?.status ?? "PENDING" },
        include: { batch: { include: { document: { select: { filename: true } } } } },
        orderBy: { createdAt: "desc" },
      }),
    ),
});

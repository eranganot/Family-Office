import { TRPCError } from "@trpc/server";
import { findAdapter, listAdapters } from "@wealthos/ingestion";
import { z } from "zod";
import { ImportError, runImport } from "../services/import-service";
import { OwnershipSchema } from "../schemas/ledger";
import { protectedProcedure, router } from "../trpc";
import { requireHouseholdId } from "./ledger";

export const importsRouter = router({
  adapters: protectedProcedure.query(() =>
    listAdapters().map((a) => ({ id: a.id, version: a.version })),
  ),

  /**
   * Which stored documents an adapter can actually parse.
   *
   * Owner QA 2026-08-02: assigning ownership failed on every document with a bare
   * `NO_ADAPTER_FOUND`. Only two adapters exist — Israeli pension PDFs and an accounts
   * CSV — so a PDF typed MORTGAGE_SCHEDULE, TAX_106, BANK_STATEMENT or
   * BROKERAGE_STATEMENT matches nothing and the import throws. The document was stored
   * correctly the whole time; only the parse was impossible.
   *
   * That distinction is the entire point now. Since per-item attribution landed, a
   * document is EVIDENCE whether or not a parser can read it — a mortgage schedule
   * nobody can parse still proves the mortgage. Presenting import as the thing to do,
   * and hard-failing it, told the owner his filing had failed when it had not.
   *
   * So the UI asks first and offers the form only where it can succeed. One query for
   * the whole list rather than one per row.
   */
  importableIds: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    const docs = await ctx.db.document.findMany({
      where: { householdId },
      select: { id: true, filename: true, mimeType: true, docType: true, sha256: true },
    });
    return docs
      .filter((d) =>
        findAdapter({
          filename: d.filename,
          mimeType: d.mimeType,
          docType: d.docType ?? undefined,
          sha256: d.sha256,
        }) !== undefined,
      )
      .map((d) => d.id);
  }),

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

export const suspenseResolutionRouter = router({
  get: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const item = await ctx.db.suspenseItem.findUnique({
      where: { id: input.id },
      include: { batch: { include: { document: { select: { filename: true } } } } },
    });
    if (!item) throw new TRPCError({ code: "NOT_FOUND" });
    return item;
  }),

  discard: protectedProcedure
    .input(z.object({ id: z.uuid(), note: z.string().min(1).max(500) }))
    .mutation(({ ctx, input }) =>
      ctx.db.suspenseItem.update({
        where: { id: input.id },
        data: { status: "DISCARDED", resolutionNote: input.note, resolvedAt: new Date() },
      }),
    ),

  /** The raw data belongs to an item that already exists in the ledger. */
  linkToExisting: protectedProcedure
    .input(z.object({ id: z.uuid(), ledgerItemId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const item = await ctx.db.ledgerItem.findUnique({ where: { id: input.ledgerItemId } });
      if (!item) throw new TRPCError({ code: "BAD_REQUEST", message: "ITEM_NOT_FOUND" });
      return ctx.db.suspenseItem.update({
        where: { id: input.id },
        data: {
          status: "RESOLVED",
          resolvedLedgerItemId: input.ledgerItemId,
          resolutionNote: "LINKED_TO_EXISTING",
          resolvedAt: new Date(),
        },
      });
    }),

  /** Mark resolved after the human created a canonical item from the raw data. */
  markResolved: protectedProcedure
    .input(z.object({ id: z.uuid(), ledgerItemId: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.suspenseItem.update({
        where: { id: input.id },
        data: {
          status: "RESOLVED",
          resolvedLedgerItemId: input.ledgerItemId,
          resolutionNote: "CLASSIFIED_BY_HUMAN",
          resolvedAt: new Date(),
        },
      }),
    ),
});

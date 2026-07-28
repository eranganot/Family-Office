import { TRPCError } from "@trpc/server";
import { documentsRepo, fileStore, sha256Of } from "@wealthos/db";
import { z } from "zod";
import { protectedProcedure, router } from "../trpc";
import { requireHouseholdId } from "./ledger";

export const DocTypeSchema = z.enum([
  "PENSION_REPORT",
  "HISHTALMUT_STATEMENT",
  "GEMEL_STATEMENT",
  "BANK_STATEMENT",
  // Card statements are a first-class kind: they drive the outflow sign rule and the
  // settlement dedup. Their absence here silently rejected every card upload while
  // bank uploads succeeded, which made it look like a file problem.
  "CARD_STATEMENT",
  "BROKERAGE_STATEMENT",
  "MISLAKA",
  "MORTGAGE_SCHEDULE",
  "TAX_106",
  "OTHER",
]);

export const documentsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const householdId = await requireHouseholdId(ctx.db);
    return documentsRepo.list(ctx.db, householdId);
  }),

  get: protectedProcedure.input(z.object({ id: z.uuid() })).query(async ({ ctx, input }) => {
    const doc = await documentsRepo.get(ctx.db, input.id);
    if (!doc) throw new TRPCError({ code: "NOT_FOUND" });
    return doc;
  }),

  /** Upload = store bytes immutably (content-addressed) + metadata row. Duplicates rejected by sha256. */
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(300),
        mimeType: z.string().min(1).max(100),
        docType: DocTypeSchema.optional(),
        institutionName: z.string().max(200).optional(),
        contentBase64: z.string().min(1),
        /**
         * What to do when the same bytes are already stored.
         *
         * "ERROR" (default) preserves the original behaviour for every existing caller.
         * "REUSE" returns the stored document instead of throwing — re-uploading a file
         * you already have should take you to it, not report a failure. The owner hit
         * exactly this: a perfectly good preview sitting under a red "save failed".
         */
        onDuplicate: z.enum(["ERROR", "REUSE"]).default("ERROR"),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireHouseholdId(ctx.db);
      const bytes = Buffer.from(input.contentBase64, "base64");
      if (bytes.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "EMPTY_FILE" });
      if (bytes.length > 25 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "FILE_TOO_LARGE" });
      const sha256 = sha256Of(bytes);
      const existing = await documentsRepo.findBySha(ctx.db, sha256);
      if (existing) {
        if (input.onDuplicate === "ERROR") {
          throw new TRPCError({ code: "CONFLICT", message: "DUPLICATE_DOCUMENT" });
        }
        // Stamp a docType that was missing: files uploaded before the statement-type
        // selector existed have none, and that is what drives the outflow sign rule.
        // Re-uploading with the type chosen is the natural way to fix them.
        if (input.docType && !existing.docType) {
          await ctx.db.document.update({ where: { id: existing.id }, data: { docType: input.docType } });
        }
        return { ...existing, duplicate: true as const };
      }
      const storageKey = await fileStore().put(sha256, bytes);
      const created = await documentsRepo.create(ctx.db, householdId, {
        sha256,
        filename: input.filename,
        mimeType: input.mimeType,
        docType: input.docType,
        institutionName: input.institutionName,
        storageKey,
      });
      return { ...created, duplicate: false as const };
    }),

  /** M27: correct the document type after upload (chooses which adapter runs on import). */
  setDocType: protectedProcedure
    .input(z.object({ id: z.uuid(), docType: DocTypeSchema }))
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireHouseholdId(ctx.db);
      const doc = await ctx.db.document.findUnique({ where: { id: input.id }, select: { householdId: true } });
      if (!doc || doc.householdId !== householdId) throw new TRPCError({ code: "NOT_FOUND" });
      return ctx.db.document.update({ where: { id: input.id }, data: { docType: input.docType } });
    }),
});

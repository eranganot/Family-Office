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
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const householdId = await requireHouseholdId(ctx.db);
      const bytes = Buffer.from(input.contentBase64, "base64");
      if (bytes.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "EMPTY_FILE" });
      if (bytes.length > 25 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "FILE_TOO_LARGE" });
      const sha256 = sha256Of(bytes);
      const existing = await documentsRepo.findBySha(ctx.db, sha256);
      if (existing) throw new TRPCError({ code: "CONFLICT", message: "DUPLICATE_DOCUMENT" });
      const storageKey = await fileStore().put(sha256, bytes);
      return documentsRepo.create(ctx.db, householdId, {
        sha256,
        filename: input.filename,
        mimeType: input.mimeType,
        docType: input.docType,
        institutionName: input.institutionName,
        storageKey,
      });
    }),
});

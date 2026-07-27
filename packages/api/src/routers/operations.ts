import { TRPCError } from "@trpc/server";
import { operationsRepo } from "@wealthos/db";
import { UNCLASSIFIED_KEY } from "@wealthos/domain";
import { normalizeMerchantKey, OPERATIONS_ENGINE_VERSION } from "@wealthos/engine-operations";
import { operationsProcedure, router } from "../trpc";
import {
  ArchiveCategorySchema,
  ClassifyTransactionsSchema,
  CreateManualTransactionSchema,
  ListTransactionsSchema,
  UpsertCategorySchema,
} from "../schemas/operations";

/**
 * M36 — Financial Operations router.
 *
 * Every procedure is built on `operationsProcedure` (= minPhaseGuard("VERIFICATION")),
 * NOT on workflowGuard: operations runs on its own monthly cadence and must remain
 * available in every phase from VERIFICATION onward (owner decision D2).
 */
export const operationsRouter = router({
  meta: operationsProcedure.query(() => ({ engineVersion: OPERATIONS_ENGINE_VERSION })),

  categories: router({
    /** Seeds the default tree on first read, then returns it nested. Idempotent. */
    tree: operationsProcedure
      .input(UpsertCategorySchema.pick({ axis: true }).partial().optional())
      .query(async ({ ctx, input }) => {
        const seeded = await operationsRepo.ensureCategories(ctx.db, ctx.householdId);
        const rows = await operationsRepo.listCategories(ctx.db, ctx.householdId, {
          axis: input?.axis,
        });
        return { seeded, tree: operationsRepo.toTree(rows), flat: rows };
      }),

    upsert: operationsProcedure.input(UpsertCategorySchema).mutation(async ({ ctx, input }) => {
      // Guard the tree invariant: a category may not be its own ancestor.
      if (input.id && input.parentId) {
        let cursor: string | null = input.parentId;
        const seen = new Set<string>();
        while (cursor) {
          if (cursor === input.id) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "CATEGORY_CYCLE" });
          }
          if (seen.has(cursor)) break;
          seen.add(cursor);
          const parent: { parentId: string | null } | null = await ctx.db.cashFlowCategory.findUnique({
            where: { id: cursor },
            select: { parentId: true },
          });
          cursor = parent?.parentId ?? null;
        }
      }

      const data = {
        parentId: input.parentId ?? null,
        axis: input.axis,
        key: input.key,
        nameEn: input.nameEn,
        nameHe: input.nameHe,
        defaultBehavioralClass: input.defaultBehavioralClass,
        mapsToFlowType: input.mapsToFlowType ?? null,
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      };

      if (input.id) {
        const existing = await ctx.db.cashFlowCategory.findUnique({ where: { id: input.id } });
        if (!existing || existing.householdId !== ctx.householdId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "CATEGORY_NOT_FOUND" });
        }
        const updated = await ctx.db.cashFlowCategory.update({ where: { id: input.id }, data });
        return { id: updated.id };
      }
      const created = await ctx.db.cashFlowCategory.create({
        data: { ...data, householdId: ctx.householdId, isSystem: false },
      });
      return { id: created.id };
    }),

    /**
     * System categories are archived, never deleted (they are referenced by
     * classification history, which is append-only evidence).
     */
    archive: operationsProcedure.input(ArchiveCategorySchema).mutation(async ({ ctx, input }) => {
      const cat = await ctx.db.cashFlowCategory.findUnique({
        where: { id: input.id },
        select: { householdId: true, key: true },
      });
      if (!cat || cat.householdId !== ctx.householdId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "CATEGORY_NOT_FOUND" });
      }
      if (cat.key === UNCLASSIFIED_KEY) {
        // The suspense fallback must always exist, or low-confidence rows have nowhere to go.
        throw new TRPCError({ code: "BAD_REQUEST", message: "CANNOT_ARCHIVE_FALLBACK" });
      }
      const moved = input.reassignToId
        ? (
            await ctx.db.transaction.updateMany({
              where: { householdId: ctx.householdId, categoryId: input.id },
              data: { categoryId: input.reassignToId },
            })
          ).count
        : 0;
      await ctx.db.cashFlowCategory.update({ where: { id: input.id }, data: { isArchived: true } });
      return { id: input.id, reassigned: moved };
    }),
  }),

  transactions: router({
    list: operationsProcedure.input(ListTransactionsSchema).query(async ({ ctx, input }) => {
      const rows = await operationsRepo.listTransactions(ctx.db, ctx.householdId, {
        from: input.from,
        to: input.to,
        categoryId: input.categoryId,
        limit: input.limit,
        cursor: input.cursor,
      });
      const nextCursor = rows.length === input.limit ? rows[rows.length - 1]?.id : undefined;
      return { rows, nextCursor };
    }),

    /**
     * Manual entry. `description` is treated as owner-authored text and stored in the
     * redacted column directly — the redaction pipeline (M38a) guards the IMPORT path,
     * where PII actually arrives. The column name is honest about what it holds.
     */
    createManual: operationsProcedure
      .input(CreateManualTransactionSchema)
      .mutation(async ({ ctx, input }) => {
        if (input.valueDate && input.valueDate < input.bookedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "VALUE_DATE_BEFORE_BOOKED" });
        }
        const created = await operationsRepo.createTransaction(ctx.db, ctx.householdId, {
          source: "MANUAL",
          bookedAt: input.bookedAt,
          valueDate: input.valueDate,
          amount: input.amount,
          currency: input.currency,
          // Base-currency conversion is the M37 engine's job (it needs an FxRate and
          // must refuse rather than guess). Same-currency is the only safe shortcut.
          amountBase: input.currency === ctx.baseCurrency ? input.amount : undefined,
          descriptionRedacted: input.description,
          merchantKey: normalizeMerchantKey(input.description) || undefined,
          categoryId: input.categoryId,
          behavioralClass: input.behavioralClass,
          instalmentNumber: input.instalmentNumber,
          instalmentTotal: input.instalmentTotal,
          originalAmount: input.originalAmount,
          isRecurringCandidate: input.isRecurringCandidate,
        });
        return { id: created.id, merchantKey: created.merchantKey };
      }),

    classify: operationsProcedure
      .input(ClassifyTransactionsSchema)
      .mutation(async ({ ctx, input }) => {
        const cat = await ctx.db.cashFlowCategory.findUnique({
          where: { id: input.categoryId },
          select: { householdId: true },
        });
        if (!cat || cat.householdId !== ctx.householdId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "CATEGORY_NOT_FOUND" });
        }
        const owned = await ctx.db.transaction.count({
          where: { id: { in: input.transactionIds }, householdId: ctx.householdId },
        });
        if (owned !== input.transactionIds.length) {
          throw new TRPCError({ code: "NOT_FOUND", message: "TRANSACTION_NOT_FOUND" });
        }
        const updated = await operationsRepo.classify(ctx.db, {
          transactionIds: input.transactionIds,
          categoryId: input.categoryId,
          behavioralClass: input.behavioralClass,
          decidedBy: ctx.session.email,
        });
        return { updated };
      }),
  }),
});

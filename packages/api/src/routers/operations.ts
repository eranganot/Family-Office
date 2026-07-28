import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { operationsRepo } from "@wealthos/db";
import { UNCLASSIFIED_KEY } from "@wealthos/domain";
import { normalizeMerchantKey, OPERATIONS_ENGINE_VERSION } from "@wealthos/engine-operations";
import { operationsProcedure, router } from "../trpc";
import { autoClassify, computePeriod, operationsAssumptions } from "../services/operations-service";
import { commitStatement, previewStatement } from "../services/statement-import-service";
import { linkCardSettlements } from "../services/settlement-service";
import {
  ArchiveCategorySchema,
  BulkClassifyByMerchantSchema,
  SetTransactionStatusSchema,
  UpdateTransactionSchema,
  ClassifyTransactionsSchema,
  ClosePeriodSchema,
  CommitStatementSchema,
  CreateManualTransactionSchema,
  PreviewStatementSchema,
  SaveMappingProfileSchema,
  ListTransactionsSchema,
  PeriodRefSchema,
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
    /**
     * Includes the ACTIVE classification so the UI can answer "why does this row have
     * this category?" — method (OWNER / RULE / FALLBACK), the rule that fired, the
     * confidence, and who decided. Without this, a surprising category is a mystery,
     * and a mystery in a financial tool is a trust problem.
     */
    list: operationsProcedure.input(ListTransactionsSchema).query(async ({ ctx, input }) => {
      const rows = await ctx.db.transaction.findMany({
        where: {
          householdId: ctx.householdId,
          ...(input.from || input.to
            ? { bookedAt: { ...(input.from ? { gte: input.from } : {}), ...(input.to ? { lte: input.to } : {}) } }
            : {}),
          ...(input.categoryId ? { categoryId: input.categoryId } : {}),
        },
        orderBy: [{ bookedAt: "desc" }, { id: "desc" }],
        take: input.limit,
        ...(input.cursor ? { skip: 1, cursor: { id: input.cursor } } : {}),
        include: {
          classifications: {
            where: { status: { not: "SUPERSEDED" } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { method: true, confidence: true, ruleVersion: true, status: true, decidedBy: true, createdAt: true },
          },
        },
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

    /** Full edit. Recomputes the merchant key when the description changes. */
    update: operationsProcedure.input(UpdateTransactionSchema).mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.transaction.findUnique({
        where: { id: input.id },
        select: { householdId: true, currency: true, amount: true },
      });
      if (!existing || existing.householdId !== ctx.householdId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "TRANSACTION_NOT_FOUND" });
      }
      if (input.categoryId) {
        const cat = await ctx.db.cashFlowCategory.findUnique({
          where: { id: input.categoryId },
          select: { householdId: true },
        });
        if (!cat || cat.householdId !== ctx.householdId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "CATEGORY_NOT_FOUND" });
        }
      }

      const data: Record<string, unknown> = {};
      if (input.bookedAt !== undefined) data["bookedAt"] = input.bookedAt;
      if (input.valueDate !== undefined) data["valueDate"] = input.valueDate;
      if (input.amount !== undefined) data["amount"] = input.amount;
      if (input.currency !== undefined) data["currency"] = input.currency;
      if (input.categoryId !== undefined) data["categoryId"] = input.categoryId;
      if (input.behavioralClass !== undefined) data["behavioralClass"] = input.behavioralClass;
      if (input.instalmentNumber !== undefined) data["instalmentNumber"] = input.instalmentNumber;
      if (input.instalmentTotal !== undefined) data["instalmentTotal"] = input.instalmentTotal;
      if (input.isRecurringCandidate !== undefined) data["isRecurringCandidate"] = input.isRecurringCandidate;
      if (input.description !== undefined) {
        data["descriptionRedacted"] = input.description;
        // The merchant key is DERIVED from the description; leaving a stale key would
        // silently mis-group the transaction and poison owner memory.
        data["merchantKey"] = normalizeMerchantKey(input.description) || null;
      }

      // amountBase is only safe to set directly in the household base currency; any
      // other currency needs an FxRate, which the engine resolves (and refuses without).
      const nextCurrency = input.currency ?? existing.currency;
      if (input.amount !== undefined || input.currency !== undefined) {
        data["amountBase"] = nextCurrency === ctx.baseCurrency
          ? (input.amount ?? String(existing.amount))
          : null;
      }

      await ctx.db.transaction.update({ where: { id: input.id }, data: data as never });
      return { id: input.id };
    }),

    /**
     * Remove (VOID) or restore. Never a hard delete — classification history is
     * append-only evidence, and a voided row is excluded from every calculation
     * anyway, so destroying it would only cost the audit trail.
     */
    setStatus: operationsProcedure.input(SetTransactionStatusSchema).mutation(async ({ ctx, input }) => {
      const existing = await ctx.db.transaction.findUnique({
        where: { id: input.id },
        select: { householdId: true },
      });
      if (!existing || existing.householdId !== ctx.householdId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "TRANSACTION_NOT_FOUND" });
      }
      await ctx.db.transaction.update({ where: { id: input.id }, data: { status: input.status } });
      return { id: input.id, status: input.status };
    }),

    /**
     * Teach the classifier: apply one decision to EVERY transaction sharing a merchant
     * key, past and future. Because merchant keys strip per-transaction reference codes,
     * "SPOTIFY P43CD5B1CB" and "SPOTIFY Q99XX1A2BC" are the same merchant, so one
     * correction covers both. This is the whole learning loop — deterministic, auditable,
     * and reversible, with no model in the path (owner decision D3).
     */
    bulkClassifyByMerchant: operationsProcedure
      .input(BulkClassifyByMerchantSchema)
      .mutation(async ({ ctx, input }) => {
        const cat = await ctx.db.cashFlowCategory.findUnique({
          where: { id: input.categoryId },
          select: { householdId: true },
        });
        if (!cat || cat.householdId !== ctx.householdId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "CATEGORY_NOT_FOUND" });
        }
        const rows = await ctx.db.transaction.findMany({
          where: { householdId: ctx.householdId, merchantKey: input.merchantKey },
          select: { id: true },
        });
        if (rows.length === 0) return { updated: 0 };
        const updated = await operationsRepo.classify(ctx.db, {
          transactionIds: rows.map((r) => r.id),
          categoryId: input.categoryId,
          behavioralClass: input.behavioralClass,
          decidedBy: ctx.session.email,
        });
        return { updated };
      }),
  }),

  // ------------------------------------------------------------------ M37 --
  /**
   * The dual-axis engine. Every figure below is computed on demand from the
   * transaction ledger; nothing is cached until a period is CLOSED, at which point
   * `computed` + `pins` + `engineVersion` are frozen for reproducibility.
   */
  cashflow: router({
    dualAxis: operationsProcedure.input(PeriodRefSchema).query(async ({ ctx, input }) => {
      const r = await computePeriod(ctx.db, ctx.householdId, input.year, input.month);
      const categories = await ctx.db.cashFlowCategory.findMany({
        where: { householdId: ctx.householdId },
        select: { id: true, key: true, nameEn: true, nameHe: true, axis: true, parentId: true },
      });
      return { ...r, categories };
    }),
  }),

  surplus: router({
    get: operationsProcedure.input(PeriodRefSchema).query(async ({ ctx, input }) => {
      const r = await computePeriod(ctx.db, ctx.householdId, input.year, input.month);
      return { surplus: r.surplus, flow: r.flow, engineVersion: r.engineVersion, pins: r.pins };
    }),
    safeToSpend: operationsProcedure.input(PeriodRefSchema).query(async ({ ctx, input }) => {
      const r = await computePeriod(ctx.db, ctx.householdId, input.year, input.month);
      return {
        safeToSpend: r.safeToSpend,
        workingCapital: r.workingCapital,
        committedInstalmentsBase: r.committedInstalmentsBase,
      };
    }),
  }),

  period: router({
    /** Optional year/month so the owner can navigate to any past month, not just today's. */
    current: operationsProcedure
      .input(PeriodRefSchema.partial().optional())
      .query(async ({ ctx, input }) => {
        const now = new Date();
        const year = input?.year ?? now.getUTCFullYear();
        const month = input?.month ?? now.getUTCMonth() + 1;
        const row = await ctx.db.operatingPeriod.findUnique({
          where: { householdId_year_month: { householdId: ctx.householdId, year, month } },
        });
        const computed = await computePeriod(ctx.db, ctx.householdId, year, month);
        return { year, month, row, computed };
      }),

    /**
     * Months that actually hold transactions, newest first — so navigation offers real
     * months rather than an unbounded calendar the owner has to guess their way around.
     */
    months: operationsProcedure.query(async ({ ctx }) => {
      const rows = await ctx.db.transaction.findMany({
        where: { householdId: ctx.householdId },
        select: { bookedAt: true },
        orderBy: { bookedAt: "desc" },
      });
      const seen = new Map<string, { year: number; month: number; count: number }>();
      for (const r of rows) {
        const y = r.bookedAt.getUTCFullYear();
        const m = r.bookedAt.getUTCMonth() + 1;
        const key = `${y}-${m}`;
        const prev = seen.get(key);
        if (prev) prev.count += 1;
        else seen.set(key, { year: y, month: m, count: 1 });
      }
      return [...seen.values()];
    }),

    /** Runs the deterministic classifier over everything unconfirmed, then recomputes. */
    recompute: operationsProcedure.input(PeriodRefSchema).mutation(async ({ ctx, input }) => {
      const cls = await autoClassify(ctx.db, ctx.householdId);
      // Re-link settlements too: a card statement imported AFTER its bank line must
      // still retro-actively suppress that aggregate.
      await linkCardSettlements(ctx.db, ctx.householdId);
      const r = await computePeriod(ctx.db, ctx.householdId, input.year, input.month);
      const surplusBase = r.surplus.ok ? r.surplus.monthlyBase.toFixed(4) : null;
      const provisional = r.surplus.ok ? r.surplus.provisional : true;
      const coverage = r.flow.ok ? r.flow.coverage : "PARTIAL";
      await ctx.db.operatingPeriod.upsert({
        where: { householdId_year_month: { householdId: ctx.householdId, year: input.year, month: input.month } },
        create: {
          householdId: ctx.householdId, year: input.year, month: input.month,
          surplusBase, surplusIsProvisional: provisional, coverage,
          unverifiedCount: r.flow.ok ? r.flow.unverifiedCount : 0,
          unverifiedAmountBase: r.flow.ok ? r.flow.unverifiedAmountBase.toFixed(4) : null,
        },
        update: {
          surplusBase, surplusIsProvisional: provisional, coverage,
          unverifiedCount: r.flow.ok ? r.flow.unverifiedCount : 0,
          unverifiedAmountBase: r.flow.ok ? r.flow.unverifiedAmountBase.toFixed(4) : null,
        },
      });
      return { ...cls, ...r };
    }),

    /**
     * Freeze the month. `computed` + `pins` + `engineVersion` are stored so a closed
     * period is reproducible later even after assumptions or rules change.
     * Closing with unverified rows is ALLOWED (the non-blocking rule) and recorded.
     */
    close: operationsProcedure.input(ClosePeriodSchema).mutation(async ({ ctx, input }) => {
      const r = await computePeriod(ctx.db, ctx.householdId, input.year, input.month);
      if (!r.flow.ok) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `CANNOT_CLOSE:${r.flow.reason}` });
      }
      const row = await ctx.db.operatingPeriod.upsert({
        where: { householdId_year_month: { householdId: ctx.householdId, year: input.year, month: input.month } },
        create: {
          householdId: ctx.householdId, year: input.year, month: input.month,
          status: "CLOSED", closedAt: new Date(), engineVersion: r.engineVersion,
          computed: JSON.parse(JSON.stringify(r)), pins: r.pins,
          surplusBase: r.surplus.ok ? r.surplus.monthlyBase.toFixed(4) : null,
          surplusIsProvisional: r.surplus.ok ? r.surplus.provisional : true,
          coverage: r.flow.coverage,
          unverifiedCount: r.flow.unverifiedCount,
          unverifiedAmountBase: r.flow.unverifiedAmountBase.toFixed(4),
          reviewNote: input.reviewNote ?? null,
        },
        update: {
          status: "CLOSED", closedAt: new Date(), engineVersion: r.engineVersion,
          computed: JSON.parse(JSON.stringify(r)), pins: r.pins,
          surplusBase: r.surplus.ok ? r.surplus.monthlyBase.toFixed(4) : null,
          surplusIsProvisional: r.surplus.ok ? r.surplus.provisional : true,
          coverage: r.flow.coverage,
          unverifiedCount: r.flow.unverifiedCount,
          unverifiedAmountBase: r.flow.unverifiedAmountBase.toFixed(4),
          reviewNote: input.reviewNote ?? null,
        },
      });
      return { id: row.id, status: row.status, provisional: row.surplusIsProvisional };
    }),

    reopen: operationsProcedure.input(PeriodRefSchema).mutation(async ({ ctx, input }) => {
      const row = await ctx.db.operatingPeriod.update({
        where: { householdId_year_month: { householdId: ctx.householdId, year: input.year, month: input.month } },
        data: { status: "OPEN", closedAt: null },
      });
      return { id: row.id, status: row.status };
    }),
  }),

  /**
   * Read-only inspector: exactly what is IN the database for a month, and how each row
   * is being counted.
   *
   * Added after several rounds of "the parser is right but the screen still shows the
   * old number". Every fault in this module has been silent, and the loop that kept
   * repeating was: fix parser -> owner re-imports -> figures unchanged -> no way to tell
   * whether the row is missing, mis-signed, mis-classified or excluded as a TRANSFER.
   * This answers that in one look, without a database client.
   */
  diagnostics: router({
    month: operationsProcedure.input(PeriodRefSchema).query(async ({ ctx, input }) => {
      const start = new Date(Date.UTC(input.year, input.month - 1, 1));
      const end = new Date(Date.UTC(input.year, input.month, 0, 23, 59, 59));
      const rows = await ctx.db.transaction.findMany({
        where: { householdId: ctx.householdId, bookedAt: { gte: start, lte: end } },
        orderBy: [{ amount: "desc" }],
        select: {
          id: true, bookedAt: true, amount: true, amountBase: true, currency: true,
          status: true, source: true, descriptionRedacted: true, behavioralClass: true,
          category: { select: { key: true, nameHe: true, nameEn: true } },
          classifications: {
            where: { status: { not: "SUPERSEDED" } },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { method: true, confidence: true, status: true },
          },
        },
      });

      const num = (v: unknown) => Number(v ?? 0);
      const counted = rows.filter((r) => r.status === "BOOKED");
      return {
        total: rows.length,
        booked: counted.length,
        pending: rows.filter((r) => r.status === "PENDING").length,
        voided: rows.filter((r) => r.status === "VOID").length,
        missingBase: counted.filter((r) => r.amountBase === null).length,
        // The four buckets that decide whether a row reaches the totals at all.
        inflow: counted.filter((r) => num(r.amount) > 0 && r.behavioralClass !== "TRANSFER").length,
        inflowTotal: counted.filter((r) => num(r.amount) > 0 && r.behavioralClass !== "TRANSFER").reduce((n, r) => n + num(r.amount), 0),
        transfers: counted.filter((r) => r.behavioralClass === "TRANSFER").length,
        transferTotal: counted.filter((r) => r.behavioralClass === "TRANSFER").reduce((n, r) => n + Math.abs(num(r.amount)), 0),
        savings: counted.filter((r) => r.behavioralClass === "SAVINGS_FLOW").length,
        rows: rows.map((r) => ({
          id: r.id,
          date: r.bookedAt.toISOString().slice(0, 10),
          amount: num(r.amount),
          hasBase: r.amountBase !== null,
          currency: r.currency,
          status: r.status,
          source: r.source,
          description: r.descriptionRedacted,
          behavioral: r.behavioralClass,
          category: r.category?.nameHe ?? null,
          method: r.classifications[0]?.method ?? null,
          confidence: Number(r.classifications[0]?.confidence ?? 0),
        })),
      };
    }),
  }),

  suspense: router({
    /**
     * Everything the classifier was not confident enough to apply. These amounts ARE
     * counted in the month (non-blocking rule) — this queue is about confirming them,
     * not about unblocking the numbers.
     */
    queue: operationsProcedure
      .input(ListTransactionsSchema.pick({ limit: true, cursor: true }).partial())
      .query(async ({ ctx, input }) => {
        const rows = await ctx.db.transaction.findMany({
          where: { householdId: ctx.householdId, classifications: { some: { status: "SUSPENSE" } } },
          orderBy: [{ bookedAt: "desc" }, { id: "desc" }],
          take: input?.limit ?? 50,
          include: {
            category: { select: { id: true, key: true, nameEn: true, nameHe: true } },
            classifications: {
              where: { status: { not: "SUPERSEDED" } },
              select: { confidence: true, method: true, ruleVersion: true },
              take: 1,
            },
          },
        });
        const { minConfidence } = await operationsAssumptions(ctx.db, ctx.householdId);
        return { rows, minConfidence };
      }),
  }),

  // ------------------------------------------------------------------ M38b --
  /**
   * Statement import. `preview` persists NOTHING — it parses, redacts and maps so the
   * household can see exactly what will land before committing. Both paths run the
   * redaction boundary, so raw PII never reaches the database on any route.
   */
  import: router({
    preview: operationsProcedure.input(PreviewStatementSchema).mutation(async ({ ctx, input }) => {
      try {
        return await previewStatement(ctx.db, ctx.householdId, input.documentId, input.mapping);
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "PREVIEW_FAILED",
        });
      }
    }),

    commit: operationsProcedure.input(CommitStatementSchema).mutation(async ({ ctx, input }) => {
      let result;
      try {
        result = await commitStatement(
          ctx.db, ctx.householdId, input.documentId, input.adapterId, input.mapping,
        );
      } catch (e) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: e instanceof Error ? e.message : "IMPORT_FAILED",
        });
      }
      if (input.saveProfileAs && input.mapping) {
        await ctx.db.importMappingProfile.upsert({
          where: { householdId_name: { householdId: ctx.householdId, name: input.saveProfileAs } },
          create: {
            householdId: ctx.householdId,
            name: input.saveProfileAs,
            adapterId: input.adapterId,
            mapping: JSON.parse(JSON.stringify(input.mapping)),
          },
          update: { mapping: JSON.parse(JSON.stringify(input.mapping)), adapterId: input.adapterId },
        });
      }
      // Classify what just landed, then link any bank card-bill line to its detail so
      // the same money is never counted twice.
      const classified = await autoClassify(ctx.db, ctx.householdId);
      const settlements = await linkCardSettlements(ctx.db, ctx.householdId);
      return { ...result, ...classified, settlementsLinked: settlements.linked };
    }),

    /**
     * Statements uploaded but not yet imported. Multi-file upload queues several at
     * once, and without this list the extra files would be invisible after the first
     * preview.
     */
    pending: operationsProcedure.query(async ({ ctx }) =>
      // Relation filter, NOT take-then-filter: an earlier version paginated first and
      // then removed imported rows, so `pending` (newest 25) and `commitAllPending`
      // (oldest 25) silently operated on DIFFERENT sets of files.
      ctx.db.document.findMany({
        where: { householdId: ctx.householdId, batches: { none: { status: "COMPLETED" } } },
        orderBy: { uploadedAt: "desc" },
        select: { id: true, filename: true, uploadedAt: true, mimeType: true },
      }),
    ),

    /**
     * Import every pending statement that needs no column mapping (PDF, and HTML/CSV
     * whose headers the guesser resolves on its own). Preview exists so a CSV's column
     * mapping can be checked before it lands — but a PDF has no mapping to check, so
     * forcing a preview round-trip per file is pure friction. Files that DO need a
     * mapping decision are skipped and reported, not guessed at.
     */
    commitAllPending: operationsProcedure.mutation(async ({ ctx }) => {
      // EXACTLY the same set the `pending` list shows — see the note there.
      const docs = await ctx.db.document.findMany({
        where: { householdId: ctx.householdId, batches: { none: { status: "COMPLETED" } } },
        orderBy: { uploadedAt: "asc" },
        select: { id: true, filename: true },
      });

      let inserted = 0;
      let duplicates = 0;
      const imported: string[] = [];
      const skipped: Array<{ filename: string; reason: string }> = [];

      for (const doc of docs) {
        try {
          const pv = await previewStatement(ctx.db, ctx.householdId, doc.id);
          if (pv.unsupportedReason) {
            skipped.push({ filename: doc.filename, reason: pv.unsupportedReason });
            continue;
          }
          if (pv.drafts.length === 0) {
            // Needs a human mapping decision — never guess one.
            skipped.push({ filename: doc.filename, reason: "NEEDS_MAPPING" });
            continue;
          }
          const r = await commitStatement(
            ctx.db, ctx.householdId, doc.id,
            pv.format === "PDF" ? "pdf-statement" : "generic-tabular",
          );
          inserted += r.inserted;
          duplicates += r.duplicates;
          imported.push(doc.filename);
        } catch (e) {
          skipped.push({
            filename: doc.filename,
            reason: e instanceof Error ? e.message.slice(0, 120) : "FAILED",
          });
        }
      }

      const classified = inserted > 0 ? await autoClassify(ctx.db, ctx.householdId) : { classified: 0, suspense: 0 };
      if (inserted > 0) await linkCardSettlements(ctx.db, ctx.householdId);
      // `considered` makes the on-screen numbers reconcile: considered = imported + skipped.
      return { considered: docs.length, inserted, duplicates, imported, skipped, ...classified };
    }),

    /** Import batches, newest first, with how many transactions each produced. */
    batches: operationsProcedure.query(async ({ ctx }) => {
      const batches = await ctx.db.importBatch.findMany({
        where: { document: { householdId: ctx.householdId } },
        orderBy: { startedAt: "desc" },
        take: 30,
        select: {
          id: true, adapterId: true, status: true, startedAt: true,
          document: { select: { filename: true } },
          _count: { select: { transactions: true } },
        },
      });
      return batches;
    }),

    /**
     * Undo an import: delete every transaction it created.
     *
     * Safe because transactions are the OBSERVATION layer (owner decision D5) — nothing
     * downstream depends on them structurally, and classification history cascades with
     * the row. This is a real DELETE rather than a VOID: a bad import is not evidence of
     * anything, it is noise that should leave no trace. Re-importing the file afterwards
     * is clean, because dedupe is keyed on externalRef which goes away with the rows.
     */
    undo: operationsProcedure
      .input(z.object({ batchId: z.uuid() }))
      .mutation(async ({ ctx, input }) => {
        const batch = await ctx.db.importBatch.findUnique({
          where: { id: input.batchId },
          select: { id: true, document: { select: { householdId: true } } },
        });
        if (!batch || batch.document?.householdId !== ctx.householdId) {
          throw new TRPCError({ code: "NOT_FOUND", message: "BATCH_NOT_FOUND" });
        }
        const removed = await ctx.db.transaction.deleteMany({
          where: { importBatchId: input.batchId, householdId: ctx.householdId },
        });
        // Drop the batch too, so the document returns to the pending list and can be
        // re-imported once the parser is fixed.
        await ctx.db.importBatch.delete({ where: { id: input.batchId } });
        return { removed: removed.count };
      }),

    /**
     * DESTRUCTIVE: delete every imported transaction, every import batch and every
     * uploaded statement document for the household, so importing can start from clean.
     *
     * Requires the caller to type the confirmation phrase — this cannot be reached by a
     * stray click. Manually-entered transactions are KEPT: they were never part of an
     * import and re-creating them by hand would be real lost work.
     */
    resetAll: operationsProcedure
      .input(z.object({ confirm: z.literal("DELETE ALL") }))
      .mutation(async ({ ctx }) => {
        const txns = await ctx.db.transaction.deleteMany({
          where: { householdId: ctx.householdId, source: "IMPORT" },
        });
        const batches = await ctx.db.importBatch.deleteMany({
          where: { document: { householdId: ctx.householdId } },
        });
        // Documents last: batches reference them.
        const docs = await ctx.db.document.deleteMany({
          where: { householdId: ctx.householdId, batches: { none: {} }, valuations: { none: {} } },
        });
        // Periods hold frozen figures computed from the deleted rows.
        await ctx.db.operatingPeriod.deleteMany({ where: { householdId: ctx.householdId } });
        return { transactions: txns.count, batches: batches.count, documents: docs.count };
      }),

    profiles: operationsProcedure.query(async ({ ctx }) =>
      ctx.db.importMappingProfile.findMany({
        where: { householdId: ctx.householdId },
        orderBy: { name: "asc" },
      }),
    ),

    saveProfile: operationsProcedure.input(SaveMappingProfileSchema).mutation(async ({ ctx, input }) => {
      const row = await ctx.db.importMappingProfile.upsert({
        where: { householdId_name: { householdId: ctx.householdId, name: input.name } },
        create: {
          householdId: ctx.householdId,
          name: input.name,
          adapterId: input.adapterId,
          mapping: JSON.parse(JSON.stringify(input.mapping)),
        },
        update: { mapping: JSON.parse(JSON.stringify(input.mapping)), adapterId: input.adapterId },
      });
      return { id: row.id };
    }),
  }),
});
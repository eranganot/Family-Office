import type { CashFlowCategory, CashFlowType, Prisma, PrismaClient, Transaction } from "@prisma/client";
import { DEFAULT_CATEGORY_TREE, flattenCategoryTree } from "@wealthos/domain";

export interface CategoryNode extends CashFlowCategory {
  children: CategoryNode[];
}

export interface CreateTransactionInput {
  source: "MANUAL" | "IMPORT" | "DERIVED";
  bookedAt: Date;
  valueDate?: Date | undefined;
  amount: string; // signed decimal string; negative = outflow
  currency: string;
  amountBase?: string | undefined;
  descriptionRedacted: string;
  merchantKey?: string | undefined;
  categoryId?: string | undefined;
  behavioralClass?: Prisma.TransactionCreateInput["behavioralClass"] | undefined;
  externalRef?: string | undefined;
  instalmentNumber?: number | undefined;
  instalmentTotal?: number | undefined;
  originalAmount?: string | undefined;
  /** M40c — currency of `originalAmount`; disambiguates a conversion from an instalment. */
  originalCurrency?: string | undefined;
  isRecurringCandidate?: boolean | undefined;
}

export const operationsRepo = {
  /**
   * Idempotently seed the default category tree for a household.
   *
   * Deliberately lazy (called on first read) rather than wired into household
   * bootstrap: the existing household predates M36 and would otherwise never get a
   * tree. Matches the registry seed convention — never overwrites an existing row,
   * so re-running is always safe and owner edits are never clobbered.
   */
  async ensureCategories(db: PrismaClient, householdId: string): Promise<number> {
    const rows = flattenCategoryTree(DEFAULT_CATEGORY_TREE);
    const existing = await db.cashFlowCategory.findMany({
      where: { householdId },
      select: { key: true },
    });
    const have = new Set(existing.map((r) => r.key));
    if (have.size >= rows.length) return 0;

    // Two passes so parents always exist before children (the tree is shallow).
    const idByKey = new Map<string, string>();
    for (const r of await db.cashFlowCategory.findMany({ where: { householdId }, select: { id: true, key: true } })) {
      idByKey.set(r.key, r.id);
    }

    let created = 0;
    for (const row of rows) {
      if (have.has(row.key)) continue;
      const parentId = row.parentKey ? (idByKey.get(row.parentKey) ?? null) : null;
      const rec = await db.cashFlowCategory.create({
        data: {
          householdId,
          parentId,
          axis: row.axis,
          key: row.key,
          nameEn: row.nameEn,
          nameHe: row.nameHe,
          defaultBehavioralClass: row.behavioral,
          mapsToFlowType: (row.mapsToFlowType ?? null) as CashFlowType | null,
          isSystem: true,
          sortOrder: row.sortOrder,
        },
      });
      idByKey.set(row.key, rec.id);
      created += 1;
    }
    return created;
  },

  async listCategories(
    db: PrismaClient,
    householdId: string,
    opts: { axis?: "INCOME" | "EXPENSE" | undefined; includeArchived?: boolean | undefined } = {},
  ): Promise<CashFlowCategory[]> {
    return db.cashFlowCategory.findMany({
      where: {
        householdId,
        ...(opts.axis ? { axis: opts.axis } : {}),
        ...(opts.includeArchived ? {} : { isArchived: false }),
      },
      orderBy: [{ axis: "asc" }, { sortOrder: "asc" }, { key: "asc" }],
    });
  },

  /** Build the nested tree from the flat rows (single query, assembled in memory). */
  toTree(rows: CashFlowCategory[]): CategoryNode[] {
    const byId = new Map<string, CategoryNode>();
    for (const r of rows) byId.set(r.id, { ...r, children: [] });
    const roots: CategoryNode[] = [];
    for (const node of byId.values()) {
      if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
      else roots.push(node);
    }
    const sort = (ns: CategoryNode[]): void => {
      ns.sort((a, b) => a.sortOrder - b.sortOrder || a.key.localeCompare(b.key));
      ns.forEach((n) => sort(n.children));
    };
    sort(roots);
    return roots;
  },

  async createTransaction(
    db: PrismaClient,
    householdId: string,
    input: CreateTransactionInput,
  ): Promise<Transaction> {
    return db.transaction.create({
      data: {
        householdId,
        source: input.source,
        bookedAt: input.bookedAt,
        valueDate: input.valueDate ?? null,
        amount: input.amount,
        currency: input.currency,
        amountBase: input.amountBase ?? null,
        descriptionRedacted: input.descriptionRedacted,
        merchantKey: input.merchantKey ?? null,
        categoryId: input.categoryId ?? null,
        behavioralClass: input.behavioralClass ?? null,
        externalRef: input.externalRef ?? null,
        instalmentNumber: input.instalmentNumber ?? null,
        instalmentTotal: input.instalmentTotal ?? null,
        originalAmount: input.originalAmount ?? null,
        originalCurrency: input.originalCurrency ?? null,
        isRecurringCandidate: input.isRecurringCandidate ?? false,
      },
    });
  },

  async listTransactions(
    db: PrismaClient,
    householdId: string,
    opts: { from?: Date | undefined; to?: Date | undefined; categoryId?: string | undefined; limit: number; cursor?: string | undefined },
  ): Promise<Transaction[]> {
    return db.transaction.findMany({
      where: {
        householdId,
        ...(opts.from || opts.to
          ? { bookedAt: { ...(opts.from ? { gte: opts.from } : {}), ...(opts.to ? { lte: opts.to } : {}) } }
          : {}),
        ...(opts.categoryId ? { categoryId: opts.categoryId } : {}),
      },
      orderBy: [{ bookedAt: "desc" }, { id: "desc" }],
      take: opts.limit,
      ...(opts.cursor ? { skip: 1, cursor: { id: opts.cursor } } : {}),
    });
  },

  /**
   * Re-classify a set of transactions. Supersedes the previous ACTIVE classification
   * rather than overwriting it — the history of HOW a transaction got its tags is
   * itself auditable (and is what makes rule-version changes reviewable later).
   */
  async classify(
    db: PrismaClient,
    input: {
      transactionIds: string[];
      categoryId: string;
      behavioralClass: Prisma.TransactionClassificationCreateInput["behavioralClass"];
      decidedBy: string;
    },
  ): Promise<number> {
    return db.$transaction(async (tx) => {
      await tx.transactionClassification.updateMany({
        where: { transactionId: { in: input.transactionIds }, status: { not: "SUPERSEDED" } },
        data: { status: "SUPERSEDED" },
      });
      await tx.transactionClassification.createMany({
        data: input.transactionIds.map((transactionId) => ({
          transactionId,
          categoryId: input.categoryId,
          behavioralClass: input.behavioralClass,
          confidence: "1.000", // an owner decision is definitionally certain
          method: "OWNER",
          status: "CONFIRMED" as const,
          decidedBy: input.decidedBy,
        })),
      });
      const res = await tx.transaction.updateMany({
        where: { id: { in: input.transactionIds } },
        data: { categoryId: input.categoryId, behavioralClass: input.behavioralClass },
      });
      return res.count;
    });
  },
};
